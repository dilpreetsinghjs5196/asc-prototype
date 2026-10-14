import { getSettingsAndKey } from './gemini';

// Verified Google AI Studio Multimodal Live streaming endpoints on v1beta (Free Tier compatible)
const LIVE_CONFIGS = [
  { apiVersion: "v1beta", model: "models/gemini-2.0-flash-exp" },
  { apiVersion: "v1beta", model: "models/gemini-2.0-flash" },
  { apiVersion: "v1beta", model: "models/gemini-2.0-flash-001" },
  { apiVersion: "v1alpha", model: "models/gemini-2.0-flash-exp" },
  { apiVersion: "v1beta", model: "models/gemini-2.5-flash" },
  { apiVersion: "v1beta", model: "models/gemini-3.5-live-translate-preview" }
];

let currentConfigIndex = 0;

// Helper functions for PCM converting and Base64 encoding/decoding
function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function int16ToFloat32(int16Buffer) {
  const int16 = new Int16Array(int16Buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    const s = int16[i];
    float32[i] = s < 0 ? s / 0x8000 : s / 0x7FFF;
  }
  return float32;
}

// Inline AudioWorklet for extracting PCM chunks cleanly
const workletCode = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      for (let i = 0; i < channelData.length; i++) {
        this.buffer[this.bufferIndex++] = channelData[i];
        if (this.bufferIndex >= this.bufferSize) {
          this.port.postMessage(this.buffer);
          this.bufferIndex = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

export class GeminiLiveSession {
  constructor({
    model = null,
    onStatusChange,
    onVolumeChange,
    onAudioPlaybackStart,
    onAudioPlaybackEnd,
    onTextReceived,
    onError
  } = {}) {
    this.initialModel = model;
    this.onStatusChange = onStatusChange || (() => {});
    this.onVolumeChange = onVolumeChange || (() => {});
    this.onAudioPlaybackStart = onAudioPlaybackStart || (() => {});
    this.onAudioPlaybackEnd = onAudioPlaybackEnd || (() => {});
    this.onTextReceived = onTextReceived || (() => {});
    this.onError = onError || (() => {});

    this.ws = null;
    this.mediaStream = null;
    this.inputAudioContext = null;
    this.playbackAudioContext = null;
    this.workletNode = null;
    this.scriptProcessor = null;
    this.isMuted = false;
    this.isConnected = false;
    this.isSetupComplete = false;
    this.nextPlayTime = 0;
    this.activeSources = [];
    this.workletUrl = null;
    this.retryCount = 0;
    this.fullDatabaseContext = "";
    this.connectionLogs = [];
  }

  async connect(systemInstructionOrContext = "", retryAttempt = false) {
    try {
      if (!retryAttempt) {
        this.fullDatabaseContext = systemInstructionOrContext;
        this.retryCount = 0;
        this.connectionLogs = [];
        this.onStatusChange('Connecting to Live Voice AI...');
      }

      const { apiKey } = await getSettingsAndKey();
      if (!apiKey) {
        throw new Error("Gemini API Key is missing. Please add it in Settings -> AI Configuration.");
      }

      const currentConfig = LIVE_CONFIGS[currentConfigIndex % LIVE_CONFIGS.length];
      const activeModel = currentConfig.model;
      const apiVer = currentConfig.apiVersion;

      console.info(`[Gemini Live] Connecting via ${apiVer} with model: ${activeModel}`);
      this.onStatusChange(`Connecting to ${activeModel.replace('models/', '')}...`);

      // 1. Request microphone permission
      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      }

      // 2. Setup Playback Audio Context
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!this.playbackAudioContext || this.playbackAudioContext.state === 'closed') {
        this.playbackAudioContext = new AudioContextClass({ sampleRate: 24000 });
        this.nextPlayTime = this.playbackAudioContext.currentTime;
      }

      // 3. Setup Input Audio Context & Microphone Processing
      if (!this.inputAudioContext || this.inputAudioContext.state === 'closed') {
        this.inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
        const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);

        try {
          const blob = new Blob([workletCode], { type: 'application/javascript' });
          this.workletUrl = URL.createObjectURL(blob);
          await this.inputAudioContext.audioWorklet.addModule(this.workletUrl);

          this.workletNode = new AudioWorkletNode(this.inputAudioContext, 'pcm-processor');
          this.workletNode.port.onmessage = (event) => {
            this.handleAudioInput(event.data);
          };
          source.connect(this.workletNode);
          this.workletNode.connect(this.inputAudioContext.destination);
        } catch (e) {
          console.warn("AudioWorklet fallback to ScriptProcessor:", e);
          this.scriptProcessor = this.inputAudioContext.createScriptProcessor(2048, 1, 1);
          this.scriptProcessor.onaudioprocess = (event) => {
            const inputBuffer = event.inputBuffer.getChannelData(0);
            this.handleAudioInput(new Float32Array(inputBuffer));
          };
          source.connect(this.scriptProcessor);
          this.scriptProcessor.connect(this.inputAudioContext.destination);
        }
      }

      // 4. Connect WebSocket to Gemini Live Multimodal API
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVer}.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[Gemini Live] WebSocket open (${apiVer}). Sending setup for ${activeModel}...`);
        this.isConnected = true;
        this.isSetupComplete = false;

        const setupPayload = {
          setup: {
            model: activeModel,
            generationConfig: {
              responseModalities: ["AUDIO"]
            },
            systemInstruction: {
              parts: [{ text: "You are an intelligent real-time conversational voice assistant for an Ambulatory Surgery Center (ASC Manager). Speak accurately, concisely, and professionally." }]
            }
          }
        };
        this.ws.send(JSON.stringify(setupPayload));
      };

      this.ws.onmessage = async (event) => {
        try {
          let jsonStr = event.data;
          if (event.data instanceof Blob) {
            jsonStr = await event.data.text();
          }
          const data = JSON.parse(jsonStr);

          // Handle Setup Completion
          if (data.setupComplete) {
            console.info(`[Gemini Live] Setup confirmed by server for ${activeModel} (${apiVer}). Ready!`);
            this.isSetupComplete = true;
            this.onStatusChange('Connected - Listening...');

            if (this.fullDatabaseContext && this.fullDatabaseContext.trim()) {
              const contextPayload = {
                clientContent: {
                  turns: [
                    {
                      role: "user",
                      parts: [{ text: `[SYSTEM HOSPITAL DATABASE CONTEXT FOR VOICE SESSION]:\n${this.fullDatabaseContext}\n\nAcknowledge briefly that you are ready and have loaded the hospital database.` }]
                    }
                  ],
                  turnComplete: true
                }
              };
              this.ws.send(JSON.stringify(contextPayload));
            }
            return;
          }

          // Handle Server Content (Audio / Text Responses)
          if (data.serverContent) {
            if (data.serverContent.interrupted) {
              this.stopAllPlayback();
            }

            const modelTurn = data.serverContent.modelTurn;
            if (modelTurn && modelTurn.parts) {
              for (const part of modelTurn.parts) {
                if (part.inlineData && part.inlineData.data) {
                  this.playAudioChunk(part.inlineData.data);
                }
                if (part.text) {
                  this.onTextReceived(part.text);
                }
              }
            }
          }
        } catch (err) {
          console.error("Error parsing Live WebSocket message:", err);
        }
      };

      this.ws.onerror = (error) => {
        console.warn(`[Gemini Live] WebSocket error on ${activeModel} (${apiVer}):`, error);
      };

      this.ws.onclose = (event) => {
        const reasonStr = event.reason ? ` (Reason: ${event.reason})` : '';
        const logMsg = `${activeModel} (${apiVer}): Code ${event.code}${reasonStr}`;
        console.warn(`[Gemini Live] WebSocket closed: ${logMsg}. setupComplete: ${this.isSetupComplete}`);
        this.connectionLogs.push(logMsg);
        this.isConnected = false;

        // Rate limit protection: Wait 2.5 seconds before attempting backup endpoint to prevent Google Free Tier 429 TooManyRequests
        if (!this.isSetupComplete && this.retryCount < LIVE_CONFIGS.length - 1) {
          this.retryCount += 1;
          currentConfigIndex = (currentConfigIndex + 1) % LIVE_CONFIGS.length;
          const nextCfg = LIVE_CONFIGS[currentConfigIndex];
          console.info(`[Gemini Live Fallback] Waiting 2.5s cooldown before retrying with ${nextCfg.model} (${nextCfg.apiVersion}) to avoid rate limits...`);
          this.onStatusChange(`Switching endpoint (${this.retryCount}/${LIVE_CONFIGS.length}) in 2s...`);
          
          if (this.ws) {
            try { this.ws.close(); } catch (err) { console.debug('[Gemini Live] Notice closing ws:', err); }
            this.ws = null;
          }
          
          setTimeout(() => {
            this.connect(this.fullDatabaseContext, true);
          }, 2500);
          return;
        }

        if (!this.isSetupComplete && this.retryCount >= LIVE_CONFIGS.length - 1) {
          this.onError(`Unable to connect after checking all endpoints.\nDiagnostics:\n${this.connectionLogs.join('\n')}\n\nNote: If you experienced 429 TooManyRequests on Free Tier, please wait 1 minute before retrying.`);
        }

        this.onStatusChange('Disconnected');
        this.stopMedia();
      };

    } catch (err) {
      console.error("Failed to initialize Gemini Live Voice Session:", err);
      this.onError(err.message || "Failed to initiate Live Voice conversation.");
      this.disconnect();
    }
  }

  handleAudioInput(float32Array) {
    if (!this.isConnected || !this.isSetupComplete || this.isMuted || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    let sum = 0;
    for (let i = 0; i < float32Array.length; i++) {
      sum += float32Array[i] * float32Array[i];
    }
    const rms = Math.sqrt(sum / float32Array.length);
    this.onVolumeChange(Math.min(1, rms * 5));

    const pcmBuffer = floatTo16BitPCM(float32Array);
    const base64Data = arrayBufferToBase64(pcmBuffer);

    const audioPayload = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "audio/pcm;rate=16000",
            data: base64Data
          }
        ]
      }
    };
    this.ws.send(JSON.stringify(audioPayload));
  }

  playAudioChunk(base64Data, sampleRate = 24000) {
    if (!this.playbackAudioContext) return;

    try {
      const arrayBuffer = base64ToArrayBuffer(base64Data);
      const float32Data = int16ToFloat32(arrayBuffer);

      const audioBuffer = this.playbackAudioContext.createBuffer(
        1,
        float32Data.length,
        sampleRate
      );
      audioBuffer.getChannelData(0).set(float32Data);

      const source = this.playbackAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackAudioContext.destination);

      const currentTime = this.playbackAudioContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;

      if (this.activeSources.length === 0) {
        this.onAudioPlaybackStart();
      }
      this.activeSources.push(source);

      source.onended = () => {
        this.activeSources = this.activeSources.filter(s => s !== source);
        if (this.activeSources.length === 0) {
          this.onAudioPlaybackEnd();
        }
      };
    } catch (e) {
      console.error("Error playing received PCM audio chunk:", e);
    }
  }

  stopAllPlayback() {
    this.activeSources.forEach(source => {
      try { source.stop(); } catch (err) { console.debug('[Gemini Live] Notice stopping audio source:', err); }
    });
    this.activeSources = [];
    if (this.playbackAudioContext) {
      this.nextPlayTime = this.playbackAudioContext.currentTime;
    }
    this.onAudioPlaybackEnd();
  }

  setMuted(muted) {
    this.isMuted = muted;
    if (muted) {
      this.onVolumeChange(0);
    }
  }

  sendTextMessage(text) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && text.trim()) {
      const payload = {
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [{ text: text.trim() }]
            }
          ],
          turnComplete: true
        }
      };
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  stopMedia() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.workletNode) {
      try { this.workletNode.disconnect(); } catch (err) { console.debug('[Gemini Live] Notice disconnecting worklet:', err); }
      this.workletNode = null;
    }
    if (this.scriptProcessor) {
      try { this.scriptProcessor.disconnect(); } catch (err) { console.debug('[Gemini Live] Notice disconnecting processor:', err); }
      this.scriptProcessor = null;
    }
    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
      try { this.inputAudioContext.close(); } catch (err) { console.debug('[Gemini Live] Notice closing input context:', err); }
      this.inputAudioContext = null;
    }
    if (this.playbackAudioContext && this.playbackAudioContext.state !== 'closed') {
      try { this.playbackAudioContext.close(); } catch (err) { console.debug('[Gemini Live] Notice closing playback context:', err); }
      this.playbackAudioContext = null;
    }
    if (this.workletUrl) {
      try { URL.revokeObjectURL(this.workletUrl); } catch (err) { console.debug('[Gemini Live] Notice revoking worklet URL:', err); }
      this.workletUrl = null;
    }
    this.stopAllPlayback();
    this.isSetupComplete = false;
  }

  disconnect() {
    this.isConnected = false;
    this.isSetupComplete = false;
    this.stopMedia();
    if (this.ws) {
      try { this.ws.close(); } catch (err) { console.debug('[Gemini Live] Notice closing ws on disconnect:', err); }
      this.ws = null;
    }
    this.onStatusChange('Disconnected');
  }
}
