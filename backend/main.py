from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import aiofiles
from pathlib import Path
import uuid
import time
import gc
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


@app.get("/")
async def root():
    """API root endpoint"""
    return {"message": "HayAI Art Platform API", "version": "1.0.0"}


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
