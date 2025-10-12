import base64
from io import BytesIO
from PIL import Image
from constants import client


def transform_image(image_path: str) -> str:
    """
    Transform an image using OpenAI's GPT-Image-1 image edit API
    """
    # Get original image dimensions
    with Image.open(image_path) as original_img:
        original_width, original_height = original_img.size
    
    # Determine the appropriate size for the API call
    # The API supports: '1024x1024', '1024x1536', '1536x1024', and 'auto'
    # We'll choose based on the original image's aspect ratio
    aspect_ratio = original_width / original_height
    
    if aspect_ratio > 1.2:  # Landscape (wider than tall)
        api_size = "1536x1024"
    elif aspect_ratio < 0.8:  # Portrait (taller than wide)
        api_size = "1024x1536"
    else:  # Square-ish or close to square
        api_size = "1024x1024"

    img = open(image_path, "rb")

    result = client.images.edit(
        model="gpt-image-1",
        image=img,
        prompt="Make this drawing beautiful and realistic",
        size=api_size,
    )

    image_base64 = result.data[0].b64_json
    image_bytes = base64.b64decode(image_base64)

    image = Image.open(BytesIO(image_bytes))
    
    # Resize to original dimensions to preserve aspect ratio
    image = image.resize((original_width, original_height), Image.LANCZOS)

    improved_path = image_path.replace(".", "_improved.")
    image.save(improved_path, format="JPEG", quality=80, optimize=True)

    return improved_path
