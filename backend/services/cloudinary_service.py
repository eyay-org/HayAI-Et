"""
Cloudinary Service for Image Upload and Management
"""
import os
import cloudinary
import cloudinary.uploader
import cloudinary.api
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

# Configure Cloudinary
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True
)


def upload_image(file_path: str, folder: str = "hayai/uploads", public_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Upload an image to Cloudinary
    
    Args:
        file_path: Local path to the image file
        folder: Cloudinary folder to store the image
        public_id: Optional custom public ID for the image
    
    Returns:
        Dict containing upload result with secure_url, public_id, etc.
    """
    upload_options = {
        "folder": folder,
        "resource_type": "image",
        "overwrite": True,
        "invalidate": True,
    }
    
    if public_id:
        upload_options["public_id"] = public_id
    
    result = cloudinary.uploader.upload(file_path, **upload_options)
    
    return {
        "secure_url": result["secure_url"],
        "public_id": result["public_id"],
        "width": result.get("width"),
        "height": result.get("height"),
        "format": result.get("format"),
        "bytes": result.get("bytes"),
    }


def upload_image_from_bytes(image_bytes: bytes, folder: str = "hayai/uploads", public_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Upload image bytes to Cloudinary
    
    Args:
        image_bytes: Image data as bytes
        folder: Cloudinary folder to store the image
        public_id: Optional custom public ID for the image
    
    Returns:
        Dict containing upload result with secure_url, public_id, etc.
    """
    upload_options = {
        "folder": folder,
        "resource_type": "image",
        "overwrite": True,
        "invalidate": True,
    }
    
    if public_id:
        upload_options["public_id"] = public_id
    
    result = cloudinary.uploader.upload(image_bytes, **upload_options)
    
    return {
        "secure_url": result["secure_url"],
        "public_id": result["public_id"],
        "width": result.get("width"),
        "height": result.get("height"),
        "format": result.get("format"),
        "bytes": result.get("bytes"),
    }


def delete_image(public_id: str) -> bool:
    """
    Delete an image from Cloudinary
    
    Args:
        public_id: The public ID of the image to delete
    
    Returns:
        True if deletion was successful
    """
    try:
        result = cloudinary.uploader.destroy(public_id)
        return result.get("result") == "ok"
    except Exception as e:
        print(f"Error deleting image {public_id}: {e}")
        return False


def get_image_url(public_id: str, transformation: Optional[Dict] = None) -> str:
    """
    Get URL for an image with optional transformations
    
    Args:
        public_id: The public ID of the image
        transformation: Optional transformation parameters
    
    Returns:
        The image URL
    """
    if transformation:
        return cloudinary.CloudinaryImage(public_id).build_url(**transformation)
    return cloudinary.CloudinaryImage(public_id).build_url()


def upload_avatar(file_path: str, user_id: int) -> Dict[str, Any]:
    """
    Upload a user avatar to Cloudinary
    
    Args:
        file_path: Local path to the avatar image
        user_id: User ID for naming the avatar
    
    Returns:
        Dict containing upload result
    """
    return upload_image(
        file_path,
        folder="hayai/avatars",
        public_id=f"avatar_{user_id}"
    )

