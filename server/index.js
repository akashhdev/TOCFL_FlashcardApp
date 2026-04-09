const express = require('express');
const cors = require('cors');

// Initialize DB (runs schema DDL on startup)
require('./db');

const app = express();

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/decks',         require('./routes/decks'));
app.use('/api/progress',      require('./routes/progress'));
app.use('/api/paragraphs',    require('./routes/paragraphs'));
app.use('/api/conversations', require('./routes/conversations'));

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`TOCFL server running on http://localhost:${PORT}`);
});
