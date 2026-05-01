"""espeak-ng TTS fallback.

Quality is much lower than OpenAI TTS but it's free, instant, offline, and
already in the container (we need libespeak-ng for phonemizer anyway).
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path


class EspeakUnavailable(RuntimeError):
    pass


def synthesize(text: str, lang: str = "en-us") -> bytes:
    """Run espeak-ng and return WAV bytes. Raises EspeakUnavailable if missing."""
    bin_path = shutil.which("espeak-ng") or shutil.which("espeak")
    if not bin_path:
        raise EspeakUnavailable("espeak-ng not on PATH")

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        out_path = Path(f.name)
    try:
        subprocess.run(
            [bin_path, "-v", lang or "en-us", "-w", str(out_path), text],
            check=True,
            capture_output=True,
        )
        return out_path.read_bytes()
    finally:
        out_path.unlink(missing_ok=True)
