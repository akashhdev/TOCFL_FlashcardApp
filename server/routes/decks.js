const express = require('express');
const db = require('../db');
const verifyToken = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

// GET /api/decks - list user's decks with progress flag
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT d.id, d.name, d.created_at,
           json_array_length(d.cards_json) AS card_count,
           CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END AS has_progress,
           d.cards_json
    FROM flashcard_decks d
    LEFT JOIN flashcard_progress p ON p.deck_id = d.id AND p.user_id = d.user_id
    WHERE d.user_id = ?
    ORDER BY d.created_at DESC
  `).all(req.userId);
  res.json(rows);
});

// POST /api/decks - save a deck
router.post('/', (req, res) => {
  const { name, cards } = req.body;
  if (!name || !Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: 'name and cards array required' });
  }
  const result = db.prepare(
    'INSERT INTO flashcard_decks (user_id, name, cards_json) VALUES (?, ?, ?)'
  ).run(req.userId, name.trim(), JSON.stringify(cards));
  res.json({ id: result.lastInsertRowid, name: name.trim() });
});

// DELETE /api/decks/:id - delete a deck (cascades to progress)
router.delete('/:id', (req, res) => {
  const result = db.prepare(
    'DELETE FROM flashcard_decks WHERE id = ? AND user_id = ?'
  ).run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Deck not found' });
  res.json({ ok: true });
});

module.exports = router;
