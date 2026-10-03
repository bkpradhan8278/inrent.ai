---
title: Audio
description: Speech-to-text and text-to-speech status.
---

`POST /audio/transcriptions` and `POST /audio/speech` are not available yet. Calls return:

```json
{ "error": { "type": "not_supported_error", "code": "endpoint_not_supported", "message": "Audio transcription is not available yet. ..." } }
```

Models that accept audio **input** in chat (multimodal models) can be used through `/chat/completions` with `input_audio` content parts where the model supports them.

Follow the [changelog](/changelog) for availability.
