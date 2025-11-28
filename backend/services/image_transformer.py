"""
Image Transformer Service using OpenAI GPT-Image-1
Uploads images to Cloudinary and returns URLs
"""
import base64
from io import BytesIO
from PIL import Image
from constants import client
from services.cloudinary_service import upload_image, upload_image_from_bytes
from typing import Dict, Any
import tempfile
import os


def transform_image(image_path: str, prompt: str) -> Dict[str, Any]:
    """
    Transform an image using OpenAI's GPT-Image-1 image edit API
    and upload both original and improved images to Cloudinary.
    
    Args:
        image_path: Path to the original image
        prompt: Transformation prompt for OpenAI
    
    Returns:
        Dict containing:
            - original_url: Cloudinary URL of original image
            - original_public_id: Cloudinary public ID of original
            - improved_url: Cloudinary URL of improved image
            - improved_public_id: Cloudinary public ID of improved
    """
    # Get original image dimensions
    with Image.open(image_path) as original_img:
        original_width, original_height = original_img.size
    
    # Determine the appropriate size for the API call
    # The API supports: '1024x1024', '1024x1536', '1536x1024', and 'auto'
    aspect_ratio = original_width / original_height
    
    if aspect_ratio > 1.2:  # Landscape (wider than tall)
        api_size = "1536x1024"
    elif aspect_ratio < 0.8:  # Portrait (taller than wide)
        api_size = "1024x1536"
    else:  # Square-ish or close to square
        api_size = "1024x1024"

    # Upload original image to Cloudinary first
    original_result = upload_image(image_path, folder="hayai/originals")
    
    # Call OpenAI API for transformation
    with open(image_path, "rb") as img:
        result = client.images.edit(
            model="gpt-image-1",
            image=img,
            prompt=prompt or "Make this drawing beautiful and realistic",
            size=api_size,
        )

    image_base64 = result.data[0].b64_json
    image_bytes = base64.b64decode(image_base64)

    # Process the improved image
    image = Image.open(BytesIO(image_bytes))
    
    # Resize to original dimensions to preserve aspect ratio
    image = image.resize((original_width, original_height), Image.LANCZOS)

    # Save to temporary file for upload
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_file:
        image.save(tmp_file, format="JPEG", quality=80, optimize=True)
        tmp_path = tmp_file.name
    
    try:
        # Upload improved image to Cloudinary
        improved_result = upload_image(tmp_path, folder="hayai/improved")
    finally:
        # Clean up temporary file
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    
    # Clean up original local file if it exists
    if os.path.exists(image_path):
        try:
            os.remove(image_path)
        except:
            pass
    
    return {
        "original_url": original_result["secure_url"],
        "original_public_id": original_result["public_id"],
        "improved_url": improved_result["secure_url"],
        "improved_public_id": improved_result["public_id"],
    }


def transform_image_legacy(image_path: str, prompt: str) -> str:
    """
    Legacy function for backward compatibility.
    Transform an image and save locally (for local development only).
    
    Args:
        image_path: Path to the original image
        prompt: Transformation prompt for OpenAI
    
    Returns:
        Path to the improved image
    """
    # Get original image dimensions
    with Image.open(image_path) as original_img:
        original_width, original_height = original_img.size
    
    aspect_ratio = original_width / original_height
    
    if aspect_ratio > 1.2:
        api_size = "1536x1024"
    elif aspect_ratio < 0.8:
        api_size = "1024x1536"
    else:
        api_size = "1024x1024"

    with open(image_path, "rb") as img:
        result = client.images.edit(
            model="gpt-image-1",
            image=img,
            prompt=prompt or "Make this drawing beautiful and realistic",
            size=api_size,
        )

    image_base64 = result.data[0].b64_json
    image_bytes = base64.b64decode(image_base64)

    image = Image.open(BytesIO(image_bytes))
    image = image.resize((original_width, original_height), Image.LANCZOS)

    improved_path = image_path.replace(".", "_improved.")
    image.save(improved_path, format="JPEG", quality=80, optimize=True)

    return improved_path
