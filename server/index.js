require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./db');

const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const { recalculateJobStatus } = jobRoutes;
const experimentRoutes = require('./routes/experiments');
const statsRoutes = require('./routes/stats');

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
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS furthest_status TEXT`);
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
