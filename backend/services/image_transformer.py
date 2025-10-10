import base64
from constants import client


def transform_image(drawing_bytes: bytes) -> bytes:
    result = client.images.edit(
        model="gpt-image-1",
        image=drawing_bytes,
        prompt="Make this drawing beautiful and realistic",
    )

    return base64.b64decode(result.data[0].b64_json)
