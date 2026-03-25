const express = require('express');
const db = require('../db');
const verifyToken = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

// GET /api/conversations - list
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT id, name, created_at FROM conversation_saves WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.userId);
  res.json(rows);
});

// GET /api/conversations/:id - full row
router.get('/:id', (req, res) => {
  const row = db.prepare(
    'SELECT * FROM conversation_saves WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST /api/conversations
router.post('/', (req, res) => {
  const { name, conversationConfig, conversationData } = req.body;
  if (!name || !conversationData) return res.status(400).json({ error: 'name and conversationData required' });
  const result = db.prepare(
    'INSERT INTO conversation_saves (user_id, name, conversation_config, conversation_data) VALUES (?, ?, ?, ?)'
  ).run(req.userId, name.trim(), JSON.stringify(conversationConfig || {}), JSON.stringify(conversationData));
  res.json({ id: result.lastInsertRowid });
});

// DELETE /api/conversations/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare(
    'DELETE FROM conversation_saves WHERE id = ? AND user_id = ?'
  ).run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
