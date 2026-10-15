const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const { PIPELINE, VALID_STATUSES } = require('../statuses');

const router = express.Router();

// Protect all routes in this file — verifyToken runs before every handler below
router.use(verifyToken);

// Ids are integers — reject anything else here rather than letting the database error
function requireNumericId(req, res, next, value) {
  if (!/^\d+$/.test(value)) return res.status(400).json({ error: 'Invalid id' });
  next();
}
router.param('id', requireNumericId);
router.param('eventId', requireNumericId);

// Ranks statuses in VALID_STATUSES order (Applied = 0 … Withdrawn = 6)
const statusOrderSQL = (col = 'status') =>
  `CASE ${col} ${VALID_STATUSES.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ')} ELSE 99 END`

// Works out a job's summary fields from its events.
// `events` must be ordered latest first: by day, then status rank, then time (see recalculateJobStatus).
function deriveJobState(events) {
  const status = events[0]?.status || 'Applied';

  // Rejected/Withdrawn aren't in PIPELINE (indexOf = -1), so they never count as a stage reached
  let furthestStatus = null;
  for (const ev of events) {
    if (PIPELINE.indexOf(ev.status) > PIPELINE.indexOf(furthestStatus ?? '')) {
      furthestStatus = ev.status;
    }
  }

  // appliedAt = date of the earliest 'Applied' event, so the stats chart reflects
  // when the user actually applied rather than when the tracker entry was created.
  // Falls back to the earliest event of any status so a job without an 'Applied'
  // event still has a date and doesn't drop out of the stats.
  const oldestFirst = [...events].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const firstApplied = oldestFirst.find(ev => ev.status === 'Applied') || oldestFirst[0];
  const appliedAt = firstApplied ? firstApplied.created_at : null;

  return { status, furthestStatus, appliedAt };
}

async function recalculateJobStatus(jobId) {
  const events = await pool.query(
    `SELECT status, created_at FROM job_status_events WHERE job_id = $1
     ORDER BY
       created_at::date DESC,
       ${statusOrderSQL()} DESC,
       created_at DESC`,
    [jobId]
  );
  const { status, furthestStatus, appliedAt } = deriveJobState(events.rows);

  // COALESCE keeps the existing applied_at when the job has no events at all
  await pool.query(
    'UPDATE jobs SET status = $1, furthest_status = $2, applied_at = COALESCE($3, applied_at) WHERE id = $4',
    [status, furthestStatus, appliedAt, jobId]
  );
}

// GET /api/jobs — get all jobs for the logged-in user
router.get('/', async (req, res, next) => {
  try {
    // last_event_at = most recent history event, so the dashboard can show "updated N days ago"
    // open_tasks = tasks not yet ticked off, so the dashboard can show "to do" vs "waiting"
    const result = await pool.query(
      `SELECT j.*,
              (SELECT MAX(e.created_at) FROM job_status_events e WHERE e.job_id = j.id) AS last_event_at,
              (SELECT COUNT(*)::int FROM tasks t WHERE t.job_id = j.id AND t.done_at IS NULL) AS open_tasks
       FROM jobs j
       WHERE j.user_id = $1
       ORDER BY j.applied_at DESC NULLS LAST, j.created_at DESC`,
      [req.user.id]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs — create a new job application
router.post('/', async (req, res, next) => {
  try {
    const { company, job_title, source, status, salary_min, salary_max, notes } = req.body;

    if (!company || !job_title) {
      return res.status(400).json({ error: 'Company and job title are required' });
    }

    const jobStatus = status || 'Applied';
    if (!VALID_STATUSES.includes(jobStatus)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const result = await pool.query(
      `INSERT INTO jobs (user_id, company, job_title, source, status, salary_min, salary_max, notes, applied_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [req.user.id, company, job_title, source, jobStatus, salary_min, salary_max, notes]
    );

    const newJob = result.rows[0];

    // Always log the initial status event
    await pool.query(
      'INSERT INTO job_status_events (job_id, status) VALUES ($1, $2)',
      [newJob.id, jobStatus]
    );

    await recalculateJobStatus(newJob.id);

    res.status(201).json(newJob);
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id — get a single job
router.get('/:id', async (req, res, next) => {
  try {
    // AND user_id = $2 prevents IDOR — a user can only fetch their own jobs
    const result = await pool.query(
      'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/jobs/:id — update a job (fields only — status is derived from event history)
router.put('/:id', async (req, res, next) => {
  try {
    const { company, job_title, source, salary_min, salary_max, notes } = req.body;

    if (!company || !job_title) {
      return res.status(400).json({ error: 'Company and job title are required' });
    }

    const result = await pool.query(
      `UPDATE jobs
       SET company=$1, job_title=$2, source=$3,
           salary_min=$4, salary_max=$5, notes=$6
       WHERE id=$7 AND user_id=$8
       RETURNING *`,
      [company, job_title, source, salary_min, salary_max, notes, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/jobs/:id/waiting — mark the job's current stage as "waiting on them" (or back to to-do).
// Stored as the status it applies to, so moving to a new stage makes the job to-do again automatically.
router.put('/:id/waiting', async (req, res, next) => {
  try {
    if (typeof req.body?.waiting !== 'boolean') {
      return res.status(400).json({ error: 'waiting must be true or false' });
    }
    const result = await pool.query(
      `UPDATE jobs SET waiting_status = CASE WHEN $1 THEN status ELSE NULL END
       WHERE id = $2 AND user_id = $3
       RETURNING id, status, waiting_status`,
      [req.body.waiting, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id/events — status history for a job
router.get('/:id/events', async (req, res, next) => {
  try {
    // Verify the job belongs to the user before returning events
    const result = await pool.query(
      `SELECT e.id, e.status, e.notes, e.created_at
       FROM job_status_events e
       JOIN jobs j ON j.id = e.job_id
       WHERE e.job_id = $1 AND j.user_id = $2
       ORDER BY
         e.created_at::date ASC,
         ${statusOrderSQL('e.status')} ASC,
         e.created_at ASC`,
      [req.params.id, req.user.id]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:id/events — manually add a history event
router.post('/:id/events', async (req, res, next) => {
  try {
    const { status, created_at, notes } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    // Verify job ownership
    const job = await pool.query('SELECT id FROM jobs WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (job.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const result = await pool.query(
      `INSERT INTO job_status_events (job_id, status, created_at, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, status, created_at || new Date(), notes || null]
    );
    await recalculateJobStatus(req.params.id);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/jobs/:id/events/:eventId — update an event's status, date, or notes
router.put('/:id/events/:eventId', async (req, res, next) => {
  try {
    const { status, created_at, notes } = req.body;
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    // $3 flags whether caller explicitly sent a notes field (so clearing '' works correctly)
    const notesProvided = 'notes' in req.body;
    const result = await pool.query(
      `UPDATE job_status_events e
       SET status = COALESCE($1, e.status),
           created_at = COALESCE($2, e.created_at),
           notes = CASE WHEN $3 THEN $4 ELSE e.notes END
       FROM jobs j
       WHERE e.id = $5 AND e.job_id = $7 AND e.job_id = j.id AND j.user_id = $6
       RETURNING e.*`,
      [status || null, created_at || null, notesProvided, notes || null, req.params.eventId, req.user.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    await recalculateJobStatus(req.params.id);
    res.status(200).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/jobs/:id/events/:eventId — remove a history event
router.delete('/:id/events/:eventId', async (req, res, next) => {
  try {
    const result = await pool.query(
      `DELETE FROM job_status_events e
       USING jobs j
       WHERE e.id = $1 AND e.job_id = $3 AND e.job_id = j.id AND j.user_id = $2
       RETURNING e.id`,
      [req.params.eventId, req.user.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    await recalculateJobStatus(req.params.id);
    res.status(200).json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/jobs/:id — delete a job
router.delete('/:id', async (req, res, next) => {
  try {
    // RETURNING id lets us check whether a row was actually deleted
    const result = await pool.query(
      'DELETE FROM jobs WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.status(200).json({ message: 'Job deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.recalculateJobStatus = recalculateJobStatus;
module.exports.deriveJobState = deriveJobState;
