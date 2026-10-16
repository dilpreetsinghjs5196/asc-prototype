import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, X, Send, Mic, MicOff, Lock, Volume2, VolumeX, MessageSquare, Radio, Play, Square } from 'lucide-react';
import { db } from '../lib/supabase';
import { sendMessageToGemini } from '../lib/gemini';
import './Chatbot.css';

const SUPPORTED_LANGUAGES = [
  { code: 'pa-IN', name: 'Punjabi (ਪੰਜਾਬੀ / Panjabi)' },
  { code: 'hi-IN', name: 'Hindi / Hinglish (हिंदी)' },
  { code: 'en-IN', name: 'English (India/Global)' },
  { code: 'es-ES', name: 'Spanish (Español)' },
  { code: 'fr-FR', name: 'French (Français)' },
  { code: 'de-DE', name: 'German (Deutsch)' }
];

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('text'); // 'text' | 'live'
  const [selectedLang, setSelectedLang] = useState(() => localStorage.getItem('asc_ai_lang') || 'en-IN');
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      text: 'Hello! I am your Multilingual ASC Operations Assistant. You can speak or write to me in Punjabi, Hindi, English, or any selected language. I provide real-time guidance on operating room schedules, CPT surgical billing codes, procedure durations, and operational center metrics under strict HIPAA zero-PHI privacy safeguards. How can I assist you today?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState(null);
  
  // Database context state
  const [surgeons, setSurgeons] = useState([]);
  const [patients, setPatients] = useState([]);
  const [cptCodes, setCptCodes] = useState([]);
  const [surgeries, setSurgeries] = useState([]);
  const [orBlockSchedule, setOrBlockSchedule] = useState([]);
  const [otExtraCosts, setOtExtraCosts] = useState([]);

  // Live Voice Mode state (Reliable HTTP-based Continuous Voice Loop)
  const [liveStatus, setLiveStatus] = useState('Disconnected');
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isLiveMuted, setIsLiveMuted] = useState(false);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const liveRecognitionRef = useRef(null);
  const liveLoopActiveRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const [isSoundOn, setIsSoundOn] = useState(true);

  const refreshDatabaseContext = useCallback(async () => {
    try {
      const [data, surgs, pats, cpts, surgies, orBlocks, extraCosts] = await Promise.all([
        db.getSettings().catch(() => null),
        db.getSurgeons().catch(() => []),
        db.getPatients().catch(() => []),
        db.getCPTCodes().catch(() => []),
        db.getSurgeries().catch(() => []),
        db.getORBlockSchedule().catch(() => []),
        db.getOTExtraCosts().catch(() => [])
      ]);
      
      const localAllowedEmail = localStorage.getItem('ai_allowed_email') || '';
      setSettings({ ...data, ai_allowed_email: data?.ai_allowed_email || localAllowedEmail });
      
      setSurgeons(surgs);
      setPatients(pats);
      setCptCodes(cpts);
      setSurgeries(surgies);
      setOrBlockSchedule(orBlocks);
      setOtExtraCosts(extraCosts);
      
      return { surgs, pats, cpts, surgies, orBlocks, extraCosts, settingsData: data };
    } catch (err) {
      console.error('Failed to load real-time data for Chatbot:', err);
      return { surgs: [], pats: [], cpts: [], surgies: [], orBlocks: [], extraCosts: [], settingsData: null };
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        refreshDatabaseContext();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, refreshDatabaseContext]);

  // Preload TTS voices & Clean up on unmounting
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.getVoices();
        };
      }
    }

    return () => {
      liveLoopActiveRef.current = false;
      if (liveRecognitionRef.current) {
        try {
          liveRecognitionRef.current.stop();
        } catch (err) {
          console.debug('Recognition stop notice:', err);
        }
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Robust Text-to-Speech Engine with Smart Fallbacks for Regional Languages (Punjabi / Hindi / Hinglish)
  const speakMessage = (text, targetLang, onEnd) => {
    if (!('speechSynthesis' in window) || !isSoundOn) {
      if (onEnd) setTimeout(onEnd, 3000);
      return;
    }
    
    window.speechSynthesis.cancel(); // Reset audio queue
    
    const cleanText = text.replace(/[*_#~]/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    const langPrefix = targetLang.split('-')[0].toLowerCase();

    // 1. Check for exact language or language prefix voice (e.g. Punjabi pa-IN)
    let selectedVoice = voices.find(v => v.lang.toLowerCase().includes(targetLang.toLowerCase())) ||
                        voices.find(v => v.lang.toLowerCase().startsWith(langPrefix));

    // 2. SMART INDIAN DIALECT FALLBACK: On many Windows PCs, Punjabi ('pa-IN') voices are not installed. Fallback to Hindi ('hi-IN') or Indian English ('en-IN') so it reads Romanized Punjabi & Hinglish fluently!
    if (!selectedVoice && (targetLang === 'pa-IN' || targetLang === 'hi-IN' || targetLang === 'en-IN')) {
      selectedVoice = voices.find(v => v.lang.toLowerCase().includes('hi-in')) ||
                      voices.find(v => v.lang.toLowerCase().includes('en-in')) ||
                      voices.find(v => v.lang.toLowerCase().includes('hi')) ||
                      voices.find(v => v.lang.toLowerCase().includes('en'));
    }

    // 3. Global fallback so it NEVER stays silent
    if (!selectedVoice && voices.length > 0) {
      selectedVoice = voices.find(v => v.default) || voices[0];
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      // CRITICAL: Must sync utterance.lang with voice.lang, otherwise Chrome silences audio!
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = targetLang;
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    if (onEnd) {
      utterance.onend = () => onEnd();
      utterance.onerror = (e) => {
        console.warn("Speech synthesis notice:", e);
        onEnd();
      };
    }

    // Workaround for Chrome garbage collector bug interrupting audio playback
    window.currentUtterance = utterance;

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error("Speech playback error:", err);
      if (onEnd) onEnd();
    }
  };

  // Initialize Speech Recognition for Text Chat input
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (!finalTranscript && event.results.length > 0) {
           finalTranscript = event.results[event.results.length - 1][0].transcript;
        }

        if (finalTranscript) {
          setInput(finalTranscript);
        }
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error in Text Chat', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert("Voice recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.lang = selectedLang;
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeTab === 'text') {
      scrollToBottom();
    }
  }, [messages, isOpen, activeTab]);

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setSelectedLang(newLang);
    localStorage.setItem('asc_ai_lang', newLang);
    if (liveStatus !== 'Disconnected') {
      stopLiveVoice();
    }
  };

  const prepareContextData = (userPrompt = '', customData = null) => {
    const sList = customData?.surgs || surgeons;
    const pList = customData?.pats || patients;
    const cList = customData?.cpts || cptCodes;
    const surgList = customData?.surgies || surgeries;
    const blockList = customData?.orBlocks || orBlockSchedule;
    const extraList = customData?.extraCosts || otExtraCosts;

    const getSurgeonName = (s) => {
      if (!s) return 'Unknown';
      if (s.name && s.name !== 'undefined') return s.name;
      const full = `${s.firstname || ''} ${s.lastname || ''}`.trim();
      if (full) return `Dr. ${full.replace(/^Dr\.?\s*/i, '')}`;
      return s.doctor_name || s.surgeon_name || `Surgeon #${s.id || 'N/A'}`;
    };



    const selectedLangObj = SUPPORTED_LANGUAGES.find(l => l.code === selectedLang) || SUPPORTED_LANGUAGES[0];
    const contextParts = [];
    
    // System Header with Strict Multilingual Guidance & Pronounceable Script Rules
    contextParts.push(`=== ASC MANAGER REAL-TIME DATABASE CONTEXT ===\nCurrent Date & Time: ${new Date().toLocaleString()}\nYou have complete, unrestricted access to the entire ASC (Ambulatory Surgery Center) database below.\n\nCRITICAL MULTILINGUAL INSTRUCTION FOR SPEECH & TEXT:\n1. The user's interface is set to: "${selectedLangObj.name}" (${selectedLang}).\n2. Detect the exact language/dialect of the user's input (Punjabi, Hindi, Hinglish, English, etc.) and answer directly in THAT EXACT SAME LANGUAGE!\n3. SPEECH PRONUNCIATION REQUIREMENT: When replying in Punjabi or Hindi, ALWAYS provide clear conversational Romanized script (e.g. Romanized Punjabi / Pinglish like 'Hanjii, ajh diyan 5 surgeries scheduled ne...' or Hinglish / simple style) so standard voice audio synthesizers can speak your answer aloud naturally without failing on unreadable characters!\n4. Provide exact answers using only the verified ASC operational database below. Keep answers conversational, natural, and highly professional.`);
    
    // Surgeons Database (Sanitized for AI Context)
    if (sList && sList.length > 0) {
      const surgeonText = sList.map((s, idx) => {
        const name = getSurgeonName(s);
        const spec = s.specialty || 'General Surgery';
        const status = s.status || 'Active';
        return `[Surgeon ID: ${s.id || idx + 1}] Name: ${name} | Specialty: ${spec} | Status: ${status}`;
      }).join('\n');
      contextParts.push(`--- SURGEON DIRECTORY (Total: ${sList.length} Credentialed Surgeons) ---\n${surgeonText}`);
    } else {
      contextParts.push(`--- SURGEON DIRECTORY ---\nNo surgeons currently listed in the database.`);
    }

    // Patients Database (HIPAA Minimum Necessary & De-Identification: 45 CFR § 164.514)
    // NOTE: Direct patient names, MRNs, DOBs, phone numbers, and addresses are strictly excluded from AI prompts.
    if (pList && pList.length > 0) {
      contextParts.push(`--- PATIENT REGISTRY SUMMARY (Total Registered Patients: ${pList.length}) ---
Privacy Safeguard (HIPAA § 164.514): Individual patient Protected Health Information (PHI) such as full names, MRNs, dates of birth, phone numbers, and home addresses are strictly stripped from external AI prompts. For specific individual patient charts, instruct the user to view the secure, authenticated Patient Registry screen.`);
    } else {
      contextParts.push(`--- PATIENT REGISTRY ---\nNo patient records registered in database.`);
    }

    // Surgeries / Case Log (De-Identified for AI Context)
    if (surgList && surgList.length > 0) {
      const surgeryText = surgList.map((s, idx) => {
        const surgeonName = getSurgeonName(s.surgeons || s);
        const date = s.date || 'Unscheduled';
        const time = s.time || s.start_time || 'TBD';
        const room = s.operating_room || s.room || s.or_room || 'Assigned OR';
        const proc = s.procedure_name || s.procedure || s.cpt_description || 'Surgical Procedure';
        const cpt = s.cpt_code || s.cpt || 'N/A';
        const status = s.status || 'Scheduled';
        const cost = s.cost !== undefined ? `$${s.cost}` : '$0';
        const reimb = s.reimbursement !== undefined ? `$${s.reimbursement}` : '$0';
        const cancelReason = s.cancellation_reason ? ` (Reason: ${s.cancellation_reason})` : '';
        return `[Case ID: ${s.id || idx + 1}] Date: ${date} at ${time} | OR: ${room} | Surgeon: ${surgeonName} | Patient: [De-Identified] | Procedure: ${proc} (CPT: ${cpt}) | Status: ${status}${cancelReason} | Est. Cost: ${cost} | Expected Reimbursement: ${reimb}`;
      }).join('\n');
      contextParts.push(`--- SURGICAL CASE LOG & FINANCIALS (Total: ${surgList.length} Surgeries) ---\n${surgeryText}`);
    } else {
      contextParts.push(`--- SURGICAL CASE LOG ---\nNo surgical cases logged yet.`);
    }

    // OR Block Schedule
    if (blockList && blockList.length > 0) {
      const blockText = blockList.map((b, idx) => {
        const room = b.room_name || b.room || b.or || 'OR';
        const provider = b.provider_name || b.surgeon || getSurgeonName(b);
        const day = b.day_of_week || b.date || 'Weekly';
        const time = (b.start_time && b.end_time) ? `${b.start_time} - ${b.end_time}` : 'Full Day Block';
        return `[Block ID: ${b.id || idx + 1}] Room: ${room} | Provider: ${provider} | Schedule: ${day} (${time})`;
      }).join('\n');
      contextParts.push(`--- OR BLOCK SCHEDULES (Total: ${blockList.length} Blocks) ---\n${blockText}`);
    }

    // Token-Optimized CPT Codes & Supply Context
    const promptLower = userPrompt.toLowerCase();
    const isBillingOrProcedureQuery = 
      promptLower.includes('cpt') || promptLower.includes('code') || promptLower.includes('cost') ||
      promptLower.includes('price') || promptLower.includes('reimbursement') || promptLower.includes('margin') ||
      promptLower.includes('procedure') || promptLower.includes('supply') || promptLower.includes('duration') ||
      promptLower.includes('turnover') || promptLower.includes('charge') || promptLower.includes('fee');

    if (cList && cList.length > 0) {
      const formatCPT = (c) => `CPT ${c.code || 'Unknown'}: ${c.description || 'No description'} [Category: ${c.category || 'General'} | Avg Cost: $${c.cost || 0} | Expected Reimbursement: $${c.reimbursement || 0} | Avg Duration: ${c.average_duration || 0} mins]`;
      
      if (cList.length <= 50 || isBillingOrProcedureQuery) {
        const displayList = isBillingOrProcedureQuery && cList.length > 200 ? cList.slice(0, 200) : cList;
        contextParts.push(`--- COMPASS CPT CODES DATABASE (Showing ${displayList.length} of Total: ${cList.length} CPT Codes) ---\n${displayList.map(formatCPT).join('\n')}`);
      } else {
        contextParts.push(`--- COMPASS CPT CODES DATABASE (Total Catalog Size: ${cList.length} CPT Codes) ---\nNote: Complete CPT procedure database of ${cList.length} billing codes is actively linked in the background and will be fully expanded when asked about specific CPT codes, procedures, costs, or turnover times. Sample procedures:\n${cList.slice(0, 20).map(formatCPT).join('\n')}`);
      }
    }

    if (extraList && extraList.length > 0) {
      if (extraList.length <= 30 || isBillingOrProcedureQuery) {
        const extraText = extraList.map((e, idx) => `[Cost ID: ${e.id || idx + 1}] Related CPT: ${e.cpt_codes || e.code || 'All'} | Item: ${e.item_name || e.name || e.description || 'Extra Supply'} | Additional Cost: $${e.cost || e.amount || 0}`).join('\n');
        contextParts.push(`--- OPERATING THEATER (OT) EXTRA COSTS & SUPPLIES (Total: ${extraList.length} Items) ---\n${extraText}`);
      } else {
        contextParts.push(`--- OPERATING THEATER (OT) EXTRA COSTS (Total Items: ${extraList.length}) ---\nNote: Expanded when pricing or supply costs are requested.`);
      }
    }

    return contextParts.join('\n\n');
  };

  // ==========================================
  // Reliable HTTP-Based Continuous Live Voice Loop
  // ==========================================
  const startLiveVoice = async () => {
    liveLoopActiveRef.current = true;
    setLiveStatus('Starting Live Voice...');
    setLiveTranscript('Syncing with real-time ASC hospital database...');
    await refreshDatabaseContext();

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      startLiveListeningLoop();
    } else {
      setLiveStatus('Error: Voice Recognition Unsupported');
      setLiveTranscript('Your browser does not support Speech Recognition. Please use Chrome or Edge.');
    }
  };

  const startLiveListeningLoop = () => {
    if (!liveLoopActiveRef.current) return;
    if (isLiveMuted) {
      setLiveStatus('Paused (Muted)');
      return;
    }

    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setIsAiSpeaking(false);
    
    const shortCode = selectedLang.split('-')[0].toUpperCase();
    setLiveStatus(`🟢 Listening (${shortCode})... Speak naturally!`);
    setLiveTranscript('Listening... ask any question about surgeries, surgeons, or hospital schedules in your selected language.');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    liveRecognitionRef.current = recognition;
    recognition.lang = selectedLang;
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalTxt = '';

    recognition.onresult = (event) => {
      let interimTxt = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTxt += event.results[i][0].transcript;
        } else {
          interimTxt += event.results[i][0].transcript;
        }
      }
      if (finalTxt || interimTxt) {
        setLiveTranscript(finalTxt || interimTxt);
      }
    };

    recognition.onend = async () => {
      if (!liveLoopActiveRef.current) return;

      if (!finalTxt.trim()) {
        // If user stayed silent, briefly wait and re-listen automatically
        if (liveLoopActiveRef.current && !isLiveMuted) {
          setTimeout(() => startLiveListeningLoop(), 1000);
        }
        return;
      }

      // Query captured! Submit to Gemini with fallback protection
      setLiveStatus('⚡ Thinking & Checking ASC Database...');
      setLiveTranscript(`You asked: "${finalTxt}"\n\nConsulting real-time surgical records...`);

      const userMsg = {
        id: Date.now(),
        type: 'user',
        text: finalTxt,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const latestData = await refreshDatabaseContext();
        const history = messages
          .filter(m => m.id !== 1 && (m.type === 'user' || m.type === 'bot'))
          .map(m => ({ role: m.type === 'bot' ? 'model' : 'user', text: m.text }));
        const contextData = prepareContextData(finalTxt, latestData);
        
        const botReply = await sendMessageToGemini(finalTxt, history, contextData);

        const botMsg = {
          id: Date.now() + 1,
          type: 'bot',
          text: botReply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages((prev) => [...prev, botMsg]);

        setLiveTranscript(botReply);
        setLiveStatus('🔊 Speaking Reply...');
        setIsAiSpeaking(true);

        // Read out response using robust TTS synthesizer
        speakMessage(botReply, selectedLang, () => {
          setIsAiSpeaking(false);
          if (liveLoopActiveRef.current && !isLiveMuted) {
            setTimeout(() => startLiveListeningLoop(), 1000);
          }
        });

      } catch (err) {
        console.error("Live voice interaction error:", err);
        setLiveStatus("Error processing reply");
        setLiveTranscript(`Error: ${err.message}. Retrying in 3s...`);
        setTimeout(() => {
          if (liveLoopActiveRef.current && !isLiveMuted) startLiveListeningLoop();
        }, 3000);
      }
    };

    recognition.onerror = (e) => {
      console.warn("Speech recognition notice:", e.error);
      if (liveLoopActiveRef.current && e.error !== 'not-allowed' && e.error !== 'service-not-allowed') {
        setTimeout(() => startLiveListeningLoop(), 1500);
      } else if (e.error === 'not-allowed') {
        setLiveStatus('Microphone Access Denied');
        setLiveTranscript('Please enable microphone permissions in browser settings.');
        liveLoopActiveRef.current = false;
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to begin speech capture:", e);
    }
  };

  const stopLiveVoice = () => {
    liveLoopActiveRef.current = false;
    if (liveRecognitionRef.current) {
      try {
        liveRecognitionRef.current.stop();
      } catch (err) {
        console.debug('Stop live recognition notice:', err);
      }
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setLiveStatus('Disconnected');
    setIsAiSpeaking(false);
  };

  const toggleLiveMute = () => {
    const nextMute = !isLiveMuted;
    setIsLiveMuted(nextMute);
    if (nextMute) {
      if (liveRecognitionRef.current) {
        try {
          liveRecognitionRef.current.stop();
        } catch (err) {
          console.debug('Mute live recognition notice:', err);
        }
      }
      setLiveStatus('Paused (Muted)');
    } else {
      if (liveLoopActiveRef.current) {
        startLiveListeningLoop();
      }
    }
  };

  const handleTabChange = (tab) => {
    if (tab === 'text' && liveStatus !== 'Disconnected') {
      stopLiveVoice();
    }
    setActiveTab(tab);
  };

  const toggleChat = () => {
    if (isOpen && liveStatus !== 'Disconnected') {
      stopLiveVoice();
    }
    setIsOpen(!isOpen);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      text: input,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const latestData = await refreshDatabaseContext();

    if (!latestData?.settingsData && !settings?.gemini_api_key && !import.meta.env.VITE_GEMINI_API_KEY) {
      setTimeout(() => {
        setMessages((prev) => [...prev, {
          id: Date.now() + 1,
          type: 'bot',
          text: 'Error: Gemini API Key is not configured. Please add it in Settings under AI Configuration.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        setIsLoading(false);
      }, 1000);
      return;
    }

    try {
      const history = messages
        .filter(m => m.id !== 1 && (m.type === 'user' || m.type === 'bot'))
        .map(m => ({ role: m.type === 'bot' ? 'model' : 'user', text: m.text }));

      const contextData = prepareContextData(userMessage.text, latestData);
      const botReply = await sendMessageToGemini(userMessage.text, history, contextData);

      if (isSoundOn) {
        speakMessage(botReply, selectedLang);
      }

      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        text: botReply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      console.error('Gemini API Error:', err);
      const errorMessage = {
        id: Date.now() + 1,
        type: 'bot',
        text: `Sorry, I encountered an error communicating with the AI service. Details: ${err.message}. Please try again.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chatbot-container">
      {isOpen && (
        <div className="chatbot-window">
          {/* Header */}
          <div className="chatbot-header">
            <div className="chatbot-header-info">
              <div style={{ background: '#10b981', width: '8px', height: '8px', borderRadius: '50%' }}></div>
              <h3 className="chatbot-title">ASC Assistant</h3>
              <div className="chatbot-badge" title="HIPAA Compliant De-Identified Mode: No patient identifiers or contact details are sent to AI">
                <Lock size={12} />
                <span>AI • ZERO-PHI</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="chatbot-close-btn" 
                onClick={() => {
                  if (window.speechSynthesis) window.speechSynthesis.cancel();
                  setIsSoundOn(!isSoundOn);
                }} 
                aria-label="Toggle Sound"
                title={isSoundOn ? "Mute Spoken Replies" : "Enable Spoken Replies"}
              >
                {isSoundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
              <button className="chatbot-close-btn" onClick={toggleChat} aria-label="Close Chat">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Mode Navigation Bar */}
          <div className="chatbot-mode-bar">
            <button
              type="button"
              className={`chatbot-mode-tab ${activeTab === 'text' ? 'active' : ''}`}
              onClick={() => handleTabChange('text')}
            >
              <MessageSquare size={14} />
              <span>Text Chat</span>
            </button>
            <button
              type="button"
              className={`chatbot-mode-tab ${activeTab === 'live' ? 'active' : ''}`}
              onClick={() => handleTabChange('live')}
            >
              <Radio size={14} />
              <span>Live AI Voice</span>
            </button>
          </div>

          {/* Spoken & Reply Language Selector Bar */}
          <div className="chatbot-lang-bar">
            <span>🗣️ Assistant Language:</span>
            <select 
              className="chatbot-lang-select"
              value={selectedLang}
              onChange={handleLanguageChange}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tab Content */}
          {activeTab === 'live' ? (
            <div className="live-voice-container">
              <div className="live-voice-status">
                <span className={`status-dot ${
                  liveStatus.includes('Listening') || liveStatus.includes('Speaking') ? (isAiSpeaking ? 'speaking' : 'connected') :
                  liveStatus.includes('Checking') || liveStatus.includes('Starting') ? 'connecting' : 'disconnected'
                }`}></span>
                <span>{liveStatus}</span>
              </div>

              <div className="live-orb-wrapper">
                <div 
                  className={`live-orb ${isAiSpeaking ? 'speaking' : ''}`}
                  style={{
                    transform: `scale(${isAiSpeaking ? 1.25 : 1})`,
                    cursor: liveStatus === 'Disconnected' || liveStatus.includes('Error') || liveStatus.includes('Denied') ? 'pointer' : 'default'
                  }}
                  onClick={() => {
                    if (liveStatus === 'Disconnected' || liveStatus.includes('Error') || liveStatus.includes('Denied')) {
                      startLiveVoice();
                    }
                  }}
                >
                  <Radio size={48} className="live-orb-icon" />
                </div>

                <div className="live-transcript-box">
                  {liveTranscript || "Click Start Conversation below to speak in Punjabi, Hindi, English, or any selected language!"}
                </div>
              </div>

              <div className="live-controls-row">
                {liveStatus === 'Disconnected' || liveStatus.includes('Error') || liveStatus.includes('Denied') ? (
                  <button type="button" className="live-action-btn start" onClick={startLiveVoice}>
                    <Play size={18} />
                    <span>Start Live Voice</span>
                  </button>
                ) : (
                  <>
                    <button 
                      type="button" 
                      className={`live-mute-btn ${isLiveMuted ? 'muted' : ''}`} 
                      onClick={toggleLiveMute}
                      title={isLiveMuted ? "Unmute Microphone" : "Mute Microphone"}
                    >
                      {isLiveMuted ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                    <button type="button" className="live-action-btn stop" onClick={stopLiveVoice}>
                      <Square size={16} />
                      <span>End Conversation</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Messages Area */}
              <div className="chatbot-messages">
                {messages.map((msg) => (
                  <div key={msg.id} className={`chat-message ${msg.type}`}>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                    <span className="chat-time">{msg.time}</span>
                  </div>
                ))}
                {isLoading && (
                  <div className="chat-message bot" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="typing-indicator" style={{ display: 'flex', gap: '4px' }}>
                      <span style={{ width: '6px', height: '6px', background: '#94a3b8', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both' }}></span>
                      <span style={{ width: '6px', height: '6px', background: '#94a3b8', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }}></span>
                      <span style={{ width: '6px', height: '6px', background: '#94a3b8', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }}></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <form className="chatbot-input-area" onSubmit={handleSend}>
                <div className="chatbot-input-wrapper">
                  <button 
                    type="button"
                    className={`chatbot-mic-btn ${isListening ? 'listening' : ''}`}
                    onClick={toggleVoiceInput}
                    aria-label={isListening ? "Stop listening" : "Start voice input"}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      cursor: 'pointer',
                      color: isListening ? '#ef4444' : 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px'
                    }}
                  >
                    <Mic size={18} className="chatbot-mic-icon" />
                  </button>
                  <input
                    type="text"
                    className="chatbot-input"
                    placeholder={`Ask in ${SUPPORTED_LANGUAGES.find(l => l.code === selectedLang)?.name.split(' ')[0]}...`}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <button 
                  type="submit" 
                  className="chatbot-send-btn" 
                  disabled={!input.trim() || isLoading}
                  aria-label="Send Message"
                >
                  <Send size={16} />
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* Floating Toggle Button */}
      {!isOpen && (
        <button 
          className="chatbot-toggle-btn" 
          onClick={toggleChat}
          aria-label="Open AI Assistant"
        >
          <Sparkles size={24} />
        </button>
      )}
      
      {/* Inline style for typing animation */}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default Chatbot;
