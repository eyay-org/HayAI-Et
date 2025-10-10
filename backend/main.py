from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
import aiofiles
from pathlib import Path
import uuid
from services.image_transformer import transform_image

app = FastAPI(title="HayAI Art Platform", version="1.0.0")

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory if it doesn't exist
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


@app.get("/")
async def root():
    """API root endpoint"""
    return {"message": "HayAI Art Platform API", "version": "1.0.0"}


@app.post("/upload/")
async def upload_file(file: UploadFile = File(...)):
    """Handle image file uploads"""
    try:
        # Validate file type
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")

        # Validate file size (max 10MB)
        content = await file.read()
        if len(content) > 10 * 1024 * 1024:  # 10MB
            raise HTTPException(
                status_code=400, detail="File size must be less than 10MB"
            )

        # Create unique filename
        file_extension = file.filename.split(".")[-1] if "." in file.filename else "jpg"
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = UPLOAD_DIR / unique_filename

        # Save file
        async with aiofiles.open(file_path, "wb") as out_file:
            await out_file.write(content)

        # Transform image
        improved_content = transform_image(content)

        # Save improved image
        improved_filename = f"improved_{unique_filename}"
        improved_file_path = UPLOAD_DIR / improved_filename
        async with aiofiles.open(improved_file_path, "wb") as out_file:
            await out_file.write(improved_content)

        return {
            "message": "File uploaded and improved successfully",
            "filename": unique_filename,
            "improved_filename": improved_filename,
            "original_filename": file.filename,
            "content_type": file.content_type,
            "size": len(content),
            "file_path": str(file_path),
            "improved_file_path": str(improved_file_path),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "message": "HayAI Art Platform is running!"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
