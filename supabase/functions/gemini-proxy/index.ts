import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_PROMPT_CHARS = 32000;
const MAX_CONTEXT_CHARS = 64000;

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. Authenticate caller session via Bearer JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authentication credentials" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? supabaseAnonKey;

    // Client bound to caller's JWT for authorization checks
    const supabaseCaller = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseCaller.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse and validate input payload
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(
        JSON.stringify({ error: "Invalid request payload format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { message, history = [], contextData = null, facilityId, mode = 'chat' } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Message parameter is required and cannot be empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (message.length > MAX_PROMPT_CHARS) {
      return new Response(
        JSON.stringify({ error: `Message exceeds maximum allowed length of ${MAX_PROMPT_CHARS} characters` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (contextData && typeof contextData === "string" && contextData.length > MAX_CONTEXT_CHARS) {
      return new Response(
        JSON.stringify({ error: `Context data exceeds maximum length of ${MAX_CONTEXT_CHARS} characters` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Verify facility authorization & RBAC permissions using elevated service client
    const targetFacilityId = facilityId || '00000000-0000-0000-0000-000000000002';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: membership, error: memError } = await supabaseAdmin
      .from("facility_memberships")
      .select("role, is_active")
      .eq("user_id", user.id)
      .eq("facility_id", targetFacilityId)
      .single();

    if (memError || !membership || !membership.is_active) {
      return new Response(
        JSON.stringify({ error: "Access Denied: You lack active membership for the requested facility" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Securely acquire master Gemini API key from server environment
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      console.error("[gemini-proxy] GEMINI_API_KEY is not configured in server environment secrets.");
      return new Response(
        JSON.stringify({ error: "Server-side AI configuration is incomplete. Contact facility administrator." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Structure payload for Google Generative Language API
    let systemInstruction = "You are an intelligent clinical and operational assistant for an Ambulatory Surgery Center (ASC Manager). Be professional, concise, accurate with numerical counts, and ensure patient privacy.";
    if (mode === "cpt-coding-assistant") {
      systemInstruction = `You are an expert Certified Professional Coder (CPC) for an Ambulatory Surgery Center (ASC).
Analyze the operative documentation, extract documented surgical procedures, and suggest matching candidate CPT codes.
Do NOT invent clinical facts or procedures not documented. If laterality, approach, or anatomical compartment is ambiguous, include it in "warnings".
Return ONLY valid JSON matching this exact structure:
{
  "candidates": [
    {
      "code": "29881",
      "cpt_code": "29881",
      "description": "Arthroscopy, knee, surgical; with meniscectomy (medial or lateral)",
      "confidence": 0.95,
      "confidence_score": 0.95,
      "documentation_excerpt": "verbatim text excerpt from note supporting procedure",
      "clinical_rationale": "why this CPT code matches the surgical technique",
      "suggested_modifiers": ["RT"],
      "suggested_laterality": "RIGHT",
      "warnings": []
    }
  ]
}`;
    }
    let fullPrompt = message;
    if (contextData) {
      fullPrompt = `[ASC Operational Database Context]:\n${contextData}\n\n[User Inquery]:\n${message}`;
    }

    // Format chat turns if history provided
    const formattedContents = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const msg of history.slice(-10)) { // limit to last 10 turns
        if (msg && msg.text) {
          formattedContents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: String(msg.text).slice(0, MAX_PROMPT_CHARS) }]
          });
        }
      }
    }
    formattedContents.push({
      role: 'user',
      parts: [{ text: fullPrompt }]
    });

    const googleEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

    const googleResponse = await fetch(googleEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: formattedContents,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048
        }
      })
    });

    if (!googleResponse.ok) {
      const errStatus = googleResponse.status;
      const errText = await googleResponse.text();
      console.warn(`[gemini-proxy] Upstream Google API returned status ${errStatus}:`, errText);

      if (errStatus === 429) {
        return new Response(
          JSON.stringify({ error: "Upstream Google AI quota pool is temporarily exhausted. Please retry shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "AI communication error with upstream provider." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await googleResponse.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated by AI model.";

    if (mode === "cpt-coding-assistant") {
      let parsed = null;
      try {
        let cleanJson = replyText;
        if (cleanJson.includes("```json")) {
          cleanJson = cleanJson.split("```json")[1].split("```")[0].trim();
        } else if (cleanJson.includes("```")) {
          cleanJson = cleanJson.split("```")[1].split("```")[0].trim();
        }
        parsed = JSON.parse(cleanJson);
      } catch (parseErr) {
        console.warn("[gemini-proxy] JSON parse error for cpt-coding-assistant:", parseErr);
      }
      return new Response(
        JSON.stringify({
          success: true,
          candidates: parsed?.candidates || [],
          raw: replyText
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return sanitized text output — never exposing internal secrets
    return new Response(
      JSON.stringify({ text: replyText }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[gemini-proxy] Unhandled exception:", err?.message || err);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred while processing your AI request." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
