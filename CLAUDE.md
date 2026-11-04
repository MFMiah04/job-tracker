# Job Tracker

React (Vite) client in `client/`, Express + Postgres (Neon) server in `server/`. Deployed: client on Vercel, server on Render.

## Checking the user's applications

When asked about job applications, statuses, tasks, interviews or stats, read the snapshot instead of guessing:

1. Refresh it: `cd server && npm run snapshot` (read-only; uses `DATABASE_URL` and `SNAPSHOT_EMAIL` from `server/.env`).
2. Read `snapshot/jobs.md` (summary, open tasks, waiting, every job with history) or `snapshot/jobs.json` (same data, structured).

The file header says when it was generated. If refreshing fails (no network, missing env), say so and use the existing file, stating its age.

`snapshot/` holds personal data and is git-ignored — never commit it, and never write to the database while answering questions about it.

## How status works

- A job's status is derived from its history events (`job_status_events`), never set directly; see `deriveJobState` in `server/routes/jobs.js`.
- OA and Interview events each carry a `waiting` flag: to do (false) or done and waiting on the employer (true). Adding a newer stage marks earlier rounds as waiting.
- Dashboard "N to do" counts open tasks only (`tasks` table); "Waiting" means at OA/Interview with no open tasks and every round marked waiting.

## Checks before committing

- `cd server && npm test`
- `cd client && npm run lint && npm run build`
