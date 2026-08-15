# MSCS Plan

A static, Vercel-ready degree planner for Purdue University MS in Computer Science students. It combines term-specific graduate course offerings with a private browser-local planner, degree-progress checklist, timetable conflict detection, and Purdue-scale GPA calculator.

> Unofficial student tool. Always confirm enrollment, degree-plan, and graduation decisions with Purdue CS and your academic advisor.

## Features

- Search scheduled CS 50000+ course sections by term, title, code, or instructor.
- Add sections to a saved semester plan and detect overlapping meeting times.
- Switch between thesis and non-thesis degree paths.
- Track Systems I, Systems II, and Algorithms core requirements.
- Record completed courses and calculate a credit-weighted GPA/CGPA.
- Keep all draft data in the visitor's browser; no account is required for this release.

## Run locally

```bash
npm install
npm run import:sections  # regenerate bundled JSON after replacing CSV exports
npm run dev
```

`npm run build` produces the static site in `dist/`, ready for Vercel.

## Deploy on Vercel

1. Push this repository to GitHub.
2. In Vercel, select **Add New → Project** and import the repository.
3. Vercel detects Vite automatically; the included `vercel.json` explicitly uses `npm run build` and deploys `dist/`.
4. Deploy. No environment variables are required for the static release.

Every push to the production branch creates a new Vercel deployment.

## Data policy for this initial deployment

- Import only catalog entries where a listed subject is `CS` and its number is `50000` or higher.
- Cross-listed offerings are included only when they explicitly list an eligible CS code.
- `events.csv` is Fall 2026; `events_2.csv` is Spring 2026; `events_3.csv` is Fall 2025.
- The historic CSVs currently contain only untimed CS 69900 records at MS/PhD level. More complete graduate schedule exports should replace them as they become available.

## Firebase follow-up plan

1. Create a Firebase project, enable Email/Password Authentication, and create Firestore.
2. Add public Firebase web configuration through Vercel environment variables (`VITE_FIREBASE_*`); never commit it as a secret file.
3. Replace the local-storage adapter in `src/main.tsx` with an authenticated Firestore repository: `users/{uid}/plans/{planId}` and `users/{uid}/courses/{courseId}`.
4. Add Firestore rules requiring `request.auth.uid == userId` for every student-owned document.
5. Keep `sections.json` static and versioned by import until a staff/admin import workflow is needed; then add a protected catalog import job.
6. Add account migration that offers to copy the current browser-local plan into the first signed-in account.

The supplied `db/schema.sql` is a temporary local relational reference only. It is not used by the static Vercel deployment and can serve as a migration map if a server-side SQLite prototype is ever needed.
