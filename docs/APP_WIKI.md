# TOCFL Flashcards App Wiki

## 1. Overview

This app is a React + Vite single-page learning tool for TOCFL preparation.

Core modes:
- Flashcards: word drill with scoring, timer, and review deck.
- Paragraph: reading comprehension generation with optional questions.
- Conversation: listening transcript generation with speaker playback and questions.

The app is intentionally implemented as one main file: `src/App.jsx`.

Global feature flags:
- **Offline mode**: Disables all AI/network features. Persisted in `localStorage` (`tocfl_mode = 'offline'`). Toggled via the header ONLINE/OFFLINE button.

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

Flow:
1. Card front/back interaction.
2. User marks correct/wrong.
3. Status and score update.
4. Session completion computes summary and review deck.

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

## 3a. Offline Mode

When `isOfflineMode` is `true`:
- All `callGemini` / generation entry-points (smart sentence, paragraph, conversation, TTS, chat) return early without network calls.
- Keyboard shortcuts that trigger network actions (Tab → open chat, Shift → generate sentence) are suppressed.
- AI-feature buttons are hidden or replaced with placeholder UI.
- The header shows an **OFFLINE** badge (amber). Clicking it toggles back to online.
- State persisted via `localStorage` key `tocfl_mode` (`'offline'` | `'online'`).

Offline mode does **not** affect: flashcard navigation, file upload/parsing, scoring, TTS playback from pre-loaded `src` URLs, deck export, and snapshot load.

## 4. AI Integration

Primary helper:
- `callGemini(prompt, systemInstruction, key, responseMimeType)`

Behavior:
- Uses token-efficiency system instruction globally.
- Retries transient failures.
- Has fallback to `gemini-1.5-flash` for model-not-found scenarios.

Other helpers:
- `generateImage(...)` for optional image generation.
- `generateTTS(...)` for Gemini audio fallback.

## 5. Audio Pipeline

### 5.1 Sound Effects
- Uses `AudioContext` via `SoundFX` for correct/wrong/bonus/victory feedback.

### 5.2 Speech/TTS
Preferred order for content speech:
1. Google Translate TTS endpoint (`translate.googleapis.com/translate_tts`)
2. Browser `speechSynthesis`
3. Gemini TTS fallback (if API key available)

Conversation speaker behavior:
- Speaker names are mapped to alternating voice preferences (`female`, `male`) when browser voices allow.

## 6. File Upload and Deck Parsing

Supported formats:
- `.csv`, `.txt`, `.docx`

Parsing notes:
- CSV-like parsing with basic comma handling.
- `.docx` uses `mammoth` browser bundle loaded dynamically.

## 7. Keyboard Shortcuts (Flashcards)

- Right/Left arrows: next/previous card
- Up: flip
- Down: unflip
- Enter: mark correct (when flipped)
- Escape: mark wrong (when flipped)
- Shift: generate sentence
- Tab: open chat
- Alt/CapsLock: play TTS for current card

## 8. Settings and API Key

API key precedence:
1. User key saved in localStorage (`gemini_key`)
2. Env key (`VITE_GEMINI_API_KEY` from `.env.local`)

Settings modal supports:
- Key entry
- Connection test

## 9. Performance and Reliability Notes

Current optimizations:
- `useMemo` for status stats and session summary.
- Memoized paragraph word highlighting.
- TTS chunking to avoid long-request failures.

Reliability:
- TTS includes timeout/fallback handling.
- Gemini requests include retry/fallback model strategy.

## 10. Snapshot System

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

## 11. Extension Guide for Future Agents

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
