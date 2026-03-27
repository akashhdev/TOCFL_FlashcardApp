# TOCFL FLASHCARD APP

<img width="1320" height="1301" alt="image" src="https://github.com/user-attachments/assets/99d4fe6e-f22a-4274-89b7-6010afe70454" />
<img width="1332" height="1253" alt="image" src="https://github.com/user-attachments/assets/d81d93a9-a9b1-4526-9407-dc1f8b19052f" />
<img width="1338" height="1289" alt="image" src="https://github.com/user-attachments/assets/4715ba84-14fc-4489-b857-3f4b9426120b" />
<img width="1352" height="1027" alt="image" src="https://github.com/user-attachments/assets/1a4d6685-1ff8-4b2f-b0b0-c20350c4e062" />

# Paragraph Practice Mode

Generate your own tocfl practice paragraph based on your difficulty level. You can even add your own flashcards to make the paragraph more familiar and focused on your practice set! 

<img width="1080" height="1920" alt="image" src="src/assets/Demo-images/tocfl-prep-app-para-practice-1.png" />
<img width="1080" height="1920" alt="image" src="src/assets/Demo-images/tocfl-prep-app-para-practice-2.png" />

# Conversation Practice Mode

Generate your own tocfl listening practice conversation based on your difficulty level. You can even add your own flashcards to make the conversation more familiar and focused on your practice set! 

<img width="1080" height="1920" alt="image" src="src/assets/Demo-images/tocfl-prep-app-convo-practice-1.png" />
<img width="1080" height="1920" alt="image" src="src/assets/Demo-images/tocfl-prep-app-convo-practice-2.png" 


## Features

- **Flashcard Drill** — score-tracked sessions with a 10-second bonus window, shuffle, and keyboard shortcuts
- **Mix Decks** — select multiple saved decks in the Library and combine them into a new shuffled deck tagged `[Mixed]`
- **Custom Word Review** — after any session, open *Select Custom Words* to cherry-pick individual cards by status (correct / wrong / missed / unvisited) and start a targeted review
- **Paragraph Practice** — AI-generated TOCFL reading passages with pinyin, translation, and optional comprehension questions
- **Conversation Practice** — AI-generated listening transcripts with per-turn audio playback and questions
- **Cloud Library** — save decks, paragraphs, and conversations to the backend; progress is auto-saved on every card advance
- **Offline Mode** — disables all AI/network features so you can drill saved content without a connection

## Stack

- React 19 + Vite 7 + Tailwind CSS
- Node.js + Express backend (port 3001) with SQLite (`server/tocfl.db`)
- JWT authentication (30-day tokens)
- Google Gemini API for AI generation

## Getting Started

```bash
npm install
npm run dev   # starts Vite (5173) + Express (3001) together
```

Set `VITE_GEMINI_API_KEY` in `.env.local` or enter your key in the Settings modal.
