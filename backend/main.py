from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import aiofiles
from pathlib import Path
import uuid
import time
import gc
from typing import List, Dict, Set, Any
from enum import Enum
from pydantic import BaseModel, Field
from services.image_transformer import transform_image
import json

# Base directory (the backend package directory) so files live under `backend/`
BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="HayAI Art Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory under backend
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Create avatars directory under backend
AVATARS_DIR = BASE_DIR / "avatars"
AVATARS_DIR.mkdir(exist_ok=True)


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
    name: str  # Filename
    url: str  # Full URL path


class UserSearchResponse(BaseModel):
    query: str
    count: int
    results: List[UserProfile]

class LikeRequest(BaseModel):
    filename: str # Hangi resim? (original filename kullanacağız ID olarak)
    user_id: int  # Kim beğeniyor?


# Follow relations file path (persisted under backend)
FOLLOW_RELATIONS_FILE = BASE_DIR / "follow_relations.json"

# In-memory follow relations: {user_id: set of user_ids that this user follows}
FOLLOW_RELATIONS: Dict[int, Set[int]] = {}

def load_follow_relations():
    """Load follow relations from JSON file"""
    global FOLLOW_RELATIONS
    if FOLLOW_RELATIONS_FILE.exists():
        try:
            import json
            with open(FOLLOW_RELATIONS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Convert list values to sets
                FOLLOW_RELATIONS = {int(k): set(v) for k, v in data.items()}
        except Exception as e:
            print(f"Error loading follow relations: {e}")
            FOLLOW_RELATIONS = {}
    else:
        FOLLOW_RELATIONS = {}

def save_follow_relations():
    """Save follow relations to JSON file"""
    try:
        import json
        # Convert sets to lists for JSON serialization
        data = {str(k): list(v) for k, v in FOLLOW_RELATIONS.items()}
        with open(FOLLOW_RELATIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving follow relations: {e}")

# Load follow relations on startup
load_follow_relations()

# User profiles persistence
USER_PROFILES_FILE = BASE_DIR / "user_profiles.json"

def save_user_profiles():
    """Save current users to JSON file"""
    try:
        data = [u.dict() for u in FAKE_USERS]
        with open(USER_PROFILES_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving user profiles: {e}")

def load_user_profiles():
    """Load user profiles from JSON file if present, otherwise write defaults."""
    global FAKE_USERS
    if USER_PROFILES_FILE.exists():
        try:
            with open(USER_PROFILES_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                loaded = []
                for item in data:
                    # Ensure keys match the Pydantic model
                    loaded.append(UserProfile(**item))
                FAKE_USERS = loaded
        except Exception as e:
            print(f"Error loading user profiles: {e}")
    else:
        # Persist initial in-memory users for future runs
        save_user_profiles()

# Helper function to get available avatars
def get_available_avatars() -> List[AvatarInfo]:
    """Get list of all available avatar images"""
    avatars = []
    if not AVATARS_DIR.exists():
        return avatars
    
    # Supported image extensions
    extensions = ['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp']
    
    for file_path in AVATARS_DIR.iterdir():
        if file_path.is_file():
            ext = file_path.suffix[1:].lower()  # Remove the dot
            if ext in extensions:
                avatars.append(AvatarInfo(
                    name=file_path.name,
                    url=f"/avatars/{file_path.name}"
                ))
    
    # Sort by filename for consistent ordering
    avatars.sort(key=lambda x: x.name)
    return avatars

# In-memory user directory for prototype purposes. Replace with database queries when ready.
# Users can select avatars from the available avatars pool
FAKE_USERS: List[UserProfile] = [
    # Login users (hayai and guest)
    UserProfile(
        id=1,
        username="hayai",
        display_name="HayAI Kullanıcısı",
        bio="HayAI Art Platform'unda çizimlerimi paylaşıyorum! 🎨",
        interests=["ai", "sanat", "çizim"],
        avatar_name=None,  # No avatar selected by default
    ),
    UserProfile(
        id=2,
        username="guest",
        display_name="Misafir Kullanıcı",
        bio="HayAI Art Platform'unda çizimlerimi paylaşıyorum! 🎨",
        interests=["sanat", "çizim"],
        avatar_name=None,  # No avatar selected by default
    ),
    # Other users
    UserProfile(
        id=3,
        username="luna_art",
        display_name="Luna Demir",
        bio="Renkli illüstrasyonlar ve çocuk kitabı karakterleri çiziyorum.",
        interests=["illüstrasyon", "çocuk kitapları", "pastel"],
        avatar_name=None,
    ),
    UserProfile(
        id=4,
        username="pixelbaran",
        display_name="Baran Yıldız",
        bio="Animasyon ve piksel sanatına meraklı bir tasarımcı.",
        interests=["animasyon", "piksel", "retro"],
        avatar_name=None,
    ),
    UserProfile(
        id=5,
        username="selincreates",
        display_name="Selin Kara",
        bio="Çocuklar için STEM temalı çizimler ve posterler hazırlıyorum.",
        interests=["stem", "poster", "renkli"],
        avatar_name=None,
    ),
    UserProfile(
        id=6,
        username="mert_ai",
        display_name="Mert Aksoy",
        bio="Yapay zeka ile sanatı buluşturmaya çalışıyorum.",
        interests=["ai", "deneysel", "dijital"],
        avatar_name=None,
    ),
    UserProfile(
        id=7,
        username="zeynepdraws",
        display_name="Zeynep Uçar",
        bio="Bitki illüstrasyonları ve doğa temalı görseller üretiyorum.",
        interests=["botanik", "suluboya", "doğa"],
        avatar_name=None,
    ),
    UserProfile(
        id=8,
        username="atlasstory",
        display_name="Atlas Şahin",
        bio="Çocuk hikayeleri için konsept sanat ve karakter tasarımı yapıyorum.",
        interests=["konsept", "karakter", "hikaye"],
        avatar_name=None,
    ),
    UserProfile(
        id=9,
        username="neonmelis",
        display_name="Melis Kurt",
        bio="Neon renklerle bilim kurgu sahneleri tasarlıyorum.",
        interests=["sci-fi", "neon", "fantastik"],
        avatar_name=None,
    ),
    UserProfile(
        id=10,
        username="elifhandmade",
        display_name="Elif Arslan",
        bio="Geleneksel el işi desenlerini dijitalleştiriyorum.",
        interests=["geleneksel", "desen", "dijitalleşme"],
        avatar_name=None,
    ),
]

# Load persisted user profiles (if present) so avatars and other changes persist
load_user_profiles()


@app.get("/")
async def root():
    """API root endpoint"""
    return {"message": "HayAI Art Platform API", "version": "1.0.0"}


@app.get("/users/search", response_model=UserSearchResponse)
async def search_users(q: str = Query("", max_length=50, description="Kullanıcı adı veya isim araması")):
    """
    Hem '@kullaniciadi' hem de 'Ad Soyad' aramalarını destekler.
    """
    
    # 1. Temizlik: Önce boşlukları al, sonra küçük harfe çevir.
    raw_query = q.strip().lower()
    
    # 2. Kritik Hamle: Eğer başta '@' varsa onu atıyoruz.
    #    - "@luna_art" yazdıysa -> "luna_art" olur (Username ile eşleşir).
    #    - "luna demir" yazdıysa -> "luna demir" kalır (Display Name ile eşleşir).
    query = raw_query.lstrip("@")
    
    print(f"Gelen: '{q}' -> Aranan: '{query}'")

    # Login kullanıcılarını (id 1 ve 2) listeden çıkar
    searchable_users = FAKE_USERS

    if not query:
        matches = searchable_users[:5]
    else:
        matches = [
            user for user in searchable_users
            if query in user.username.lower() or query in user.display_name.lower()
        ][:10]

    return UserSearchResponse(
        query=q,
        count=len(matches),
        results=matches,
    )


@app.get("/avatars", response_model=List[AvatarInfo])
async def get_avatars():
    """Get list of all available avatars"""
    return get_available_avatars()


@app.put("/users/{user_id}/avatar")
async def set_user_avatar(user_id: int, avatar_name: str = Query(..., description="Avatar filename")):
    """Set avatar for a user"""
    user = next((u for u in FAKE_USERS if u.id == user_id), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify avatar exists
    available_avatars = get_available_avatars()
    if not any(av.name == avatar_name for av in available_avatars):
        raise HTTPException(status_code=404, detail="Avatar not found")
    
    # Update user avatar
    user.avatar_name = avatar_name
    # Persist change so avatar survives server restarts
    save_user_profiles()

    return {"message": "Avatar updated successfully", "avatar_name": avatar_name}


# Mevcut get_user fonksiyonunu SİL ve yerine bunu yapıştır:

@app.get("/users/{user_id}", response_model=UserProfile)
async def get_user(user_id: int):
    """Kullanıcıyı ve detaylı paylaşımlarını getirir"""
    user = next((u for u in FAKE_USERS if u.id == user_id), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_posts = []
    posts_file = BASE_DIR / "posts.json"
    
    # Şu anki (istek atan) kullanıcının ID'sini nasıl alacağız?
    # Bu fonksiyon public olduğu için viewer_id'yi parametre olarak alamayabiliriz.
    # Ancak Frontend bize "kimin profiline" baktığımızı soruyor.
    # "Ben bunu beğendim mi?" bilgisini frontend'de hesaplamak daha kolay olabilir ama 
    # doğrusu backend'den göndermektir. Şimdilik basitlik adına tüm 'liked_by' listesini göndermeyeceğiz,
    # Frontend'de "giriş yapmış kullanıcı ID'si" ile karşılaştıracağız.

    if posts_file.exists():
        try:
            with open(posts_file, "r", encoding="utf-8") as f:
                all_posts = json.load(f)
                for p in all_posts:
                    if p.get("user_id") == user_id:
                        # Beğenenler listesini al, yoksa boş liste ver
                        liked_by = p.get("liked_by", [])
                        
                        mode_value = p.get("mode") or TransformMode.NORMAL.value
                        original_filename = p.get("original_filename") or p.get("image")

                        user_posts.append({
                            "original": p.get("image"),
                            "improved": p.get("improved_image"),
                            "mode": mode_value,
                            "original_filename": original_filename,
                            "like_count": len(liked_by),     # YENİ: Toplam beğeni
                            "liked_by": liked_by             # YENİ: Kimler beğendi (ID listesi)
                        })
        except Exception as e:
            print(f"Post okuma hatası: {e}")

    user_response = user.copy()
    # Dikkat: UserProfile modelini aşağıda güncelleyeceğiz, şimdilik hata verebilir, panik yapma.
    user_response.posts = user_posts 
    
    return user_response

# Mevcut /upload/ fonksiyonunu SİL ve yerine bunu yapıştır:

@app.post("/upload/")
async def upload_file(
    file: UploadFile = File(...),
    user_id: int = Form(..., description="Yükleyen kullanıcının ID'si"),
    mode: str = Form(DEFAULT_TRANSFORM_MODE, description="AI dönüşüm modu")
):
    """Resim yükler ve posts.json dosyasına kaydeder."""
    try:
        mode_value = (mode or DEFAULT_TRANSFORM_MODE).strip().lower()
        if mode_value not in TRANSFORM_MODE_PROMPTS:
            raise HTTPException(status_code=400, detail="Geçersiz dönüşüm modu seçildi")

        prompt = TRANSFORM_MODE_PROMPTS[mode_value]

        # 1. Dosyayı fiziksel olarak kaydet
        content = await file.read()
        client_filename = file.filename or ""
        file_extension = client_filename.rsplit(".", 1)[-1].lower() if "." in client_filename else "png"
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = UPLOAD_DIR / unique_filename

        async with aiofiles.open(file_path, "wb") as out_file:
            await out_file.write(content)

        # 2. Görüntüyü işle (AI transformer)
        improved_file_path = transform_image(str(file_path), prompt)
        improved_filename = Path(improved_file_path).name

        # 3. JSON VERİTABANINA KAYIT (YENİ BÖLÜM)
        original_client_filename = client_filename or unique_filename
        post_entry = {
            "user_id": user_id,
            "image": unique_filename,
            "improved_image": improved_filename,
            "timestamp": time.time(),
            "mode": mode_value,
            "original_filename": original_client_filename
        }

        posts_file = BASE_DIR / "posts.json"
        
        # Mevcut postları oku
        current_posts = []
        if posts_file.exists():
            try:
                with open(posts_file, "r", encoding="utf-8") as f:
                    current_posts = json.load(f)
            except:
                current_posts = []
        
        # Yeni postu ekle ve kaydet
        current_posts.append(post_entry)
        with open(posts_file, "w", encoding="utf-8") as f:
            json.dump(current_posts, f, indent=2)

        original_url = f"/uploads/{unique_filename}"
        improved_url = f"/uploads/{improved_filename}"

        return {
            "message": "Yükleme ve kayıt başarılı",
            "filename": unique_filename,
            "original_filename": original_client_filename,
            "improved_filename": improved_filename,
            "original_url": original_url,
            "improved_url": improved_url,
            "mode": mode_value,
            "user_id": user_id
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.delete("/delete/{filename}")
async def delete_file(filename: str):
    """Delete both original and improved versions of an uploaded file"""
    try:
        # Validate filename to prevent directory traversal attacks
        if ".." in filename or "/" in filename or "\\" in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")
        
        # Construct file paths
        original_file_path = UPLOAD_DIR / filename
        
        # Extract base name without extension for improved file
        base_name = filename.rsplit('.', 1)[0] if '.' in filename else filename
        file_extension = filename.split('.')[-1] if '.' in filename else 'jpeg'
        improved_filename = f"{base_name}_improved.{file_extension}"
        improved_file_path = UPLOAD_DIR / improved_filename
        
        deleted_files = []
        
        # Function to safely delete a file with retry mechanism
        def safe_delete_file(file_path: Path, filename: str, max_retries: int = 3) -> bool:
            for attempt in range(max_retries):
                try:
                    if file_path.exists():
                        # Force garbage collection to close any file handles
                        gc.collect()
                        # Small delay to allow file handles to close
                        time.sleep(0.1)
                        file_path.unlink()
                        return True
                except PermissionError:
                    if attempt < max_retries - 1:
                        time.sleep(0.5)  # Wait longer between retries
                        continue
                    else:
                        return False
                except Exception:
                    return False
            return False
        
        # Delete original file if it exists
        if original_file_path.exists():
            if safe_delete_file(original_file_path, filename):
                deleted_files.append(filename)
            else:
                raise HTTPException(status_code=500, detail=f"Failed to delete original file after retries: {filename}")
        
        # Delete improved file if it exists
        if improved_file_path.exists():
            if safe_delete_file(improved_file_path, improved_filename):
                deleted_files.append(improved_filename)
            else:
                raise HTTPException(status_code=500, detail=f"Failed to delete improved file after retries: {improved_filename}")
        
        if not deleted_files:
            raise HTTPException(status_code=404, detail="File not found")
        
        return {
            "message": "Files deleted successfully",
            "deleted_files": deleted_files,
            "original_filename": filename,
            "improved_filename": improved_filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "message": "HayAI Art Platform is running!"}


@app.post("/users/{target_user_id}/follow")
async def follow_user(target_user_id: int, current_user_id: int = Query(..., description="Current user ID")):
    """Follow a user"""
    # Check if target user exists
    target_user = next((u for u in FAKE_USERS if u.id == target_user_id), None)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if current user exists
    current_user = next((u for u in FAKE_USERS if u.id == current_user_id), None)
    if not current_user:
        raise HTTPException(status_code=404, detail="Current user not found")
    
    # Can't follow yourself
    if current_user_id == target_user_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    
    # Add follow relation
    if current_user_id not in FOLLOW_RELATIONS:
        FOLLOW_RELATIONS[current_user_id] = set()
    FOLLOW_RELATIONS[current_user_id].add(target_user_id)
    
    # Save to file
    save_follow_relations()
    
    return {"message": "User followed successfully", "following": True}


@app.delete("/users/{target_user_id}/follow")
async def unfollow_user(target_user_id: int, current_user_id: int = Query(..., description="Current user ID")):
    """Unfollow a user"""
    if current_user_id in FOLLOW_RELATIONS:
        FOLLOW_RELATIONS[current_user_id].discard(target_user_id)
    
    # Save to file
    save_follow_relations()
    
    return {"message": "User unfollowed successfully", "following": False}


@app.get("/users/{user_id}/followers")
async def get_followers(user_id: int):
    """Get list of users who follow this user"""
    # Find all users who follow this user
    followers = [
        u for u in FAKE_USERS 
        if user_id in FOLLOW_RELATIONS.get(u.id, set())
    ]
    return {"count": len(followers), "followers": followers}


@app.get("/users/{user_id}/following")
async def get_following(user_id: int):
    """Get list of users that this user follows"""
    following_ids = FOLLOW_RELATIONS.get(user_id, set())
    following = [u for u in FAKE_USERS if u.id in following_ids]
    return {"count": len(following), "following": following}


@app.get("/users/{user_id}/follow-stats")
async def get_follow_stats(user_id: int):
    """Get follower and following counts for a user"""
    followers_count = len([
        u for u in FAKE_USERS 
        if user_id in FOLLOW_RELATIONS.get(u.id, set())
    ])
    following_count = len(FOLLOW_RELATIONS.get(user_id, set()))
    return {"followers": followers_count, "following": following_count}


@app.get("/users/{user_id}/is-following/{target_user_id}")
async def is_following(user_id: int, target_user_id: int):
    """Check if a user is following another user"""
    is_following = target_user_id in FOLLOW_RELATIONS.get(user_id, set())
    return {"is_following": is_following}

@app.post("/posts/like")
async def toggle_like(like_data: LikeRequest):
    """Bir gönderiyi beğenir veya beğeniyi geri alır."""
    posts_file = BASE_DIR / "posts.json"
    
    if not posts_file.exists():
        raise HTTPException(status_code=404, detail="Post veritabanı bulunamadı")
    
    try:
        # 1. Dosyayı Oku
        with open(posts_file, "r", encoding="utf-8") as f:
            all_posts = json.load(f)
        
        post_found = False
        current_likes = 0
        is_liked = False

        # 2. İlgili postu bul ve güncelle
        for post in all_posts:
            # Eşleşme için 'image' (orijinal dosya adı) kullanıyoruz
            if post.get("image") == like_data.filename:
                post_found = True
                
                # 'liked_by' listesi yoksa oluştur
                if "liked_by" not in post:
                    post["liked_by"] = []
                
                # Mantık: ID listede varsa çıkar, yoksa ekle
                if like_data.user_id in post["liked_by"]:
                    post["liked_by"].remove(like_data.user_id)
                    is_liked = False
                else:
                    post["liked_by"].append(like_data.user_id)
                    is_liked = True
                
                current_likes = len(post["liked_by"])
                break
        
        if not post_found:
            raise HTTPException(status_code=404, detail="Gönderi bulunamadı")

        # 3. Dosyayı Kaydet
        with open(posts_file, "w", encoding="utf-8") as f:
            json.dump(all_posts, f, indent=2)
            
        return {
            "success": True, 
            "likes": current_likes, 
            "is_liked": is_liked
        }

    except Exception as e:
        print(f"Like hatası: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Mount static files directory AFTER all endpoints are defined
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/avatars", StaticFiles(directory=str(AVATARS_DIR)), name="avatars")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
