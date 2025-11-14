from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import aiofiles
from pathlib import Path
import uuid
import time
import gc
from typing import List, Dict, Set
from pydantic import BaseModel
from services.image_transformer import transform_image

app = FastAPI(title="HayAI Art Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Create avatars directory
AVATARS_DIR = Path("avatars")
AVATARS_DIR.mkdir(exist_ok=True)


class UserProfile(BaseModel):
    id: int
    username: str
    display_name: str
    bio: str
    interests: List[str] = []
    avatar_name: str | None = None  # Avatar filename (e.g., "avatar1.png")


class AvatarInfo(BaseModel):
    name: str  # Filename
    url: str  # Full URL path


class UserSearchResponse(BaseModel):
    query: str
    count: int
    results: List[UserProfile]


# Follow relations file path
FOLLOW_RELATIONS_FILE = Path("follow_relations.json")

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


@app.get("/")
async def root():
    """API root endpoint"""
    return {"message": "HayAI Art Platform API", "version": "1.0.0"}


@app.get("/users/{user_id}", response_model=UserProfile)
async def get_user(user_id: int):
    """Get user profile by ID"""
    user = next((u for u in FAKE_USERS if u.id == user_id), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


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
    
    return {"message": "Avatar updated successfully", "avatar_name": avatar_name}


@app.get("/users/search", response_model=UserSearchResponse)
async def search_users(q: str = Query("", max_length=50, description="Kullanıcı adı veya isim araması")):
    """Search users by username or display name."""
    query = q.strip().lower()

    # Exclude login users (hayai and guest) from search results
    searchable_users = [user for user in FAKE_USERS if user.id not in [1, 2]]

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


@app.post("/upload/")
async def upload_file(file: UploadFile = File(...)):
    """Handle image file uploads and transform them using AI"""
    try:
        # Read file content
        content = await file.read()

        # Create unique filename
        file_extension = file.filename.split(".")[-1].lower()
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = UPLOAD_DIR / unique_filename

        async with aiofiles.open(file_path, "wb") as out_file:
            await out_file.write(content)

        # Transform image
        improved_file_path = transform_image(str(file_path))

        # Extract filename from path (works for both Windows and Unix paths)
        improved_filename = Path(improved_file_path).name

        return {
            "message": "File uploaded and transformed successfully",
            "filename": unique_filename,
            "improved_filename": improved_filename,
            "original_filename": file.filename,
            "file_path": str(file_path),
            "improved_file_path": improved_file_path,
            "original_url": f"/uploads/{unique_filename}",
            "improved_url": f"/uploads/{improved_filename}",
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


# Mount static files directory AFTER all endpoints are defined
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/avatars", StaticFiles(directory="avatars"), name="avatars")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
