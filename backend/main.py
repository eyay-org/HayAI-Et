from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
import aiofiles
from pathlib import Path
import uuid
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

        return {
            "message": "File uploaded and transformed successfully",
            "filename": unique_filename,
            "improved_filename": improved_file_path.split("/")[-1],
            "original_filename": file.filename,
            "file_path": str(file_path),
            "improved_file_path": improved_file_path,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "message": "HayAI Art Platform is running!"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
