const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const pool = require('../db');

const router = express.Router();

const WINDOW_MS = 15 * 60 * 1000;
// Most accounts the app will hold; override with the MAX_USERS environment variable
const MAX_USERS = Number(process.env.MAX_USERS) || 25;
const TOO_MANY ={ error: 'Too many attempts — try again in 15 minutes' };

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

module.exports = router;
