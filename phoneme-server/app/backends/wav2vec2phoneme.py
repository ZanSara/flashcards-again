"""Default phoneme recogniser backend.

Uses `facebook/wav2vec2-lv-60-espeak-cv-ft` (Wav2Vec2Phoneme), which was
fine-tuned on Common Voice with espeak-ng G2P labels. That's why we route
text-to-phonemes through phonemizer/espeak-ng on the same `g2p.py` module:
the canonical IPA we score against must use the same vocabulary as the model
emits.

CPU-friendly. Loads the model once on first request and keeps it warm.
"""

from __future__ import annotations

import threading
from typing import Optional

import numpy as np
import torch
from transformers import AutoProcessor, AutoModelForCTC

from .base import EmissionsResult, PhonemeBackend

MODEL_ID = "facebook/wav2vec2-lv-60-espeak-cv-ft"
SAMPLE_RATE = 16000
FRAME_STRIDE_MS = 20.0  # wav2vec2 has 20ms stride after the conv subsampling


class Wav2Vec2PhonemeBackend(PhonemeBackend):
    name = "wav2vec2phoneme"
    backend_vocab_tag = "espeak-cv"

    _processor = None  # type: ignore[assignment]
    _model = None  # type: ignore[assignment]
    _vocab: list[str] = []
    _blank_idx: int = 0
    _lock = threading.Lock()

    def _ensure_loaded(self) -> None:
        with self._lock:
            if self._model is None:
                self._processor = AutoProcessor.from_pretrained(MODEL_ID)
                self._model = AutoModelForCTC.from_pretrained(MODEL_ID)
                self._model.eval()
                # vocab comes from the tokenizer
                tk = self._processor.tokenizer  # type: ignore[union-attr]
                vocab = tk.get_vocab()
                # vocab is dict[token -> id]; invert
                pairs = sorted(vocab.items(), key=lambda kv: kv[1])
                self._vocab = [p[0] for p in pairs]
                # blank id (CTC blank) is "<pad>" or whatever pad_token is for wav2vec2
                pad = tk.pad_token  # type: ignore[union-attr]
                self._blank_idx = vocab.get(pad, 0)

    def encode(self, audio: np.ndarray) -> EmissionsResult:
        self._ensure_loaded()
        inputs = self._processor(  # type: ignore[union-attr]
            audio, sampling_rate=SAMPLE_RATE, return_tensors="pt"
        )
        with torch.no_grad():
            outputs = self._model(**inputs)  # type: ignore[union-attr]
        logits = outputs.logits[0].cpu().numpy()  # (T, V)
        log_probs = torch.log_softmax(outputs.logits[0], dim=-1).cpu().numpy()
        return EmissionsResult(
            log_probs=log_probs.astype(np.float32),
            logits=logits.astype(np.float32),
            vocab=self._vocab,
            blank_token_idx=self._blank_idx,
            frame_stride_ms=FRAME_STRIDE_MS,
        )

    def argmax_decode(self, emissions: EmissionsResult) -> str:
        idxs = np.argmax(emissions.log_probs, axis=-1)
        # CTC-collapse: drop consecutive duplicates and blank
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
            if tok and tok not in {"<s>", "</s>", "<unk>", "<pad>", "|"}:
                out.append(tok)
            prev = i
        return " ".join(out)
