-- ============================================================================
-- Row-Level Security policies
-- ============================================================================
-- In solo mode the app uses the service-role key, which BYPASSES RLS. These
-- policies still exist as a safety net (in case anyone connects via the anon
-- key by accident) and as a forward-compatibility hook for a future
-- multi-user migration: swap `true` for `auth.uid() = user_id` in each policy.
-- ============================================================================

alter table notes enable row level security;
alter table example_sentences enable row level security;
alter table cards enable row level security;
alter table reviews enable row level security;
alter table media enable row level security;
alter table note_media enable row level security;
alter table ipa_cache enable row level security;
alter table settings enable row level security;

-- Solo-mode policies: deny anon access by default (the service role still has
-- full access because it bypasses RLS). When you migrate to multi-user, change
-- `using (false)` to `using (auth.uid() = user_id)` on each table.

create policy notes_anon_deny on notes for all using (false);
create policy example_sentences_anon_deny on example_sentences for all using (false);
create policy cards_anon_deny on cards for all using (false);
create policy reviews_anon_deny on reviews for all using (false);
create policy media_anon_deny on media for all using (false);
create policy note_media_anon_deny on note_media for all using (false);
create policy ipa_cache_anon_deny on ipa_cache for all using (false);
create policy settings_anon_deny on settings for all using (false);
