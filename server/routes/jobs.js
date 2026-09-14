const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// Protect all routes in this file — verifyToken runs before every handler below
router.use(verifyToken);

const VALID_STATUSES = ['Wishlist', 'Applied', 'OA', 'Interview', 'Offer', 'Rejected'];
// Statuses that can become furthest_status (Rejected and Wishlist excluded)
const PIPELINE = ['Wishlist', 'Applied', 'OA', 'Interview', 'Offer'];

function isFurther(newStatus, currentFurthest) {
  const ni = PIPELINE.indexOf(newStatus);
  const ci = PIPELINE.indexOf(currentFurthest || 'Wishlist');
  return ni > ci;
}

// GET /api/jobs — get all jobs for the logged-in user
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM jobs WHERE user_id = $1 ORDER BY applied_at DESC NULLS LAST, created_at DESC',
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

    const jobStatus = status || 'Wishlist';
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

    // Set furthest_status if job starts further than Wishlist
    if (jobStatus !== 'Wishlist' && jobStatus !== 'Rejected') {
      await pool.query(
        'UPDATE jobs SET furthest_status = $1 WHERE id = $2',
        [jobStatus, newJob.id]
      );
      newJob.furthest_status = jobStatus;
    }

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

// PUT /api/jobs/:id — update a job
router.put('/:id', async (req, res, next) => {
  try {
    const { company, job_title, source, status, salary_min, salary_max, notes } = req.body;

    if (!company || !job_title) {
      return res.status(400).json({ error: 'Company and job title are required' });
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    // Fetch current job first to detect status change and furthest_status
    const current = await pool.query(
      'SELECT status, furthest_status FROM jobs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const currentJob = current.rows[0];

    const result = await pool.query(
      `UPDATE jobs
       SET company=$1, job_title=$2, source=$3, status=$4,
           salary_min=$5, salary_max=$6, notes=$7
       WHERE id=$8 AND user_id=$9
       RETURNING *`,
      [company, job_title, source, status, salary_min, salary_max, notes, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const updatedJob = result.rows[0];

    // Log event and update furthest_status if status changed
    if (status && status !== currentJob.status) {
      await pool.query(
        'INSERT INTO job_status_events (job_id, status) VALUES ($1, $2)',
        [req.params.id, status]
      );
      if (status !== 'Rejected' && isFurther(status, currentJob.furthest_status)) {
        await pool.query(
          'UPDATE jobs SET furthest_status = $1 WHERE id = $2',
          [status, req.params.id]
        );
        updatedJob.furthest_status = status;
      }
    }

    res.status(200).json(updatedJob);
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id/events — status history for a job
router.get('/:id/events', async (req, res, next) => {
  try {
    // Verify the job belongs to the user before returning events
    const result = await pool.query(
      `SELECT e.id, e.status, e.created_at
       FROM job_status_events e
       JOIN jobs j ON j.id = e.job_id
       WHERE e.job_id = $1 AND j.user_id = $2
       ORDER BY e.created_at ASC`,
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
    const { status, created_at } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    // Verify job ownership
    const job = await pool.query('SELECT id FROM jobs WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (job.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const result = await pool.query(
      `INSERT INTO job_status_events (job_id, status, created_at)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, status, created_at || new Date()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/jobs/:id/events/:eventId — update an event's status or date
router.put('/:id/events/:eventId', async (req, res, next) => {
  try {
    const { status, created_at } = req.body;
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    const result = await pool.query(
      `UPDATE job_status_events e
       SET status = COALESCE($1, e.status),
           created_at = COALESCE($2, e.created_at)
       FROM jobs j
       WHERE e.id = $3 AND e.job_id = j.id AND j.user_id = $4
       RETURNING e.*`,
      [status || null, created_at || null, req.params.eventId, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
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
       WHERE e.id = $1 AND e.job_id = j.id AND j.user_id = $2
       RETURNING e.id`,
      [req.params.eventId, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
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
