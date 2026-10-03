---
title: Vision
description: Send images to vision-capable models.
---

Use content parts with `image_url`. URLs and base64 data URLs are both accepted.

```python
response = client.chat.completions.create(
    model="inrent/auto",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "What's in this image?"},
            {"type": "image_url", "image_url": {"url": "https://example.com/photo.jpg"}},
        ],
    }],
)
```

When a request contains images, INRENT routes only to endpoints that accept image input. For providers with native formats (such as Anthropic), images are translated automatically. Data URLs are sent as inline base64; other URLs are passed by reference.

Image tokens are counted by the provider and billed as input tokens.
