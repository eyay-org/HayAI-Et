"""
HayAI Art Platform API
Using MongoDB for data storage and Cloudinary for image hosting
"""
from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Form, Request, Depends, Body
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
import aiofiles
from pathlib import Path
import uuid
import time
import hashlib
from datetime import datetime, timedelta
from jose import JWTError, jwt
from typing import List, Dict, Any, Optional, Literal
from enum import Enum
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager
import tempfile
import os
from passlib.context import CryptContext
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from database import (
    get_users_collection,
    get_posts_collection,
    get_follows_collection,
    get_audit_logs_collection,
    get_next_sequence,
    init_database,
)
from services.image_transformer import transform_image
from services.cloudinary_service import delete_image, upload_image

# Base directory
BASE_DIR = Path(__file__).resolve().parent

# Create avatars directory for static avatar images
AVATARS_DIR = BASE_DIR / "avatars"
AVATARS_DIR.mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup"""
    init_database()
    ensure_default_users()
    yield


    yield


limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="HayAI Art Platform", version="2.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TransformMode(str, Enum):
    NORMAL = "normal"
    OIL = "oil"
    NEON = "neon"
    INVERSE = "inverse"
    ANIME = "anime"
    CARTOON = "cartoon"
    COMIC = "comic"
    TEST_FAIL = "test_fail"


class ImageKind(str, Enum):
    ORIGINAL = "original"
    AI = "ai"


class PostStatus(str, Enum):
    PENDING_MOD = "pending_mod"
    APPROVED = "approved"
    REJECTED = "rejected"


class UserRole(str, Enum):
    CHILD = "child"
    PARENT = "parent"
    ADMIN = "admin"


TRANSFORM_MODE_PROMPTS: Dict[str, str] = {
    TransformMode.NORMAL.value: (
        "Make this drawing beautiful and realistic while keeping the original composition completely unchanged."
    ),
    TransformMode.OIL.value: (
        "Recreate this drawing with rich oil-painting textures, visible brushstrokes, "
        "and warm lighting, keeping the original composition completely unchanged."
    ),
    TransformMode.NEON.value: (
        "Color this drawing using glowing neon tones and bright highlights while preserving "
        "all original shapes and linework."
    ),
    TransformMode.INVERSE.value: (
        "Apply an inverse-color effect to this drawing while keeping all shapes, outlines, "
        "and composition exactly the same."
    ),
    TransformMode.ANIME.value: (
        "Render this drawing in a soft anime illustration style with gentle shading and "
        "vibrant colors while keeping all the original figures and proportions the same."
    ),
    TransformMode.CARTOON.value: (
        "Repaint this drawing in a colorful cartoon style with smooth outlines and clean fills, "
        "without changing any of the original figures or elements."
    ),
    TransformMode.COMIC.value: (
        "Color this drawing in a classic comic-book style with halftone textures, keeping all "
        "original shapes intact."
    ),
    TransformMode.TEST_FAIL.value: "This request simulates a moderation rejection.",
}

DEFAULT_TRANSFORM_MODE = TransformMode.NORMAL.value

# JWT Configuration
SECRET_KEY = "test_secret_key"  # In production, use os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Predefined comments that users can select from
# Predefined comments that users can select from
PREDEFINED_COMMENTS = {
    1: "Harika görünüyor! 🌟",
    2: "Çok yeteneklisin! 👏",
    3: "Bayıldım! 😍",
    4: "Kullandığın renkler müthiş! 🎨",
    5: "Çizimlerin çok gerçekçi! ✨"
}


# ==================== Pydantic Models ====================

class UserProfile(BaseModel):
    id: int
    username: str
    display_name: str = Field(..., serialization_alias="displayName")
    bio: str
    interests: List[str] = []
    avatar_name: str | None = None
    posts: List[Dict[str, Any]] = []
    
    class Config:
        populate_by_name = True


class AvatarInfo(BaseModel):
    name: str
    url: str


class UserSearchResponse(BaseModel):
    query: str
    count: int
    results: List[UserProfile]


class CommentRequest(BaseModel):
    preset_id: int = Field(..., alias="presetId")
    
    model_config = {"extra": "forbid"}


class CommentResponse(BaseModel):
    id: str
    user_id: int
    username: str
    display_name: str = Field(..., serialization_alias="displayName")
    avatar_name: str | None = None
    comment_text: str
    timestamp: float
    
    class Config:
        populate_by_name = True


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    display_name: str
    bio: Optional[str] = "HayAI Art Platform'unda çizimlerimi paylaşıyorum! 🎨"
    role: UserRole = UserRole.CHILD
    age_verified: bool
    terms_accepted: bool


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    access_token: str
    refresh_token: str
    token_type: str
    user_id: int
    username: str
    display_name: str = Field(..., serialization_alias="displayName")
    message: str
    
    class Config:
        populate_by_name = True


class TransformRequest(BaseModel):
    image_id: str
    theme: str
    visibility: Literal["public", "private"] = "public"

class VisibilityUpdate(BaseModel):
    visibility: Literal["public", "private"]


# ==================== Helper Functions ====================

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify password against hash"""
    return pwd_context.verify(password, password_hash)


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        user_id: int = payload.get("user_id")
        if username is None or user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    users = get_users_collection()
    user = users.find_one({"user_id": user_id})
    if user is None:
        raise credentials_exception
    return user


oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

async def get_current_user_optional(token: str = Depends(oauth2_scheme_optional)):
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        if user_id is None:
            return None
    except JWTError:
        return None
        
    users = get_users_collection()
    user = users.find_one({"user_id": user_id})
    return user


def get_available_avatars() -> List[AvatarInfo]:
    """Get list of all available avatar images"""
    avatars = []
    if not AVATARS_DIR.exists():
        return avatars
    
    extensions = ['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp']
    
    for file_path in AVATARS_DIR.iterdir():
        if file_path.is_file():
            ext = file_path.suffix[1:].lower()
            if ext in extensions:
                avatars.append(AvatarInfo(
                    name=file_path.name,
                    url=f"/avatars/{file_path.name}"
                ))
    
    avatars.sort(key=lambda x: x.name)
    avatars.sort(key=lambda x: x.name)
    return avatars


async def log_audit(event: str, user_id: int, ip_address: str, details: dict = None):
    """Log security event to audit_logs collection"""
    audit_logs = get_audit_logs_collection()
    log_entry = {
        "event": event,
        "actor_id": user_id,
        "timestamp": datetime.utcnow().isoformat(),
        "ip_address": ip_address,
        "details": details or {}
    }
    audit_logs.insert_one(log_entry)


def user_doc_to_profile(user_doc: dict) -> UserProfile:
    """Convert MongoDB user document to UserProfile"""
    return UserProfile(
        id=user_doc["user_id"],
        username=user_doc["username"],
        display_name=user_doc.get("display_name", user_doc["username"]),
        bio=user_doc.get("bio", ""),
        interests=user_doc.get("interests", []),
        avatar_name=user_doc.get("avatar_name"),
        posts=[]
    )


def ensure_default_users():
    """Ensure default users exist in database"""
    users = get_users_collection()
    
    default_users = [
        {
            "user_id": 1,
            "username": "hayai",
            "email": "hayai@example.com",
            "password_hash": hash_password("hayai123"),
            "display_name": "HayAI Kullanıcısı",
            "bio": "HayAI Art Platform'unda çizimlerimi paylaşıyorum! 🎨",
            "interests": ["ai", "sanat", "çizim"],
            "avatar_name": None,
            "created_at": datetime.now().isoformat(),
            "terms_accepted": True,
            "terms_accepted_at": datetime.now().isoformat(),
            "age_verified": True
        },
        {
            "user_id": 2,
            "username": "guest",
            "email": "guest@example.com",
            "password_hash": hash_password("guest123"),
            "display_name": "Misafir Kullanıcı",
            "bio": "HayAI Art Platform'unda çizimlerimi paylaşıyorum! 🎨",
            "interests": ["sanat", "çizim"],
            "avatar_name": None,
            "created_at": datetime.now().isoformat(),
            "terms_accepted": True,
            "terms_accepted_at": datetime.now().isoformat(),
            "age_verified": True
        },
        # Demo users
        {
            "user_id": 3,
            "username": "luna_art",
            "email": "luna@example.com",
            "password_hash": hash_password("demo123"),
            "display_name": "Luna Demir",
            "bio": "Renkli illüstrasyonlar ve çocuk kitabı karakterleri çiziyorum.",
            "interests": ["illüstrasyon", "çocuk kitapları", "pastel"],
            "avatar_name": None,
            "created_at": datetime.now().isoformat(),
            "terms_accepted": True,
            "age_verified": True
        },
        {
            "user_id": 4,
            "username": "pixelbaran",
            "email": "baran@example.com",
            "password_hash": hash_password("demo123"),
            "display_name": "Baran Yıldız",
            "bio": "Animasyon ve piksel sanatına meraklı bir tasarımcı.",
            "interests": ["animasyon", "piksel", "retro"],
            "avatar_name": None,
            "created_at": datetime.now().isoformat(),
            "terms_accepted": True,
            "age_verified": True
        },
        {
            "user_id": 5,
            "username": "selincreates",
            "email": "selin@example.com",
            "password_hash": hash_password("demo123"),
            "display_name": "Selin Kara",
            "bio": "Çocuklar için STEM temalı çizimler ve posterler hazırlıyorum.",
            "interests": ["stem", "poster", "renkli"],
            "avatar_name": None,
            "created_at": datetime.now().isoformat(),
            "terms_accepted": True,
            "age_verified": True
        },
    ]
    
    for user_data in default_users:
        if not users.find_one({"user_id": user_data["user_id"]}):
            users.insert_one(user_data)
            print(f"✅ Created default user: {user_data['username']}")


# ==================== API Endpoints ====================

@app.get("/")
async def root():
    """API root endpoint"""
    return {"message": "HayAI Art Platform API", "version": "2.0.0", "database": "MongoDB"}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "message": "HayAI Art Platform is running!"}


# ==================== Authentication ====================

@app.post("/api/auth/register", response_model=LoginResponse, status_code=201)
async def register_user(register_data: RegisterRequest, request: Request):
    """Register a new user"""
    users = get_users_collection()
    
    # Validations
    if '@' not in register_data.email or '.' not in register_data.email.split('@')[-1]:
        raise HTTPException(status_code=400, detail="Geçerli bir e-posta adresi girin")
    
    if not register_data.age_verified:
        raise HTTPException(status_code=400, detail="Yaş doğrulaması gereklidir (18+)")
    
    if not register_data.terms_accepted:
        raise HTTPException(status_code=400, detail="Kullanım koşullarını kabul etmelisiniz")
    
    # Check existing username
    if users.find_one({"username": {"$regex": f"^{register_data.username}$", "$options": "i"}}):
        raise HTTPException(status_code=409, detail="Bu kullanıcı adı zaten kullanılıyor")
    
    # Check existing email
    if users.find_one({"email": {"$regex": f"^{register_data.email}$", "$options": "i"}}):
        raise HTTPException(status_code=409, detail="Bu e-posta adresi zaten kayıtlı")
    
    # Validate username format
    if not register_data.username.replace('_', '').isalnum() or len(register_data.username) < 3 or len(register_data.username) > 20:
        raise HTTPException(status_code=400, detail="Kullanıcı adı 3-20 karakter olmalı ve sadece harf, rakam ve alt çizgi içerebilir")
    
    # Validate password strength
    if len(register_data.password) < 8:
        raise HTTPException(status_code=400, detail="Şifre en az 8 karakter olmalıdır")
    
    if not any(c.isalpha() for c in register_data.password) or not any(c.isdigit() for c in register_data.password):
        raise HTTPException(status_code=400, detail="Şifre hem harf hem de rakam içermelidir")
    
    # Create new user
    new_user_id = get_next_sequence("user_id")
    current_time = datetime.now().isoformat()
    
    new_user = {
        "user_id": new_user_id,
        "username": register_data.username,
        "email": register_data.email,
        "password_hash": hash_password(register_data.password),
        "display_name": register_data.display_name,
        "bio": register_data.bio or "HayAI Art Platform'unda çizimlerimi paylaşıyorum! 🎨",
        "interests": [],
        "avatar_name": None,
        "created_at": current_time,
        "terms_accepted": register_data.terms_accepted,
        "terms_accepted_at": current_time,
        "created_at": current_time,
        "terms_accepted": register_data.terms_accepted,
        "terms_accepted_at": current_time,
        "age_verified": register_data.age_verified,
        "role": register_data.role.value,
        "is_verified": False
    }
    
    users.insert_one(new_user)
    
    # Create access token for auto-login after register
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": register_data.username, "user_id": new_user_id, "role": register_data.role.value},
        expires_delta=access_token_expires
    )
    
    # Create refresh token
    refresh_token_expires = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    refresh_token = create_access_token(
        data={"sub": register_data.username, "user_id": new_user_id, "type": "refresh"},
        expires_delta=refresh_token_expires
    )

    # Audit Log
    await log_audit(
        event="user_register",
        user_id=new_user_id,
        ip_address=request.client.host,
        details={"username": register_data.username, "role": register_data.role.value}
    )

    return LoginResponse(
        success=True,
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user_id=new_user_id,
        username=register_data.username,
        display_name=register_data.display_name,
        message="Kayıt başarılı! Hoş geldiniz!"
    )


@app.post("/api/auth/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login_user(request: Request, login_data: LoginRequest):
    """Login user with username and password"""
    users = get_users_collection()
    
    # Find user by username (case-insensitive)
    user = users.find_one({"username": {"$regex": f"^{login_data.username}$", "$options": "i"}})
    
    if not user:
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı")
    
    if not verify_password(login_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı")
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"], "user_id": user["user_id"], "role": user.get("role", UserRole.CHILD.value)},
        expires_delta=access_token_expires
    )
    
    # Create refresh token
    refresh_token_expires = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    refresh_token = create_access_token(
        data={"sub": user["username"], "user_id": user["user_id"], "type": "refresh"},
        expires_delta=refresh_token_expires
    )
    
    # Audit Log
    await log_audit(
        event="user_login",
        user_id=user["user_id"],
        ip_address=request.client.host,
        details={"username": user["username"]}
    )
    
    return LoginResponse(
        success=True,
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user_id=user["user_id"],
        username=user["username"],
        display_name=user.get("display_name", user["username"]),
        message="Giriş başarılı!"
    )


# ==================== User Endpoints ====================

@app.get("/users/search", response_model=UserSearchResponse)
async def search_users(q: str = Query("", max_length=50)):
    """Search users by username or display name"""
    users = get_users_collection()
    
    raw_query = q.strip().lower()
    query = raw_query.lstrip("@")
    
    if not query:
        # Return first 5 users
        user_docs = list(users.find().limit(5))
    else:
        # Search by username or display_name
        user_docs = list(users.find({
            "$or": [
                {"username": {"$regex": query, "$options": "i"}},
                {"display_name": {"$regex": query, "$options": "i"}}
            ]
        }).limit(10))
    
    results = [user_doc_to_profile(doc) for doc in user_docs]
    
    return UserSearchResponse(
        query=q,
        count=len(results),
        results=results
    )


@app.get("/users/{user_id}", response_model=UserProfile)
async def get_user(
    user_id: int,
    current_user: dict = Depends(get_current_user_optional)
):
    """Get user profile with posts"""
    users = get_users_collection()
    posts_collection = get_posts_collection()
    
    user = users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get user's posts
    # STRICT SECURITY FILTERING (TC-3 & TC-4)
    query = {
        "user_id": user_id,
        "status": PostStatus.APPROVED.value,
    }
    
    # If NOT owner, enforce public visibility
    if not current_user or current_user["user_id"] != user_id:
        query["$or"] = [
            {"visibility": "public"},
            {"visibility": {"$exists": False}}
        ]
        
    user_posts = list(posts_collection.find(query).sort("created_at", -1))
    
    posts_data = []
    for post in user_posts:
        posts_data.append({
            "original": post.get("original_url"),
            "improved": post.get("improved_url"),
            "mode": post.get("mode", TransformMode.NORMAL.value),
            "original_filename": post.get("image_id"),
            "like_count": len(post.get("liked_by", [])),
            "liked_by": post.get("liked_by", []),
            "comment_count": len(post.get("comments", [])),
            "comment_count": len(post.get("comments", [])),
            "comments": post.get("comments", []),
            "visibility": post.get("visibility", "public")
        })
    
    profile = user_doc_to_profile(user)
    profile.posts = posts_data
    
    return profile


@app.get("/avatars", response_model=List[AvatarInfo])
async def get_avatars():
    """Get list of all available avatars"""
    return get_available_avatars()


@app.put("/users/{user_id}/avatar")
async def set_user_avatar(user_id: int, avatar_name: str = Query(...)):
    """Set avatar for a user"""
    users = get_users_collection()
    
    user = users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify avatar exists
    available_avatars = get_available_avatars()
    if not any(av.name == avatar_name for av in available_avatars):
        raise HTTPException(status_code=404, detail="Avatar not found")
    
    users.update_one({"user_id": user_id}, {"$set": {"avatar_name": avatar_name}})
    
    return {"message": "Avatar updated successfully", "avatar_name": avatar_name}


# ==================== Follow Endpoints ====================

@app.post("/users/{target_user_id}/follow")
async def follow_user(target_user_id: int, current_user_id: int = Query(...)):
    """Follow a user"""
    users = get_users_collection()
    follows = get_follows_collection()
    
    if not users.find_one({"user_id": target_user_id}):
        raise HTTPException(status_code=404, detail="User not found")
    
    if not users.find_one({"user_id": current_user_id}):
        raise HTTPException(status_code=404, detail="Current user not found")
    
    if current_user_id == target_user_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    
    # Add follow relation (upsert)
    follows.update_one(
        {"follower_id": current_user_id, "following_id": target_user_id},
        {"$set": {"created_at": datetime.now().isoformat()}},
        upsert=True
    )
    
    return {"message": "User followed successfully", "following": True}


@app.delete("/users/{target_user_id}/follow")
async def unfollow_user(target_user_id: int, current_user_id: int = Query(...)):
    """Unfollow a user"""
    follows = get_follows_collection()
    
    follows.delete_one({"follower_id": current_user_id, "following_id": target_user_id})
    
    return {"message": "User unfollowed successfully", "following": False}


@app.get("/users/{user_id}/followers")
async def get_followers(user_id: int):
    """Get list of users who follow this user"""
    users = get_users_collection()
    follows = get_follows_collection()
    
    follower_ids = [f["follower_id"] for f in follows.find({"following_id": user_id})]
    followers = [user_doc_to_profile(u) for u in users.find({"user_id": {"$in": follower_ids}})]
    
    return {"count": len(followers), "followers": followers}


@app.get("/users/{user_id}/following")
async def get_following(user_id: int):
    """Get list of users that this user follows"""
    users = get_users_collection()
    follows = get_follows_collection()
    
    following_ids = [f["following_id"] for f in follows.find({"follower_id": user_id})]
    following = [user_doc_to_profile(u) for u in users.find({"user_id": {"$in": following_ids}})]
    
    return {"count": len(following), "following": following}


@app.get("/users/{user_id}/follow-stats")
async def get_follow_stats(user_id: int):
    """Get follower and following counts for a user"""
    follows = get_follows_collection()
    
    followers_count = follows.count_documents({"following_id": user_id})
    following_count = follows.count_documents({"follower_id": user_id})
    
    return {"followers": followers_count, "following": following_count}


@app.get("/users/{user_id}/is-following/{target_user_id}")
async def is_following(user_id: int, target_user_id: int):
    """Check if a user is following another user"""
    follows = get_follows_collection()
    
    is_following = follows.find_one({"follower_id": user_id, "following_id": target_user_id}) is not None
    
    return {"is_following": is_following}


# ==================== Post Endpoints ====================

@app.post("/api/uploads", status_code=201)
async def upload_image_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Step 1: Upload original image"""
    posts = get_posts_collection()
    
    try:
        # Check file size (10MB limit)
        content = await file.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Payload Too Large")
            
        client_filename = file.filename or ""
        file_extension = client_filename.rsplit(".", 1)[-1].lower() if "." in client_filename else "png"
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(suffix=f".{file_extension}", delete=False) as tmp_file:
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        try:
            # Upload original to Cloudinary
            upload_result = upload_image(tmp_path)
            if not upload_result:
                 raise Exception("Cloudinary upload failed")
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        
        image_id = str(uuid.uuid4())
        
        # Save "Original" Image Record (Hidden until transformed)
        image_record = {
            "image_id": image_id,
            "user_id": current_user["user_id"],
            "original_url": upload_result["secure_url"],
            "original_public_id": upload_result["public_id"],
            "kind": ImageKind.ORIGINAL.value,
            "original_filename": client_filename,
            "created_at": datetime.now().isoformat(),
            "status": "pending_transform" 
        }
        posts.insert_one(image_record)
        
        return {
            "image_id": image_id,
            "url": upload_result["secure_url"]
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.patch("/api/posts/{image_id}/visibility")
async def update_post_visibility(
    image_id: str,
    visibility_update: VisibilityUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update visibility of a post"""
    posts = get_posts_collection()
    
    # Find post
    post = posts.find_one({"image_id": image_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
        
    # Check ownership
    if post["user_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized to modify this post")
        
    # Update visibility
    posts.update_one(
        {"image_id": image_id},
        {"$set": {"visibility": visibility_update.visibility}}
    )
    
    return {"status": "success", "new_visibility": visibility_update.visibility}




@app.post("/api/ai/transform")
async def transform_image_api(
    request: TransformRequest,
    current_user: dict = Depends(get_current_user)
):
    """Step 2: Transform image with AI"""
    posts = get_posts_collection()
    
    # Verify ownership
    image_record = posts.find_one({"image_id": request.image_id})
    if not image_record:
        raise HTTPException(status_code=404, detail="Image not found")
        
    if image_record["user_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized to transform this image")

    mode_value = request.theme.strip().lower()
    if mode_value not in TRANSFORM_MODE_PROMPTS:
        raise HTTPException(status_code=400, detail="Invalid theme")
    
    prompt = TRANSFORM_MODE_PROMPTS[mode_value]
    
    try:
        if mode_value == TransformMode.TEST_FAIL.value:
            # REJECTION PATH (Mocking a blocked content)
            # Skip OpenAI call completely
            final_status = PostStatus.REJECTED.value
            final_visibility = "private"
            result = {
                "improved_url": image_record["original_url"], 
                "improved_public_id": image_record["original_public_id"]
            }
        else:
            # HAPPY PATH (Real AI Transformation)
            # We need to download the original image to transform it
            import requests
            response = requests.get(image_record["original_url"])
            if response.status_code != 200:
                 raise HTTPException(status_code=500, detail="Failed to retrieve original image")
                 
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_file:
                tmp_file.write(response.content)
                tmp_path = tmp_file.name
                
            try:
                 result = transform_image(tmp_path, prompt)
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)

            final_status = PostStatus.APPROVED.value
            final_visibility = request.visibility # Use user selection
            # HAPPY PATH (Mocking an Auto-Approval)
            final_status = PostStatus.APPROVED.value
            final_visibility = request.visibility # Use user selection

        update_data = {
            "$set": {
                "improved_url": result["improved_url"],
                "improved_public_id": result["improved_public_id"],
                "mode": mode_value,
                "status": final_status,
                "visibility": final_visibility,
                "kind": ImageKind.AI.value,
                "timestamp": time.time(),
                "liked_by": [],
                "comments": []
            }
        }
        
        posts.update_one({"image_id": request.image_id}, update_data)
        
        return {
            "post_id": request.image_id,
            "ai_image_url": result["improved_url"],
            "status": final_status
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transformation failed: {str(e)}")


@app.patch("/api/posts/{post_id}/visibility")
async def update_post_visibility(
    post_id: str,
    visibility_update: VisibilityUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Toggle post visibility (Public/Private)"""
    posts = get_posts_collection()
    
    # Find post
    post = posts.find_one({"image_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
        
    # Verify ownership
    if post["user_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized to modify this post")
        
    # Update visibility
    posts.update_one(
        {"image_id": post_id},
        {"$set": {"visibility": visibility_update.visibility}}
    )
    
    return {"status": "updated", "visibility": visibility_update.visibility}


@app.delete("/delete/{filename}")
async def delete_post(filename: str):
    """Delete a post and its images from Cloudinary"""
    posts = get_posts_collection()
    
    # Find post by image_id
    post = posts.find_one({"image_id": filename})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Delete images from Cloudinary
    deleted_files = []
    
    if post.get("original_public_id"):
        if delete_image(post["original_public_id"]):
            deleted_files.append("original")
    
    if post.get("improved_public_id"):
        if delete_image(post["improved_public_id"]):
            deleted_files.append("improved")
    
    # Delete post from MongoDB
    posts.delete_one({"image_id": filename})
    
    return {
        "message": "Post deleted successfully",
        "deleted_files": deleted_files,
        "original_filename": filename
    }


@app.post("/api/posts/{post_id}/like")
async def like_post(
    post_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Like a post (Idempotent)"""
    posts = get_posts_collection()
    
    # Find post
    post = posts.find_one({"image_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Gönderi bulunamadı")
        
    # Security Checks
    if post.get("status") == "rejected":
        raise HTTPException(status_code=403, detail="Bu gönderi ile etkileşime geçilemez.")
        
    if post.get("visibility") == "private" and post.get("user_id") != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Bu gönderi gizlidir.")
    
    # Add like (Idempotent via $addToSet)
    posts.update_one(
        {"image_id": post_id},
        {"$addToSet": {"liked_by": current_user["user_id"]}}
    )
    
    # Get updated count
    updated_post = posts.find_one({"image_id": post_id})
    current_likes = len(updated_post.get("liked_by", []))
    
    return {"success": True, "likes": current_likes, "is_liked": True}


@app.delete("/api/posts/{post_id}/like")
async def unlike_post(
    post_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Unlike a post (Idempotent)"""
    posts = get_posts_collection()
    
    # Find post
    post = posts.find_one({"image_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Gönderi bulunamadı")
        
    # Security Checks
    if post.get("status") == "rejected":
        raise HTTPException(status_code=403, detail="Bu gönderi ile etkileşime geçilemez.")
        
    if post.get("visibility") == "private" and post.get("user_id") != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Bu gönderi gizlidir.")
    
    # Remove like (Idempotent via $pull)
    posts.update_one(
        {"image_id": post_id},
        {"$pull": {"liked_by": current_user["user_id"]}}
    )
    
    # Get updated count
    updated_post = posts.find_one({"image_id": post_id})
    current_likes = len(updated_post.get("liked_by", []))
    
    return {"success": True, "likes": current_likes, "is_liked": False}


@app.get("/api/presets")
async def get_predefined_comments():
    """Get the list of predefined comments"""
    # Convert dict to list of objects for frontend
    comments_list = [{"id": k, "text": v} for k, v in PREDEFINED_COMMENTS.items()]
    return {"comments": comments_list}


@app.post("/api/posts/{post_id}/comment", response_model=CommentResponse, status_code=201)
async def add_comment(
    post_id: str,
    comment_data: CommentRequest,
    current_user: dict = Depends(get_current_user)
):
    """Add a comment to a post"""
    # users = get_users_collection() # Not needed, we have current_user
    posts = get_posts_collection()
    
    # Validate preset_id
    if comment_data.preset_id not in PREDEFINED_COMMENTS:
        raise HTTPException(status_code=400, detail="Geçersiz yorum ID'si.")
    
    # Find post
    post = posts.find_one({"image_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Gönderi bulunamadı")
        
    # Security Checks
    if post.get("status") == "rejected":
        raise HTTPException(status_code=403, detail="Bu gönderi ile etkileşime geçilemez.")
        
    if post.get("visibility") == "private" and post.get("user_id") != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Bu gönderi gizlidir.")
    
    # Create comment
    new_comment_db = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["user_id"],
        "username": current_user["username"],
        "display_name": current_user.get("display_name", current_user["username"]),
        "avatar_name": current_user.get("avatar_name"),
        "preset_id": comment_data.preset_id,
        "timestamp": time.time()
    }
    
    # Add comment to post
    posts.update_one(
        {"image_id": post_id},
        {"$push": {"comments": new_comment_db}}
    )
    
    # Return response with text for frontend
    response_data = new_comment_db.copy()
    response_data["comment_text"] = PREDEFINED_COMMENTS[comment_data.preset_id]
    
    return CommentResponse(**response_data)


@app.get("/posts/{filename}/comments", response_model=List[CommentResponse])
async def get_post_comments(filename: str):
    """Get comments for a post"""
    posts = get_posts_collection()
    
    post = posts.find_one({"image_id": filename})
    if not post:
        return []
    
    comments = post.get("comments", [])
    results = []
    for c in comments:
        # Reconstruct comment text from preset_id
        c_data = c.copy()
        if "preset_id" in c and c["preset_id"] in PREDEFINED_COMMENTS:
            c_data["comment_text"] = PREDEFINED_COMMENTS[c["preset_id"]]
        else:
            # Fallback for old comments or missing IDs
            c_data["comment_text"] = c.get("comment_text", "")
            
        results.append(CommentResponse(**c_data))
        
    return results


# Mount static files for avatars
app.mount("/avatars", StaticFiles(directory=str(AVATARS_DIR)), name="avatars")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
