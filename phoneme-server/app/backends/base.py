from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np


@dataclass
class EmissionsResult:
    """A frame x vocab matrix of CTC log-probabilities + the matching vocabulary.

    GOP-SF operates on the FULL emissions matrix, not just the argmax. We keep
    log-probs (not raw logits) so the scoring routines can pick whichever they
    need: probability-based GOP works on log-probs, and the logit-based variants
    in the 2025 Parikh paper accept either with a small adjustment.
    """

    log_probs: np.ndarray  # shape (T, V)
    logits: np.ndarray | None  # shape (T, V), optional but needed for GOPMaxLogit
    vocab: list[str]  # IPA-like phoneme tokens, length V
    blank_token_idx: int
    frame_stride_ms: float


class PhonemeBackend(Protocol):
    """Backend protocol implemented by wav2vec2phoneme / phoneticxeus."""

    name: str
    backend_vocab_tag: str

    def encode(self, audio: np.ndarray) -> EmissionsResult:
        """Run the model on a 16kHz mono float32 array."""
        ...

    def argmax_decode(self, emissions: EmissionsResult) -> str:
        """Return the argmax-decoded phoneme string (CTC-collapsed)."""
        ...
