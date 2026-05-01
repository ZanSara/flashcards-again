"""Synthetic-emissions tests for GOP scoring.

These exercise the algorithm without loading any real model. We craft an
emissions matrix where the model very strongly emits a chosen phoneme and
verify the per-phoneme scores reflect the canonical alignment.
"""

import numpy as np
import pytest

from app.backends.base import EmissionsResult
from app.gop import score_pronunciation


def make_emissions(vocab: list[str], target_seq: list[str], blank: str = "<pad>") -> EmissionsResult:
    """One frame per target phoneme, each spiking on the chosen phoneme."""
    full_vocab = vocab if blank in vocab else [blank, *vocab]
    blank_idx = full_vocab.index(blank)
    V = len(full_vocab)
    T = len(target_seq)
    logits = np.full((T, V), -3.0, dtype=np.float32)
    for t, p in enumerate(target_seq):
        idx = full_vocab.index(p)
        logits[t, idx] = 9.0
    log_probs = logits - np.log(np.exp(logits).sum(axis=-1, keepdims=True))
    return EmissionsResult(
        log_probs=log_probs.astype(np.float32),
        logits=logits.astype(np.float32),
        vocab=full_vocab,
        blank_token_idx=blank_idx,
        frame_stride_ms=20.0,
    )


def test_perfect_match_scores_high():
    vocab = ["a", "b", "c"]
    em = make_emissions(vocab, ["a", "b", "c"])
    out = score_pronunciation(em, ["a", "b", "c"], "a b c")
    assert out.overall_score > 90
    assert all(p.canonical == p.sound_most_like for p in out.per_phoneme)


def test_substitution_lowers_score_and_reports_actual():
    vocab = ["a", "b", "c"]
    em = make_emissions(vocab, ["a", "c", "c"])  # said /c/ where /b/ should be
    out = score_pronunciation(em, ["a", "b", "c"], "a c c")
    assert out.per_phoneme[1].canonical == "b"
    assert out.per_phoneme[1].score < 50
    assert out.per_phoneme[1].sound_most_like == "c"


def test_oov_canonical_phoneme_is_handled():
    vocab = ["a", "b", "c"]
    em = make_emissions(vocab, ["a", "b", "c"])
    out = score_pronunciation(em, ["a", "z", "c"], "a b c")
    assert len(out.per_phoneme) == 3
    # OOV gets neutral score and a non-canonical 'sound_most_like'
    assert out.per_phoneme[1].canonical == "z"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
