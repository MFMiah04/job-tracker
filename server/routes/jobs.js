const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// Protect all routes in this file — verifyToken runs before every handler below
router.use(verifyToken);

const VALID_STATUSES = ['Applied', 'OA', 'Interview', 'Offer', 'Rejected'];

// GET /api/jobs — get all jobs for the logged-in user
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM jobs WHERE user_id = $1 ORDER BY applied_at DESC, created_at DESC',
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
    const { company, job_title, source, status, salary_min, salary_max, notes, applied_at } = req.body;

    if (!company || !job_title) {
      return res.status(400).json({ error: 'Company and job title are required' });
    }

    const jobStatus = status || 'Applied';
    if (!VALID_STATUSES.includes(jobStatus)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const result = await pool.query(
      `INSERT INTO jobs (user_id, company, job_title, source, status, salary_min, salary_max, notes, applied_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [req.user.id, company, job_title, source, jobStatus, salary_min, salary_max, notes, applied_at]
    );

    res.status(201).json(result.rows[0]);
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
    const { company, job_title, source, status, salary_min, salary_max, notes, applied_at } = req.body;

    if (!company || !job_title) {
      return res.status(400).json({ error: 'Company and job title are required' });
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const result = await pool.query(
      `UPDATE jobs
       SET company=$1, job_title=$2, source=$3, status=$4,
           salary_min=$5, salary_max=$6, notes=$7, applied_at=$8
       WHERE id=$9 AND user_id=$10
       RETURNING *`,
      [company, job_title, source, status, salary_min, salary_max, notes, applied_at, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.status(200).json(result.rows[0]);
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
