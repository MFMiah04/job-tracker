const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const { ACTIVE_STAGES } = require('../statuses');

const router = express.Router();
router.use(verifyToken);

// Ids are integers — reject anything else here rather than letting the database error
router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return res.status(400).json({ error: 'Invalid id' });
  next();
});

// Dates go out as plain YYYY-MM-DD text so no time zone can shift them by a day
const TASK_COLUMNS = `
  t.id, t.job_id, t.title, t.link,
  to_char(t.given_at, 'YYYY-MM-DD') AS given_at,
  to_char(t.due_at, 'YYYY-MM-DD') AS due_at,
  t.done_at, t.created_at,
  j.company, j.job_title`;

const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v));

// Checks and tidies the editable fields. Returns { error } or { fields }.
function readTaskFields(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const link = typeof body.link === 'string' ? body.link.trim() : '';
  const { given_at, due_at } = body;

  if (!title) return { error: 'Task is required' };
  if (link && !/^https?:\/\//i.test(link)) return { error: 'Link must start with http:// or https://' };
  if (given_at && !isDate(given_at)) return { error: 'Date given must be a valid date' };
  if (due_at && !isDate(due_at)) return { error: 'Due date must be a valid date' };

  return { fields: { title, link: link || null, given_at: given_at || null, due_at: due_at || null } };
}

// GET /api/tasks?job_id=N — the user's tasks (optionally for one job): open first, soonest due first
router.get('/', async (req, res, next) => {
  try {
    const jobId = req.query.job_id;
    if (jobId !== undefined && !/^\d+$/.test(jobId)) {
      return res.status(400).json({ error: 'Invalid job id' });
    }
    const result = await pool.query(
      `SELECT ${TASK_COLUMNS}
       FROM tasks t
       JOIN jobs j ON j.id = t.job_id
       WHERE t.user_id = $1 AND ($2::int IS NULL OR t.job_id = $2::int)
       ORDER BY (t.done_at IS NOT NULL), t.due_at ASC NULLS LAST, t.given_at ASC, t.id ASC`,
      [req.user.id, jobId ?? null]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/tasks/stages — OA/Interview history events still marked to do, oldest first
router.get('/stages', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.job_id, e.status, to_char(e.created_at, 'YYYY-MM-DD') AS created_at,
              j.company, j.job_title
       FROM job_status_events e
       JOIN jobs j ON j.id = e.job_id
       WHERE j.user_id = $1 AND e.status = ANY($2::text[]) AND NOT e.waiting
       ORDER BY e.created_at ASC, e.id ASC`,
      [req.user.id, ACTIVE_STAGES]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks — add a task to one of the user's jobs
router.post('/', async (req, res, next) => {
  try {
    const { error, fields } = readTaskFields(req.body || {});
    if (error) return res.status(400).json({ error });

    const jobId = req.body.job_id;
    if (!/^\d+$/.test(String(jobId ?? ''))) {
      return res.status(400).json({ error: 'Choose a job for this task' });
    }

    // Only insert when the job belongs to this user (IDOR check in the same statement)
    const result = await pool.query(
      `WITH inserted AS (
         INSERT INTO tasks (user_id, job_id, title, link, given_at, due_at)
         SELECT $1, j.id, $3, $4, COALESCE($5::date, CURRENT_DATE), $6::date
         FROM jobs j WHERE j.id = $2 AND j.user_id = $1
         RETURNING *
       )
       SELECT ${TASK_COLUMNS} FROM inserted t JOIN jobs j ON j.id = t.job_id`,
      [req.user.id, jobId, fields.title, fields.link, fields.given_at, fields.due_at]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/tasks/:id — edit a task, and tick it off or reopen it with `done`
router.put('/:id', async (req, res, next) => {
  try {
    const { error, fields } = readTaskFields(req.body || {});
    if (error) return res.status(400).json({ error });

    const result = await pool.query(
      `WITH updated AS (
         UPDATE tasks
         SET title = $1, link = $2,
             given_at = COALESCE($3::date, given_at),
             due_at = $4::date,
             done_at = CASE WHEN $5 THEN COALESCE(done_at, NOW()) ELSE NULL END
         WHERE id = $6 AND user_id = $7
         RETURNING *
       )
       SELECT ${TASK_COLUMNS} FROM updated t JOIN jobs j ON j.id = t.job_id`,
      [fields.title, fields.link, fields.given_at, fields.due_at, Boolean(req.body.done), req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.status(200).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.status(200).json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
