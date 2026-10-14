import { sendMessageToGemini } from '../../lib/gemini.js';
import { hasSurgeonPerformedCpt } from './SurgeonIntelligence.js';

/**
 * CPT Code Agent
 * Analyzes natural language procedure descriptions and maps them to CPT codes
 * using Gemini API and historical surgeon data.
 */
export const recommendCPTCodes = async (procedureDescription, cptRegistry, surgeriesData, selectedSurgeon) => {
    let contextData = "Available CPT Codes Registry:\n";
    
    if (selectedSurgeon && selectedSurgeon !== 'All') {
        const historicallyDone = cptRegistry.filter(c => hasSurgeonPerformedCpt(surgeriesData, selectedSurgeon, c.code));
        if (historicallyDone.length > 0) {
            contextData += `Note: The surgeon (${selectedSurgeon}) has historically performed the following CPT codes. Prioritize these if they match the description:\n`;
            contextData += historicallyDone.map(c => `${c.code}: ${c.description} (Category: ${c.category || 'N/A'})`).join('\n') + "\n\n";
        }
    }
    
    // List all codes briefly for the LLM to know the available universe
    const codeList = cptRegistry.map(c => `${c.code}: ${c.description}`).join('\n');
    contextData += `Full CPT Registry:\n${codeList}\n`;

    const prompt = `You are a Medical CPT Coding Agent.
Your task is to analyze the following natural language procedure description:
"${procedureDescription}"

Return a JSON array of the most likely CPT codes from the provided registry that match this description.
Consider the body part, procedure type, and provided historical context.

For each candidate, provide:
- "code": the CPT code string
- "description": the description
- "confidence": a number between 0 and 1 (0.99 being very high)
- "reasoning": why this matches the description
- "warnings": any ambiguity or missing information preventing a perfect match

Rank the candidates from highest confidence to lowest. Return ONLY valid JSON format with no extra text or markdown wrappers outside the JSON array. Example:
[
  {
    "code": "29881",
    "description": "Arthroscopy, knee, surgical; with meniscectomy",
    "confidence": 0.95,
    "reasoning": "Direct match for knee arthroscopy with meniscus repair.",
    "warnings": "Ensure it was medial or lateral."
  }
]
`;

    try {
        const responseText = await sendMessageToGemini(prompt, [], contextData);
        
        let jsonString = responseText;
        if (jsonString.includes('```json')) {
            jsonString = jsonString.split('```json')[1].split('```')[0].trim();
        } else if (jsonString.includes('```')) {
            jsonString = jsonString.split('```')[1].split('```')[0].trim();
        }

        return JSON.parse(jsonString);
    } catch (e) {
        console.error("Failed to parse CPT Agent response:", e);
        throw new Error("Failed to parse AI response into structured CPT recommendations. Ensure API key is valid and quota is not exceeded.", { cause: e });
    }
};
