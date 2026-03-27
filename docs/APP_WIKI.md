# TOCFL Flashcards App Wiki

## 1. Overview

This app is a React + Vite single-page learning tool for TOCFL preparation.

Core modes:
- Flashcards: word drill with scoring, timer, and review deck.
- Paragraph: reading comprehension generation with optional questions.
- Conversation: listening transcript generation with speaker playback and questions.

The app is intentionally implemented as one main file: `src/App.jsx`.

Backend: Node.js + Express on port 3001 with SQLite (`server/tocfl.db`). Start both together with `npm run dev`.

Global feature flags:
- **Offline mode**: Disables all AI/network features. Persisted in `localStorage` (`tocfl_mode = 'offline'`). Toggled via the **Online/Offline** button inside the Settings modal.

## 2. High-Level Architecture

Main control model:
- The app behaves like a mode-based state machine.
- `appMode` controls which major view renders.

Primary mode values:
- `flashcards`
- `paragraph-setup`, `paragraph-loading`, `paragraph-practice`
- `conversation-setup`, `conversation-loading`, `conversation-practice`

Rendering pattern:
- `App` uses early returns for mode-specific screens.
- Shared controls (header/settings/theme/sound) are reused across modes.

## 3. Data and State Model

### 3.1 Flashcards
Key state:
- `cards`: current working deck.
- `currentIndex`: active card index.
- `cardStatuses`: per-card status (`unvisited`, `correct`, `wrong`, `missed`).
- `score`, `isBonusWindow`, `timerKey`.
- `showAllWords`: boolean — controls AllWordsModal on result screen.
- `selectedWordIndices`: Set of card indices selected in AllWordsModal.
- `pendingMixedCards`: merged card array held while the mixed-deck name prompt is open.

Flow:
1. Card front/back interaction.
2. User marks correct/wrong.
3. Status and score update.
4. Session completion computes summary and shows result screen.

### 3.2 Paragraph Mode
Key state:
- `paragraphConfig`: generation settings (band/length/vocab familiarity/questions).
- `paragraphData`: generated text + translation + optional questions.
- `questionAnswers`, `visibleTranslations`.

Flow:
1. Generate paragraph (JSON or plain text path).
2. Generate pinyin + English translation.
3. Render reading text and optional comprehension section.

### 3.3 Conversation Mode
Key state:
- `conversationConfig`: settings (similar to paragraph config).
- `conversationData`: title, conversation turns, optional questions.
- `conversationVisibleTurns`: progressive reveal cursor.
- `conversationQuestionAnswers`, `conversationVisibleTranslations`.
- `revealedConversationTurns`: per-turn text visibility map (`{ [turnIndex]: boolean }`). Chinese text for each speaker line is hidden by default and revealed individually by the user via a "Show text" / "Hide" toggle button.

Flow:
1. Generate speaker-structured transcript (+ optional questions).
2. Reveal transcript turn-by-turn over time (progressive timer).
3. User may individually reveal/hide the Chinese text for any turn.
4. Play per-turn or full conversation audio.
5. Answer listening questions.

## 3a. User Account System

Users must log in before the app loads (full-screen auth gate).

### 3a.1 Authentication
- Register with a unique username (min 3 chars) and password (min 6 chars).
- Passwords hashed with bcryptjs. JWT issued on register/login (30-day expiry).
- Token stored in `localStorage` (`tocfl_auth_token`). Validated on every page load via a bootstrap effect.
- Logout clears the token and returns to the auth gate.

### 3a.2 Cloud Saves
All saves are scoped to the logged-in user. Available via the **Library** button (icon + "Library" text) in the header.

**Flashcard Decks**
- **Save Deck** button (floppy disk icon) in the flashcard nav row opens a name prompt, saves the deck to the server, sets `currentDeckId`, and immediately records an initial progress entry.
- Uploading a file via Library → Upload also auto-saves the deck using the filename as the name, sets `currentDeckId`, and refreshes the library in place.
- Library → Decks tab shows all saved decks with card count and an "In-progress session saved" badge if progress exists. Long deck names are truncated to one line.
- **Load / Resume**: loading a deck from the library restores saved progress automatically — no prompt. The session resumes at the exact card and score where it was last saved.
- **Mix Decks**: select two or more decks via checkboxes in the Decks tab. A **"Mix Selected (N decks · M cards)"** button appears in the footer. Clicking it shuffles all selected cards together, opens a name prompt pre-filled with the source deck names and a `[Mixed]` tag, saves the combined deck to the backend, and starts a new session.

**Flashcard Progress (Auto-save)**
- Progress is saved automatically on every card advance (no manual button).
- Also saved on browser tab close / window unload via `beforeunload`.
- Saves: `currentIndex`, `cardStatuses`, `score`, `sessionDuration`, `isFinished`, `isBonusWindow`.
- One progress row per user per deck (upsert). Deleted automatically when a deck is deleted (cascade).
- Progress saving requires `currentDeckId` to be set (i.e. the deck must have been saved to cloud first).

**Paragraphs and Conversations**
- **Save to Cloud** button in paragraph-practice and conversation-practice views.
- Saves the full `paragraphData`/`conversationData` + config. Load restores the practice view instantly.

### 3a.3 State Variables (Auth)
- `authToken` — JWT string or null; initialized from `localStorage('tocfl_auth_token')`.
- `authUser` — `{ username }` or null.
- `currentDeckId` — integer id of the currently-active saved deck, or null for local/uploaded decks.
- `showLibrary`, `libraryTab`, `savedDecks`, `savedParagraphs`, `savedConversations` — Library modal state.
- `showSavePrompt` — `null | 'deck' | 'paragraph' | 'conversation' | 'mixed'`; controls which save flow is active.
- `pendingMixedCards` — merged card array held while the `'mixed'` save prompt is open; cleared on save or cancel.

### 3a.4 Session Result Screen

After completing a deck the result screen shows stars, score, and time stats, then three action buttons:

1. **Start Review Deck (N)** — visible only when wrong/missed cards exist. Immediately starts a new session with those cards only.
2. **Select Custom Words** — opens `AllWordsModal`: a scrollable list of every card in the deck with colour-coded status badges (green = correct, red = wrong, yellow = missed, grey = unvisited), per-card eye toggle, copy button, and a checkbox. Footer has **Select All / Deselect All** and **Start Custom Review (N)** (disabled when 0 selected). Selecting and confirming starts a session with exactly those cards.
3. **Restart Full Deck** — restarts with the complete original deck.

`selectedWordIndices` (Set) is reset automatically by `resetSession` on every new session start.

## 3b. Offline Mode

When `isOfflineMode` is `true`:
- All `callGemini` / generation entry-points (smart sentence, paragraph, conversation, TTS, chat) return early without network calls.
- Keyboard shortcuts that trigger network actions (Tab → open chat, Shift → generate sentence) are suppressed.
- AI-feature buttons are hidden or replaced with placeholder UI.
- The **Online/Offline** toggle lives in the Settings modal (3-column grid alongside Sound and Dark Mode buttons). Amber = offline, green = online.
- State persisted via `localStorage` key `tocfl_mode` (`'offline'` | `'online'`).

Offline mode does **not** affect: flashcard navigation, file upload/parsing, scoring, TTS playback from pre-loaded `src` URLs, deck export, and snapshot load.

## 4. Backend API

All endpoints require `Authorization: Bearer <jwt>` except `/api/auth/*`.

Frontend calls go through `callAPI(path, method, body)` — defined at module level in `src/App.jsx`, reads token from localStorage on each call.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` | Create account → `{ token, username }` |
| POST | `/api/auth/login` | Sign in → `{ token, username }` |
| GET | `/api/decks` | List user's decks (includes `has_progress` flag) |
| POST | `/api/decks` | Save deck `{ name, cards }` |
| DELETE | `/api/decks/:id` | Delete deck (cascades progress) |
| GET | `/api/progress/:deckId` | Get saved progress for a deck |
| PUT | `/api/progress/:deckId` | Upsert progress (pause/save) |
| DELETE | `/api/progress/:deckId` | Clear progress (session reset) |
| GET | `/api/paragraphs` | List paragraph saves |
| GET | `/api/paragraphs/:id` | Get full paragraph save |
| POST | `/api/paragraphs` | Save paragraph `{ name, paragraphConfig, paragraphData }` |
| DELETE | `/api/paragraphs/:id` | Delete paragraph save |
| GET | `/api/conversations` | List conversation saves |
| GET | `/api/conversations/:id` | Get full conversation save |
| POST | `/api/conversations` | Save conversation `{ name, conversationConfig, conversationData }` |
| DELETE | `/api/conversations/:id` | Delete conversation save |
| GET | `/api/health` | Server liveness check |

## 5. AI Integration

Primary helper:
- `callGemini(prompt, systemInstruction, key, responseMimeType)`

Behavior:
- Uses token-efficiency system instruction globally.
- Retries transient failures.
- Has fallback to `gemini-1.5-flash` for model-not-found scenarios.

Other helpers:
- `generateImage(...)` for optional image generation.
- `generateTTS(...)` for Gemini audio fallback.

## 6. Audio Pipeline

### 5.1 Sound Effects
- Uses `AudioContext` via `SoundFX` for correct/wrong/bonus/victory feedback.

### 5.2 Speech/TTS
Preferred order for content speech:
1. Google Translate TTS endpoint (`translate.googleapis.com/translate_tts`)
2. Browser `speechSynthesis`
3. Gemini TTS fallback (if API key available)

Conversation speaker behavior:
- Speaker names are mapped to alternating voice preferences (`female`, `male`) when browser voices allow.

## 7. File Upload and Deck Parsing

Upload entry point: **Library modal → Upload button** (bottom of modal, label changes to match the active tab: "Upload Flashcards / Paragraph / Conversation"). The standalone Upload button was removed from the header.

Supported formats:
- `.csv`, `.txt`, `.docx`, `.json` (deck array or paragraph/conversation snapshot)

Parsing notes:
- CSV-like parsing with basic comma handling.
- `.docx` uses `mammoth` browser bundle loaded dynamically.
- After a successful deck upload, if the user is logged in, the deck is auto-saved to cloud using the filename (without extension) as the name, `currentDeckId` is set, the library is refreshed, and progress saving activates immediately.

## 8. Keyboard Shortcuts (Flashcards)

- Right/Left arrows: next/previous card
- Up: flip
- Down: unflip
- Enter: mark correct (when flipped)
- Escape: mark wrong (when flipped)
- Shift: generate sentence
- Tab: open chat
- Alt/CapsLock: play TTS for current card

## 9. Settings and API Key

API key precedence:
1. User key saved in localStorage (`gemini_key`)
2. Env key (`VITE_GEMINI_API_KEY` from `.env.local`)

Settings modal layout (top to bottom):
- **User info bar** (when logged in): avatar initial, username, Log Out button.
- **3-column toggle grid**: Sound On/Off · Dark/Light Mode · Online/Offline.
- **Gemini API Key** input + connection test.

Header icon: the settings button now shows a **User** icon (not a gear).

## 10. Performance and Reliability Notes

Current optimizations:
- `useMemo` for status stats and session summary.
- Memoized paragraph word highlighting.
- TTS chunking to avoid long-request failures.

Reliability:
- TTS includes timeout/fallback handling.
- Gemini requests include retry/fallback model strategy.

## 11. Snapshot System

Both paragraph and conversation modes support saving and loading JSON snapshots.

### 10.1 Saving
- `downloadParagraphSnapshot()` serialises the current `paragraphData` + `paragraphConfig` metadata into a JSON file downloaded to the user's browser.
- `downloadConversationSnapshot()` serialises `conversationData` + `conversationConfig` into a JSON file.
- File names are timestamped: `tocfl-paragraph-<ISO>.json` / `tocfl-conversation-<ISO>.json`.
- Both functions play a short tone via `SoundFX` on success.

### 10.2 Loading
- A file-upload input accepts `.json` files.
- The payload is dispatched through `applyParagraphFromJson` or `applyConversationFromJson` based on `payload.type`.
- Snapshots always reset the relevant answer/translation/reveal states before applying new data.

## 12. Extension Guide for Future Agents

When adding a new mode:
1. Add mode state and config state.
2. Add setup/loading/practice views.
3. Add generation function with strict JSON contract.
4. Add question rendering and translation toggles if needed.
5. Reuse existing header mode-switch pattern.

When changing prompts:
- Keep output schema explicit and compact.
- Preserve `TOKEN_EFFICIENCY_INSTRUCTION` behavior.
- Validate parsing assumptions for JSON output.

When changing TTS:
- Keep a fallback chain; do not rely on a single provider.
- Avoid very long single utterances; keep chunking.

When adding offline-sensitive features:
- Check `isOfflineMode` at the entry-point of every function that makes a network call.
- Gate AI-dependent UI behind `!isOfflineMode` conditions.
- Do not call `setShowSettings(true)` flows (API key prompts) in offline mode.

When adding per-item reveal UI:
- Follow the `revealedConversationTurns` pattern: `useState({})` keyed by index.
- Reset the state alongside other mode-reset calls (new generation and snapshot load).
- Keep the toggle inline within the item component so reveal state stays localised.
