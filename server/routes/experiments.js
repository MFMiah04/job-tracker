const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

// GET /api/experiments
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM experiments WHERE user_id = $1 ORDER BY start_date DESC NULLS LAST, created_at DESC',
      [req.user.id]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/experiments
router.post('/', async (req, res, next) => {
  try {
    const { name, start_date, end_date, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const result = await pool.query(
      `INSERT INTO experiments (user_id, name, start_date, end_date, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, name.trim(), start_date || null, end_date || null, notes?.trim() || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/experiments/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, start_date, end_date, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const result = await pool.query(
      `UPDATE experiments
       SET name=$1, start_date=$2, end_date=$3, notes=$4
       WHERE id=$5 AND user_id=$6
       RETURNING *`,
      [name.trim(), start_date || null, end_date || null, notes?.trim() || null, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/experiments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM experiments WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    res.status(200).json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
