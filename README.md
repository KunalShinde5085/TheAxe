# SharpeningTheAxe MAX

AI-powered learning tracker using:
- Static HTML/CSS/JavaScript frontend
- Supabase Auth + Postgres + Row Level Security
- Supabase Edge Function for Gemini
- Gemini YouTube video understanding
- JSON and CSV import/export
- Local fallback for progress

## Important: Gemini is not "unlimited free"

Google currently documents the YouTube URL feature as a preview available at no charge, with free-tier limits. Google documents a free-tier limit of up to 8 hours of YouTube video per day for this feature. Limits/pricing can change. Do not design the application assuming unlimited free AI calls.

## Folder

D:\SharpeningTheAxe\
  index.html
  README.md
  .env.example
  .gitignore
  css\style.css
  js\config.js
  js\app.js
  supabase\schema.sql
  supabase\config.toml
  supabase\functions\analyze-youtube\index.ts
  supabase\functions\import-course-json\index.ts

## 1. Create Supabase project

Create a project at Supabase.

Then open SQL Editor and run the COMPLETE file:
supabase/schema.sql

This creates:
courses
lessons
lesson_progress
study_sessions
daily_goals
reminders
RLS policies and indexes

## 2. Get Supabase browser settings

In Supabase Dashboard -> Settings -> API Keys, copy:
- Project URL
- Publishable key

Put them in:
js/config.js

Example:
window.STA_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_..."
};

The publishable key is intended for browser use with RLS. NEVER put a Supabase secret/service-role key in js/config.js.

## 3. Create Google AI Studio key

Create a Gemini API key in Google AI Studio.

DO NOT paste the Gemini key into index.html or js/app.js.

The key belongs in the Supabase Edge Function secret:
GEMINI_API_KEY

## 4. Deploy the Edge Function

Install Supabase CLI if you want CLI deployment.

From this project folder:

supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_KEY
supabase functions deploy analyze-youtube

The function is:
supabase/functions/analyze-youtube/index.ts

It receives:
{ "youtube_url": "...", "course_name": "..." }

It sends the public YouTube URL to Gemini and asks for structured JSON.

## 5. Run

For the simplest local test, double-click index.html.

For more reliable browser behavior, serve the folder using a local static server, for example VS Code Live Server.

Your taskbar shortcut can continue to point to:
D:\SharpeningTheAxe\index.html

## 6. First use

1. Open the dashboard.
2. Create a Supabase account or sign in.
3. Paste a public YouTube educational video URL.
4. Click Generate course.
5. Gemini returns structured course JSON.
6. The frontend saves the course and lessons in Supabase.
7. Tick lessons as completed.
8. Progress updates dynamically.
9. Export the data as JSON or CSV whenever you want.

## 7. Data flow

YouTube URL
  -> Browser
  -> Supabase Edge Function
  -> Gemini API
  -> Structured JSON
  -> Browser
  -> Supabase Postgres
  -> Dashboard

The browser NEVER receives the Gemini secret.

## 8. Why JSON is the primary AI format

AI should generate structured JSON because the database has relationships:
course -> modules -> lessons -> progress.

CSV is kept for human import/export. It is intentionally flatter.

## 9. YouTube limitations

The Gemini YouTube URL input is for public YouTube videos. Private/unlisted videos are not supported by this input method. Free-tier usage has limits. If a video cannot be processed, use a transcript/text import in a later version.

## 10. Future MAX upgrades

Recommended next modules:
- AI quiz after each lesson
- AI notes
- AI daily schedule
- watch-time tracking
- calendar
- reminder service
- course editing
- playlist import
- transcript fallback
- spaced repetition
- skill graph
- achievements
- PWA/offline support
- Excel import/export
- Windows Task Scheduler reminder
