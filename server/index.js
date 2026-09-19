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
  res.status(status).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

async function start() {
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

  // Recalculate status + furthest_status for every job from its event history
  const { rows: allJobs } = await pool.query('SELECT id FROM jobs');
  for (const { id } of allJobs) {
    await recalculateJobStatus(id);
  }
  console.log(`Recalculated status for ${allJobs.length} jobs`);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
