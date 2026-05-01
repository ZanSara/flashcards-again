# Supabase setup

These migrations target a hosted Supabase project. The app uses the
**service-role** key for all database access in solo mode (RLS is bypassed),
so the policies in `0002_rls.sql` exist mostly as a forward-compat hook for
later multi-user mode.

## One-time setup

1. Create a project at <https://supabase.com>.
2. Copy the URL, anon (or publishable) key, service-role key, **and** the
   Postgres connection string into `.env` (see `.env.example`).
3. Apply the migrations:

   ```bash
   npm run migrate
   ```

   This connects via `DATABASE_URL` and applies every `*.sql` file in this
   directory in lexical order, tracking applied filenames in a `_migrations`
   table so re-runs are idempotent. Use `npm run migrate:status` to see what
   is pending or drifted.

   Migrations included:
   - `0001_init.sql` — schema, enums, indexes, triggers
   - `0002_rls.sql` — row-level security policies (deny-all under anon key)
   - `0003_storage.sql` — private `media` bucket

   Alternative: paste each file into the Supabase SQL editor manually. The
   migration script is just a convenience.

## Regenerating types

If you change the schema, regenerate `src/lib/database.types.ts`:

```bash
npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
```

The currently-checked-in version is hand-written but follows the exact same
shape Supabase generates; substituting it should be a drop-in replacement.
