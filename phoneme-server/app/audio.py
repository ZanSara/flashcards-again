"""Audio decoding helpers.

The web app sends WebM/Opus blobs from MediaRecorder; we decode them to a
16kHz mono float32 numpy array on the way into the recognisers.
"""

from __future__ import annotations

import io
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

TARGET_SR = 16000


def decode_to_16k_mono(audio_bytes: bytes, mime: str | None = None) -> np.ndarray:
    """Decode an arbitrary audio blob to a 16kHz mono float32 numpy array.

    soundfile handles WAV/FLAC/OGG natively. For WebM/Opus blobs from
    MediaRecorder we shell out to ffmpeg, which is in the container image.
    """
    try:
        data, sr = sf.read(io.BytesIO(audio_bytes), dtype="float32", always_2d=False)
    except Exception:
        data = None
        sr = 0
    if data is None:
        # Fall back to ffmpeg via a temp file for everything soundfile can't read.
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=True) as inf:
            inf.write(audio_bytes)
            inf.flush()
            out_path = Path(inf.name).with_suffix(".wav")
            try:
                subprocess.run(
                    [
                        "ffmpeg",
                        "-y",
                        "-loglevel",
                        "error",
                        "-i",
                        inf.name,
                        "-ar",
                        str(TARGET_SR),
                        "-ac",
                        "1",
                        "-f",
                        "wav",
                        str(out_path),
                    ],
                    check=True,
                )
                data, sr = sf.read(str(out_path), dtype="float32", always_2d=False)
            finally:
                out_path.unlink(missing_ok=True)

    if data.ndim == 2:
        data = data.mean(axis=1)
    if sr != TARGET_SR:
        # Linear resample is fine for short clips; ffmpeg path already resampled.
        ratio = TARGET_SR / float(sr)
        new_len = int(round(len(data) * ratio))
        if new_len <= 1:
            return np.zeros(0, dtype=np.float32)
        x_new = np.linspace(0.0, 1.0, num=new_len, dtype=np.float64)
        x_old = np.linspace(0.0, 1.0, num=len(data), dtype=np.float64)
        data = np.interp(x_new, x_old, data).astype(np.float32)
    return data.astype(np.float32, copy=False)
