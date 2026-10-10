const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
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

// POST /api/admin/users/:id/reset-password — give an account a temporary password.
// The password is returned once for the admin to pass on; only its hash is stored.
router.post('/users/:id/reset-password', requireAdmin, async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Use the Account page to change your own password' });
    }
    // 12 random bytes → 16 URL-safe characters
    const temporaryPassword = crypto.randomBytes(12).toString('base64url');
    const password_hash = await bcrypt.hash(temporaryPassword, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING email',
      [password_hash, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.status(200).json({ email: result.rows[0].email, temporaryPassword });
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
