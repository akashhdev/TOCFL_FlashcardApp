require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Initialize DB (runs schema DDL on startup)
require('./db');

const app = express();

const devOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).concat(devOrigins)
  : devOrigins;

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/decks',         require('./routes/decks'));
app.use('/api/progress',      require('./routes/progress'));
app.use('/api/paragraphs',    require('./routes/paragraphs'));
app.use('/api/conversations', require('./routes/conversations'));

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Serve built React frontend (production)
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// SPA fallback — all non-API routes return index.html
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`TOCFL server running on http://localhost:${PORT}`);
});
