const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const { MAX_USERS, isAdminEmail } = require('../config');

const router = express.Router();
router.use(verifyToken);

function requireAdmin(req, res, next) {
  if (!isAdminEmail(req.user.email)) {
    return res.status(403).json({ error: 'Admins only' });
  }
  next();
}

// GET /api/admin/status — any logged-in user may ask; only the admin gets the account numbers
router.get('/status', async (req, res, next) => {
  try {
    if (!isAdminEmail(req.user.email)) {
      return res.status(200).json({ isAdmin: false });
    }
    const { rows: [{ count }] } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    res.status(200).json({ isAdmin: true, userCount: count, maxUsers: MAX_USERS });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users — every account, with how many applications each has
router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.created_at,
              (SELECT COUNT(*)::int FROM jobs j WHERE j.user_id = u.id) AS job_count
       FROM users u
       ORDER BY u.created_at ASC, u.id ASC`
    );
    res.status(200).json({ maxUsers: MAX_USERS, users: result.rows });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/users/:id — remove an account and everything it owns
router.delete('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'You cannot remove your own account' });
    }
    // jobs, their events and experiments go with the user via ON DELETE CASCADE
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.status(200).json({ message: 'Account removed' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
