---
title: Images
description: Generate images with models that support image output.
---

```python
result = client.images.generate(
    model="vendor/image-model",
    prompt="An isometric illustration of a data center at dusk",
    n=1,
    size="1024x1024",
)
print(result.data[0].url)
```

Image generation is available for catalog models with the **Image generation** capability. These models are priced per image, and the number of images returned is billed as `units` in the request log. Check the [catalog](/models) for current availability.
