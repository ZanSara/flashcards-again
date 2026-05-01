"""FastAPI sidecar exposing phoneme + pronunciation services."""

from __future__ import annotations

import os
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import JSONResponse

from .audio import decode_to_16k_mono
from .backends import PhonemeBackend
from .backends.wav2vec2phoneme import Wav2Vec2PhonemeBackend
from .g2p import split_phoneme_string, text_to_phonemes
from .gop import score_pronunciation
from .tts import EspeakUnavailable, synthesize as espeak_synth

BACKEND_NAME = os.environ.get("PHONEME_BACKEND", "wav2vec2phoneme").strip()


def _make_backend() -> PhonemeBackend:
    if BACKEND_NAME == "phoneticxeus":
        from .backends.phoneticxeus import PhoneticXeusBackend

        return PhoneticXeusBackend()
    return Wav2Vec2PhonemeBackend()


_backend: PhonemeBackend | None = None


def get_backend() -> PhonemeBackend:
    global _backend
    if _backend is None:
        _backend = _make_backend()
    return _backend


app = FastAPI(title="phoneme-server", version="0.1.0")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "backend": BACKEND_NAME}


@app.post("/text-to-phonemes")
async def text_to_phonemes_endpoint(payload: dict) -> JSONResponse:
    text = str(payload.get("text", ""))
    lang = str(payload.get("lang", "") or "en-us")
    if not text.strip():
        raise HTTPException(status_code=400, detail="text required")
    phonemes = text_to_phonemes(text, lang)
    return JSONResponse(
        {
            "phonemes": phonemes,
            "backend_vocab": get_backend().backend_vocab_tag,
        }
    )


@app.post("/tts-espeak")
async def tts_espeak_endpoint(payload: dict) -> Response:
    text = str(payload.get("text", ""))
    lang = str(payload.get("lang", "") or "en-us")
    if not text.strip():
        raise HTTPException(status_code=400, detail="text required")
    try:
        wav = espeak_synth(text, lang)
    except EspeakUnavailable as e:
        raise HTTPException(status_code=501, detail=str(e))
    return Response(content=wav, media_type="audio/wav")


@app.post("/pronunciation")
async def pronunciation_endpoint(
    audio: Annotated[UploadFile, File()],
    text: Annotated[str, Form()],
    lang: Annotated[str, Form()] = "en-us",
    expected_phonemes: Annotated[str | None, Form()] = None,
) -> JSONResponse:
    audio_bytes = await audio.read()
    wav = decode_to_16k_mono(audio_bytes, audio.content_type)
    if wav.size == 0:
        raise HTTPException(status_code=400, detail="empty audio")

    canonical_str = (expected_phonemes or text_to_phonemes(text, lang)).strip()
    canonical_phonemes = split_phoneme_string(canonical_str)

    backend = get_backend()
    emissions = backend.encode(wav)
    actual = backend.argmax_decode(emissions)

    outcome = score_pronunciation(emissions, canonical_phonemes, actual)
    return JSONResponse(
        {
            "overall_score": round(outcome.overall_score, 2),
            "per_phoneme": [
                {
                    "canonical": p.canonical,
                    "score": round(p.score, 2),
                    "sound_most_like": p.sound_most_like,
                    "frame_span": [int(p.frame_span[0]), int(p.frame_span[1])],
                }
                for p in outcome.per_phoneme
            ],
            "actual_phonemes_argmax": outcome.actual_phonemes_argmax,
            "expected_phonemes": canonical_str,
            "backend": backend.name,
        }
    )
