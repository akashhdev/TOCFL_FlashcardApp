import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  ChevronLeft, ChevronRight, RotateCcw, Sparkles, MessageCircle, Send, 
  Loader2, X, Moon, Sun, Upload, Download, Volume2, VolumeX, 
  Trophy, AlertCircle, Eye, EyeOff, RefreshCw, BrainCircuit,
  GraduationCap, Star, Smile, Frown, Meh, AlertTriangle, XCircle,
  BookOpen, CheckSquare, Shuffle, CheckCircle2, Copy, Clock, Settings, Key, Zap,
  LogIn, LogOut, Library, Save, PlayCircle
} from 'lucide-react';

/*
  AGENT ORIENTATION NOTE
  ---------------------------------------------------------------------------
  This file is intentionally monolithic and drives the full app UI + logic.
  The app is effectively a mode-based state machine controlled by `appMode`.

  Primary modes:
  - `flashcards`                : core card drill + scoring loop
  - `paragraph-setup/loading/practice`
  - `conversation-setup/loading/practice`

  Audio strategy:
  - SFX via WebAudio (`SoundFX`)
  - Content speech uses layered fallback pipeline:
    1) Google Translate TTS endpoint
    2) Browser SpeechSynthesis
    3) Gemini audio generation (when API key available)

  AI strategy:
  - All Gemini requests go through `callGemini`
  - Token usage is constrained by `TOKEN_EFFICIENCY_INSTRUCTION`

  Maintenance guidance for agents:
  - Prefer adding helpers before JSX views, not inside JSX blocks.
  - Keep output JSON contracts stable when changing prompts.
  - If adding a new mode, mirror existing setup/loading/practice pattern.
*/

// --- Configuration ---
const envApiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() || "";

// --- API Helper ---
// Shared fetch wrapper for the Express backend. Reads JWT from localStorage on each call.
const callAPI = async (path, method = 'GET', body = null) => {
  const token = localStorage.getItem('tocfl_auth_token');
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};
const TOKEN_EFFICIENCY_INSTRUCTION = "Be concise. No filler. Output only requested format.";

// --- Initial Data ---
const INITIAL_DECK = [
  { id: 1, char: "杯子", pinyin: "bēi zi", meaning: "cup/glass" },
  { id: 2, char: "麵包", pinyin: "miàn bāo", meaning: "bread" },
  { id: 3, char: "點心", pinyin: "diǎn xīn", meaning: "snack/dessert" },
  { id: 4, char: "豬肉", pinyin: "zhū ròu", meaning: "pork" },
  { id: 5, char: "菜", pinyin: "cài", meaning: "vegetable / dish" },
  { id: 6, char: "飲料", pinyin: "yǐn liào", meaning: "beverage" },
  { id: 7, char: "果汁", pinyin: "guǒ zhī", meaning: "juice" },
  { id: 8, char: "紙", pinyin: "zhǐ", meaning: "paper" },
  { id: 9, char: "桌子", pinyin: "zhuō zi", meaning: "table" },
  { id: 10, char: "筆", pinyin: "bǐ", meaning: "pen" },
  { id: 11, char: "帽子", pinyin: "mào zi", meaning: "hat" },
  { id: 12, char: "裙子", pinyin: "qún zi", meaning: "skirt" },
  { id: 13, char: "行李", pinyin: "xíng lǐ", meaning: "luggage" },
  { id: 14, char: "花", pinyin: "huā", meaning: "flower" },
  { id: 15, char: "樹", pinyin: "shù", meaning: "tree" },
  { id: 16, char: "作業 / 功課", pinyin: "zuò yè / gōng kè", meaning: "homework" },
  { id: 17, char: "球", pinyin: "qiú", meaning: "ball" },
  { id: 18, char: "路口", pinyin: "lù kǒu", meaning: "intersection/crossing" },
  { id: 19, char: "旅館", pinyin: "lǚ guǎn", meaning: "hotel" },
  { id: 20, char: "百貨公司", pinyin: "bǎi huò gōng sī", meaning: "department store" }
];

// --- Audio Engine (Singleton) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const SoundFX = {
  playTone: (freq, type, duration, volume = 0.1) => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  },
  correct: () => {
    SoundFX.playTone(600, 'sine', 0.1);
    setTimeout(() => SoundFX.playTone(800, 'sine', 0.2), 100);
  },
  bonus: () => {
    SoundFX.playTone(800, 'sine', 0.1);
    setTimeout(() => SoundFX.playTone(1200, 'triangle', 0.3), 100);
  },
  wrong: () => {
    SoundFX.playTone(150, 'sawtooth', 0.3);
  },
  victory: () => {
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      setTimeout(() => SoundFX.playTone(freq, 'square', 0.4, 0.1), i * 150);
    });
  }
};

// --- API Helpers (Modified to accept key) ---
// Centralized Gemini wrapper used by every AI feature.
// It applies a shared token-efficiency system instruction + retry/fallback behavior.
const callGemini = async (prompt, systemInstruction, key, responseMimeType = "text/plain") => {
  if (!key) return null;
  // Use gemini-3.1-flash-lite-preview for all AI tasks
  const model = "gemini-3.1-flash-lite-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const optimizedSystemInstruction = `${systemInstruction}\n${TOKEN_EFFICIENCY_INSTRUCTION}`;
  
  const makeRequest = async (retryCount = 0) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: optimizedSystemInstruction }] },
          generationConfig: { responseMimeType }
        })
      });
      
      if (!response.ok) {
        const errText = await response.text();
        // If it's a 404, it might be a model name issue, try fallback to 1.5 flash
        if (response.status === 404 && model.includes('3.1-flash-lite-preview')) {
             console.warn("3.1 flash lite preview model not found, falling back to 1.5-flash");
             const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
             const fallbackResp = await fetch(fallbackUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }],
                  systemInstruction: { parts: [{ text: optimizedSystemInstruction }] },
                  generationConfig: { responseMimeType }
                })
             });
             if (fallbackResp.ok) {
                const data = await fallbackResp.json();
                return data.candidates?.[0]?.content?.parts?.[0]?.text;
             }
        }

        if (response.status === 401 || response.status === 403) {
            console.error(`Gemini Auth Error (${response.status}):`, errText);
            throw new Error(`Auth Error: ${response.status}. Check API Key.`);
        }
        if (retryCount < 2) {
          await new Promise(r => setTimeout(r, Math.pow(2, retryCount) * 1000));
          return makeRequest(retryCount + 1);
        }
        throw new Error(`API Error: ${response.status} ${errText}`);
      }
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (err) {
      console.error("Gemini API Network Error:", err);
      throw err; // Propagate error for UI handling
    }
  };
  return makeRequest();
};

const generateImage = async (prompt, key) => {
  if (!key) return null;
  // Imagen typically requires specific allowlisting or credits. 
  // Fallback to text description if image gen fails is handled by UI logic usually, but here we just return null.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${key}`;
  const makeRequest = async (retryCount = 0) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          instances: [{ prompt }], 
          parameters: { sampleCount: 1 } 
        })
      });
      if (!response.ok) {
        if (retryCount < 1) {
          await new Promise(r => setTimeout(r, 1000));
          return makeRequest(retryCount + 1);
        }
        return null;
      }
      const result = await response.json();
      if (!result.predictions?.[0]?.bytesBase64Encoded) return null;
      return `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
    } catch (err) { 
      return null; 
    }
  };
  return makeRequest();
};

// Gemini-native TTS helper (kept as a fallback path when browser/web TTS is unavailable).
const generateTTS = async (text, key) => {
  if (!key) return null;
  // TTS model - using gemini-3.1-flash-lite-preview
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${key}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Mandarin: ${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
        }
      })
    });
    if (!response.ok) return null;
    const result = await response.json();
    return result.candidates[0].content.parts[0].inlineData;
  } catch (err) { return null; }
};

// Converts raw PCM bytes returned by Gemini TTS into a playable WAV blob.
const pcmToWav = (base64Pcm) => {
  const pcmBuffer = Uint8Array.from(atob(base64Pcm), c => c.charCodeAt(0)).buffer;
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  const writeString = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeString(0, 'RIFF'); view.setUint32(4, 36 + pcmBuffer.byteLength, true);
  writeString(8, 'WAVE'); writeString(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeString(36, 'data'); view.setUint32(40, pcmBuffer.byteLength, true);
  return new Blob([wavHeader, pcmBuffer], { type: 'audio/wav' });
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// --- Sub-Components ---
const Confetti = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
    {[...Array(50)].map((_, i) => (
      <div
        key={i}
        className="absolute w-2 h-2 bg-indigo-500 rounded-full animate-confetti"
        style={{
          left: `${Math.random() * 100}%`,
          top: `-10px`,
          backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ec4899'][Math.floor(Math.random() * 4)],
          animationDelay: `${Math.random() * 2}s`,
          animationDuration: `${2 + Math.random() * 2}s`
        }}
      />
    ))}
  </div>
);

// Formatter for Bold, Lists, and Headings
const FormattedText = ({ text, isUser }) => {
  const parseBold = (str) => {
    const parts = str.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className={`font-black ${isUser ? 'text-white' : 'text-indigo-400'}`}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <div className="space-y-1">
      {text.split('\n').map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;
        if (trimmed.startsWith('### ')) {
           return <h3 key={i} className={`text-lg font-extrabold mt-3 mb-1 ${isUser ? 'text-white' : 'text-indigo-400'}`}>{parseBold(trimmed.substring(4))}</h3>;
        }
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
           return <div key={i} className="flex gap-2 pl-2"><span className="opacity-50">•</span><span>{parseBold(trimmed.substring(2))}</span></div>;
        }
        return <div key={i}>{parseBold(line)}</div>;
      })}
    </div>
  );
};

// Isolated Timer Component to prevent main thread blocking
const TimerBar = ({ isActive, duration = 10, onExpire, resetKey }) => {
  const [width, setWidth] = useState(100);

  useEffect(() => {
    setWidth(100);
  }, [resetKey]);

  useEffect(() => {
    if (!isActive) return;
    
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, duration - elapsed);
      const nextWidth = (remaining / duration) * 100;
      
      setWidth(nextWidth);

      if (remaining <= 0) {
        clearInterval(interval);
        onExpire && onExpire();
      }
    }, 50); // 20fps update rate

    return () => clearInterval(interval);
  }, [isActive, duration, onExpire, resetKey]);

  return (
    <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full mb-8 overflow-hidden pointer-events-none relative z-0">
      <div className="h-full bg-indigo-500 transition-all duration-75 ease-linear" style={{ width: `${width}%` }} />
    </div>
  );
};

// --- Main App Component ---
export default function App() {
  // Global UI State
  // `appMode` is the top-level route/state machine driver for the whole app.
  const [appMode, setAppMode] = useState('flashcards');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Flashcard Session State
  const [cards, setCards] = useState(INITIAL_DECK);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [score, setScore] = useState(0);
  const [isBonusWindow, setIsBonusWindow] = useState(true); 
  const [timerKey, setTimerKey] = useState(0);

  // Flashcard Timing State
  const [startTime, setStartTime] = useState(Date.now());
  const [sessionDuration, setSessionDuration] = useState(0);

  // Card evaluation state model: 'unvisited' | 'correct' | 'wrong' | 'missed'
  const [cardStatuses, setCardStatuses] = useState(new Array(INITIAL_DECK.length).fill('unvisited'));
  const [isFinished, setIsFinished] = useState(false);

  // Context/Chat assistant state
  const [aiSentence, setAiSentence] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [isChatting, setIsChatting] = useState(false);
  const [isContextRevealed, setIsContextRevealed] = useState(false);
  
  // API key sources: user-entered key (localStorage) overrides env key.
  const [customKey, setCustomKey] = useState(() => localStorage.getItem('gemini_key') || "");
  const [showSettings, setShowSettings] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(() => localStorage.getItem('tocfl_mode') === 'offline');

  // Auth State
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('tocfl_auth_token') || null);
  const [authUser, setAuthUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Library Panel State
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryTab, setLibraryTab] = useState('decks'); // 'decks' | 'paragraphs' | 'conversations'
  const [savedDecks, setSavedDecks] = useState([]);
  const [savedParagraphs, setSavedParagraphs] = useState([]);
  const [savedConversations, setSavedConversations] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // Save prompt state
  const [showSavePrompt, setShowSavePrompt] = useState(null); // null | 'deck' | 'paragraph' | 'conversation'
  const [saveName, setSaveName] = useState('');

  // Current saved deck id (links active session to DB for progress saving)
  const [currentDeckId, setCurrentDeckId] = useState(null);
  const [pendingResume, setPendingResume] = useState(null); // { deckId, progress } | null

  const effectiveKey = customKey || envApiKey;

  // Paragraph Practice State (reading comprehension workflow)
  const [paragraphConfig, setParagraphConfig] = useState({ level: 'A', length: 'short', useCurrentDeck: false, familiarity: 1, includeQuestions: false });
  const [paragraphData, setParagraphData] = useState({
    chinese: "小明每天早上都會喝一杯咖啡。他喜歡在咖啡廳裡看書，感受寧靜的早晨。咖啡的香味讓他覺得很放鬆。有時候他會點一個三明治，跟咖啡一起吃。咖啡廳的老闆娘很親切，總是跟他聊天。小明覺得這是開始新一天最好的方式。",
    pinyin: "Xiǎo Míng měi tiān zǎo shàng dōu huì hē yī bēi kā fēi. Tā xǐ huān zài kā fēi tīng lǐ kàn shū, gǎn shòu níng jìng de zǎo chén. Kā fēi de xiāng wèi ràng tā jué dé hěn fàng sōng. Yǒu shí hòu tā huì diǎn yī gè sān míng zhì, gēn kā fēi yī qǐ chī. Kā fēi tīng de lǎo bǎn niáng hěn qīn qiè, zǒng shì gēn tā liáo tiān. Xiǎo Míng jué dé zhè shì kāi shǐ xīn yī tiān zuì hǎo de fāng shì.",
    english: "Xiao Ming drinks a cup of coffee every morning. He likes to read books in the cafe and enjoy the peaceful morning. The aroma of coffee makes him feel very relaxed. Sometimes he orders a sandwich to eat with his coffee. The cafe owner is very friendly and always chats with him. Xiao Ming thinks this is the best way to start a new day.",
    questions: [],
    words: ["杯子", "咖啡", "點心", "豬肉", "菜", "飲料", "果汁", "紙", "桌子", "筆", "帽子", "裙子", "行李", "花", "樹", "作業", "球", "路口", "旅館", "百貨公司"]
  });
  const [paragraphLoadingStatus, setParagraphLoadingStatus] = useState("");
  const [showPinyin, setShowPinyin] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
  const [highlightWords, setHighlightWords] = useState(false);
  const [questionAnswers, setQuestionAnswers] = useState({});
  const [visibleTranslations, setVisibleTranslations] = useState({}); // Track which translations are visible

  // Conversation Practice State (listening workflow)
  const [conversationConfig, setConversationConfig] = useState({ level: 'A', length: 'short', useCurrentDeck: false, familiarity: 1, includeQuestions: true });
  const [conversationData, setConversationData] = useState({
    title: '日常對話',
    conversation: [],
    questions: [],
    words: []
  });
  const [conversationLoadingStatus, setConversationLoadingStatus] = useState('');
  const [conversationVisibleTurns, setConversationVisibleTurns] = useState(0);
  const [conversationQuestionAnswers, setConversationQuestionAnswers] = useState({});
  const [conversationVisibleTranslations, setConversationVisibleTranslations] = useState({});
  const [revealedConversationTurns, setRevealedConversationTurns] = useState({});
  const [playingTurnIndex, setPlayingTurnIndex] = useState(null);

  // Post-session review state for flashcards summary screen.
  const [revealedReviewItems, setRevealedReviewItems] = useState({});

  const fileInputRef = useRef(null);
  const currentCard = cards[currentIndex] || {};
  const speakerVoicePreferenceRef = useRef({});

  // Derived counters to avoid repeated O(n) scans during render.
  const statusStats = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    let missed = 0;

    for (const status of cardStatuses) {
      if (status === 'correct') correct += 1;
      else if (status === 'wrong') wrong += 1;
      else if (status === 'missed') missed += 1;
    }

    return { correct, wrong, missed };
  }, [cardStatuses]);

  // Derived flashcard summary payload used by the completion view.
  const sessionSummary = useMemo(() => {
    const totalCards = cards.length;
    const correctCount = statusStats.correct;
    const percentage = totalCards > 0 ? (correctCount / totalCards) * 100 : 0;

    let stars = 0;
    if (percentage >= 20) stars = 1;
    if (percentage >= 40) stars = 2;
    if (percentage >= 60) stars = 3;
    if (percentage >= 80) stars = 4;
    if (percentage === 100) stars = 5;

    const reviewCards = cardStatuses
      .map((status, i) => ((status === 'wrong' || status === 'missed') ? { ...cards[i], status } : null))
      .filter(Boolean);

    return {
      totalCards,
      correctCount,
      percentage,
      stars,
      reviewCards,
    };
  }, [cards, cardStatuses, statusStats.correct]);

  // Precomputes highlighted paragraph HTML only when relevant inputs change.
  const highlightedParagraphHtml = useMemo(() => {
    const chineseText = paragraphData?.chinese || '';
    if (!highlightWords || !chineseText || !Array.isArray(paragraphData?.words)) {
      return chineseText;
    }

    const uniqueWords = [...new Set(paragraphData.words.filter(Boolean))].sort((a, b) => b.length - a.length);
    if (uniqueWords.length === 0) {
      return chineseText;
    }

    const pattern = uniqueWords.map(escapeRegExp).join('|');
    if (!pattern) {
      return chineseText;
    }

    const regex = new RegExp(`(${pattern})`, 'g');
    return chineseText.replace(regex, '<span class="bg-yellow-300 text-black px-1 rounded">$1</span>');
  }, [highlightWords, paragraphData]);

  // --- Initialization ---
  useEffect(() => {
    if (!window.mammoth) {
      const script = document.createElement('script');
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const handleKeySave = (newKey) => {
    const trimmedKey = newKey.trim();
    setCustomKey(trimmedKey);
    localStorage.setItem('gemini_key', trimmedKey);
  };

  const toggleOfflineMode = () => {
    setIsOfflineMode((prev) => {
      const next = !prev;
      localStorage.setItem('tocfl_mode', next ? 'offline' : 'online');
      if (next) {
        setShowChat(false);
      }
      return next;
    });
  };

  // --- Auth Handlers ---
  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const data = await callAPI('/api/auth/login', 'POST', { username: authUsername, password: authPassword });
      localStorage.setItem('tocfl_auth_token', data.token);
      setAuthToken(data.token);
      setAuthUser({ username: data.username });
    } catch (e) {
      setAuthError(e.message);
    }
    setAuthLoading(false);
  };

  const handleRegister = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const data = await callAPI('/api/auth/register', 'POST', { username: authUsername, password: authPassword });
      localStorage.setItem('tocfl_auth_token', data.token);
      setAuthToken(data.token);
      setAuthUser({ username: data.username });
    } catch (e) {
      setAuthError(e.message);
    }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('tocfl_auth_token');
    setAuthToken(null);
    setAuthUser(null);
    setCurrentDeckId(null);
    setPendingResume(null);
  };

  // Validate stored token on mount and restore username from JWT payload.
  useEffect(() => {
    if (!authToken) return;
    callAPI('/api/decks')
      .then(() => {
        try {
          const payload = JSON.parse(atob(authToken.split('.')[1]));
          setAuthUser({ username: payload.username });
        } catch { /* malformed token */ }
      })
      .catch(() => {
        localStorage.removeItem('tocfl_auth_token');
        setAuthToken(null);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Library ---
  const loadLibrary = async () => {
    setLibraryLoading(true);
    try {
      const [decks, paragraphs, conversations] = await Promise.all([
        callAPI('/api/decks'),
        callAPI('/api/paragraphs'),
        callAPI('/api/conversations'),
      ]);
      setSavedDecks(decks);
      setSavedParagraphs(paragraphs);
      setSavedConversations(conversations);
    } catch (e) {
      console.error('Library load failed:', e);
    }
    setLibraryLoading(false);
  };

  const loadDeckFromLibrary = async (deck) => {
    const deckCards = JSON.parse(deck.cards_json || '[]');
    if (!deckCards.length) return;
    setCards(deckCards);
    resetSession(deckCards);
    setCurrentDeckId(deck.id);
    setShowLibrary(false);
    setAppMode('flashcards');

    if (deck.has_progress) {
      try {
        const progress = await callAPI(`/api/progress/${deck.id}`);
        if (progress && !progress.is_finished) {
          setPendingResume({ deckId: deck.id, progress });
        }
      } catch { /* no progress */ }
    }
  };

  const applyResume = (progress) => {
    setCurrentIndex(progress.current_index);
    setCardStatuses(JSON.parse(progress.card_statuses));
    setScore(progress.score);
    setSessionDuration(progress.session_duration);
    setIsFinished(progress.is_finished === 1);
    setIsBonusWindow(progress.is_bonus_window === 1);
    setPendingResume(null);
  };

  // --- Cloud Save Functions ---
  const saveDeckToCloud = async () => {
    if (!saveName.trim()) return;
    try {
      await callAPI('/api/decks', 'POST', { name: saveName.trim(), cards });
      setShowSavePrompt(null);
      setSaveName('');
      if (soundEnabled) SoundFX.playTone(800, 'triangle', 0.15);
    } catch (e) {
      console.error('Save deck failed:', e);
    }
  };

  const saveParagraphToCloud = async () => {
    if (!saveName.trim()) return;
    try {
      await callAPI('/api/paragraphs', 'POST', { name: saveName.trim(), paragraphConfig, paragraphData });
      setShowSavePrompt(null);
      setSaveName('');
      if (soundEnabled) SoundFX.playTone(800, 'triangle', 0.15);
    } catch (e) {
      console.error('Save paragraph failed:', e);
    }
  };

  const saveConversationToCloud = async () => {
    if (!saveName.trim()) return;
    try {
      await callAPI('/api/conversations', 'POST', { name: saveName.trim(), conversationConfig, conversationData });
      setShowSavePrompt(null);
      setSaveName('');
      if (soundEnabled) SoundFX.playTone(800, 'triangle', 0.15);
    } catch (e) {
      console.error('Save conversation failed:', e);
    }
  };

  const pauseAndSaveProgress = async () => {
    if (!currentDeckId) return;
    try {
      await callAPI(`/api/progress/${currentDeckId}`, 'PUT', {
        currentIndex,
        cardStatuses,
        score,
        sessionDuration: Date.now() - startTime,
        isFinished,
        isBonusWindow,
      });
      if (soundEnabled) SoundFX.playTone(600, 'sine', 0.15);
    } catch (e) {
      console.error('Save progress failed:', e);
    }
  };

  // --- Keyboard Shortcuts ---
  // Scope is primarily flashcard mode to avoid mode-crossing key collisions.
  const handleKeyDown = useCallback((e) => {
    if (showChat || showSettings) {
       if (e.key === 'Escape') {
         setShowChat(false);
         setShowSettings(false);
       }
       return;
    }

    if (e.key === 'Alt' || e.key === 'CapsLock') {
      e.preventDefault();
      handleTTS(currentCard.char);
      return;
    }

    if (appMode === 'flashcards' && !isFinished) {
      if (e.key === 'ArrowRight') nextCard();
      if (e.key === 'ArrowLeft') prevCard();
      if (e.key === 'ArrowUp') setIsFlipped(prev => !prev);
      if (e.key === 'ArrowDown') setIsFlipped(false);
      
      if (e.key === 'Enter') {
        if (isFlipped) markCard('correct');
      }
      if (e.key === 'Escape') {
        if (isFlipped) markCard('wrong');
      }
      
      if (e.key === 'Tab') {
        if (isOfflineMode) return;
        e.preventDefault();
        setShowChat(true);
      }
      if (e.key === 'Shift') {
        if (isOfflineMode) return;
        e.preventDefault();
        generateSmartSentence();
      }
    }
  }, [appMode, isFinished, isFlipped, currentCard, showChat, showSettings, isOfflineMode]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Resets bonus window and progress bar for the next flashcard turn.
  const resetTimer = () => {
    setIsBonusWindow(true);
    setTimerKey(prev => prev + 1);
  };

  // Keeps tutor chat scoped to the currently visible flashcard.
  const resetTutorChat = () => {
    setChatMessages([]);
    setChatInput("");
  };

  // Marks untouched cards as missed when learner navigates away without grading.
  const updateStatusIfMissed = (index) => {
    if (cardStatuses[index] === 'unvisited') {
      const newStatuses = [...cardStatuses];
      newStatuses[index] = 'missed';
      setCardStatuses(newStatuses);
    }
  };

  const nextCard = () => {
    if (currentIndex < cards.length - 1) {
      updateStatusIfMissed(currentIndex);
      setIsFlipped(false);
      resetTutorChat();
      setCurrentIndex(p => p + 1);
      setAiSentence(null);
      setIsContextRevealed(false);
      resetTimer();
    } else {
        if (cardStatuses[currentIndex] === 'unvisited') {
             updateStatusIfMissed(currentIndex);
             setSessionDuration((Date.now() - startTime) / 1000);
             setTimeout(() => setIsFinished(true), 200);
        }
    }
  };

  const prevCard = () => {
    if (currentIndex > 0) {
      updateStatusIfMissed(currentIndex);
      setIsFlipped(false);
      resetTutorChat();
      setCurrentIndex(p => p - 1);
      setAiSentence(null);
      setIsContextRevealed(false);
      resetTimer();
    }
  };

  // Central grading handler for flashcards; updates score, SFX, status, and flow.
  const markCard = (status) => {
    const cardTextForAudio = currentCard?.char;

    let points = 0;
    if (status === 'correct') {
      points = isBonusWindow ? 10 : 5;
      if (soundEnabled) isBonusWindow ? SoundFX.bonus() : SoundFX.correct();
    } else if (status === 'wrong') {
      points = -5;
      if (soundEnabled) SoundFX.wrong();
    }

    setScore(s => s + points);
    setCardStatuses(prev => {
      const n = [...prev];
      n[currentIndex] = status;
      return n;
    });

    if (!isOfflineMode && cardTextForAudio) {
      // Small delay keeps grading SFX from clipping the spoken card audio.
      setTimeout(() => {
        handleTTS(cardTextForAudio);
      }, 120);
    }

    if (currentIndex === cards.length - 1) {
      if (soundEnabled && status === 'correct') SoundFX.victory();
      setSessionDuration((Date.now() - startTime) / 1000);
      setTimeout(() => setIsFinished(true), 500);
    } else {
      setIsFlipped(false);
      setAiSentence(null);
      setIsContextRevealed(false);
      resetTutorChat();
      resetTimer();
      setTimeout(() => setCurrentIndex(p => p + 1), 200);
    }
  };

  // Restarts either full deck or provided subset (used for review deck mode).
  const resetSession = (specificCards = null) => {
    const deckToUse = specificCards || cards;
    if (specificCards) setCards(specificCards);
    
    setIsFinished(false);
    setCurrentIndex(0);
    setIsFlipped(false);
    setCardStatuses(new Array(deckToUse.length).fill('unvisited'));
    setScore(0);
    resetTutorChat();
    setAiSentence(null);
    setIsContextRevealed(false);
    setRevealedReviewItems({});
    setStartTime(Date.now());
    setSessionDuration(0);
    resetTimer();
  };

  const shuffleDeck = () => {
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    resetSession(shuffled);
  };

  // --- Copy Helper ---
  const copyToClipboard = async (text) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      if (soundEnabled) SoundFX.playTone(800, 'sine', 0.1);
    } catch (err) {
      console.error('Unable to copy text to clipboard', err);
    }
  };

  const downloadParagraphSnapshot = () => {
    if (!paragraphData?.chinese?.trim()) return;

    const snapshot = {
      app: 'TOCFL Prep',
      type: 'paragraph-snapshot',
      version: 1,
      savedAt: new Date().toISOString(),
      paragraphConfig,
      paragraphData: {
        chinese: paragraphData.chinese,
        pinyin: paragraphData.pinyin || '',
        english: paragraphData.english || '',
        questions: Array.isArray(paragraphData.questions) ? paragraphData.questions : [],
        words: Array.isArray(paragraphData.words) ? paragraphData.words : []
      }
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `tocfl-paragraph-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (soundEnabled) SoundFX.playTone(800, 'triangle', 0.1);
  };

  const downloadConversationSnapshot = () => {
    if (!Array.isArray(conversationData?.conversation) || conversationData.conversation.length === 0) return;

    const snapshot = {
      app: 'TOCFL Prep',
      type: 'conversation-snapshot',
      version: 1,
      savedAt: new Date().toISOString(),
      conversationConfig,
      conversationData: {
        title: conversationData.title || 'Listening Conversation',
        conversation: conversationData.conversation,
        questions: Array.isArray(conversationData.questions) ? conversationData.questions : [],
        words: Array.isArray(conversationData.words) ? conversationData.words : []
      }
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `tocfl-conversation-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (soundEnabled) SoundFX.playTone(800, 'triangle', 0.1);
  };

  // --- Snapshot Loaders (component-scope so Library modal can call them too) ---
  const applyParagraphSnapshot = (payload) => {
    const snapshotConfig = payload?.paragraphConfig || {};
    const snapshotData = payload?.paragraphData || {};
    if (!snapshotData?.chinese || typeof snapshotData.chinese !== 'string') return false;

    setParagraphConfig(prev => ({
      ...prev,
      ...snapshotConfig,
      familiarity: Number.isFinite(snapshotConfig.familiarity) ? snapshotConfig.familiarity : prev.familiarity
    }));

    setParagraphData({
      chinese: snapshotData.chinese,
      pinyin: snapshotData.pinyin || '',
      english: snapshotData.english || '',
      questions: Array.isArray(snapshotData.questions) ? snapshotData.questions : [],
      words: Array.isArray(snapshotData.words) ? snapshotData.words : cards.map(c => c.char)
    });

    setShowPinyin(false);
    setShowEnglish(false);
    setHighlightWords(false);
    setQuestionAnswers({});
    setVisibleTranslations({});
    setAppMode('paragraph-practice');
    return true;
  };

  const applyConversationSnapshot = (payload) => {
    const snapshotConfig = payload?.conversationConfig || {};
    const snapshotData = payload?.conversationData || {};
    if (!Array.isArray(snapshotData.conversation) || snapshotData.conversation.length === 0) return false;

    const normalizedConversation = snapshotData.conversation
      .map((turn) => {
        const speaker = String(turn?.speaker || '').trim();
        const text = String(turn?.text || '').trim();
        if (!speaker || !text) return null;
        return { speaker, text };
      })
      .filter(Boolean);

    if (!normalizedConversation.length) return false;

    setConversationConfig(prev => ({
      ...prev,
      ...snapshotConfig,
      familiarity: Number.isFinite(snapshotConfig.familiarity) ? snapshotConfig.familiarity : prev.familiarity
    }));

    setConversationData({
      title: String(snapshotData.title || 'Listening Conversation'),
      conversation: normalizedConversation,
      questions: Array.isArray(snapshotData.questions) ? snapshotData.questions : [],
      words: Array.isArray(snapshotData.words) ? snapshotData.words : cards.map(c => c.char)
    });

    setConversationVisibleTurns(0);
    setConversationQuestionAnswers({});
    setConversationVisibleTranslations({});
    setRevealedConversationTurns({});
    setPlayingTurnIndex(null);
    speakerVoicePreferenceRef.current = {};
    setAppMode('conversation-practice');
    return true;
  };

  // --- File Handling ---
  // Accepts CSV/TXT/DOCX and normalizes to internal deck shape.
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const parseText = (text) => {
      const lines = text.split('\n').filter(l => l.trim());
      return lines.map((line, idx) => {
        const parts = line.split(/,(?![^()]*\))/).map(p => p.trim());
        const simpleParts = line.split(',').map(p => p.trim());
        const finalParts = simpleParts.length >= 3 ? simpleParts : parts;
        
        if (finalParts.length < 2) return null;
        return {
          id: Date.now() + idx,
          char: finalParts[0].replace(/[()]/g, ''),
          pinyin: finalParts[1] || '',
          meaning: finalParts.slice(2).join(', ') || ''
        };
      }).filter(Boolean);
    };

    const applyDeckFromJson = (payload) => {
      if (!Array.isArray(payload)) return false;
      const deck = payload
        .map((item, idx) => {
          if (!item || typeof item !== 'object') return null;
          const char = String(item.char || '').trim();
          if (!char) return null;
          return {
            id: Date.now() + idx,
            char,
            pinyin: String(item.pinyin || '').trim(),
            meaning: String(item.meaning || '').trim()
          };
        })
        .filter(Boolean);

      if (!deck.length) return false;
      setCards(deck);
      resetSession(deck);
      return true;
    };

    let newDeck = [];
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.json')) {
      try {
        const jsonText = await file.text();
        const parsed = JSON.parse(jsonText);
        const loadedParagraph = parsed?.type === 'paragraph-snapshot' && applyParagraphSnapshot(parsed);
        const loadedConversation = !loadedParagraph && parsed?.type === 'conversation-snapshot' && applyConversationSnapshot(parsed);
        const loadedDeck = !loadedParagraph && !loadedConversation && applyDeckFromJson(parsed);
        if (loadedParagraph || loadedConversation || loadedDeck) return;
      } catch (err) {
        console.error('Invalid JSON upload:', err);
      }
    }

    if (lowerName.endsWith('.docx') && window.mammoth) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await window.mammoth.extractRawText({ arrayBuffer });
      newDeck = parseText(result.value);
    } else {
      const text = await file.text();
      newDeck = parseText(text);
    }

    if (newDeck.length > 0) {
      setCards(newDeck);
      resetSession(newDeck);
    }
  };

  // --- AI Actions ---
  // Content TTS fallback chain is managed in `playGoogleTranslateTTS`; this method
  // is the single entry point used by flashcards and other direct word playback UI.
  const playGeminiTTS = async (text) => {
    if (!effectiveKey) throw new Error('No Gemini API key for TTS fallback');

    const audioData = await generateTTS(text, effectiveKey);
    if (!audioData) throw new Error('Gemini TTS fallback failed');

    const blob = pcmToWav(audioData.data);
    const audio = new Audio(URL.createObjectURL(blob));
    await audio.play();
  };

  const handleTTS = async (text) => {
    if (!text) return;
    try {
      await playGoogleTranslateTTS(text, {
        speaker: null,
        fallbackToBrowser: true,
        fallbackToGemini: !!effectiveKey,
      });
    } catch (err) {
      console.error('Word TTS failed:', err);
      if (!effectiveKey) setShowSettings(true);
    }
  };

  // Generates a contextual example sentence for the active flashcard.
  const generateSmartSentence = async () => {
    if (isOfflineMode) return;
    if (!effectiveKey) { setShowSettings(true); return; }
    setIsGenerating(true);
    try {
      const prompt = `Create one natural TOCFL Band A sentence using "${currentCard.char}". Return exactly: [Traditional Chinese] | [Pinyin] | [English].`;
      const result = await callGemini(prompt, "You are a TOCFL Chinese tutor.", effectiveKey);
      if (result) {
        const [chinese, pinyin, english] = result.split('|').map(s => s.trim());
        setAiSentence({ chinese, pinyin, english });
        setIsContextRevealed(false);
      }
    } catch (e) {
      console.error(e);
    }
    setIsGenerating(false);
  };

  // Chat tutor bound to current card context.
  const handleChat = async (inputOverride = null) => {
    if (isOfflineMode) return;
    if (!effectiveKey) { setShowSettings(true); return; }
    const msg = inputOverride || chatInput;
    if (!msg.trim()) return;
    
    setChatMessages(p => [...p, { role: 'user', text: msg }]);
    setChatInput("");
    setIsChatting(true);
    
    const prompt = `Context: card "${currentCard.char}" (${currentCard.meaning}). User asks: "${msg}".
  Answer in English. Use Chinese only when citing vocabulary.
  Keep concise by default (short paragraphs/bullets), but still clear and useful.
  Format: **bold** for key terms, bullets for lists, ### for section headings.`;

    try {
      const response = await callGemini(prompt, "You are a helpful Mandarin tutor. Always explain in English.", effectiveKey);
      setChatMessages(p => [...p, { role: 'ai', text: response || "Sorry, I couldn't connect." }]);
    } catch (e) {
      setChatMessages(p => [...p, { role: 'ai', text: `Error: ${e.message}` }]);
    }
    setIsChatting(false);
  };

  // --- Paragraph Practice Logic ---
  // Two-stage generation:
  // 1) paragraph (+ optional questions)
  // 2) pinyin + English translation enrichment
  const startParagraphGeneration = async () => {
    if (isOfflineMode) return;
    if (!effectiveKey) { setShowSettings(true); return; }
    setAppMode('paragraph-loading');
    setParagraphLoadingStatus("Generating paragraph...");
    
    // Reset UI state
    setShowPinyin(false);
    setShowEnglish(false);
    setHighlightWords(false);
    setQuestionAnswers({});
    setVisibleTranslations({});
    
    // Construct vocabulary context if option is selected
    let vocabContext = "";
    if (paragraphConfig.useCurrentDeck) {
      const deckWords = [...new Set(cards.map(c => c.char).filter(Boolean))].join(",");
      const familiarityLevels = {
        1: "natural usage",
        2: "slight repetition",
        3: "moderate repetition",
        4: "high repetition",
        5: "max repetition"
      };
      vocabContext = `vocab:[${deckWords}] familiarity:${paragraphConfig.familiarity} (${familiarityLevels[paragraphConfig.familiarity]})`;
    }

    const lengthMap = {
      'short': '50-80 words',
      'medium': '80-120 words', 
      'long': '120-160 words'
    };

    const prompt = `task: TOCFL Band ${paragraphConfig.level} reading paragraph in Traditional Chinese
  topic: daily-life narrative
  length: ${lengthMap[paragraphConfig.length]}
  ${vocabContext ? `${vocabContext}\n` : ''}output: ${paragraphConfig.includeQuestions
      ? 'json {paragraph, questions[3-5]{question, question_english, options[3], options_english[3], correct_answer, explanation}}'
      : 'text paragraph only'}`;
    
    try {
      const response = await callGemini(
        prompt, 
        paragraphConfig.includeQuestions
          ? "Generate natural TOCFL content in zh-Hant. Return strict JSON only."
          : "Generate natural TOCFL content in zh-Hant. Return only the paragraph text.", 
        effectiveKey, 
        paragraphConfig.includeQuestions ? "application/json" : "text/plain"
      );
      
      let paragraphData;
      if (paragraphConfig.includeQuestions) {
        // Parse JSON response with questions
        const cleanedResponse = response.replace(/```json|```/g, '').trim();
        const parsedData = JSON.parse(cleanedResponse);
        paragraphData = {
          chinese: parsedData.paragraph,
          questions: parsedData.questions
        };
      } else {
        // Plain text paragraph response
        paragraphData = {
          chinese: response
        };
      }
      
      if (!paragraphData.chinese) { throw new Error("No paragraph generated"); }

      // Generate pinyin and English translation
      setParagraphLoadingStatus("Generating translations...");
      const translationPrompt = `Convert zh-Hant paragraph to JSON only: {"pinyin":"...","english":"..."}\nparagraph:${paragraphData.chinese}`;
      
      const translationData = await callGemini(translationPrompt, "Return valid JSON only.", effectiveKey, "application/json");
      const cleanedTranslation = translationData.replace(/```json|```/g, '').trim();
      const translations = JSON.parse(cleanedTranslation);

      setParagraphData({
        chinese: paragraphData.chinese,
        pinyin: translations.pinyin,
        english: translations.english,
        questions: paragraphData.questions || [],
        words: cards.map(c => c.char) // Store the flashcard words for highlighting
      });
      
      setAppMode('paragraph-practice');
    } catch (e) { 
      console.error("Paragraph Generation Failed:", e);
      setParagraphLoadingStatus(`Error: ${e.message}`);
      setTimeout(() => setAppMode('flashcards'), 2000);
    }
  };

  // --- Conversation Practice Logic ---
  // Browser speech engine with optional speaker-aware voice selection.
  const playBrowserSpeechSynthesis = (text, speaker = null) => new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('Speech synthesis is not supported in this browser'));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-TW';
    utterance.rate = 0.9;
    utterance.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const zhVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('zh'));

    if (speaker && !speakerVoicePreferenceRef.current[speaker]) {
      const existingCount = Object.keys(speakerVoicePreferenceRef.current).length;
      speakerVoicePreferenceRef.current[speaker] = existingCount % 2 === 0 ? 'female' : 'male';
    }

    const preference = speaker ? speakerVoicePreferenceRef.current[speaker] : null;
    const femaleVoiceRegex = /(female|woman|girl|zira|samantha|ting|mei|xiao|hui|luna)/i;
    const maleVoiceRegex = /(male|man|boy|david|mark|george|james|liam|jun|gang|yun)/i;

    let preferredVoice = null;
    if (preference === 'female') {
      preferredVoice = zhVoices.find((voice) => femaleVoiceRegex.test(voice.name));
    }
    if (!preferredVoice && preference === 'male') {
      preferredVoice = zhVoices.find((voice) => maleVoiceRegex.test(voice.name));
    }
    if (!preferredVoice && zhVoices.length > 0) {
      preferredVoice = zhVoices[0];
    }
    if (preferredVoice) utterance.voice = preferredVoice;

    const timeoutId = setTimeout(() => {
      window.speechSynthesis.cancel();
      reject(new Error('Speech synthesis timeout'));
    }, 15000);

    utterance.onend = () => {
      clearTimeout(timeoutId);
      resolve();
    };

    utterance.onerror = (event) => {
      clearTimeout(timeoutId);
      reject(new Error(event.error || 'Speech synthesis failed'));
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });

  // Network TTS with chunking + fallback policy.
  const playGoogleTranslateTTS = async (
    text,
    {
      speaker = null,
      fallbackToBrowser = true,
      fallbackToGemini = false,
    } = {}
  ) => {
    if (!text?.trim()) return;

    const chunks = text
      .split(/(?<=[。！？!?])/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .flatMap((chunk) => {
        if (chunk.length <= 110) return [chunk];
        const parts = [];
        let current = '';
        for (const token of chunk.split(/([，,；;])/)) {
          if ((current + token).length > 110 && current) {
            parts.push(current.trim());
            current = token;
          } else {
            current += token;
          }
        }
        if (current.trim()) parts.push(current.trim());
        return parts;
      });

    const playChunk = (chunk) => new Promise((resolve, reject) => {
      const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=zh-TW&q=${encodeURIComponent(chunk)}`;
      const audio = new Audio(url);
      const timeoutId = setTimeout(() => {
        audio.pause();
        reject(new Error('Google TTS request timeout'));
      }, 12000);

      audio.preload = 'auto';
      audio.onended = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      audio.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error('Google TTS audio playback failed'));
      };
      audio.play().catch(reject);
    });

    try {
      for (const chunk of chunks) {
        // eslint-disable-next-line no-await-in-loop
        await playChunk(chunk);
      }
    } catch (err) {
      if (fallbackToBrowser) {
        try {
          await playBrowserSpeechSynthesis(text, speaker);
          return;
        } catch {
          // Continue to next fallback.
        }
      }
      if (fallbackToGemini) {
        await playGeminiTTS(text);
        return;
      }
      throw err;
    }
  };

  // Plays one transcript turn and updates inline UI spinner state.
  const playConversationTurn = async (turn, index) => {
    if (!turn?.text) return;
    setPlayingTurnIndex(index);
    try {
      try {
        // Prefer browser speech here so different speakers can use different voices.
        await playBrowserSpeechSynthesis(turn.text, turn.speaker);
      } catch {
        await playGoogleTranslateTTS(turn.text, {
          speaker: turn.speaker,
          fallbackToBrowser: false,
          fallbackToGemini: !!effectiveKey,
        });
      }
    } finally {
      setPlayingTurnIndex(null);
    }
  };

  // Generates structured listening transcript + optional questions via JSON schema prompt.
  const startConversationGeneration = async () => {
    if (isOfflineMode) return;
    if (!effectiveKey) { setShowSettings(true); return; }
    setAppMode('conversation-loading');
    setConversationLoadingStatus('Generating conversation...');

    setConversationVisibleTurns(0);
    setConversationQuestionAnswers({});
    setConversationVisibleTranslations({});
    setRevealedConversationTurns({});

    let vocabContext = '';
    if (conversationConfig.useCurrentDeck) {
      const deckWords = [...new Set(cards.map(c => c.char).filter(Boolean))].join(',');
      const familiarityLevels = {
        1: 'natural usage',
        2: 'slight repetition',
        3: 'moderate repetition',
        4: 'high repetition',
        5: 'max repetition'
      };
      vocabContext = `vocab:[${deckWords}] familiarity:${conversationConfig.familiarity} (${familiarityLevels[conversationConfig.familiarity]})`;
    }

    const turnMap = {
      short: '6-8 turns',
      medium: '9-12 turns',
      long: '13-16 turns'
    };

    const minQuestionCount = conversationConfig.includeQuestions
      ? (conversationConfig.length === 'short' ? 3 : 5)
      : 0;

    const buildConversationPrompt = (strictQuestionCount = false) => `task: TOCFL Band ${conversationConfig.level} listening conversation in Traditional Chinese
  turns: ${turnMap[conversationConfig.length]}
  speakers: 2-3 with clear names
  ${conversationConfig.includeQuestions ? `questions: generate at least ${minQuestionCount} multiple-choice listening questions${strictQuestionCount ? `; fewer than ${minQuestionCount} questions is invalid` : ''}` : ''}
  ${vocabContext ? `${vocabContext}\n` : ''}output: json {title, speakers[], conversation[{speaker,text}]${conversationConfig.includeQuestions ? ', questions[{question,question_english,options[3],options_english[3],correct_answer,explanation}]' : ''}}`;

    try {
      let parsed = null;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0) {
          setConversationLoadingStatus(`Regenerating questions to reach ${minQuestionCount}...`);
        }

        const response = await callGemini(
          buildConversationPrompt(attempt > 0),
          conversationConfig.includeQuestions
            ? `You are a TOCFL listening-test writer. Return strict JSON only in the requested shape. If questions are requested, you must include at least ${minQuestionCount} questions.`
            : 'You are a TOCFL listening-test writer. Return strict JSON only in the requested shape.',
          effectiveKey,
          'application/json'
        );

        const cleaned = response.replace(/```json|```/g, '').trim();
        const candidate = JSON.parse(cleaned);

        if (!Array.isArray(candidate.conversation) || candidate.conversation.length === 0) {
          throw new Error('No conversation turns generated');
        }

        const generatedQuestions = Array.isArray(candidate.questions) ? candidate.questions : [];
        if (!conversationConfig.includeQuestions || generatedQuestions.length >= minQuestionCount) {
          parsed = candidate;
          break;
        }
      }

      if (!parsed) {
        throw new Error(`Generated fewer than ${minQuestionCount} questions`);
      }

      setConversationData({
        title: parsed.title || 'Listening Conversation',
        conversation: parsed.conversation,
        questions: parsed.questions || [],
        words: cards.map(c => c.char)
      });
      setAppMode('conversation-practice');
    } catch (e) {
      console.error('Conversation Generation Failed:', e);
      setConversationLoadingStatus(`Error: ${e.message}`);
      setTimeout(() => setAppMode('flashcards'), 2000);
    }
  };

  // Progressive transcript reveal timer for conversation playback UX.
  useEffect(() => {
    if (appMode !== 'conversation-practice') return;

    const turns = conversationData?.conversation || [];
    if (turns.length === 0) return;

    setConversationVisibleTurns(0);
    const id = setInterval(() => {
      setConversationVisibleTurns(prev => {
        if (prev >= turns.length) {
          clearInterval(id);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);

    return () => clearInterval(id);
  }, [appMode, conversationData]);

  // --- Helpers ---
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // --- Theme Helpers ---
  const themeClass = isDarkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900';
  const cardBg = isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const iconBtnClass = `p-2.5 rounded-xl transition-colors ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700' : 'bg-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-300'}`;
  const navBtnClass = `p-4 rounded-2xl transition-all ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-indigo-600 hover:text-white' : 'bg-slate-200 text-slate-600 hover:bg-indigo-600 hover:text-white'}`;

  // --- Components ---
  // Header is shared across all modes and acts as global mode switcher.
  const Header = () => (
    <header className="flex items-center justify-between w-full max-w-4xl mb-6 px-4">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <GraduationCap className="text-white" size={24} />
        </div>
        <span className="font-black text-xl tracking-tight hidden sm:block">TOCFL Prep</span>
      </div>

      <div className={`flex p-1 rounded-xl backdrop-blur-md ${isDarkMode ? 'bg-slate-800/50' : 'bg-slate-200/50'}`}>
        <button 
          onClick={() => setAppMode('flashcards')} 
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${appMode === 'flashcards' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-500'}`}
        >
          Flashcards
        </button>
        <button 
          onClick={() => setAppMode('paragraph-setup')} 
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${appMode.includes('paragraph') ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-500'}`}
        >
          Paragraph
        </button>
        <button 
          onClick={() => setAppMode('conversation-setup')} 
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${appMode.includes('conversation') ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-500'}`}
        >
          Conversation
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={toggleOfflineMode}
          className={`px-3 rounded-xl text-xs font-black tracking-wider transition-colors ${isOfflineMode ? 'bg-amber-500 text-white hover:bg-amber-400' : 'bg-emerald-500 text-white hover:bg-emerald-400'}`}
          title="Toggle offline mode"
        >
          {isOfflineMode ? 'OFFLINE' : 'ONLINE'}
        </button>
        {authToken && (
          <button onClick={() => { loadLibrary(); setShowLibrary(true); }} className={iconBtnClass} title="My Library">
            <Library size={20} />
          </button>
        )}
        <button onClick={() => setShowSettings(true)} className={`${iconBtnClass} ${!effectiveKey ? 'animate-pulse text-indigo-500 ring-2 ring-indigo-500' : ''}`}>
          <Settings size={20} />
        </button>
        <button onClick={() => fileInputRef.current.click()} className={iconBtnClass}>
          <Upload size={20} />
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv,.txt,.docx,.json" />
        {authToken && (
          <button onClick={handleLogout} className={iconBtnClass} title={`Logout (${authUser?.username})`}>
            <LogOut size={20} />
          </button>
        )}
      </div>
    </header>
  );

  // --- Auth Gate ---
  // Shown instead of the whole app when no valid JWT is present.
  if (!authToken) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 ${themeClass}`}>
        <div className="flex items-center gap-3 mb-10">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <GraduationCap className="text-white" size={28} />
          </div>
          <span className="font-black text-3xl tracking-tight">TOCFL Prep</span>
        </div>

        <div className={`w-full max-w-sm p-8 rounded-3xl shadow-2xl border ${cardBg}`}>
          <div className={`flex p-1 rounded-xl mb-6 ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
            {['login', 'register'].map(mode => (
              <button
                key={mode}
                onClick={() => { setAuthMode(mode); setAuthError(''); }}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all capitalize ${authMode === mode ? 'bg-indigo-600 text-white shadow' : 'text-slate-400'}`}
              >
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest opacity-60 mb-1 block">Username</label>
              <input
                value={authUsername}
                onChange={e => setAuthUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (authMode === 'login' ? handleLogin() : handleRegister())}
                placeholder="your_username"
                className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all focus:border-indigo-500 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest opacity-60 mb-1 block">Password</label>
              <input
                type="password"
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (authMode === 'login' ? handleLogin() : handleRegister())}
                placeholder="••••••••"
                className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all focus:border-indigo-500 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
              />
            </div>

            {authError && (
              <div className="text-red-500 text-sm font-bold text-center py-2 px-3 bg-red-500/10 rounded-xl">
                {authError}
              </div>
            )}

            <button
              onClick={authMode === 'login' ? handleLogin : handleRegister}
              disabled={authLoading || !authUsername.trim() || !authPassword.trim()}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-black transition-all flex items-center justify-center gap-2"
            >
              {authLoading ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </div>

          <button
            onClick={() => setIsDarkMode(p => !p)}
            className={`mt-6 w-full py-2 rounded-xl text-xs font-bold ${isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          </button>
        </div>
      </div>
    );
  }

  // --- Shared Modal Components ---
  // SavePromptModal: small name-entry dialog used by all three save flows.
  const SavePromptModal = ({ onSave }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-sm p-6 rounded-3xl shadow-2xl border ${cardBg}`}>
        <h3 className="font-black text-lg mb-4">Save to Cloud</h3>
        <input
          autoFocus
          value={saveName}
          onChange={e => setSaveName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSave()}
          placeholder="Enter a name..."
          className={`w-full px-4 py-3 rounded-xl border text-sm outline-none mb-4 focus:border-indigo-500 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
        />
        <div className="flex gap-3">
          <button onClick={() => { setShowSavePrompt(null); setSaveName(''); }} className={`flex-1 py-3 rounded-xl font-bold ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>Cancel</button>
          <button onClick={onSave} disabled={!saveName.trim()} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold">Save</button>
        </div>
      </div>
    </div>
  );

  // LibraryModal: browse and load saved decks, paragraphs, conversations.
  const LibraryModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className={`w-full max-w-lg h-[80vh] rounded-3xl flex flex-col overflow-hidden shadow-2xl border ${cardBg}`}>
        <div className={`p-5 border-b flex justify-between items-center ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          <h3 className="font-black text-lg flex items-center gap-2"><Library className="text-indigo-500" size={20}/> My Library</h3>
          <button onClick={() => setShowLibrary(false)} className="p-2 rounded-full hover:bg-slate-500/10"><X size={20}/></button>
        </div>

        <div className={`flex border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          {['decks', 'paragraphs', 'conversations'].map(tab => (
            <button
              key={tab}
              onClick={() => setLibraryTab(tab)}
              className={`flex-1 py-3 text-sm font-bold capitalize transition-colors ${libraryTab === tab ? 'text-indigo-500 border-b-2 border-indigo-500' : 'text-slate-400'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {libraryLoading && <div className="text-center py-8 text-slate-500">Loading...</div>}

          {libraryTab === 'decks' && !libraryLoading && (
            savedDecks.length === 0
              ? <p className="text-center py-8 text-slate-500 text-sm">No saved decks yet.</p>
              : savedDecks.map(deck => (
                <div key={deck.id} className={`p-4 rounded-2xl border flex items-center justify-between ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <div>
                    <div className="font-bold">{deck.name}</div>
                    <div className="text-xs text-slate-500">{deck.card_count} cards</div>
                    {deck.has_progress === 1 && (
                      <div className="text-xs text-indigo-500 font-bold flex items-center gap-1 mt-0.5">
                        <PlayCircle size={12} /> In-progress session saved
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => loadDeckFromLibrary(deck)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-all">
                      {deck.has_progress === 1 ? 'Resume' : 'Load'}
                    </button>
                    <button onClick={async () => { await callAPI(`/api/decks/${deck.id}`, 'DELETE'); loadLibrary(); }} className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl transition-all">
                      <X size={16}/>
                    </button>
                  </div>
                </div>
              ))
          )}

          {libraryTab === 'paragraphs' && !libraryLoading && (
            savedParagraphs.length === 0
              ? <p className="text-center py-8 text-slate-500 text-sm">No saved paragraphs yet.</p>
              : savedParagraphs.map(p => (
                <div key={p.id} className={`p-4 rounded-2xl border flex items-center justify-between ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <div>
                    <div className="font-bold">{p.name}</div>
                    <div className="text-xs text-slate-500">{new Date(p.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        const full = await callAPI(`/api/paragraphs/${p.id}`);
                        applyParagraphSnapshot({ paragraphConfig: JSON.parse(full.paragraph_config), paragraphData: JSON.parse(full.paragraph_data) });
                        setShowLibrary(false);
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold"
                    >Load</button>
                    <button onClick={async () => { await callAPI(`/api/paragraphs/${p.id}`, 'DELETE'); loadLibrary(); }} className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl">
                      <X size={16}/>
                    </button>
                  </div>
                </div>
              ))
          )}

          {libraryTab === 'conversations' && !libraryLoading && (
            savedConversations.length === 0
              ? <p className="text-center py-8 text-slate-500 text-sm">No saved conversations yet.</p>
              : savedConversations.map(c => (
                <div key={c.id} className={`p-4 rounded-2xl border flex items-center justify-between ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <div>
                    <div className="font-bold">{c.name}</div>
                    <div className="text-xs text-slate-500">{new Date(c.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        const full = await callAPI(`/api/conversations/${c.id}`);
                        applyConversationSnapshot({ conversationConfig: JSON.parse(full.conversation_config), conversationData: JSON.parse(full.conversation_data) });
                        setShowLibrary(false);
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold"
                    >Load</button>
                    <button onClick={async () => { await callAPI(`/api/conversations/${c.id}`, 'DELETE'); loadLibrary(); }} className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl">
                      <X size={16}/>
                    </button>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );

  // PendingResumePrompt: shown after loading a deck that has a saved in-progress session.
  const PendingResumePrompt = () => (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40">
      <div className={`w-full max-w-sm p-6 rounded-3xl shadow-2xl border ${cardBg}`}>
        <h3 className="font-black text-lg mb-2">Saved Progress Found</h3>
        <p className="text-slate-500 text-sm mb-6">
          You were on card {(pendingResume?.progress?.current_index ?? 0) + 1} with {pendingResume?.progress?.score ?? 0} pts. Resume where you left off?
        </p>
        <div className="flex gap-3">
          <button onClick={() => setPendingResume(null)} className={`flex-1 py-3 rounded-xl font-bold ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
            Start Fresh
          </button>
          <button onClick={() => applyResume(pendingResume.progress)} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold">
            Resume
          </button>
        </div>
      </div>
    </div>
  );

  // --- Views ---
  // Mode-specific UI is kept in sequential early returns for readability.
  if (appMode === 'paragraph-setup') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 ${themeClass}`}>
        <Header />
        <div className={`max-w-md w-full rounded-3xl p-8 shadow-2xl ${cardBg} border`}>
          <h2 className="text-2xl font-black mb-8 flex items-center gap-2">
            <BookOpen className="text-indigo-500" /> Paragraph Practice Setup
          </h2>
          
          {isOfflineMode ? (
            <div className="space-y-4">
              <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 text-amber-500 text-sm">
                Offline mode is active. Upload a saved paragraph file to practice without internet.
              </div>
              <button
                onClick={() => fileInputRef.current.click()}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black shadow-lg shadow-indigo-500/25 active:scale-95 transition-all"
              >
                Upload Saved Paragraph (.json)
              </button>
            </div>
          ) : (
          <div className="space-y-6">
            {/* Flashcard Upload */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest opacity-60 mb-2 block">Flashcard Set</label>
              <div className="space-y-3">
                <button 
                  onClick={() => fileInputRef.current.click()} 
                  className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-slate-400 hover:border-indigo-500 transition-colors flex items-center justify-center gap-2 text-slate-500 hover:text-indigo-500"
                >
                  <Upload size={20} />
                  Upload Flashcard Set / Saved Practice (.csv, .txt, .docx, .json)
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv,.txt,.docx,.json" />
                
                <div className={`p-3 rounded-xl text-sm ${cards.length > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800/50 text-slate-400'}`}>
                  {cards.length > 0 ? `${cards.length} flashcards loaded` : 'No flashcards loaded - will use default set'}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-widest opacity-60 mb-2 block">TOCFL Band Level</label>
              <div className="grid grid-cols-3 gap-3">
                {['A', 'B', 'C'].map(l => (
                  <button key={l} onClick={() => setParagraphConfig(c => ({...c, level: l}))}
                    className={`py-3 rounded-xl font-bold border-2 transition-all ${paragraphConfig.level === l ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500' : 'border-transparent bg-slate-800 text-slate-500'}`}>
                    Band {l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-widest opacity-60 mb-2 block">Paragraph Length</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'short', label: 'Short', desc: '50-80 words' },
                  { key: 'medium', label: 'Medium', desc: '80-120 words' },
                  { key: 'long', label: 'Long', desc: '120-160 words' }
                ].map(({ key, label, desc }) => (
                  <button key={key} onClick={() => setParagraphConfig(c => ({...c, length: key}))}
                    className={`py-3 rounded-xl font-bold border-2 transition-all text-center ${paragraphConfig.length === key ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : 'border-transparent bg-slate-800 text-slate-500'}`}>
                    <div>{label}</div>
                    <div className="text-xs opacity-60">{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Use Current Deck Toggle */}
            <div 
              onClick={() => setParagraphConfig(c => ({...c, useCurrentDeck: !c.useCurrentDeck}))}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between group ${paragraphConfig.useCurrentDeck ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 bg-slate-800/50'}`}
            >
              <div className="flex items-center gap-3">
                <BookOpen size={20} className={paragraphConfig.useCurrentDeck ? 'text-indigo-500' : 'text-slate-500'} />
                <div>
                  <div className={`font-bold text-sm ${paragraphConfig.useCurrentDeck ? 'text-indigo-500' : 'text-slate-400'}`}>Use Flashcard Vocabulary</div>
                  <div className="text-xs opacity-60">Incorporate words from your flashcard set</div>
                </div>
              </div>
              <div className={`w-6 h-6 rounded-md flex items-center justify-center border transition-colors ${paragraphConfig.useCurrentDeck ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'}`}>
                {paragraphConfig.useCurrentDeck && <CheckSquare size={16} className="text-white" />}
              </div>
            </div>

            {/* Vocabulary Familiarity Slider - Only show when using current deck and enough flashcards */}
            {paragraphConfig.useCurrentDeck && (() => {
              const minFlashcards = { short: 50, medium: 80, long: 120 }[paragraphConfig.length];
              const hasEnoughFlashcards = cards.length >= minFlashcards;
              
              return hasEnoughFlashcards ? (
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest opacity-60 mb-2 block">Vocabulary Familiarity</label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Normal</span>
                      <span className="text-slate-400">Very Familiar</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={paragraphConfig.familiarity}
                      onChange={(e) => setParagraphConfig(c => ({...c, familiarity: parseInt(e.target.value)}))}
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${(paragraphConfig.familiarity - 1) * 25}%, #374151 ${(paragraphConfig.familiarity - 1) * 25}%, #374151 100%)`
                      }}
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>1</span>
                      <span>2</span>
                      <span>3</span>
                      <span>4</span>
                      <span>5</span>
                    </div>
                    <div className="text-center text-sm text-slate-400">
                      {paragraphConfig.familiarity === 1 && "Balanced vocabulary usage"}
                      {paragraphConfig.familiarity === 2 && "Slightly more familiar words"}
                      {paragraphConfig.familiarity === 3 && "Moderately familiar vocabulary"}
                      {paragraphConfig.familiarity === 4 && "Highly familiar words"}
                      {paragraphConfig.familiarity === 5 && "Maximum vocabulary repetition"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-orange-500/10 p-4 rounded-xl border border-orange-500/20 text-orange-500 text-sm">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} />
                    <span className="font-medium">Need {minFlashcards - cards.length} more flashcards</span>
                  </div>
                  <p className="mt-1">Add more flashcards to unlock vocabulary familiarity controls for {paragraphConfig.length} paragraphs.</p>
                </div>
              );
            })()}

            {/* Include Questions Toggle */}
            <div 
              onClick={() => setParagraphConfig(c => ({...c, includeQuestions: !c.includeQuestions}))}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between group ${paragraphConfig.includeQuestions ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-800/50'}`}
            >
              <div className="flex items-center gap-3">
                <CheckSquare size={20} className={paragraphConfig.includeQuestions ? 'text-emerald-500' : 'text-slate-500'} />
                <div>
                  <div className={`font-bold text-sm ${paragraphConfig.includeQuestions ? 'text-emerald-500' : 'text-slate-400'}`}>Include Comprehension Questions</div>
                  <div className="text-xs opacity-60">Generate 3-5 questions to test understanding</div>
                </div>
              </div>
              <div className={`w-6 h-6 rounded-md flex items-center justify-center border transition-colors ${paragraphConfig.includeQuestions ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}>
                {paragraphConfig.includeQuestions && <CheckSquare size={16} className="text-white" />}
              </div>
            </div>

            <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 text-amber-500 text-sm flex gap-3">
              <AlertCircle className="shrink-0" />
              <p>Generates a custom paragraph using AI based on your settings. {paragraphConfig.includeQuestions ? 'Includes 3-5 comprehension questions. ' : ''}Takes ~10-15 seconds.</p>
            </div>

            <button onClick={startParagraphGeneration} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black shadow-lg shadow-indigo-500/25 active:scale-95 transition-all">
              Generate Paragraph
            </button>
          </div>
          )}
        </div>
        {showSettings && <SettingsModal />}
        {showLibrary && <LibraryModal />}
      </div>
    );
  }

  if (appMode === 'paragraph-loading') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-8 ${themeClass}`}>
        <div className="relative mb-8">
          <Loader2 size={80} className="animate-spin text-indigo-500" />
          <Sparkles className="absolute top-0 right-0 text-amber-400 animate-pulse" />
        </div>
        <h3 className="text-3xl font-black mb-4">Generating Paragraph</h3>
        <p className="text-slate-500 font-medium animate-pulse">{paragraphLoadingStatus}</p>
      </div>
    );
  }

  if (appMode === 'conversation-setup') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 ${themeClass}`}>
        <Header />
        <div className={`max-w-md w-full rounded-3xl p-8 shadow-2xl ${cardBg} border`}>
          <h2 className="text-2xl font-black mb-8 flex items-center gap-2">
            <MessageCircle className="text-indigo-500" /> Conversation Practice Setup
          </h2>

          {isOfflineMode ? (
            <div className="space-y-4">
              <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 text-amber-500 text-sm">
                Offline mode is active. Upload a saved conversation file to practice without internet.
              </div>
              <button
                onClick={() => fileInputRef.current.click()}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black shadow-lg shadow-indigo-500/25 active:scale-95 transition-all"
              >
                Upload Saved Conversation (.json)
              </button>
            </div>
          ) : (
          <div className="space-y-6">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest opacity-60 mb-2 block">Flashcard Set</label>
              <div className="space-y-3">
                <button
                  onClick={() => fileInputRef.current.click()}
                  className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-slate-400 hover:border-indigo-500 transition-colors flex items-center justify-center gap-2 text-slate-500 hover:text-indigo-500"
                >
                  <Upload size={20} />
                  Upload Flashcard Set / Saved Practice (.csv, .txt, .docx, .json)
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv,.txt,.docx,.json" />

                <div className={`p-3 rounded-xl text-sm ${cards.length > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800/50 text-slate-400'}`}>
                  {cards.length > 0 ? `${cards.length} flashcards loaded` : 'No flashcards loaded - will use default set'}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-widest opacity-60 mb-2 block">TOCFL Band Level</label>
              <div className="grid grid-cols-3 gap-3">
                {['A', 'B', 'C'].map(l => (
                  <button key={l} onClick={() => setConversationConfig(c => ({...c, level: l}))}
                    className={`py-3 rounded-xl font-bold border-2 transition-all ${conversationConfig.level === l ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500' : 'border-transparent bg-slate-800 text-slate-500'}`}>
                    Band {l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-widest opacity-60 mb-2 block">Conversation Length</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'short', label: 'Short', desc: '6-8 turns' },
                  { key: 'medium', label: 'Medium', desc: '9-12 turns' },
                  { key: 'long', label: 'Long', desc: '13-16 turns' }
                ].map(({ key, label, desc }) => (
                  <button key={key} onClick={() => setConversationConfig(c => ({...c, length: key}))}
                    className={`py-3 rounded-xl font-bold border-2 transition-all text-center ${conversationConfig.length === key ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : 'border-transparent bg-slate-800 text-slate-500'}`}>
                    <div>{label}</div>
                    <div className="text-xs opacity-60">{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div
              onClick={() => setConversationConfig(c => ({...c, useCurrentDeck: !c.useCurrentDeck}))}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between group ${conversationConfig.useCurrentDeck ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 bg-slate-800/50'}`}
            >
              <div className="flex items-center gap-3">
                <BookOpen size={20} className={conversationConfig.useCurrentDeck ? 'text-indigo-500' : 'text-slate-500'} />
                <div>
                  <div className={`font-bold text-sm ${conversationConfig.useCurrentDeck ? 'text-indigo-500' : 'text-slate-400'}`}>Use Flashcard Vocabulary</div>
                  <div className="text-xs opacity-60">Incorporate words from your flashcard set</div>
                </div>
              </div>
              <div className={`w-6 h-6 rounded-md flex items-center justify-center border transition-colors ${conversationConfig.useCurrentDeck ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'}`}>
                {conversationConfig.useCurrentDeck && <CheckSquare size={16} className="text-white" />}
              </div>
            </div>

            {conversationConfig.useCurrentDeck && (() => {
              const minFlashcards = { short: 50, medium: 80, long: 120 }[conversationConfig.length];
              const hasEnoughFlashcards = cards.length >= minFlashcards;

              return hasEnoughFlashcards ? (
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest opacity-60 mb-2 block">Vocabulary Familiarity</label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Normal</span>
                      <span className="text-slate-400">Very Familiar</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={conversationConfig.familiarity}
                      onChange={(e) => setConversationConfig(c => ({...c, familiarity: parseInt(e.target.value)}))}
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${(conversationConfig.familiarity - 1) * 25}%, #374151 ${(conversationConfig.familiarity - 1) * 25}%, #374151 100%)`
                      }}
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>1</span>
                      <span>2</span>
                      <span>3</span>
                      <span>4</span>
                      <span>5</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-orange-500/10 p-4 rounded-xl border border-orange-500/20 text-orange-500 text-sm">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} />
                    <span className="font-medium">Need {minFlashcards - cards.length} more flashcards</span>
                  </div>
                  <p className="mt-1">Add more flashcards to unlock vocabulary familiarity controls for {conversationConfig.length} conversations.</p>
                </div>
              );
            })()}

            <div
              onClick={() => setConversationConfig(c => ({...c, includeQuestions: !c.includeQuestions}))}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between group ${conversationConfig.includeQuestions ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-800/50'}`}
            >
              <div className="flex items-center gap-3">
                <CheckSquare size={20} className={conversationConfig.includeQuestions ? 'text-emerald-500' : 'text-slate-500'} />
                <div>
                  <div className={`font-bold text-sm ${conversationConfig.includeQuestions ? 'text-emerald-500' : 'text-slate-400'}`}>Include Listening Questions</div>
                  <div className="text-xs opacity-60">Generate 3-5 questions after the conversation</div>
                </div>
              </div>
              <div className={`w-6 h-6 rounded-md flex items-center justify-center border transition-colors ${conversationConfig.includeQuestions ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}>
                {conversationConfig.includeQuestions && <CheckSquare size={16} className="text-white" />}
              </div>
            </div>

            <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 text-amber-500 text-sm flex gap-3">
              <AlertCircle className="shrink-0" />
              <p>Generates a listening conversation transcript with speakers and optional questions. Playback uses browser audio.</p>
            </div>

            <button onClick={startConversationGeneration} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black shadow-lg shadow-indigo-500/25 active:scale-95 transition-all">
              Generate Conversation
            </button>
          </div>
          )}
        </div>
        {showSettings && <SettingsModal />}
        {showLibrary && <LibraryModal />}
      </div>
    );
  }

  if (appMode === 'conversation-loading') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-8 ${themeClass}`}>
        <div className="relative mb-8">
          <Loader2 size={80} className="animate-spin text-indigo-500" />
          <Sparkles className="absolute top-0 right-0 text-amber-400 animate-pulse" />
        </div>
        <h3 className="text-3xl font-black mb-4">Generating Conversation</h3>
        <p className="text-slate-500 font-medium animate-pulse">{conversationLoadingStatus}</p>
      </div>
    );
  }

  if (appMode === 'conversation-practice') {
    const visibleTurns = conversationData.conversation.slice(0, conversationVisibleTurns);
    const conversationComplete = conversationVisibleTurns >= conversationData.conversation.length;
    const speakerOrder = [...new Set(conversationData.conversation.map(t => t.speaker))];

    return (
      <div className={`min-h-screen flex flex-col items-center p-4 transition-colors duration-300 font-sans ${themeClass} ${isDarkMode ? 'dark' : ''}`}>
        <Header />

        <main className="w-full max-w-4xl flex-1 flex flex-col justify-center">
          <div className="w-full max-w-4xl flex flex-col gap-6 mb-4">
            <div className={`p-8 rounded-[2.5rem] shadow-2xl relative flex flex-col gap-6 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} border`}>
              <div className="text-center">
                <h2 className="text-2xl font-black text-indigo-600 mb-2">Listening Conversation</h2>
                <p className="text-sm text-slate-500">
                  TOCFL Band {conversationConfig.level} • {conversationConfig.length} conversation
                </p>
                <p className="text-sm mt-2 font-semibold">{conversationData.title}</p>
              </div>

              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
                {visibleTurns.map((turn, index) => {
                  const speakerIdx = speakerOrder.indexOf(turn.speaker);
                  const isLeft = speakerIdx % 2 === 0;
                  const isPlaying = playingTurnIndex === index;

                  return (
                    <div key={`${turn.speaker}-${index}`} className={`flex ${isLeft ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] rounded-2xl p-4 border ${isLeft
                        ? isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                        : 'bg-indigo-600 text-white border-indigo-500'}`}>
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span className={`text-xs font-bold uppercase tracking-wider ${isLeft ? 'text-indigo-500' : 'text-white/80'}`}>
                            {turn.speaker}
                          </span>
                          <button
                            onClick={() => playConversationTurn(turn, index)}
                            className={`p-1.5 rounded-lg ${isLeft ? isDarkMode ? 'bg-slate-700 text-slate-300 hover:text-white' : 'bg-white text-slate-600 hover:text-indigo-600' : 'bg-white/15 text-white hover:bg-white/25'}`}
                            title="Play dialogue"
                          >
                            {isPlaying ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}
                          </button>
                        </div>
                        <div className="mt-1">
                          <button
                            onClick={() => setRevealedConversationTurns(prev => ({ ...prev, [index]: !prev[index] }))}
                            className={`text-xs px-2 py-0.5 rounded-lg border transition-colors ${isLeft
                              ? isDarkMode ? 'bg-slate-700 border-slate-600 text-slate-300 hover:text-white' : 'bg-white border-slate-300 text-slate-500 hover:text-indigo-600'
                              : 'bg-white/15 border-white/30 text-white/80 hover:bg-white/25'}`}
                          >
                            {revealedConversationTurns[index] ? 'Hide' : 'Show text'}
                          </button>
                          {revealedConversationTurns[index] && (
                            <p className="text-base leading-relaxed mt-2">{turn.text}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!conversationComplete && (
                  <div className="text-center text-sm text-slate-500 italic animate-pulse">Playing transcript...</div>
                )}
              </div>

              {conversationComplete && conversationData.conversation.length > 0 && (
                <div className="flex justify-center">
                  <button
                    onClick={async () => {
                      for (let i = 0; i < conversationData.conversation.length; i += 1) {
                        // eslint-disable-next-line no-await-in-loop
                        await playConversationTurn(conversationData.conversation[i], i);
                      }
                    }}
                    className="px-6 py-3 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-500 transition-all flex items-center gap-2"
                  >
                    <Volume2 size={18} /> Play Full Conversation
                  </button>
                </div>
              )}
            </div>

            {conversationComplete && conversationData?.questions && conversationData.questions.length > 0 && (
              <div className="w-full max-w-4xl mt-2">
                <div className={`p-6 rounded-[2.5rem] shadow-2xl ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} border`}>
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-black text-indigo-600 mb-2">Listening Questions</h3>
                    <p className="text-sm text-slate-500">Answer after listening to the full conversation</p>
                  </div>

                  <div className="space-y-6">
                    {conversationData.questions.map((question, qIndex) => {
                      const userAnswer = conversationQuestionAnswers[qIndex];
                      const hasAnswered = userAnswer !== undefined;
                        const correctIdx = (question.options || []).findIndex(opt => opt === question.correct_answer);
                        const normalizedCorrect = correctIdx >= 0
                          ? String.fromCharCode(65 + correctIdx)
                          : (question.correct_answer || '').trim().toUpperCase().charAt(0);
                        const isCorrect = hasAnswered && userAnswer === normalizedCorrect;
                      const translationVisible = !!conversationVisibleTranslations[qIndex];

                      return (
                        <div key={qIndex} className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="font-bold text-indigo-600">{qIndex + 1}. {question.question}</div>
                            <button
                              onClick={() => setConversationVisibleTranslations(prev => ({ ...prev, [qIndex]: !prev[qIndex] }))}
                              className={`p-2 rounded-lg border transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white' : 'bg-white border-slate-300 text-slate-600 hover:text-indigo-600'}`}
                              title={translationVisible ? 'Hide translations' : 'Show translations'}
                            >
                              {translationVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                          {translationVisible && question.question_english && (
                            <div className="text-sm text-slate-500 mb-3 italic">{question.question_english}</div>
                          )}

                          <div className="space-y-2">
                            {question.options.map((option, oIndex) => {
                              const optionLetter = String.fromCharCode(65 + oIndex);
                              const isSelected = userAnswer === optionLetter;
                              const isCorrectOption = optionLetter === normalizedCorrect;
                              const showCorrectness = hasAnswered;

                              let optionClass = isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
                              if (showCorrectness) {
                                if (isCorrectOption) optionClass = 'bg-emerald-500/20 border-emerald-500';
                                else if (isSelected && !isCorrectOption) optionClass = 'bg-red-500/20 border-red-500';
                              } else {
                                optionClass += ' hover:bg-indigo-600 hover:text-white hover:border-indigo-600';
                              }

                              return (
                                <div key={oIndex} className="space-y-1">
                                  <button
                                    onClick={() => {
                                      if (!hasAnswered) {
                                        setConversationQuestionAnswers(prev => ({...prev, [qIndex]: optionLetter}));
                                      }
                                    }}
                                    disabled={hasAnswered}
                                    className={`w-full p-3 text-left rounded-xl transition-all font-bold border group flex justify-between items-center ${optionClass}`}
                                  >
                                    <span>{option}</span>
                                    {showCorrectness && isCorrectOption && <CheckCircle2 className="text-emerald-500" />}
                                    {showCorrectness && isSelected && !isCorrectOption && <XCircle className="text-red-500" />}
                                  </button>
                                  {translationVisible && question.options_english && question.options_english[oIndex] && (
                                    <div className="text-sm text-slate-500 ml-3 italic">{question.options_english[oIndex]}</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {hasAnswered && question.explanation && (
                            <div className="mt-4 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                              <div className="font-bold text-indigo-600 text-sm mb-1">Explanation:</div>
                              <div className="text-sm text-slate-600">{question.explanation}</div>
                              <div className={`mt-2 text-sm font-bold ${isCorrect ? 'text-emerald-600' : 'text-red-600'}`}>
                                {isCorrect ? '✓ Correct!' : `✗ Incorrect. The correct answer is ${normalizedCorrect}.`}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-4 justify-center flex-wrap">
              <button
                onClick={downloadConversationSnapshot}
                className="px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-lg shadow-blue-500/25 active:scale-95 flex items-center gap-2"
              >
                <Download size={18} />
                Save Offline
              </button>
              {authToken && (
                <button
                  onClick={() => { setShowSavePrompt('conversation'); setSaveName(''); }}
                  className="px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-lg shadow-emerald-500/25 active:scale-95 flex items-center gap-2"
                >
                  <Save size={18} />
                  Save to Cloud
                </button>
              )}

              <button
                onClick={() => setAppMode('conversation-setup')}
                className="px-8 py-4 rounded-xl bg-slate-600 hover:bg-slate-500 text-white font-bold transition-all shadow-lg shadow-slate-500/20 active:scale-95"
              >
                New Conversation
              </button>

              <button
                onClick={() => setAppMode('flashcards')}
                className="px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-lg shadow-indigo-500/25 active:scale-95"
              >
                Back to Flashcards
              </button>
            </div>
          </div>
        </main>
        {showSettings && <SettingsModal />}
        {showLibrary && <LibraryModal />}
        {showSavePrompt === 'conversation' && <SavePromptModal onSave={saveConversationToCloud} />}
      </div>
    );
  }

  if (appMode === 'paragraph-practice') {
    return (
      <div className={`min-h-screen flex flex-col items-center p-4 transition-colors duration-300 font-sans ${themeClass} ${isDarkMode ? 'dark' : ''}`}>
        <Header />

        <main className="w-full max-w-4xl flex-1 flex flex-col justify-center">
            {/* Content Container */}
            <div className="w-full max-w-4xl flex flex-col gap-6 mb-4">
                
                {/* Paragraph Display */}
                <div className={`p-8 rounded-[2.5rem] shadow-2xl relative flex flex-col gap-6 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} border`}>
                  
                  {/* Title */}
                  <div className="text-center">
                    <h2 className="text-2xl font-black text-indigo-600 mb-2">Reading Practice</h2>
                    <p className="text-sm text-slate-500">
                      TOCFL Band {paragraphConfig.level} • {paragraphConfig.length} paragraph
                      {paragraphConfig.useCurrentDeck && ` • Familiarity: ${paragraphConfig.familiarity}/5`}
                    </p>
                  </div>

                  {/* Chinese Text */}
                  <div className="text-center">
                    <div 
                      className="text-xl leading-relaxed mb-4"
                      dangerouslySetInnerHTML={{ 
                        __html: highlightedParagraphHtml
                      }}
                    />
                  </div>

                  {/* Control Buttons */}
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <button 
                      onClick={() => setShowPinyin(!showPinyin)}
                      className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                        showPinyin 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                      }`}
                    >
                      <Volume2 size={20} />
                      {showPinyin ? 'Hide Pinyin' : 'Show Pinyin'}
                    </button>

                    <button 
                      onClick={() => setShowEnglish(!showEnglish)}
                      className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                        showEnglish 
                          ? 'bg-green-600 text-white' 
                          : 'bg-green-100 text-green-600 hover:bg-green-200'
                      }`}
                    >
                      <Eye size={20} />
                      {showEnglish ? 'Hide Translation' : 'Show Translation'}
                    </button>

                    <button 
                      onClick={() => setHighlightWords(!highlightWords)}
                      className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                        highlightWords 
                          ? 'bg-yellow-500 text-white' 
                          : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                      }`}
                    >
                      <Star size={20} />
                      {highlightWords ? 'Hide Vocabulary' : 'Highlight Vocabulary'}
                    </button>

                    <button
                      onClick={downloadParagraphSnapshot}
                      className="px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 bg-indigo-600 text-white hover:bg-indigo-500"
                    >
                      <Download size={20} />
                      Save Offline
                    </button>
                    {authToken && (
                      <button
                        onClick={() => { setShowSavePrompt('paragraph'); setSaveName(''); }}
                        className="px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
                      >
                        <Save size={20} />
                        Save to Cloud
                      </button>
                    )}
                  </div>

                  {/* Pinyin Display */}
                  {showPinyin && (
                    <div className="animate-in fade-in slide-in-from-bottom-4">
                      <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                        <span className="font-bold text-blue-500 block mb-1">Pinyin:</span>
                        <div className="text-lg leading-relaxed italic">{paragraphData?.pinyin || "Loading..."}</div>
                      </div>
                    </div>
                  )}

                  {/* English Translation Display */}
                  {showEnglish && (
                    <div className="animate-in fade-in slide-in-from-bottom-4">
                      <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                        <span className="font-bold text-green-500 block mb-1">English Translation:</span>
                        <div className="text-lg leading-relaxed">{paragraphData?.english || "Loading..."}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Comprehension Questions */}
                {paragraphData?.questions && paragraphData.questions.length > 0 && (
                  <div className="w-full max-w-4xl mt-6">
                    <div className={`p-6 rounded-[2.5rem] shadow-2xl ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} border`}>
                      <div className="text-center mb-6">
                        <h3 className="text-xl font-black text-indigo-600 mb-2">Comprehension Questions</h3>
                        <p className="text-sm text-slate-500">Test your understanding of the paragraph</p>
                      </div>

                      <div className="space-y-6">
                        {paragraphData.questions.map((question, qIndex) => {
                          const userAnswer = questionAnswers[qIndex];
                          const hasAnswered = userAnswer !== undefined;
                            const correctIdx = (question.options || []).findIndex(opt => opt === question.correct_answer);
                            const normalizedCorrect = correctIdx >= 0
                              ? String.fromCharCode(65 + correctIdx)
                              : (question.correct_answer || '').trim().toUpperCase().charAt(0);
                            const isCorrect = hasAnswered && userAnswer === normalizedCorrect;
                          const translationVisible = !!visibleTranslations[qIndex];
                          
                          return (
                            <div key={qIndex} className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="font-bold text-indigo-600">{qIndex + 1}. {question.question}</div>
                                <button
                                  onClick={() => setVisibleTranslations(prev => ({ ...prev, [qIndex]: !prev[qIndex] }))}
                                  className={`p-2 rounded-lg border transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white' : 'bg-white border-slate-300 text-slate-600 hover:text-indigo-600'}`}
                                  title={translationVisible ? 'Hide translations' : 'Show translations'}
                                >
                                  {translationVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                              </div>
                              {translationVisible && question.question_english && (
                                <div className="text-sm text-slate-500 mb-3 italic">{question.question_english}</div>
                              )}
                              <div className="space-y-2">
                                {question.options.map((option, oIndex) => {
                                  const optionLetter = String.fromCharCode(65 + oIndex); // A, B, C, D
                                  const isSelected = userAnswer === optionLetter;
                                  const isCorrectOption = optionLetter === normalizedCorrect;
                                  const showCorrectness = hasAnswered;
                                  
                                  let optionClass = isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
                                  
                                  if (showCorrectness) {
                                    if (isCorrectOption) {
                                      optionClass = 'bg-emerald-500/20 border-emerald-500';
                                    } else if (isSelected && !isCorrectOption) {
                                      optionClass = 'bg-red-500/20 border-red-500';
                                    }
                                  } else {
                                    optionClass += ' hover:bg-indigo-600 hover:text-white hover:border-indigo-600';
                                  }

                                  return (
                                    <div key={oIndex} className="space-y-1">
                                      <button
                                        onClick={() => {
                                          if (!hasAnswered) {
                                            setQuestionAnswers(prev => ({...prev, [qIndex]: optionLetter}));
                                          }
                                        }}
                                        disabled={hasAnswered}
                                        className={`w-full p-3 text-left rounded-xl transition-all font-bold border group flex justify-between items-center ${optionClass}`}
                                      >
                                        <span>{option}</span>
                                        {showCorrectness && isCorrectOption && <CheckCircle2 className="text-emerald-500" />}
                                        {showCorrectness && isSelected && !isCorrectOption && <XCircle className="text-red-500" />}
                                      </button>
                                      {translationVisible && question.options_english && question.options_english[oIndex] && (
                                        <div className="text-sm text-slate-500 ml-3 italic">{question.options_english[oIndex]}</div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {hasAnswered && question.explanation && (
                                <div className="mt-4 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                                  <div className="font-bold text-indigo-600 text-sm mb-1">Explanation:</div>
                                  <div className="text-sm text-slate-600">{question.explanation}</div>
                                  <div className={`mt-2 text-sm font-bold ${isCorrect ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {isCorrect ? '✓ Correct!' : `✗ Incorrect. The correct answer is ${normalizedCorrect}.`}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-4 justify-center">
                  <button 
                    onClick={() => setAppMode('paragraph-setup')}
                    className="px-8 py-4 rounded-xl bg-slate-600 hover:bg-slate-500 text-white font-bold transition-all shadow-lg shadow-slate-500/20 active:scale-95"
                  >
                    New Paragraph
                  </button>
                  
                  <button 
                    onClick={() => setAppMode('flashcards')}
                    className="px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-lg shadow-indigo-500/25 active:scale-95"
                  >
                    Back to Flashcards
                  </button>
                </div>
            </div>
        </main>
        {showSettings && <SettingsModal />}
        {showLibrary && <LibraryModal />}
        {showSavePrompt === 'paragraph' && <SavePromptModal onSave={saveParagraphToCloud} />}
      </div>
    );
  }



  if (isFinished) {
    const { stars, reviewCards } = sessionSummary;

    // Emoji Logic
    const Emoji = stars >= 4 ? Smile : stars >= 2 ? Meh : Frown;
    const emojiColor = stars >= 4 ? 'text-emerald-500' : stars >= 2 ? 'text-yellow-500' : 'text-slate-400';

    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden ${themeClass}`}>
        {stars > 3 && <Confetti />}
        
        <div className={`max-w-md w-full p-8 rounded-[2.5rem] shadow-2xl text-center relative z-10 max-h-[90vh] flex flex-col ${cardBg}`}>
          
          <div className={`mx-auto mb-4 w-20 h-20 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'} ${emojiColor}`}>
            <Emoji size={48} />
          </div>

          <div className="flex justify-center gap-2 mb-4">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={28} fill={i < stars ? "#fbbf24" : "none"} className={i < stars ? "text-amber-400" : "text-slate-300 dark:text-slate-700"} />
            ))}
          </div>

          <h2 className="text-3xl font-black mb-1">Session Complete!</h2>
          <p className="text-xl font-bold text-slate-500 mb-6">{score} pts</p>

          {/* Time Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6 w-full">
            <div className={`p-4 rounded-2xl ${isDarkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
               <div className="text-xs text-slate-500 uppercase font-bold flex items-center justify-center gap-1 mb-1"><Clock size={12}/> Total Time</div>
               <div className="text-xl font-black">{formatTime(sessionDuration)}</div>
            </div>
            <div className={`p-4 rounded-2xl ${isDarkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
               <div className="text-xs text-slate-500 uppercase font-bold mb-1">Avg / Card</div>
               <div className="text-xl font-black">{(sessionDuration / cards.length).toFixed(1)}s</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto mb-6 pr-2 -mr-2 text-left space-y-3">
             {reviewCards.length > 0 && <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Review Deck</h3>}
             {reviewCards.map((card, idx) => (
               <div key={idx} className={`p-4 rounded-2xl flex items-center justify-between group ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900'}`}>
                 <div className="flex items-center gap-3">
                   {/* Badge */}
                   {card.status === 'missed' ? 
                       <div className="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-500"><AlertTriangle size={16} /></div> : 
                       <div className="p-1.5 rounded-lg bg-red-500/10 text-red-500"><XCircle size={16} /></div>
                   }
                   <span className="text-2xl font-black">{card.char}</span>
                 </div>
                 
                 <div className="flex items-center gap-3">
                   {revealedReviewItems[card.id] ? (
                      <div className="text-right">
                        <div className="text-xs font-bold text-indigo-500">{card.pinyin}</div>
                        <div className={`text-xs max-w-[100px] truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{card.meaning}</div>
                      </div>
                   ) : (
                      <span className="text-xs text-slate-400 italic">Hidden</span>
                   )}
                   <button 
                     onClick={() => copyToClipboard(card.char)}
                     className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-200 text-slate-500 hover:text-indigo-600'}`}
                   >
                     <Copy size={16}/>
                   </button>
                   <button 
                     onClick={() => setRevealedReviewItems(p => ({...p, [card.id]: !p[card.id]}))}
                     className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-200 text-slate-500 hover:text-indigo-600'}`}
                   >
                     {revealedReviewItems[card.id] ? <EyeOff size={16}/> : <Eye size={16}/>}
                   </button>
                 </div>
               </div>
             ))}
             {reviewCards.length === 0 && (
               <div className="p-8 text-center text-slate-500 italic">Perfect run! No mistakes to review.</div>
             )}
          </div>

          <div className="space-y-3 shrink-0">
            {reviewCards.length > 0 && (
              <button 
                onClick={() => resetSession(reviewCards)}
                className="w-full py-4 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20"
              >
                Start Review Deck ({reviewCards.length})
              </button>
            )}
            <button 
                onClick={() => resetSession()} 
                className={`w-full py-4 rounded-xl font-bold transition-all ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-600'}`}
            >
              Restart Full Deck
            </button>
          </div>
        </div>
        {showSettings && <SettingsModal />}
        {showLibrary && <LibraryModal />}
        {showSavePrompt === 'deck' && <SavePromptModal onSave={saveDeckToCloud} />}
      </div>
    );
  }

  // --- Settings Modal Component ---
  // Includes API key management + lightweight connection validation.
  const SettingsModal = () => {
    const [testStatus, setTestStatus] = useState(null);

    const testConnection = async () => {
      setTestStatus('loading');
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${effectiveKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] })
        });
        if (res.ok) {
          setTestStatus('success');
        } else {
          const err = await res.json();
          setTestStatus(`error: ${err.error?.message || res.statusText}`);
        }
      } catch (e) {
        setTestStatus(`error: ${e.message}`);
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
        <div className={`w-full max-w-md p-6 rounded-3xl shadow-2xl border ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-black flex items-center gap-2">
              <Settings className="text-indigo-500" /> Settings
            </h3>
            <button onClick={() => setShowSettings(false)} className="p-2 rounded-full hover:bg-slate-500/10">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSoundEnabled((prev) => !prev)}
                className={`p-3 rounded-xl border transition-colors flex items-center justify-center gap-2 font-bold text-sm ${
                  soundEnabled
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                    : isDarkMode
                      ? 'bg-slate-950 border-slate-700 text-slate-300 hover:text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
                title="Toggle sound effects"
              >
                {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} className="text-red-400" />}
                {soundEnabled ? 'Sound On' : 'Sound Off'}
              </button>

              <button
                onClick={() => setIsDarkMode((prev) => !prev)}
                className={`p-3 rounded-xl border transition-colors flex items-center justify-center gap-2 font-bold text-sm ${
                  isDarkMode
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-600'
                }`}
                title="Toggle app theme"
              >
                {isDarkMode ? <Moon size={16} /> : <Sun size={16} className="text-amber-500" />}
                {isDarkMode ? 'Dark Mode' : 'Light Mode'}
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest opacity-60 mb-2">Gemini API Key</label>
              <div className={`flex items-center gap-2 p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <Key size={16} className="opacity-50" />
                <input 
                  type="password"
                  value={customKey}
                  onChange={(e) => handleKeySave(e.target.value)}
                  placeholder="Paste key here..."
                  className="bg-transparent outline-none flex-1 text-sm font-mono"
                />
              </div>
              <p className="text-xs opacity-50 mt-2">
                Get a free key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline">Google AI Studio</a>.
              </p>
            </div>

            {!isOfflineMode && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
               <span className="text-sm font-bold text-indigo-500">Connection Status</span>
               <button onClick={testConnection} disabled={testStatus === 'loading'} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2">
                 {testStatus === 'loading' ? <Loader2 className="animate-spin" size={12}/> : <Zap size={12}/>} Test
               </button>
            </div>
            )}
            
            {testStatus === 'success' && <div className="text-xs text-emerald-500 font-bold text-center">Connection Successful!</div>}
            {testStatus && testStatus.startsWith('error') && <div className="text-xs text-red-500 font-bold text-center break-words">{testStatus}</div>}
          </div>

          <button onClick={() => setShowSettings(false)} className="w-full mt-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-colors">
            Save & Close
          </button>
        </div>
      </div>
    );
  };

  // --- Main Flashcard UI ---
  return (
    <div className={`min-h-screen flex flex-col items-center p-4 transition-colors duration-300 font-sans ${themeClass} ${isDarkMode ? 'dark' : ''}`}>
      <Header />

      {isOfflineMode && (
        <div className="w-full max-w-md mb-3 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider text-center">
          Offline mode is active. Upload saved paragraph or conversation files from their setup screens.
        </div>
      )}

      <main className="w-full max-w-md flex-1 flex flex-col justify-center">
        {/* Progress Display */}
        {cards.length > 15 ? (
          <div className="flex items-center justify-between w-full mb-4 px-2 text-sm font-bold">
            <div className="flex items-center gap-1">
              <span className="text-indigo-500 text-lg">#{currentIndex + 1}</span>
              <span className={`text-lg opacity-40 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>/ {cards.length}</span>
            </div>
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-1 text-red-500">
                 <XCircle size={16} /> {statusStats.wrong}
               </div>
               <div className="flex items-center gap-1 text-yellow-500">
                 <AlertTriangle size={16} /> {statusStats.missed}
               </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-1 h-1.5 mb-2 px-1">
            {cards.map((_, i) => (
              <div key={i} className={`flex-1 rounded-full transition-all duration-300 ${
                i === currentIndex ? 'bg-indigo-500 scale-y-150' :
                cardStatuses[i] === 'correct' ? 'bg-emerald-500' :
                cardStatuses[i] === 'wrong' ? 'bg-red-500' :
                cardStatuses[i] === 'missed' ? 'bg-yellow-500' :
                'bg-slate-200 dark:bg-slate-700'
              }`} />
            ))}
          </div>
        )}

        {/* Timer Component */}
        <TimerBar 
          isActive={appMode === 'flashcards' && !isFinished && !isFlipped}
          onExpire={() => setIsBonusWindow(false)}
          resetKey={timerKey}
        />

        {/* The Card */}
        <div className="relative h-96 w-full perspective-1000 group mb-8" onClick={() => setIsFlipped(!isFlipped)}>
          <div className={`relative w-full h-full transition-all duration-500 preserve-3d cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}>
            
            {/* Front - Text size increased to 9xl */}
            <div className={`absolute inset-0 backface-hidden rounded-[2.5rem] border-2 flex flex-col items-center justify-center p-8 shadow-2xl ${cardBg} ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
              <span className="absolute top-8 text-sm font-bold tracking-widest text-slate-400">CARD {currentIndex + 1}</span>
              <h2 className="text-[7rem] leading-none font-black text-center flex items-center justify-center h-full pb-4">{currentCard.char}</h2>
              <div className="absolute bottom-8 flex items-center gap-2 text-indigo-500 text-xs font-bold uppercase tracking-widest">
                <span>Click / Up to Flip</span>
                <RotateCcw size={14} />
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); copyToClipboard(currentCard.char); }}
                className={`absolute top-6 left-6 p-3 rounded-xl transition-all ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:text-white' : 'bg-slate-100 text-slate-400 hover:text-indigo-500'}`}
              >
                <Copy size={24} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleTTS(currentCard.char); }}
                className={`absolute top-6 right-6 p-3 rounded-xl transition-all ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:text-white' : 'bg-slate-100 text-slate-400 hover:text-indigo-500'}`}
              >
                <Volume2 size={24} />
              </button>
            </div>

            {/* Back */}
            <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-[2.5rem] bg-indigo-600 text-white flex flex-col items-center justify-center p-8 shadow-2xl shadow-indigo-500/30">
              <span className="text-3xl font-bold opacity-80 mb-2">{currentCard.pinyin}</span>
              {currentCard.meaning.includes('|') ? (
                (() => {
                  const [direct, expanded] = currentCard.meaning.split('|').map(s => s.trim());
                  return (
                    <div className="text-center mb-8">
                      <h2 className="text-4xl font-black leading-tight mb-2">{direct}</h2>
                      <p className="text-lg font-medium opacity-75">{expanded}</p>
                    </div>
                  );
                })()
              ) : (
                <h2 className="text-4xl font-black text-center leading-tight mb-8">{currentCard.meaning}</h2>
              )}
              <div className="absolute bottom-0 inset-x-0 p-6 flex gap-3">
                <button 
                  onClick={(e) => { e.stopPropagation(); markCard('wrong'); }}
                  className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm backdrop-blur-sm border border-white/10 transition-all"
                >
                  WRONG (Esc)
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); markCard('correct'); }}
                  className="flex-1 py-3 bg-white text-indigo-600 rounded-xl font-bold text-sm shadow-lg hover:scale-105 transition-all"
                >
                  CORRECT (Enter)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Nav Controls - MOVED UP */}
        <div className="flex gap-2 mb-4">
          <button onClick={prevCard} className={navBtnClass}><ChevronLeft /></button>
          
          <button onClick={() => resetSession()} className={navBtnClass} title="Restart Deck">
            <RotateCcw size={20} />
          </button>
          
          <button onClick={shuffleDeck} className={navBtnClass} title="Shuffle Deck">
            <Shuffle size={20} />
          </button>

          {authToken && currentDeckId && !isFinished && (
            <button onClick={pauseAndSaveProgress} className={navBtnClass} title="Pause & Save Progress">
              <Clock size={20} />
            </button>
          )}

          {authToken && (
            <button onClick={() => { setShowSavePrompt('deck'); setSaveName(''); }} className={navBtnClass} title="Save Deck to Cloud">
              <Save size={20} />
            </button>
          )}

          {!isOfflineMode && (
            <button onClick={() => setShowChat(true)} className={`flex-1 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-indigo-600 hover:text-white' : 'bg-slate-200 text-slate-600 hover:bg-indigo-600 hover:text-white'}`}>
              <MessageCircle size={20} /> <span className="hidden sm:inline">Ask AI</span>
            </button>
          )}
          
          <button onClick={nextCard} className={navBtnClass}><ChevronRight /></button>
        </div>

        {/* AI Context Section */}
        {!isOfflineMode && (
        <div className={`rounded-[2rem] p-6 mb-6 transition-all border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2 text-indigo-500 text-xs font-black tracking-widest">
              <Sparkles size={14} /> CONTEXT LAB
            </div>
            <button 
              onClick={generateSmartSentence} 
              disabled={isGenerating}
              className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}
            >
              {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
            </button>
          </div>

          {aiSentence ? (
            <div className="animate-in fade-in slide-in-from-bottom-2">
               <div className="flex justify-between items-start mb-2">
                 <p className="text-2xl font-bold pr-2">{aiSentence.chinese}</p>
                 <div className="flex gap-2">
                   <button onClick={() => handleTTS(aiSentence.chinese)} className={`p-2 rounded-lg ${isDarkMode ? 'bg-slate-700 text-slate-300 hover:text-white' : 'bg-slate-100 text-slate-500 hover:text-indigo-600'}`}>
                      <Volume2 size={16} />
                   </button>
                   <button onClick={() => setIsContextRevealed(!isContextRevealed)} className={`p-2 rounded-lg ${isDarkMode ? 'bg-slate-700 text-slate-300 hover:text-white' : 'bg-slate-100 text-slate-500 hover:text-indigo-600'}`}>
                      {isContextRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
                   </button>
                 </div>
               </div>
               
               {isContextRevealed && (
                 <div className={`p-3 rounded-xl border mt-3 ${isDarkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                    <p className="text-sm font-bold text-indigo-500 mb-1">{aiSentence.pinyin}</p>
                    <p className="text-sm text-slate-500 italic">{aiSentence.english}</p>
                 </div>
               )}
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic text-center py-2">Press 'Shift' to generate an example sentence.</p>
          )}
        </div>
        )}
      </main>

      {/* Chat Modal */}
      {showChat && !isOfflineMode && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className={`w-full max-w-lg h-[80vh] rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <div className={`p-6 border-b flex justify-between items-center ${isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50/50 border-slate-100'}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <BrainCircuit size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-sm">AI Tutor</h3>
                  <p className="text-xs text-slate-500">Discussing "{currentCard.char}"</p>
                </div>
              </div>
              <button onClick={() => setShowChat(false)} className={`p-2 rounded-full transition-colors ${isDarkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}><X size={20}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
               {chatMessages.length === 0 && (
                 <div className="grid grid-cols-2 gap-2 mt-8">
                   {["Explain grammar usage", "Historical context & breakdown", "Example sentences", "Is this formal?"].map(q => (
                     <button key={q} onClick={() => handleChat(q)} className={`p-3 text-xs font-bold rounded-xl transition-colors text-left ${isDarkMode ? 'bg-slate-800 text-slate-400 hover:bg-indigo-600 hover:text-white' : 'bg-slate-100 text-slate-500 hover:bg-indigo-600 hover:text-white'}`}>
                       {q}
                     </button>
                   ))}
                 </div>
               )}
               {chatMessages.map((m, i) => (
                 <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                   <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-indigo-600 text-white' : isDarkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-800'}`}>
                     <FormattedText text={m.text} isUser={m.role === 'user'} />
                   </div>
                 </div>
               ))}
               {isChatting && <div className="flex gap-1 p-4"><span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"/></div>}
            </div>

            <div className={`p-4 border-t flex gap-2 ${isDarkMode ? 'border-slate-800 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'}`}>
              <input 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleChat()}
                placeholder="Ask anything..."
                className={`flex-1 rounded-xl px-4 text-sm outline-none border transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-indigo-500' : 'bg-white border-slate-200 text-slate-900 focus:border-indigo-500'}`}
              />
              <button onClick={() => handleChat()} className="p-3 bg-indigo-600 rounded-xl text-white hover:bg-indigo-500 transition-colors"><Send size={20}/></button>
            </div>
          </div>
        </div>
      )}
      {showSettings && <SettingsModal />}
      {showLibrary && <LibraryModal />}
      {showSavePrompt === 'deck' && <SavePromptModal onSave={saveDeckToCloud} />}
      {pendingResume && <PendingResumePrompt />}

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        @keyframes confetti {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
        }
        .animate-confetti { animation: confetti 3s ease-in-out forwards; }
        
        /* Custom slider styles */
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #6366f1;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        input[type="range"]::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #6366f1;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
}