"""Optional GPU backend: PhoneticXEUS (changelinglab/PhoneticXeus).

Significantly more accurate than wav2vec2-phoneme on multilingual speech
(~17.7% PFER vs ~21%) but requires CUDA. Lazy-loaded only when
PHONEME_BACKEND=phoneticxeus.

The model has its own 395-token IPA vocabulary; for GOP-SF to work, the
canonical phoneme string from `g2p.py` must be projected into this vocab via
a small lookup table. We rely on the project's own ipa_vocab.json.
"""

from __future__ import annotations

import threading
from typing import Optional

import numpy as np
import torch

from .base import EmissionsResult, PhonemeBackend

FRAME_STRIDE_MS = 20.0  # XEUS effective stride; close enough for short utterances


class PhoneticXeusBackend(PhonemeBackend):
    name = "phoneticxeus"
    backend_vocab_tag = "ipapack"

    _model = None  # type: ignore[assignment]
    _vocab: list[str] = []
    _blank_idx: int = 0
    _lock = threading.Lock()

    def _ensure_loaded(self) -> None:
        # Heavy import deferred until first use; users without GPU wheels
        # installed will see a meaningful ImportError here rather than at
        # container start.
        from huggingface_hub import hf_hub_download

        with self._lock:
            if self._model is not None:
                return
            try:
                # The reference impl lives in `src/model/xeusphoneme/builders.py`
                # of the changelinglab/PhoneticXeus repo. Users installing the
                # `phoneticxeus` extra are expected to clone it and add to
                # PYTHONPATH.
                from src.model.xeusphoneme.builders import (  # type: ignore
                    build_xeus_pr_inference,
                )
            except ImportError as e:
                raise RuntimeError(
                    "PhoneticXEUS reference implementation not on PYTHONPATH. "
                    "Install the optional `phoneticxeus` extra and clone "
                    "https://github.com/changelinglab/PhoneticXeus into the image."
                ) from e

            ckpt = hf_hub_download("changelinglab/PhoneticXeus", "phoneticxeus_state_dict.pt")
            vocab_path = hf_hub_download("changelinglab/PhoneticXeus", "ipa_vocab.json")
            self._model = build_xeus_pr_inference(
                work_dir="exp/cache/xeus",
                hf_repo="espnet/xeus",
                checkpoint=ckpt,
                vocab_file=vocab_path,
                device="cuda" if torch.cuda.is_available() else "cpu",
                interctc_weight=0.3,
                interctc_layer_idx=[4, 8, 12],
                interctc_use_conditioning=True,
                ctc_weight=1.0,
            )
            import json

            with open(vocab_path) as f:
                vocab = json.load(f)
            pairs = sorted(vocab.items(), key=lambda kv: kv[1])
            self._vocab = [p[0] for p in pairs]
            self._blank_idx = vocab.get("<blank>", vocab.get("<pad>", 0))

    def encode(self, audio: np.ndarray) -> EmissionsResult:
        self._ensure_loaded()
        wav = torch.from_numpy(audio).float()
        with torch.no_grad():
            results = self._model(wav)  # type: ignore[misc]
        # The reference impl exposes raw posteriors; if not, fall back to argmax-only.
        # Shape: (T, V) log-probs.
        if isinstance(results, dict) and "log_probs" in results:
            log_probs = results["log_probs"].cpu().numpy()
            logits = results.get("logits")
            if logits is not None:
                logits = logits.cpu().numpy()
        else:
            # Some inference wrappers only return the decoded transcript; in
            # that case we cannot do GOP-SF. Surface a clear error.
            raise RuntimeError(
                "PhoneticXEUS inference returned no emissions matrix; ensure you "
                "are using a build that exposes log_probs (see project README)."
            )
        return EmissionsResult(
            log_probs=log_probs.astype(np.float32),
            logits=logits.astype(np.float32) if logits is not None else None,
            vocab=self._vocab,
            blank_token_idx=self._blank_idx,
            frame_stride_ms=FRAME_STRIDE_MS,
        )

    def argmax_decode(self, emissions: EmissionsResult) -> str:
        idxs = np.argmax(emissions.log_probs, axis=-1)
        out: list[str] = []
        prev: Optional[int] = None
        blank = emissions.blank_token_idx
        for i in idxs.tolist():
            if i == blank:
                prev = i
                continue
            if i == prev:
                continue
            tok = emissions.vocab[i]
            out.append(tok)
            prev = i
        return " ".join(out)
