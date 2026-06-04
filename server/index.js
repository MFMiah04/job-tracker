require('dotenv').config();

const express = require('express');
const cors = require('cors');

// const authRoutes = require('./routes/auth');
// const jobRoutes = require('./routes/jobs');

const app = express();

const corsOptions = {
  origin: ['http://localhost:5173', process.env.CLIENT_URL].filter(Boolean),
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// app.use('/api/auth', authRoutes);
// app.use('/api/jobs', jobRoutes);

// Global error handler — must have exactly 4 params so Express recognises it as an error handler
// Must be registered after all routes or it won't catch their errors
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
