# Study Planner

A lightweight personal study planner built with plain HTML, CSS, and JavaScript. It includes task planning, calendar views, Pomodoro tracking, progress stats, Firebase sync, local backups, and optional deployment on Vercel.

## Features

- Home dashboard with daily stats and study quote
- Month, week, and day calendar views
- Add, edit, delete, and repeat calendar events
- Task creation with category, priority, due date, recurrence, search, sorting, and edit/delete controls
- Pomodoro timer with session log, cycle progress, sound, and browser notifications
- Progress dashboard for task completion, streaks, and Pomodoro activity
- Firebase Realtime Database sync
- JSON export/import for local backups
- Responsive layout for desktop and mobile
- Optional Google Apps Script backend scaffold in `Code.gs`

## Project Structure

```text
.
├── Study_Planner.html   # Main app markup
├── Study_Planner.css    # App styling and responsive layout
├── Study_Planner.js     # Planner logic, storage, sync, and UI rendering
├── Code.gs              # Optional Google Apps Script backend scaffold
└── vercel.json          # Vercel route config
```

## Run Locally

Open `Study_Planner.html` directly in your browser.

The app stores planner data in `localStorage` by default, so it works without a backend.

## Firebase Sync

1. Create a Firebase project.
2. Go to Realtime Database and create a database.
3. Copy the database URL.
4. Open the planner.
5. Click the settings icon.
6. Paste the Firebase Realtime Database URL and save.

Test mode is useful while experimenting, but use locked-down database rules before storing real personal data.

## Backup And Restore

Use the settings modal to export your planner data as JSON. You can import that JSON later to restore tasks, events, Pomodoro history, and streak data.

## Deploy To Vercel

This project is configured so `/` serves `Study_Planner.html`.

```bash
vercel
```

or connect the GitHub repository to Vercel and deploy from `main`.

## Notes

- `Code.gs` is optional and is not currently used by the HTML app. The current frontend syncs directly with Firebase.
- Browser notifications require permission from the browser.
- Data entered into the app is escaped before rendering to reduce unsafe HTML injection risk.



