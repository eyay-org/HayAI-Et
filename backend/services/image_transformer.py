import base64
from io import BytesIO
from PIL import Image
from constants import client


def transform_image(image_path: str) -> str:
    """
    Transform an image using OpenAI's GPT-Image-1 image edit API
    """
    img = open(image_path, "rb")

    result = client.images.edit(
        model="gpt-image-1",
        image=img,
        prompt="Make this drawing beautiful and realistic",
        size="1024x1024",
    )

    image_base64 = result.data[0].b64_json
    image_bytes = base64.b64decode(image_base64)

    image = Image.open(BytesIO(image_bytes))
    image = image.resize((250, 375), Image.LANCZOS)

    improved_path = image_path.replace(".", "_improved.")
    image.save(improved_path, format="JPEG", quality=80, optimize=True)

    return improved_path
