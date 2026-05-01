"""phonemizer wrapper.

We prefer the active recogniser's vocabulary so that the canonical phonemes
returned here match the model's emissions exactly — that is what makes GOP-SF
mathematically valid.
"""

from __future__ import annotations

from typing import Iterable
import os

# Lazy import so the module loads even if phonemizer isn't usable in tests.
_phonemize = None


def _get_phonemize():
    global _phonemize
    if _phonemize is None:
        from phonemizer import phonemize  # type: ignore

        _phonemize = phonemize
    return _phonemize


def text_to_phonemes(text: str, lang: str = "") -> str:
    """Run espeak-ng G2P on `text`, returning a space-separated phoneme string."""
    if not text.strip():
        return ""
    iso = (lang or os.environ.get("DEFAULT_G2P_LANG", "en-us")).strip() or "en-us"
    phonemize = _get_phonemize()
    out = phonemize(
        [text],
        language=iso,
        backend="espeak",
        strip=True,
        preserve_punctuation=False,
        with_stress=False,
        njobs=1,
    )
    if isinstance(out, list):
        out = out[0] if out else ""
    return str(out).strip()


def split_phoneme_string(s: str) -> list[str]:
    """Split a phonemizer output into individual phoneme tokens.

    espeak phonemizer separates phones with spaces by default. We additionally
    drop suprasegmentals like length marks and stress that are not present in
    the wav2vec2 vocabulary, since GOP scoring matches against the recogniser's
    inventory.
    """
    cleaned = s.replace("ˈ", "").replace("ˌ", "").replace("ː", "").replace("'", "")
    return [p for p in cleaned.split() if p]


__all__: Iterable[str] = ("text_to_phonemes", "split_phoneme_string")
