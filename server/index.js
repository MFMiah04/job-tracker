require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./db');

const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const { recalculateJobStatus, statusOrderSQL } = jobRoutes;
const { ACTIVE_STAGES } = require('./statuses');
const experimentRoutes = require('./routes/experiments');
const statsRoutes = require('./routes/stats');
const adminRoutes = require('./routes/admin');
const taskRoutes = require('./routes/tasks');

const app = express();

// Render sits behind a proxy — trust it so req.ip is the caller, not the proxy
app.set('trust proxy', 1);

const corsOptions = {
  origin: ['http://localhost:5173', process.env.CLIENT_URL].filter(Boolean),
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/experiments', experimentRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tasks', taskRoutes);

// Global error handler — must have exactly 4 params so Express recognises it as an error handler
// Must be registered after all routes or it won't catch their errors
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || err.statusCode || 500;
  // Never send raw server or database error text to the client
  const message = status >= 500 ? 'Internal server error' : err.message || 'Request failed';
  res.status(status).json({ error: message });
});

const PORT = process.env.PORT || 3000;

async function start() {
  // users and jobs already exist on a live database; these only matter for a fresh setup
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company         TEXT NOT NULL,
      job_title       TEXT NOT NULL,
      source          TEXT,
      status          TEXT NOT NULL DEFAULT 'Applied',
      furthest_status TEXT,
      salary_min      INTEGER,
      salary_max      INTEGER,
      notes           TEXT,
      applied_at      TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS experiments (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      start_date DATE,
      end_date   DATE,
      notes      TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_status_events (
      id         SERIAL PRIMARY KEY,
      job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      status     TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Things to do for a job (an assessment, an interview); done_at is set when ticked off
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      link       TEXT,
      given_at   DATE NOT NULL DEFAULT CURRENT_DATE,
      due_at     DATE,
      done_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS furthest_status TEXT`);
  // Legacy: job-level "waiting" mark from before it moved onto each history event (see below)
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS waiting_status TEXT`);

  // Each OA/Interview event is either still to do (false) or done and waiting to hear back (true)
  const { rows: [{ exists: hadWaitingColumn }] } = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'job_status_events' AND column_name = 'waiting'
    ) AS exists
  `);
  await pool.query(`ALTER TABLE job_status_events ADD COLUMN IF NOT EXISTS waiting BOOLEAN NOT NULL DEFAULT FALSE`);
  if (!hadWaitingColumn) {
    await migrateWaitingToEvents();
  }
  await pool.query(`ALTER TABLE job_status_events ADD COLUMN IF NOT EXISTS notes TEXT`);

  // Backfill: create an Applied event for any job with no event history
  await pool.query(`
    INSERT INTO job_status_events (job_id, status, created_at)
    SELECT j.id, 'Applied', j.created_at
    FROM jobs j
    LEFT JOIN job_status_events e ON e.job_id = j.id
    WHERE e.id IS NULL
  `);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Runs after the server is listening so a long job list doesn't delay the first request
  recalculateAllJobs().catch(err => console.error('Background recalculation failed:', err));
}

// One-off, the first time events get a waiting flag:
//  - every OA/Interview event that isn't a job's latest event is a finished round → waiting
//  - a job marked waiting at its current stage passes that mark to its latest event
async function migrateWaitingToEvents() {
  const stages = ACTIVE_STAGES.map(s => `'${s}'`).join(', ');
  await pool.query(`
    WITH ranked AS (
      SELECT e.id, e.job_id,
             ROW_NUMBER() OVER (
               PARTITION BY e.job_id
               ORDER BY e.created_at::date DESC, ${statusOrderSQL('e.status')} DESC, e.created_at DESC
             ) AS rn
      FROM job_status_events e
    )
    UPDATE job_status_events e SET waiting = TRUE
    FROM ranked r, jobs j
    WHERE e.id = r.id AND j.id = e.job_id AND e.status IN (${stages})
      AND (r.rn > 1 OR (j.waiting_status IS NOT NULL AND j.waiting_status = j.status))
  `);
  await pool.query('UPDATE jobs SET waiting_status = NULL WHERE waiting_status IS NOT NULL');
  console.log('Moved waiting marks onto history events');
}

// Recalculate status + furthest_status for every job from its event history
async function recalculateAllJobs() {
  const { rows: allJobs } = await pool.query('SELECT id FROM jobs');
  for (const { id } of allJobs) {
    await recalculateJobStatus(id);
  }
  console.log(`Recalculated status for ${allJobs.length} jobs`);
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
