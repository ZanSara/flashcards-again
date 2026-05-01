FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    HF_HOME=/cache/huggingface

# System deps:
#  - ffmpeg: needed by app.audio when decoding WebM/Opus uploads from MediaRecorder
#  - libespeak-ng-dev + espeak-ng: phonemizer G2P + the optional TTS fallback
#  - libsndfile1: soundfile dependency
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        espeak-ng \
        libespeak-ng-dev \
        libsndfile1 \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml ./
COPY app ./app

# CPU torch wheels (smaller than the default GPU build).
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu torch torchaudio \
    && pip install -e .

# Pre-create the cache dir so HuggingFace can populate it without permission errors.
RUN mkdir -p /cache/huggingface && chmod -R 777 /cache/huggingface

EXPOSE 8000
ENV PHONEME_BACKEND=wav2vec2phoneme

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -fsS http://localhost:8000/healthz || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
