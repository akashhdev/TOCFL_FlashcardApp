# Agent Handover Guide (TOCFL Flashcards App)

This document is a fast handoff brief for coding agents that need to continue work on this project with minimal onboarding time.

## 1. Project Snapshot

Stack:
- React 19 + Vite 7
- Tailwind CSS
- Single primary application file: src/App.jsx
- Node.js + Express backend: server/index.js (port 3001)
- SQLite database: server/tocfl.db (auto-created on first run via better-sqlite3)
- JWT authentication: bcryptjs + jsonwebtoken (30-day tokens)

App purpose:
- TOCFL study app with 3 learning experiences:
1. Flashcards
2. Paragraph (reading)
3. Conversation (listening)

Starting the app:
- `npm run dev` runs both Vite (port 5173) and Express (port 3001) via concurrently.
- Vite proxies `/api/*` to `localhost:3001` automatically.

## 2. Critical Architecture Pattern

The app uses a mode-based state machine.
- Main controller: appMode in src/App.jsx
- UI is rendered through early-return mode blocks.

Current mode values:
- flashcards
- paragraph-setup
- paragraph-loading
- paragraph-practice
- conversation-setup
- conversation-loading
- conversation-practice

Rule for future changes:
- If adding a new experience, follow setup -> loading -> practice pattern.

## 3. Source of Truth Files

- src/App.jsx: all runtime logic and UI composition.
- src/index.css: Tailwind directives + global base styling.
- server/index.js: Express entry point.
- server/db.js: SQLite schema DDL — edit this to add/change tables.
- server/routes/: one file per resource (auth, decks, progress, paragraphs, conversations).
- server/middleware/auth.js: JWT verifyToken middleware.
- docs/APP_WIKI.md: user-facing/technical wiki.
- docs/AGENT_HANDOVER.md: this file.

## 4. AI + Prompting Contract

All Gemini text requests should go through the shared helper:
- callGemini(prompt, systemInstruction, key, responseMimeType)

Important invariant:
- TOKEN_EFFICIENCY_INSTRUCTION is appended globally to keep token usage low.
- Do not bypass this wrapper for new AI generation features.

JSON output contract guidance:
- Always force explicit JSON shape in prompt when expecting parsed output.
- Keep field names stable unless all consuming render logic is updated.

## 5. Audio Pipeline Contract

There are two audio categories:

1. Sound effects (correct/wrong/etc.)
- Uses WebAudio via SoundFX.

2. Speech playback (words/conversation)
- Keep fallback chain intact:
1. Google Translate TTS endpoint
2. Browser speechSynthesis
3. Gemini TTS fallback (when API key available)

Conversation-specific behavior:
- Speaker names map to alternating voice preference buckets (female/male-style when available).
- Playback state uses playingTurnIndex for spinner/UX feedback.

## 6. API Key and Security Model

Gemini key precedence:
1. User-entered key in localStorage (gemini_key)
2. Env key from .env.local via Vite env var

Expected env var:
- VITE_GEMINI_API_KEY

Security note:
- Never hardcode API keys in src/App.jsx.
- .env.local should remain untracked.

## 6a. User Auth and Backend Security Model

- Passwords hashed with bcryptjs (cost 10). Never stored in plaintext.
- JWT signed with `process.env.JWT_SECRET` (falls back to dev string — set this in production).
- Every protected DB write uses `WHERE id = ? AND user_id = ?` — no cross-user access.
- `callAPI(path, method, body)` in App.jsx is the sole frontend fetch wrapper; reads JWT from localStorage on each call.
- DB file lives at `server/tocfl.db`. Add to `.gitignore` if not already; `server/.gitignore` covers it locally.
- For production deployment: replace SQLite with PostgreSQL/MySQL, set `JWT_SECRET` env var, configure CORS origin to the real domain.

## 7. Data Model Pointers

Flashcards (frontend state):
- cards, currentIndex, cardStatuses, score, timerKey, isBonusWindow
- currentDeckId: id of the currently-loaded saved deck (null if using default/uploaded deck not yet saved)

Paragraph mode:
- paragraphConfig
- paragraphData
- questionAnswers
- visibleTranslations

Conversation mode:
- conversationConfig
- conversationData
- conversationVisibleTurns
- conversationQuestionAnswers
- conversationVisibleTranslations
- playingTurnIndex

Auth state:
- authToken: JWT string (from localStorage 'tocfl_auth_token'), null when logged out
- authUser: { username } or null

Backend DB tables:
- users (id, username, password, created_at)
- flashcard_decks (id, user_id, name, cards_json, created_at, updated_at)
- flashcard_progress (id, user_id, deck_id, current_index, card_statuses, score, session_duration, is_finished, is_bonus_window, saved_at) — UNIQUE(user_id, deck_id)
- paragraph_saves (id, user_id, name, paragraph_config, paragraph_data, created_at)
- conversation_saves (id, user_id, name, conversation_config, conversation_data, created_at)

## 8. Safe Editing Rules for Agents

When modifying src/App.jsx:
- Prefer adding helper functions above JSX view blocks.
- Avoid changing multiple unrelated workflows in one commit.
- Keep state names semantically consistent with existing naming.

When modifying prompts:
- Preserve compactness and schema clarity.
- Keep bilingual output constraints explicit where used.

When modifying TTS:
- Keep chunking logic and timeout behavior.
- Do not remove fallback layers.

When modifying question UIs:
- Keep translation hidden/reveal toggles intact by default.

## 9. Regression Checklist (Manual)

Before handing back:
1. Flashcard word speaker button plays audio.
2. Correct/wrong SFX still play.
3. Paragraph generation works for with/without questions.
4. Paragraph question translations stay hidden until eye toggle.
5. Conversation generation returns visible transcript turns.
6. Conversation per-turn speaker button plays audio.
7. Full conversation playback button works.
8. Conversation question toggles and answer validation work.
9. Settings modal: user info bar shows username; logout button works; Online/Offline toggle works.
10. Auth gate appears on first load; login/register works.
11. Save Deck → library shows it; Load from library resumes at correct card (no prompt).
12. Advance cards → close browser → reopen → load deck from library → progress restored automatically.
13. Upload flashcard file via Library → deck appears in library list and loads into flashcard view.
14. Save to Cloud in paragraph/conversation practice → Library → load restores the content.
15. Logout clears auth; app returns to login screen.

## 10. Git Workflow Notes

Recommended sequence:
1. git status
2. git add <target files>
3. git commit -m "<scoped message>"
4. git pull --rebase origin main (if remote moved)
5. git push origin main

If rebase conflict occurs:
- Preserve latest functional src/App.jsx behavior first.
- Resolve conflict markers carefully around state declarations and helper blocks.

## 11. Common Pitfalls

- Parsing JSON from model output without removing code-fence wrappers.
- Introducing a new mode button without adding its early-return view.
- Breaking appMode includes checks used for active tab highlighting.
- Accidentally removing useMemo-derived objects used by summary UIs.
- Calling browser speech APIs without user interaction (autoplay policy issues).
- Adding a new backend-saving feature without gating it on `authToken` — always check token is present before showing save buttons.
- Adding a new mode view without adding `{showLibrary && <LibraryModal />}` to its return — the Library button is in the shared Header so it can be opened from any mode.
- Forgetting to reset `currentDeckId` when the user uploads a new local deck (it should be null for non-saved decks).
- `applyParagraphSnapshot` and `applyConversationSnapshot` are at component scope — call them directly from Library modal or any other consumer.
- `saveProgressSilent` depends on `currentDeckId` being set — if it's null (no saved deck), progress is never written. Always ensure `currentDeckId` is set before expecting auto-save to work.
- The Online/Offline toggle is inside the Settings modal, not the header. Do not add a header badge for it.
- The upload button is inside the Library modal footer only — not in the header. Triggering `fileInputRef.current.click()` from the Library footer is the sole upload entry point.

## 12. Quick Orientation for Next Agent

If you only have 5 minutes:
1. Read src/App.jsx top orientation comment block.
2. Locate appMode declarations and mode returns.
3. Locate callGemini, callAPI, and TTS helpers.
4. Locate the auth gate block (if (!authToken) return ...) — the first conditional return in App().
5. Run through regression checklist section 9.

This should be enough to safely continue feature work.
