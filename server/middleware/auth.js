const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  // Authorization header must be present and start with "Bearer "
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // jwt.verify is synchronous — returns the decoded payload or throws
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the decoded payload to req.user so route handlers can read req.user.id, req.user.email
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = verifyToken;
