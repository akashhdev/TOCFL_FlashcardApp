import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ChevronLeft, ChevronRight, RotateCcw, Sparkles, MessageCircle, Send, 
  Loader2, X, Moon, Sun, Upload, Volume2, VolumeX, 
  Trophy, AlertCircle, Eye, EyeOff, RefreshCw, BrainCircuit,
  GraduationCap, Star, Smile, Frown, Meh, AlertTriangle, XCircle,
  BookOpen, CheckSquare, Shuffle, CheckCircle2, Copy, Clock, Settings, Key, Zap
} from 'lucide-react';

// --- Configuration ---
// This is the fallback/system key. 
const systemApiKey = ""; 

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
const callGemini = async (prompt, systemInstruction, key, responseMimeType = "text/plain") => {
  if (!key) return null;
  // Use standard public model for custom keys, internal preview model for system keys
  const model = key === systemApiKey ? "gemini-2.5-flash-preview-09-2025" : "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  
  const makeRequest = async (retryCount = 0) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { responseMimeType }
        })
      });
      
      if (!response.ok) {
        const errText = await response.text();
        // If it's a 404, it might be a model name issue, try fallback to 1.5 flash if using system key failed
        if (response.status === 404 && model.includes('2.5')) {
             console.warn("Preview model not found, falling back to 1.5-flash");
             const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
             const fallbackResp = await fetch(fallbackUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }],
                  systemInstruction: { parts: [{ text: systemInstruction }] },
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

const generateTTS = async (text, key) => {
  if (!key) return null;
  // TTS model might also vary by key capability, but we'll try the standard endpoint
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${key}`;
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
  // Global State
  const [appMode, setAppMode] = useState('flashcards');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Flashcard State
  const [cards, setCards] = useState(INITIAL_DECK);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [score, setScore] = useState(0);
  const [isBonusWindow, setIsBonusWindow] = useState(true); 
  const [timerKey, setTimerKey] = useState(0);

  // Time Tracking State
  const [startTime, setStartTime] = useState(Date.now());
  const [sessionDuration, setSessionDuration] = useState(0);

  // Status: 'unvisited' | 'correct' | 'wrong' | 'missed'
  const [cardStatuses, setCardStatuses] = useState(new Array(INITIAL_DECK.length).fill('unvisited'));
  const [isFinished, setIsFinished] = useState(false);

  // AI & Chat State
  const [aiSentence, setAiSentence] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [isChatting, setIsChatting] = useState(false);
  const [isContextRevealed, setIsContextRevealed] = useState(false);
  
  // Custom API Key State
  const [customKey, setCustomKey] = useState(() => localStorage.getItem('gemini_key') || "");
  const [showSettings, setShowSettings] = useState(false);
  
  const effectiveKey = customKey || systemApiKey;

  // Mock Test State
  const [mockConfig, setMockConfig] = useState({ level: 'A1', count: 3, useCurrentDeck: false });
  const [mockQuestions, setMockQuestions] = useState([]);
  const [mockLoadingStatus, setMockLoadingStatus] = useState("");
  const [mockAnswers, setMockAnswers] = useState([]);

  // Session Summary State
  const [revealedReviewItems, setRevealedReviewItems] = useState({});

  const fileInputRef = useRef(null);
  const currentCard = cards[currentIndex] || {};

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

  // --- Keyboard Shortcuts ---
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
        e.preventDefault();
        setShowChat(true);
      }
      if (e.key === 'Shift') {
        e.preventDefault();
        generateSmartSentence();
      }
    }
  }, [appMode, isFinished, isFlipped, currentCard, showChat, showSettings, cardStatuses, currentIndex]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const resetTimer = () => {
    setIsBonusWindow(true);
    setTimerKey(prev => prev + 1);
  };

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
      setCurrentIndex(p => p - 1);
      setAiSentence(null);
      setIsContextRevealed(false);
      resetTimer();
    }
  };

  const markCard = (status) => {
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

    if (currentIndex === cards.length - 1) {
      if (soundEnabled && status === 'correct') SoundFX.victory();
      setSessionDuration((Date.now() - startTime) / 1000);
      setTimeout(() => setIsFinished(true), 500);
    } else {
      setIsFlipped(false);
      setAiSentence(null);
      setIsContextRevealed(false);
      resetTimer();
      setTimeout(() => setCurrentIndex(p => p + 1), 200);
    }
  };

  const resetSession = (specificCards = null) => {
    const deckToUse = specificCards || cards;
    if (specificCards) setCards(specificCards);
    
    setIsFinished(false);
    setCurrentIndex(0);
    setIsFlipped(false);
    setCardStatuses(new Array(deckToUse.length).fill('unvisited'));
    setScore(0);
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
  const copyToClipboard = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      if (soundEnabled) SoundFX.playTone(800, 'sine', 0.1); // Feedback sound
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }
    document.body.removeChild(textArea);
  };

  // --- File Handling ---
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

    let newDeck = [];
    if (file.name.endsWith('.docx') && window.mammoth) {
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
  const handleTTS = async (text) => {
    if (!text) return;
    const audioData = await generateTTS(text, effectiveKey);
    if (audioData) {
      const blob = pcmToWav(audioData.data);
      const audio = new Audio(URL.createObjectURL(blob));
      audio.play();
    } else if (!effectiveKey) {
      setShowSettings(true);
    }
  };

  const generateSmartSentence = async () => {
    if (!effectiveKey) { setShowSettings(true); return; }
    setIsGenerating(true);
    try {
      const prompt = `Create a TOCFL Band A level sentence for the word: "${currentCard.char}". Format: [Traditional Chinese] | [Pinyin] | [English]`;
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

  const handleChat = async (inputOverride = null) => {
    if (!effectiveKey) { setShowSettings(true); return; }
    const msg = inputOverride || chatInput;
    if (!msg.trim()) return;
    
    setChatMessages(p => [...p, { role: 'user', text: msg }]);
    setChatInput("");
    setIsChatting(true);
    
    const prompt = `Context: User is studying card "${currentCard.char}" (${currentCard.meaning}). User asks: "${msg}". 
    IMPORTANT: Answer strictly in English. Only use Chinese characters when explicitly citing the vocabulary. 
    Format: Use **bold** for key terms, bullet points for lists, and ### for section headings.`;

    try {
      const response = await callGemini(prompt, "You are a helpful Mandarin tutor. Always explain in English.", effectiveKey);
      setChatMessages(p => [...p, { role: 'ai', text: response || "Sorry, I couldn't connect." }]);
    } catch (e) {
      setChatMessages(p => [...p, { role: 'ai', text: `Error: ${e.message}` }]);
    }
    setIsChatting(false);
  };

  // --- Mock Test Logic ---
  const startMockGeneration = async () => {
    if (!effectiveKey) { setShowSettings(true); return; }
    setAppMode('mock-loading');
    setMockLoadingStatus("Drafting questions...");
    
    // Construct vocabulary context if option is selected
    let vocabContext = "";
    if (mockConfig.useCurrentDeck) {
      const deckWords = cards.map(c => c.char).join(", ");
      vocabContext = `Vocabulary Constraint: Construct questions primarily using these words: [${deckWords}].`;
    }

    const prompt = `Generate ${mockConfig.count} TOCFL Band ${mockConfig.level} reading questions. 
    ${vocabContext}
    Style: TOCFL Reading Part 2 (Picture Description).
    For each question, describe a simple daily life situation suitable for a line-drawing illustration.
    Format: JSON Array of objects. Each object: { 
      "image_prompt": "Description for a black and white line drawing, simple educational style, no text", 
      "options": ["Sentence Option A", "Sentence Option B", "Sentence Option C"], 
      "correct_index": 0,
      "explanation": "Brief explanation in English why the correct option fits the image description."
    }`;
    
    try {
      const textData = await callGemini(prompt, "Return valid JSON only.", effectiveKey, "application/json");
      if (!textData) { throw new Error("No data returned"); }

      // Robust JSON parsing: clean markdown code blocks if present
      const cleanedText = textData.replace(/```json|```/g, '').trim();
      const questions = JSON.parse(cleanedText);
      const questionsWithImages = [];
      
      for (let i = 0; i < questions.length; i++) {
        setMockLoadingStatus(`Illustrating question ${i + 1}/${questions.length}...`);
        // Optimized prompt for B&W line art style
        const imageStyle = "black and white line drawing, simple sketch, educational test style, no text, white background, minimalist vector art";
        const imgUrl = await generateImage(`${questions[i].image_prompt}. ${imageStyle}`, effectiveKey);
        questionsWithImages.push({ ...questions[i], imageUrl: imgUrl });
      }

      setMockQuestions(questionsWithImages);
      setMockAnswers(new Array(questionsWithImages.length).fill(null));
      setCurrentIndex(0);
      setAppMode('mock-test');
    } catch (e) { 
      console.error("Mock Test Generation Failed:", e);
      setMockLoadingStatus(`Error: ${e.message}`);
      setTimeout(() => setAppMode('flashcards'), 2000);
    }
  };

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
          onClick={() => setAppMode('mock-setup')} 
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${appMode.includes('mock') ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-500'}`}
        >
          Mock Test
        </button>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setShowSettings(true)} className={`${iconBtnClass} ${!effectiveKey ? 'animate-pulse text-indigo-500 ring-2 ring-indigo-500' : ''}`}>
          <Settings size={20} />
        </button>
        <button onClick={() => fileInputRef.current.click()} className={iconBtnClass}>
          <Upload size={20} />
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv,.txt,.docx" />
        
        <button onClick={() => setSoundEnabled(!soundEnabled)} className={iconBtnClass}>
          {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} className="text-red-400" />}
        </button>
        <button onClick={() => setIsDarkMode(!isDarkMode)} className={iconBtnClass}>
          {isDarkMode ? <Sun size={20} className="text-amber-400" /> : <Moon size={20} />}
        </button>
      </div>
    </header>
  );

  // --- Views ---
  if (appMode === 'mock-setup') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 ${themeClass}`}>
        <Header />
        <div className={`max-w-md w-full rounded-3xl p-8 shadow-2xl ${cardBg} border`}>
          <h2 className="text-2xl font-black mb-8 flex items-center gap-2">
            <BrainCircuit className="text-indigo-500" /> Exam Configuration
          </h2>
          
          <div className="space-y-6">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest opacity-60 mb-2 block">Band Level</label>
              <div className="grid grid-cols-2 gap-3">
                {['A1', 'A2'].map(l => (
                  <button key={l} onClick={() => setMockConfig(c => ({...c, level: l}))}
                    className={`py-3 rounded-xl font-bold border-2 transition-all ${mockConfig.level === l ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500' : 'border-transparent bg-slate-800 text-slate-500'}`}>
                    Band {l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-widest opacity-60 mb-2 block">Questions (Capped for speed)</label>
              <div className="grid grid-cols-3 gap-3">
                {[3, 5, 10].map(c => (
                  <button key={c} onClick={() => setMockConfig(n => ({...n, count: c}))}
                    className={`py-3 rounded-xl font-bold border-2 transition-all ${mockConfig.count === c ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : 'border-transparent bg-slate-800 text-slate-500'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Use Current Deck Toggle */}
            <div 
              onClick={() => setMockConfig(c => ({...c, useCurrentDeck: !c.useCurrentDeck}))}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between group ${mockConfig.useCurrentDeck ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 bg-slate-800/50'}`}
            >
              <div className="flex items-center gap-3">
                <BookOpen size={20} className={mockConfig.useCurrentDeck ? 'text-indigo-500' : 'text-slate-500'} />
                <div>
                  <div className={`font-bold text-sm ${mockConfig.useCurrentDeck ? 'text-indigo-500' : 'text-slate-400'}`}>Use Flashcard Vocabulary</div>
                  <div className="text-xs opacity-60">Prioritize words from your current deck</div>
                </div>
              </div>
              <div className={`w-6 h-6 rounded-md flex items-center justify-center border transition-colors ${mockConfig.useCurrentDeck ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'}`}>
                {mockConfig.useCurrentDeck && <CheckSquare size={16} className="text-white" />}
              </div>
            </div>

            <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 text-amber-500 text-sm flex gap-3">
              <AlertCircle className="shrink-0" />
              <p>Generates unique AI illustrations for every question. Takes ~5s per question.</p>
            </div>

            <button onClick={startMockGeneration} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black shadow-lg shadow-indigo-500/25 active:scale-95 transition-all">
              Start Exam
            </button>
          </div>
        </div>
        {showSettings && <SettingsModal />}
      </div>
    );
  }

  if (appMode === 'mock-loading') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-8 ${themeClass}`}>
        <div className="relative mb-8">
          <Loader2 size={80} className="animate-spin text-indigo-500" />
          <Sparkles className="absolute top-0 right-0 text-amber-400 animate-pulse" />
        </div>
        <h3 className="text-3xl font-black mb-4">Building Exam</h3>
        <p className="text-slate-500 font-medium animate-pulse">{mockLoadingStatus}</p>
      </div>
    );
  }

  if (appMode === 'mock-test') {
    const q = mockQuestions[currentIndex] || {};
    const isAnswered = mockAnswers[currentIndex] != null;

    return (
      <div className={`min-h-screen flex flex-col items-center p-4 transition-colors duration-300 font-sans ${themeClass} ${isDarkMode ? 'dark' : ''}`}>
        <Header />

        <main className="w-full max-w-md flex-1 flex flex-col justify-center">
            {/* Progress */}
            <div className="w-full max-w-md mb-8 flex items-center justify-between">
               <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden mr-4">
                 <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${((currentIndex + 1) / mockQuestions.length) * 100}%` }} />
               </div>
               <span className="font-mono font-bold text-slate-500 text-xs">{currentIndex + 1}/{mockQuestions.length}</span>
            </div>

            {/* Content Container */}
            <div className="w-full max-w-md flex flex-col gap-6 mb-4">
                
                {/* Image Box */}
                <div className={`h-64 w-full rounded-[2.5rem] overflow-hidden shadow-2xl relative flex items-center justify-center border ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                  {q.imageUrl ? (
                    <img src={q.imageUrl} alt="Scenario" className="w-full h-full object-contain p-2" />
                  ) : (
                    <Loader2 className="animate-spin m-auto text-indigo-500" />
                  )}
                </div>

                {/* Options with Feedback Logic */}
                <div className="flex flex-col space-y-3">
                  {(q.options || []).map((opt, idx) => {
                     const isSelected = mockAnswers[currentIndex] === idx;
                     const isCorrect = idx === q.correct_index;
                     const showCorrectness = isAnswered;
                     
                     let btnClass = isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
                     let textClass = '';
                     
                     if (showCorrectness) {
                       if (isCorrect) {
                         btnClass = 'bg-emerald-500/20 border-emerald-500';
                         textClass = 'text-emerald-500';
                       } else if (isSelected && !isCorrect) {
                         btnClass = 'bg-red-500/20 border-red-500';
                         textClass = 'text-red-500';
                       } else {
                         btnClass = 'opacity-50';
                       }
                     } else {
                        btnClass += ' hover:bg-indigo-600 hover:text-white hover:border-indigo-600';
                     }

                     return (
                      <button 
                        key={idx} 
                        onClick={() => {
                          if (isAnswered) return;
                          const newAns = [...mockAnswers]; 
                          newAns[currentIndex] = idx; 
                          setMockAnswers(newAns);
                          if (idx === q.correct_index) {
                             if (soundEnabled) SoundFX.correct();
                          } else {
                             if (soundEnabled) SoundFX.wrong();
                          }
                        }} 
                        disabled={isAnswered}
                        className={`w-full p-4 text-left rounded-2xl transition-all font-bold border group flex justify-between items-center ${btnClass} ${textClass}`}
                      >
                        <span>{opt}</span>
                        {showCorrectness && isCorrect && <CheckCircle2 className="text-emerald-500" />}
                        {showCorrectness && isSelected && !isCorrect && <XCircle className="text-red-500" />}
                        {!showCorrectness && <ChevronRight className={`opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? 'text-white' : 'text-white'}`} />}
                      </button>
                     );
                  })}
                </div>

                {/* Explanation & Next Button */}
                {isAnswered && (
                  <div className="animate-in fade-in slide-in-from-bottom-4">
                     <div className={`p-4 rounded-xl mb-4 text-sm leading-relaxed border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                        <span className="font-bold text-indigo-500 block mb-1">Explanation:</span>
                        {q.explanation || "No explanation provided."}
                     </div>
                     
                     <button 
                       onClick={() => {
                         if (currentIndex < mockQuestions.length - 1) {
                            setCurrentIndex(p => p + 1); 
                         } else {
                            setAppMode('mock-result');
                         }
                       }}
                       className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black shadow-lg shadow-indigo-500/25 active:scale-95 transition-all flex items-center justify-center gap-2"
                     >
                       {currentIndex < mockQuestions.length - 1 ? 'Next Question' : 'Finish Exam'} <ChevronRight />
                     </button>
                  </div>
                )}
            </div>

            {/* Bottom Nav Bar - New */}
            <div className="flex gap-2 mb-4 mt-auto">
                <button 
                  onClick={() => setCurrentIndex(p => Math.max(0, p - 1))} 
                  className={navBtnClass} 
                  disabled={currentIndex === 0}
                >
                    <ChevronLeft />
                </button>
                
                <button onClick={() => setShowChat(true)} className={`flex-1 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-indigo-600 hover:text-white' : 'bg-slate-200 text-slate-600 hover:bg-indigo-600 hover:text-white'}`}>
                    <MessageCircle size={20} /> <span className="hidden sm:inline">Ask AI</span>
                </button>

                 <button 
                   onClick={() => setCurrentIndex(p => Math.min(mockQuestions.length - 1, p + 1))} 
                   className={navBtnClass} 
                   disabled={currentIndex === mockQuestions.length - 1}
                 >
                    <ChevronRight />
                </button>
            </div>
        </main>
        {showSettings && <SettingsModal />}
      </div>
    );
  }

  if (appMode === 'mock-result') {
    const correctCount = mockAnswers.filter((a, i) => a === mockQuestions[i].correct_index).length;
    const percentage = (correctCount / mockQuestions.length) * 100;
    
    // Calculate Stars
    let stars = 0;
    if (percentage >= 20) stars = 1;
    if (percentage >= 40) stars = 2;
    if (percentage >= 60) stars = 3;
    if (percentage >= 80) stars = 4;
    if (percentage === 100) stars = 5;

    // Emoji Logic
    const Emoji = stars >= 4 ? Smile : stars >= 2 ? Meh : Frown;
    const emojiColor = stars >= 4 ? 'text-emerald-500' : stars >= 2 ? 'text-yellow-500' : 'text-slate-400';

    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden ${themeClass}`}>
         {stars > 3 && <Confetti />}
         
         <div className={`max-w-md w-full p-8 rounded-[2.5rem] shadow-2xl text-center relative z-10 ${cardBg}`}>
            
            <div className={`mx-auto mb-4 w-20 h-20 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'} ${emojiColor}`}>
              <Emoji size={48} />
            </div>

            <div className="flex justify-center gap-2 mb-4">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={28} fill={i < stars ? "#fbbf24" : "none"} className={i < stars ? "text-amber-400" : "text-slate-300 dark:text-slate-700"} />
              ))}
            </div>

            <h1 className="text-6xl font-black text-indigo-600 mb-2">{Math.round(percentage)}%</h1>
            <p className="text-slate-400 font-bold uppercase tracking-widest mb-8">Score: {correctCount} / {mockQuestions.length}</p>
            
            <div className="space-y-3">
              <button 
                onClick={() => setAppMode('mock-setup')}
                className="w-full py-4 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20"
              >
                Try Another Test
              </button>
              <button onClick={() => setAppMode('flashcards')} className={`w-full py-4 rounded-xl font-bold ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-200 hover:bg-slate-300'}`}>Back to Flashcards</button>
            </div>
         </div>
      </div>
    );
  }

  if (isFinished) {
    const totalCards = cards.length;
    const correctCount = cardStatuses.filter(s => s === 'correct').length;
    const percentage = (correctCount / totalCards) * 100;
    
    // Calculate Stars
    let stars = 0;
    if (percentage >= 20) stars = 1;
    if (percentage >= 40) stars = 2;
    if (percentage >= 60) stars = 3;
    if (percentage >= 80) stars = 4;
    if (percentage === 100) stars = 5;

    // Emoji Logic
    const Emoji = stars >= 4 ? Smile : stars >= 2 ? Meh : Frown;
    const emojiColor = stars >= 4 ? 'text-emerald-500' : stars >= 2 ? 'text-yellow-500' : 'text-slate-400';

    // Get indices for Review (Wrong or Missed)
    const reviewIndices = cardStatuses.map((s, i) => (s === 'wrong' || s === 'missed') ? i : -1).filter(i => i !== -1);
    const reviewCards = reviewIndices.map(i => ({...cards[i], status: cardStatuses[i]}));

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
      </div>
    );
  }

  // --- Settings Modal Component ---
  const SettingsModal = () => {
    const [testStatus, setTestStatus] = useState(null);

    const testConnection = async () => {
      setTestStatus('loading');
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${effectiveKey}`, {
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

            <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
               <span className="text-sm font-bold text-indigo-500">Connection Status</span>
               <button onClick={testConnection} disabled={testStatus === 'loading'} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2">
                 {testStatus === 'loading' ? <Loader2 className="animate-spin" size={12}/> : <Zap size={12}/>} Test
               </button>
            </div>
            
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
                 <XCircle size={16} /> {cardStatuses.filter(s => s === 'wrong').length}
               </div>
               <div className="flex items-center gap-1 text-yellow-500">
                 <AlertTriangle size={16} /> {cardStatuses.filter(s => s === 'missed').length}
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

          <button onClick={() => setShowChat(true)} className={`flex-1 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-indigo-600 hover:text-white' : 'bg-slate-200 text-slate-600 hover:bg-indigo-600 hover:text-white'}`}>
            <MessageCircle size={20} /> <span className="hidden sm:inline">Ask AI</span>
          </button>
          
          <button onClick={nextCard} className={navBtnClass}><ChevronRight /></button>
        </div>

        {/* AI Context Section */}
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
      </main>

      {/* Chat Modal */}
      {showChat && (
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
      `}</style>
    </div>
  );
}
