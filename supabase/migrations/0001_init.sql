-- ============================================================================
-- flashcards-again — initial schema
-- ============================================================================
-- Solo-mode app: a single owner UUID is derived from SOLO_OWNER_SECRET in the
-- application (see src/lib/server/soloAuth.ts). RLS is keyed off `user_id`,
-- which always equals that derived UUID for this single user. We do NOT use
-- Supabase Auth in solo mode; the app talks to Postgres via the service role
-- key (which bypasses RLS) and explicitly filters by `user_id`. The RLS
-- policies below are still defined so a future migration to Supabase Auth
-- (multi-user) is a one-line change in the policy expression.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

create type note_kind as enum ('word', 'phrase', 'sentence');
create type note_status as enum ('pending', 'active', 'archived');
create type note_source as enum ('manual', 'llm');

create type card_type as enum (
  'basic',
  'basic_reversed',
  'cloze',
  'audio_recognition',
  'audio_choice',
  'pronunciation'
);

create type example_sentence_status as enum ('queued', 'current', 'used');
create type media_kind as enum ('tts', 'user_recording');

-- ----------------------------------------------------------------------------
-- notes
-- ----------------------------------------------------------------------------
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  note_kind note_kind not null,
  front text not null,
  back text,
  -- extras: array of { key, value, type, visibility, display_hint? }
  extras jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  properties jsonb not null default '{}'::jsonb,
  source note_source not null default 'manual',
  status note_status not null default 'active',
  -- per-note overrides controlling which card_types the generator should emit
  card_type_overrides jsonb not null default '{}'::jsonb,
  -- Generated tsvector for full-text search across front/back + extras values.
  --
  -- Postgres forbids subqueries inside generated column expressions, so we
  -- can't aggregate over the extras array with `select string_agg(...)`. The
  -- built-in `jsonb_to_tsvector('simple', extras, '["string"]')` walks all
  -- string values in the JSONB and produces a tsvector — it's IMMUTABLE for
  -- the `'simple'` config (which is exactly what we want here, no language-
  -- specific stemming) so it's allowed in generated columns.
  search_vec tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(front, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(back, '')), 'B') ||
    setweight(jsonb_to_tsvector('simple', coalesce(extras, '[]'::jsonb), '["string"]'), 'C')
  ) stored
);

create index notes_user_status_idx on notes (user_id, status);
create index notes_tags_gin on notes using gin (tags);
create index notes_extras_gin on notes using gin (extras jsonb_path_ops);
create index notes_properties_gin on notes using gin (properties jsonb_path_ops);
create index notes_search_idx on notes using gin (search_vec);

-- updated_at trigger
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger notes_set_updated_at
  before update on notes
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- example_sentences (rotating pool, used by cloze cards on word/phrase notes)
-- ----------------------------------------------------------------------------
create table example_sentences (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references notes(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  text text not null,
  translation text not null default '',
  target_translation text not null default '',
  status example_sentence_status not null default 'queued'
);

create index example_sentences_note_status_idx
  on example_sentences (note_id, status);

-- exactly one `current` per note at any time; enforced via partial unique index
create unique index example_sentences_one_current_per_note
  on example_sentences (note_id)
  where status = 'current';

-- ----------------------------------------------------------------------------
-- cards (FSRS units derived from notes)
-- ----------------------------------------------------------------------------
create table cards (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references notes(id) on delete cascade,
  user_id uuid not null,
  card_type card_type not null,
  variant jsonb not null default '{}'::jsonb,
  -- soft session-ordering hint; does not affect FSRS scheduling
  priority smallint not null default 50,
  -- FSRS-6 state
  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  state smallint not null default 0,
  last_review timestamptz,
  reps integer not null default 0,
  lapses integer not null default 0,
  step smallint not null default 0,
  created_at timestamptz not null default now()
);

create index cards_user_due_idx on cards (user_id, due);
create index cards_note_idx on cards (note_id);
create index cards_user_state_due_idx on cards (user_id, state, due);

-- ----------------------------------------------------------------------------
-- reviews (append-only log)
-- ----------------------------------------------------------------------------
create table reviews (
  id bigserial primary key,
  card_id uuid not null references cards(id) on delete cascade,
  user_id uuid not null,
  rating smallint not null check (rating between 1 and 4),
  reviewed_at timestamptz not null default now(),
  elapsed_ms integer not null default 0,
  prev_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  example_sentence_id uuid references example_sentences(id) on delete set null
);

create index reviews_card_idx on reviews (card_id);
create index reviews_user_reviewed_idx on reviews (user_id, reviewed_at desc);

-- ----------------------------------------------------------------------------
-- media (cached TTS / user recordings)
-- ----------------------------------------------------------------------------
create table media (
  sha256 text primary key,
  user_id uuid not null,
  mime text not null,
  bytes integer not null,
  storage_path text not null,
  kind media_kind not null,
  created_at timestamptz not null default now()
);

create index media_user_kind_idx on media (user_id, kind);

create table note_media (
  note_id uuid not null references notes(id) on delete cascade,
  media_sha256 text not null references media(sha256) on delete cascade,
  purpose text not null default 'tts',
  primary key (note_id, media_sha256, purpose)
);

-- ----------------------------------------------------------------------------
-- ipa_cache (text → phonemes via phonemizer/espeak-ng)
-- ----------------------------------------------------------------------------
create table ipa_cache (
  text text not null,
  lang text not null default '',
  backend_vocab text not null,
  phonemes text not null,
  created_at timestamptz not null default now(),
  primary key (text, lang, backend_vocab)
);

-- ----------------------------------------------------------------------------
-- settings (singleton per user)
-- ----------------------------------------------------------------------------
create table settings (
  user_id uuid primary key,
  daily_new_limit integer,
  pending_threshold integer not null default 10,
  example_sentence_pool_size integer not null default 2,
  tts_voice text not null default 'openai-alloy',
  default_extras jsonb not null default '[]'::jsonb,
  fsrs_params jsonb not null default '{}'::jsonb,
  pronunciation_rating_thresholds jsonb not null default
    '{"good": 80, "hard": 60, "again": 40}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger settings_set_updated_at
  before update on settings
  for each row execute function set_updated_at();
