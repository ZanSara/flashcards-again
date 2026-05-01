# phoneme-server

FastAPI sidecar implementing:

- `POST /text-to-phonemes` — phonemizer/espeak-ng G2P, returns phonemes in
  the active recogniser's vocabulary (so GOP scoring sees a matching
  canonical phoneme set).
- `POST /pronunciation` — runs the CTC phoneme recogniser on user audio,
  computes per-canonical-phoneme GOP scores via segmentation-free Goodness
  of Pronunciation + GOPMaxLogit, returns:
  ```json
  {
    "overall_score": 0..100,
    "per_phoneme": [
      { "canonical": "i", "score": 42.0, "sound_most_like": "ɪ", "frame_span": [22, 27] }
    ],
    "actual_phonemes_argmax": "...",
    "expected_phonemes": "...",
    "backend": "wav2vec2phoneme"
  }
  ```
- `POST /tts-espeak` — robotic-but-free fallback TTS via espeak-ng.
- `GET  /healthz` — used by docker-compose's healthcheck.

## Backends

| Env | Model | Vocab | Hardware | Notes |
|---|---|---|---|---|
| `PHONEME_BACKEND=wav2vec2phoneme` (default) | `facebook/wav2vec2-lv-60-espeak-cv-ft` | espeak | CPU OK | ~21% multilingual PFER. The `-espeak-cv-ft` suffix means the model was trained against espeak G2P labels — that's why we route text→IPA through phonemizer/espeak-ng. |
| `PHONEME_BACKEND=phoneticxeus` | `changelinglab/PhoneticXeus` | IPAPack (395 IPA tokens) | GPU recommended | ~17.7% multilingual PFER; SOTA as of 2026. Requires installing the project's reference impl on `PYTHONPATH`. |

## Dev

```bash
cd phoneme-server
python -m venv .venv && source .venv/bin/activate
pip install -e .[dev]
pip install --extra-index-url https://download.pytorch.org/whl/cpu torch torchaudio
uvicorn app.main:app --reload
pytest tests/
```

## Why GOP-SF instead of "decode audio → IPA → diff"?

Naïve "argmax-decode the audio to an IPA string, then diff against expected"
throws away the strongest signal: *the model knows what was supposed to be said*.
GOP-SF uses the full CTC emissions matrix and computes per-canonical-phoneme
quality scores that align with human raters (Parikh et al. 2025), with
"sound_most_like" telling you exactly which phoneme you produced where you
should have produced something else. That's what powers the per-phoneme color
chips in the UI.
