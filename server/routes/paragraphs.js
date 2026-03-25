const express = require('express');
const db = require('../db');
const verifyToken = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

// GET /api/paragraphs - list
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT id, name, created_at FROM paragraph_saves WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.userId);
  res.json(rows);
});

// GET /api/paragraphs/:id - full row
router.get('/:id', (req, res) => {
  const row = db.prepare(
    'SELECT * FROM paragraph_saves WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST /api/paragraphs
router.post('/', (req, res) => {
  const { name, paragraphConfig, paragraphData } = req.body;
  if (!name || !paragraphData) return res.status(400).json({ error: 'name and paragraphData required' });
  const result = db.prepare(
    'INSERT INTO paragraph_saves (user_id, name, paragraph_config, paragraph_data) VALUES (?, ?, ?, ?)'
  ).run(req.userId, name.trim(), JSON.stringify(paragraphConfig || {}), JSON.stringify(paragraphData));
  res.json({ id: result.lastInsertRowid });
});

// DELETE /api/paragraphs/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare(
    'DELETE FROM paragraph_saves WHERE id = ? AND user_id = ?'
  ).run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
