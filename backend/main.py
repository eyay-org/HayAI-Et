"""
HayAI Art Platform API
Using MongoDB for data storage and Cloudinary for image hosting
"""
from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
import aiofiles
from pathlib import Path
import uuid
import time
import hashlib
from datetime import datetime
from typing import List, Dict, Any, Optional
from enum import Enum
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager
import tempfile
import os

from database import (
    get_users_collection,
    get_posts_collection,
    get_follows_collection,
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


app = FastAPI(title="HayAI Art Platform", version="2.0.0", lifespan=lifespan)

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
}

DEFAULT_TRANSFORM_MODE = TransformMode.NORMAL.value

# Predefined comments that users can select from
PREDEFINED_COMMENTS = [
    "Harika görünüyor! 🌟",
    "Çok yeteneklisin! 👏",
    "Bayıldım! 😍",
    "Kullandığın renkler müthiş! 🎨",
    "Çizimlerin çok gerçekçi! ✨"
]


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


class LikeRequest(BaseModel):
    filename: str  # image_id for the post
    user_id: int


class CommentRequest(BaseModel):
    filename: str  # image_id for the post
    user_id: int
    comment_text: str


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
    age_verified: bool
    terms_accepted: bool


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    user_id: int
    username: str
    display_name: str = Field(..., serialization_alias="displayName")
    message: str
    
    class Config:
        populate_by_name = True


# ==================== Helper Functions ====================

def hash_password(password: str) -> str:
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    """Verify password against hash"""
    return hash_password(password) == password_hash


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
    return avatars


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

@app.post("/register", response_model=LoginResponse)
async def register_user(register_data: RegisterRequest):
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
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanılıyor")
    
    # Check existing email
    if users.find_one({"email": {"$regex": f"^{register_data.email}$", "$options": "i"}}):
        raise HTTPException(status_code=400, detail="Bu e-posta adresi zaten kayıtlı")
    
    # Validate username format
    if not register_data.username.replace('_', '').isalnum() or len(register_data.username) < 3 or len(register_data.username) > 20:
        raise HTTPException(status_code=400, detail="Kullanıcı adı 3-20 karakter olmalı ve sadece harf, rakam ve alt çizgi içerebilir")
    
    # Validate password
    if len(register_data.password) < 6:
        raise HTTPException(status_code=400, detail="Şifre en az 6 karakter olmalıdır")
    
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
        "age_verified": register_data.age_verified
    }
    
    users.insert_one(new_user)
    
    return LoginResponse(
        success=True,
        user_id=new_user_id,
        username=register_data.username,
        display_name=register_data.display_name,
        message="Kayıt başarılı! Hoş geldiniz!"
    )


@app.post("/login", response_model=LoginResponse)
async def login_user(login_data: LoginRequest):
    """Login user with username and password"""
    users = get_users_collection()
    
    # Find user by username (case-insensitive)
    user = users.find_one({"username": {"$regex": f"^{login_data.username}$", "$options": "i"}})
    
    if not user:
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı")
    
    if not verify_password(login_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı")
    
    return LoginResponse(
        success=True,
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
async def get_user(user_id: int):
    """Get user profile with posts"""
    users = get_users_collection()
    posts_collection = get_posts_collection()
    
    user = users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get user's posts
    user_posts = list(posts_collection.find({"user_id": user_id}).sort("created_at", -1))
    
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
            "comments": post.get("comments", [])
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

@app.post("/upload/")
async def upload_file(
    file: UploadFile = File(...),
    user_id: int = Form(...),
    mode: str = Form(DEFAULT_TRANSFORM_MODE)
):
    """Upload and transform an image"""
    posts = get_posts_collection()
    
    try:
        mode_value = (mode or DEFAULT_TRANSFORM_MODE).strip().lower()
        if mode_value not in TRANSFORM_MODE_PROMPTS:
            raise HTTPException(status_code=400, detail="Geçersiz dönüşüm modu seçildi")
        
        prompt = TRANSFORM_MODE_PROMPTS[mode_value]
        
        # Save uploaded file temporarily
        content = await file.read()
        client_filename = file.filename or ""
        file_extension = client_filename.rsplit(".", 1)[-1].lower() if "." in client_filename else "png"
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(suffix=f".{file_extension}", delete=False) as tmp_file:
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        try:
            # Transform image and upload to Cloudinary
            result = transform_image(tmp_path, prompt)
        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        
        # Generate unique image ID
        image_id = str(uuid.uuid4())
        
        # Save post to MongoDB
        post_data = {
            "image_id": image_id,
            "user_id": user_id,
            "original_url": result["original_url"],
            "original_public_id": result["original_public_id"],
            "improved_url": result["improved_url"],
            "improved_public_id": result["improved_public_id"],
            "mode": mode_value,
            "original_filename": client_filename or image_id,
            "created_at": datetime.now().isoformat(),
            "timestamp": time.time(),
            "liked_by": [],
            "comments": []
        }
        
        posts.insert_one(post_data)
        
        return {
            "message": "Yükleme ve kayıt başarılı",
            "filename": image_id,
            "original_filename": client_filename or image_id,
            "improved_filename": image_id,
            "original_url": result["original_url"],
            "improved_url": result["improved_url"],
            "mode": mode_value,
            "user_id": user_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


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


@app.post("/posts/like")
async def toggle_like(like_data: LikeRequest):
    """Toggle like on a post"""
    posts = get_posts_collection()
    
    # Find post by image_id
    post = posts.find_one({"image_id": like_data.filename})
    if not post:
        raise HTTPException(status_code=404, detail="Gönderi bulunamadı")
    
    liked_by = post.get("liked_by", [])
    
    if like_data.user_id in liked_by:
        # Unlike
        posts.update_one(
            {"image_id": like_data.filename},
            {"$pull": {"liked_by": like_data.user_id}}
        )
        is_liked = False
        current_likes = len(liked_by) - 1
    else:
        # Like
        posts.update_one(
            {"image_id": like_data.filename},
            {"$addToSet": {"liked_by": like_data.user_id}}
        )
        is_liked = True
        current_likes = len(liked_by) + 1
    
    return {"success": True, "likes": current_likes, "is_liked": is_liked}


@app.get("/comments/predefined")
async def get_predefined_comments():
    """Get the list of predefined comments"""
    return {"comments": PREDEFINED_COMMENTS}


@app.post("/posts/comment", response_model=CommentResponse)
async def add_comment(comment_data: CommentRequest):
    """Add a comment to a post"""
    users = get_users_collection()
    posts = get_posts_collection()
    
    # Validate comment text
    if comment_data.comment_text not in PREDEFINED_COMMENTS:
        raise HTTPException(status_code=400, detail="Geçersiz yorum. Lütfen listeden bir yorum seçin.")
    
    # Get user info
    user = users.find_one({"user_id": comment_data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    
    # Find post
    post = posts.find_one({"image_id": comment_data.filename})
    if not post:
        raise HTTPException(status_code=404, detail="Gönderi bulunamadı")
    
    # Create comment
    new_comment = {
        "id": str(uuid.uuid4()),
        "user_id": comment_data.user_id,
        "username": user["username"],
        "display_name": user.get("display_name", user["username"]),
        "avatar_name": user.get("avatar_name"),
        "comment_text": comment_data.comment_text,
        "timestamp": time.time()
    }
    
    # Add comment to post
    posts.update_one(
        {"image_id": comment_data.filename},
        {"$push": {"comments": new_comment}}
    )
    
    return CommentResponse(**new_comment)


@app.get("/posts/{filename}/comments", response_model=List[CommentResponse])
async def get_post_comments(filename: str):
    """Get comments for a post"""
    posts = get_posts_collection()
    
    post = posts.find_one({"image_id": filename})
    if not post:
        return []
    
    comments = post.get("comments", [])
    return [CommentResponse(**c) for c in comments]


# Mount static files for avatars
app.mount("/avatars", StaticFiles(directory=str(AVATARS_DIR)), name="avatars")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
