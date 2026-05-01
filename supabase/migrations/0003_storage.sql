-- ============================================================================
-- Storage bucket for cached TTS + user recordings
-- ============================================================================
-- Run after the Supabase project is created. Bucket is private; the app
-- generates signed URLs server-side for client playback.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;
