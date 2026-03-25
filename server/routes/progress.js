const express = require('express');
const db = require('../db');
const verifyToken = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

// GET /api/progress/:deckId
router.get('/:deckId', (req, res) => {
  const row = db.prepare(
    'SELECT * FROM flashcard_progress WHERE deck_id = ? AND user_id = ?'
  ).get(req.params.deckId, req.userId);
  if (!row) return res.status(404).json({ error: 'No progress found' });
  res.json(row);
});

// PUT /api/progress/:deckId - upsert progress
router.put('/:deckId', (req, res) => {
  // Verify deck belongs to user
  const deck = db.prepare('SELECT id FROM flashcard_decks WHERE id = ? AND user_id = ?')
    .get(req.params.deckId, req.userId);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });

  const { currentIndex, cardStatuses, score, sessionDuration, isFinished, isBonusWindow } = req.body;
  db.prepare(`
    INSERT INTO flashcard_progress (user_id, deck_id, current_index, card_statuses, score, session_duration, is_finished, is_bonus_window, saved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, deck_id) DO UPDATE SET
      current_index    = excluded.current_index,
      card_statuses    = excluded.card_statuses,
      score            = excluded.score,
      session_duration = excluded.session_duration,
      is_finished      = excluded.is_finished,
      is_bonus_window  = excluded.is_bonus_window,
      saved_at         = excluded.saved_at
  `).run(
    req.userId, req.params.deckId,
    currentIndex, JSON.stringify(cardStatuses),
    score, sessionDuration,
    isFinished ? 1 : 0,
    isBonusWindow ? 1 : 0
  );
  res.json({ ok: true });
});

// DELETE /api/progress/:deckId - clear progress (on session reset)
router.delete('/:deckId', (req, res) => {
  db.prepare('DELETE FROM flashcard_progress WHERE deck_id = ? AND user_id = ?')
    .run(req.params.deckId, req.userId);
  res.json({ ok: true });
});

module.exports = router;
