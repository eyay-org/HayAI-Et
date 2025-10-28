from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import aiofiles
from pathlib import Path
import uuid
import time
import gc
from typing import List
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


class UserProfile(BaseModel):
    id: int
    username: str
    display_name: str
    bio: str
    interests: List[str] = []


class UserSearchResponse(BaseModel):
    query: str
    count: int
    results: List[UserProfile]


# In-memory user directory for prototype purposes. Replace with database queries when ready.
FAKE_USERS: List[UserProfile] = [
    UserProfile(
        id=1,
        username="luna_art",
        display_name="Luna Demir",
        bio="Renkli illüstrasyonlar ve çocuk kitabı karakterleri çiziyorum.",
        interests=["illüstrasyon", "çocuk kitapları", "pastel"],
    ),
    UserProfile(
        id=2,
        username="pixelbaran",
        display_name="Baran Yıldız",
        bio="Animasyon ve piksel sanatına meraklı bir tasarımcı.",
        interests=["animasyon", "piksel", "retro"],
    ),
    UserProfile(
        id=3,
        username="selincreates",
        display_name="Selin Kara",
        bio="Çocuklar için STEM temalı çizimler ve posterler hazırlıyorum.",
        interests=["stem", "poster", "renkli"],
    ),
    UserProfile(
        id=4,
        username="mert_ai",
        display_name="Mert Aksoy",
        bio="Yapay zeka ile sanatı buluşturmaya çalışıyorum.",
        interests=["ai", "deneysel", "dijital"],
    ),
    UserProfile(
        id=5,
        username="zeynepdraws",
        display_name="Zeynep Uçar",
        bio="Bitki illüstrasyonları ve doğa temalı görseller üretiyorum.",
        interests=["botanik", "suluboya", "doğa"],
    ),
    UserProfile(
        id=6,
        username="atlasstory",
        display_name="Atlas Şahin",
        bio="Çocuk hikayeleri için konsept sanat ve karakter tasarımı yapıyorum.",
        interests=["konsept", "karakter", "hikaye"],
    ),
    UserProfile(
        id=7,
        username="neonmelis",
        display_name="Melis Kurt",
        bio="Neon renklerle bilim kurgu sahneleri tasarlıyorum.",
        interests=["sci-fi", "neon", "fantastik"],
    ),
    UserProfile(
        id=8,
        username="elifhandmade",
        display_name="Elif Arslan",
        bio="Geleneksel el işi desenlerini dijitalleştiriyorum.",
        interests=["geleneksel", "desen", "dijitalleşme"],
    ),
]


@app.get("/")
async def root():
    """API root endpoint"""
    return {"message": "HayAI Art Platform API", "version": "1.0.0"}


@app.get("/users/search", response_model=UserSearchResponse)
async def search_users(q: str = Query("", max_length=50, description="Kullanıcı adı veya isim araması")):
    """Search users by username or display name."""
    query = q.strip().lower()

    if not query:
        matches = FAKE_USERS[:5]
    else:
        matches = [
            user for user in FAKE_USERS
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


# Mount static files directory AFTER all endpoints are defined
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
