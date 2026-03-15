# Agent Handover Guide (TOCFL Flashcards App)

This document is a fast handoff brief for coding agents that need to continue work on this project with minimal onboarding time.

## 1. Project Snapshot

Stack:
- React 19 + Vite 7
- Tailwind CSS
- Single primary application file: src/App.jsx

App purpose:
- TOCFL study app with 3 learning experiences:
1. Flashcards
2. Paragraph (reading)
3. Conversation (listening)

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

Key precedence:
1. User-entered key in localStorage (gemini_key)
2. Env key from .env.local via Vite env var

Expected env var:
- VITE_GEMINI_API_KEY

Security note:
- Never hardcode API keys in src/App.jsx.
- .env.local should remain untracked.

## 7. Data Model Pointers

Flashcards:
- cards, currentIndex, cardStatuses, score, timerKey, isBonusWindow

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
9. Settings modal key save/test flow still works.

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

## 12. Quick Orientation for Next Agent

If you only have 5 minutes:
1. Read src/App.jsx top orientation comment block.
2. Locate appMode declarations and mode returns.
3. Locate callGemini and TTS helpers.
4. Run through regression checklist section 9.

This should be enough to safely continue feature work.
