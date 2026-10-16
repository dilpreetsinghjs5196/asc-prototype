import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase, db } from './supabase';
import { deidentifyTextForAI } from '../utils/phiMasking.js';

let cachedModels = null;
let currentModelIndex = 0;

export const getSettingsAndKey = async () => {
    try {
        const settings = await db.getSettings();
        // Secrets are never queried from public.settings. Fallback to local env only during local development.
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY || null;
        return { settings, apiKey };
    } catch (e) {
        console.error("Error fetching settings/key:", e);
        return { settings: null, apiKey: null };
    }
};

// Dynamically discover all valid, supported Gemini models for this API key
const getFallbackModels = async (apiKey) => {
    if (cachedModels && cachedModels.length > 0) {
        return cachedModels;
    }
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.models)) {
                // Filter models that support generateContent and contain "gemini" (exclude specialized audio/vision-only endpoints)
                const models = data.models
                    .filter(m => m.supportedGenerationMethods && 
                                 m.supportedGenerationMethods.includes("generateContent") && 
                                 m.name.toLowerCase().includes("gemini") && 
                                 !m.name.toLowerCase().includes("vision") && 
                                 !m.name.toLowerCase().includes("embedding") &&
                                 !m.name.toLowerCase().includes("1.0-pro")) // exclude legacy retired models
                    .map(m => m.name.replace("models/", ""));
                
                if (models.length > 0) {
                    // Sort preferred models to the top: fast flash models first, then pro models
                    models.sort((a, b) => {
                        const score = (name) => {
                            if (name === "gemini-2.5-flash" || name === "gemini-2.0-flash") return 1;
                            if (name === "gemini-1.5-flash" || name === "gemini-1.5-flash-002") return 2;
                            if (name.includes("flash-8b") || name.includes("flash-lite")) return 3;
                            if (name.includes("flash")) return 4;
                            if (name.includes("pro")) return 5;
                            return 6;
                        };
                        return score(a) - score(b);
                    });
                    console.info("[Gemini Auto-Fallback] Dynamically discovered active supported models:", models);
                    cachedModels = models;
                    return models;
                }
            }
        }
    } catch (e) {
        console.warn("[Gemini Auto-Fallback] Dynamic model list query failed, using resilient fallback array.", e);
    }

    // Resilient static defaults (excluding retired 1.0-pro)
    return [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
        "gemini-1.5-pro"
    ];
};

const createModelInstance = (apiKey, modelName) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: "You are a helpful AI assistant for an Ambulatory Surgery Center (ASC) called 'ASC Manager'. Your role is to assist administrators, surgeons, and nurses with questions related to outpatient surgery, ASC operations, CPT codes, patient management, and general medical inquiries relevant to a surgery center. Do not answer questions that are completely unrelated to medical or ASC operations. Be professional, concise, accurately parse all numerical counts, and helpful."
    });
};

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30; // Increased limit to support automatic model fallback cycling

let requestTimestamps = [];

const checkRateLimit = () => {
    const now = Date.now();
    requestTimestamps = requestTimestamps.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);

    if (requestTimestamps.length >= MAX_REQUESTS) {
        return true;
    }
    requestTimestamps.push(now);
    return false;
};

export const sendMessageToGemini = async (message, history = [], contextData = null) => {
    if (checkRateLimit()) {
        return "Rate limit exceeded. To ensure fair usage, please wait a moment before sending another message (Limit: 30 req/min across fallback models).";
    }

    const { settings, apiKey } = await getSettingsAndKey();

    if (settings && settings.ai_allowed_email) {
        try {
            const savedUser = localStorage.getItem('asc_auth_user') || localStorage.getItem('hospital_user');
            const currentUser = savedUser ? JSON.parse(savedUser) : null;

            if (!currentUser || currentUser.email !== settings.ai_allowed_email) {
                return `Access Denied: The AI Assistant is currently restricted to ${settings.ai_allowed_email}.`;
            }
        } catch (e) {
            console.error("Error verifying user permission:", e);
            return "Error verifying user permissions.";
        }
    }

    const sanitizedMessage = deidentifyTextForAI(message);
    const sanitizedContext = contextData ? deidentifyTextForAI(contextData) : null;

    // 1. Primary Architecture: Server-Side Edge Function Proxy (zero client secret exposure)
    try {
        const activeFacilityId = localStorage.getItem('asc_active_facility_id') || '00000000-0000-0000-0000-000000000002';
        const { data: proxyData, error: proxyError } = await supabase.functions.invoke('gemini-proxy', {
            body: {
                message: sanitizedMessage,
                history: history.map(msg => ({
                    role: msg.role === 'user' ? 'user' : 'model',
                    text: deidentifyTextForAI(msg.text)
                })),
                contextData: sanitizedContext,
                facilityId: activeFacilityId
            }
        });

        if (!proxyError && proxyData && proxyData.text) {
            return proxyData.text;
        }

        if (proxyError) {
            if (proxyError.status === 403) {
                return "Access Denied: Your account does not have AI authorization for this facility.";
            }
            if (proxyError.status === 401) {
                return "Authentication Required: Please log in to use the AI Assistant.";
            }
        }
    } catch (proxyEx) {
        console.info("[Gemini Proxy] Edge proxy unavailable, falling back to local runner:", proxyEx);
    }

    // 2. Development Fallback Runner (active only when local dev key is present)
    if (!apiKey) {
        return "AI Assistant is currently offline. Please configure GEMINI_API_KEY in Supabase Vault.";
    }

    const availableModels = await getFallbackModels(apiKey);
    let lastError = null;

    // Try starting from the current active model index, and cycle through all fallback models if quota/429/404 error occurs
    for (let i = 0; i < availableModels.length; i++) {
        const index = (currentModelIndex + i) % availableModels.length;
        const modelName = availableModels[index];

        try {
            const activeModel = createModelInstance(apiKey, modelName);

            const chat = activeModel.startChat({
                history: history.map(msg => ({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: deidentifyTextForAI(msg.text) }],
                })),
            });

            let finalMessage = sanitizedMessage;
            if (sanitizedContext) {
                finalMessage = `[System Data Context]:\n${sanitizedContext}\n\n[User Question]:\n${sanitizedMessage}`;
            }

            const result = await chat.sendMessage(finalMessage);
            const response = await result.response;
            const textOutput = response.text();

            currentModelIndex = index;
            if (i > 0) {
                console.info(`[Gemini Quota Fallback] Successfully switched to working model: ${modelName}`);
            }
            return textOutput;
        } catch (error) {
            console.warn(`[Gemini API Warning] Model ${modelName} encountered an error:`, error.message || error);
            lastError = error;

            // Check if error is quota exceeded, rate limit (429), resource exhausted, 503 overload, 404 model not found, or unsupported method
            const errorStr = (JSON.stringify(error) + (error.message || '')).toLowerCase();
            const isRecoverableError = 
                error.status === 429 || 
                error.status === 503 ||
                error.status === 404 ||
                error.status === 400 ||
                errorStr.includes("429") || 
                errorStr.includes("quota exceeded") || 
                errorStr.includes("resource_exhausted") ||
                errorStr.includes("overloaded") ||
                errorStr.includes("not found") ||
                errorStr.includes("not supported") ||
                errorStr.includes("too many requests");

            if (isRecoverableError) {
                console.info(`[Gemini Quota Fallback] Model ${modelName} unavailable or quota reached. Automatically switching to next backup model...`);
                continue;
            } else {
                if (errorStr.includes("api_key_invalid") || error.status === 403) {
                    break;
                }
                continue;
            }
        }
    }

    console.error("All Gemini AI model fallback endpoints exhausted or failed:", lastError);
    
    const errSummary = (JSON.stringify(lastError) + (lastError?.message || '')).toLowerCase();
    if (lastError?.status === 429 || errSummary.includes("429") || errSummary.includes("resource_exhausted") || errSummary.includes("quota exceeded")) {
        return `Quota exceeded for all active Gemini API models (${availableModels.join(', ')}). Your Google AI free-tier quota pool has been temporarily exhausted across all available models. Please pause briefly or upgrade your Google AI Studio API key plan.`;
    }
    return `Sorry, I encountered an error communicating with the AI service: ${lastError?.message || "Unknown error"}. Please check your API key configuration.`;
};
