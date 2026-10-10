const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const { MAX_USERS } = require('../config');

const router = express.Router();

const WINDOW_MS = 15 * 60 * 1000;
const TOO_MANY = { error: 'Too many attempts — try again in 15 minutes' };

// Emails are compared case-insensitively, so "Me@x.com" and "me@x.com" are one account
const normaliseEmail = email => (typeof email === 'string' ? email.trim().toLowerCase() : '');

// Loose cap per IP on all auth routes
const ipLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY,
});

// Tight cap on failed logins per email, so password guessing is throttled
// even when the caller's real IP is hidden behind a proxy
const loginLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: req => `login:${normaliseEmail(req.body?.email)}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY,
});

// Same cap on wrong "current password" guesses per account, so a stolen session
// can't be used to work out the password. Runs after verifyToken.
const passwordLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 10,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (req, res) => res.statusCode !== 403,
  keyGenerator: req => `password:${req.user.id}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY,
});

router.use(ipLimiter);

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    // Set ALLOW_REGISTRATION=false to close sign-ups on a personal deployment
    if (process.env.ALLOW_REGISTRATION === 'false') {
      return res.status(403).json({ error: 'Registration is closed' });
    }

    const email = normaliseEmail(req.body?.email);
    const password = req.body?.password;

    if (!email || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email is already registered
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Stop accepting sign-ups once the account cap is reached
    const { rows: [{ count }] } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    if (count >= MAX_USERS) {
      return res.status(403).json({ error: 'Sign-ups are full at the moment' });
    }

    // Hash the password — 10 salt rounds is the industry standard (slow enough to deter brute force)
    const password_hash = await bcrypt.hash(password, 10);

    // Insert user and return the new row in one query (no second SELECT needed)
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, password_hash]
    );
    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const email = normaliseEmail(req.body?.email);
    const password = req.body?.password;

    if (!email || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE LOWER(email) = $1 ORDER BY id LIMIT 1',
      [email]
    );

    const user = result.rows[0];

    // Deliberately use the same message for "not found" and "wrong password"
    // to prevent user enumeration (attacker finding which emails are registered)
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(200).json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password — a logged-in user sets a new password
router.post('/change-password', verifyToken, passwordLimiter, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};

    if (typeof current_password !== 'string' || typeof new_password !== 'string' || !current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (new_password === current_password) {
      return res.status(400).json({ error: 'New password must be different from the current one' });
    }

    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(current_password, user.password_hash))) {
      // 403 rather than 401: the client treats 401 as an expired session and logs out
      return res.status(403).json({ error: 'Current password is incorrect' });
    }

    const password_hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, req.user.id]);

    res.status(200).json({ message: 'Password changed' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
