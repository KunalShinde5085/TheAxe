# SharpeningTheAxe V3

Cloud-ready AI learning tracker with dynamic editing, deletion, progress, local fallback, JSON/CSV import/export, Gemini YouTube generation, and Supabase sync.

## IMPORTANT — preserve your existing Supabase setup

**Do not run `supabase/schema.sql` on an existing/custom Supabase project unless you have reviewed it first.** V3 does not require replacing your existing database. Your existing tables/data/RLS remain the source of truth.

Also keep your existing `js/config.js` values. This V3 package does not overwrite that file during the upgrade process; if you already customized it, retain your customized copy when publishing.

## V3 upgrades
- Rename courses
- Edit lesson title/description/difficulty/duration
- Rename modules (updates all lessons in that module)
- Add courses, modules, lessons
- Delete courses, modules, lessons
- 10-second Undo for deletions
- Search and completed/pending filters
- Dynamic progress and RED/YELLOW/GREEN status
- Local mode using localStorage
- Supabase authentication and data sync
- Gemini YouTube course generation through the deployed `analyze-youtube` Edge Function
- JSON/CSV import and export
- Daily target and browser reminder settings

## Existing Supabase connection
Use your already configured `js/config.js` and existing Supabase project. Do not reset or replace your database.

The deployed Edge Function name must remain:
`analyze-youtube`

The Gemini secret must remain in Supabase Edge Function secrets as:
`GEMINI_API_KEY`

## GitHub Pages
Upload the frontend files to GitHub Pages. Normal use requires only a browser and internet connection. No Node.js or Supabase CLI is required on the laptop once the Edge Function is already deployed.

## Edge Function
The project includes the source at:
`supabase/functions/analyze-youtube/index.ts`

If you already deployed the function, leave the deployed function as-is unless you intentionally update it. V3 frontend calls the function by the exact name `analyze-youtube`.

## Files intentionally not changed by the V3 frontend upgrade
- `js/config.js`
- `supabase/config.toml`
- `supabase/schema.sql`
- `supabase/functions/analyze-youtube/index.ts`
- `supabase/functions/import-course-json/index.ts`

These are kept so your existing Supabase configuration and deployed architecture are not silently replaced.
