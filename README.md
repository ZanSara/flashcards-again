# flashcards-again

A self-hostable, single-user flashcard application with FSRS-6 scheduling,
automatic generation of front/back + cloze + audio + pronunciation cards
from a single note, and 2026-SOTA mispronunciation feedback (segmentation-free
Goodness of Pronunciation on top of a Wav2Vec2 phoneme recogniser).

> Solo mode: a single owner identified by a UUID derived from
> `SOLO_OWNER_SECRET`. Rotate the secret to "log out". RLS policies are in
> place so the schema is forward-compatible with multi-user mode (just swap
> `using (false)` for `using (auth.uid() = user_id)`).

## Stack

- **Web app:** SvelteKit (Svelte 5, TypeScript, Tailwind 4) on the Node adapter.
- **Database / storage:** hosted Supabase (Postgres + private `media` bucket).
- **Scheduler:** [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) (FSRS-6) on the server.
- **LLM (chat + TTS):** OpenAI for example sentences, suggestions, audio
  generation, and audio-choice distractors.
- **Phoneme sidecar:** Python FastAPI container running phonemizer + a CTC
  phoneme recogniser. Provides:
  - text-to-phonemes via espeak-ng (matches the recogniser's vocabulary);
  - audio-to-mispronunciation feedback via segmentation-free GOP + GOPMaxLogit;
  - optional espeak-ng TTS fallback.

## Architecture overview

```
┌──────────────┐          ┌─────────────────────┐
│ SvelteKit    │──────────►│  Supabase (cloud)   │
│ (Node, :3000)│          │  Postgres + Storage │
└──────┬───────┘          └─────────────────────┘
       │ chat / TTS
       ▼
   OpenAI API
       ▲
       │ audio + expected_phonemes (multipart)
       │
┌──────┴───────────────────────────────────┐
│ phoneme-server (FastAPI, :8000)          │
│  • wav2vec2phoneme (CPU, default)        │
│  • PhoneticXEUS (GPU, opt-in)            │
│  • GOP-SF + GOPMaxLogit                  │
│  • espeak-ng G2P + TTS fallback          │
└──────────────────────────────────────────┘
```

## Quick start (local dev)

```bash
# 1. Install Node 22+ and Python 3.11+ on your host (or skip Python — the
#    sidecar runs in Docker and the SvelteKit app talks to it over HTTP).
brew install node          # macOS
nvm use 22                 # alternative

# 2. Create a Supabase project, then configure environment:
cp .env.example .env
# Fill in PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY (or
# PUBLIC_SUPABASE_PUBLISHABLE_KEY), SUPABASE_SERVICE_ROLE, OPENAI_API_KEY (or
# OPENROUTER_API_KEY), DATABASE_URL, and a strong SOLO_OWNER_SECRET.

# 3. Apply database migrations (idempotent; tracks applied files in a
#    `_migrations` table):
npm install
npm run migrate
# Available commands:
#   npm run migrate          – apply any pending migrations
#   npm run migrate:status   – list applied / pending / drifted migrations
#   npm run migrate:dry      – show what would be applied without doing it

# 4. Start the dev server:
npm run dev
# → http://localhost:5173

# 5. Bring up the phoneme sidecar (only needed for pronunciation cards):
docker compose up -d phoneme-server
# Then point the app at it:
#   PHONEME_SERVER_URL=http://localhost:8000  (in your .env)
```

## Production deploy (homeserver)

```bash
docker compose up -d --build
```

This brings up two containers wired on a private bridge network:

- `app` (SvelteKit) on `${APP_PORT:-3000}` of the host.
- `phoneme-server` (Python sidecar) reachable only by `app`.

Put a reverse proxy (Caddy, Traefik, nginx, …) in front of `app` to handle
TLS. Example Caddy entry:

```
flashcards.example.com {
  reverse_proxy localhost:3000
}
```

### Updating

```bash
git pull
docker compose up -d --build
```

The phoneme model is cached in the `phoneme_cache` volume so subsequent
restarts don't re-download ~1GB of weights.

## Environment variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `PUBLIC_SUPABASE_URL` | yes | – | from supabase.com project settings |
| `PUBLIC_SUPABASE_ANON_KEY` | yes | – | from supabase.com project settings |
| `SUPABASE_SERVICE_ROLE` | yes | – | from supabase.com project settings; bypasses RLS |
| `OPENAI_API_KEY` | yes | – | used for chat + TTS |
| `OPENAI_CHAT_MODEL` | no | `gpt-4o-mini` | suggestions + example sentences |
| `OPENAI_TTS_MODEL` | no | `gpt-4o-mini-tts` | text-to-speech for audio cards |
| `OPENAI_TTS_VOICE` | no | `alloy` | default voice if user setting is unset |
| `PHONEME_BACKEND` | no | `wav2vec2phoneme` | or `phoneticxeus` (GPU only) |
| `PHONEME_SERVER_URL` | no | `http://phoneme-server:8000` | in compose, this is the service name |
| `PRONUNCIATION_BACKEND` | no | `sidecar` | or `speechace`, `simple-fallback` |
| `SPEECHACE_API_KEY` | no | – | only if `PRONUNCIATION_BACKEND=speechace` |
| `SOLO_OWNER_SECRET` | yes | – | a long random string; rotate to log out |
| `DATABASE_URL` | for `npm run migrate` | – | Postgres URI from Supabase → Settings → Database; only the migration runner uses this, the app talks to Postgres via the supabase-js client |
| `APP_PORT` | no | `3000` | host port published by docker-compose |

## Acknowledgements

The pronunciation pipeline implements ideas from:

- Cao, X. et al. *Segmentation-free Goodness of Pronunciation*,
  [arXiv:2507.16838](https://arxiv.org/abs/2507.16838) (2026 SOTA on
  SpeechOcean762).
- Parikh, A. K. et al. *Evaluating Logit-Based GOP Scores for Mispronunciation
  Detection*, Interspeech 2025.
- Bharadwaj, S. et al. *An Empirical Recipe for Universal Phone Recognition*
  (PhoneticXEUS), [arXiv:2603.29042](https://arxiv.org/abs/2603.29042).
