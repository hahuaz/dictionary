import { GoogleGenAI } from "@google/genai";

export const MODELS = {
  GEMINI_FLASH: "gemini-2.0-flash",
  GEMINI_PRO: "gemini-2.5-pro",
  DEEPSEEK: "deepseek-v3.1:671b-cloud",
  GPT_OSS_120B: "gpt-oss:120b-cloud",
};

const OLLAMA_API_URL = "http://172.17.16.1:11434/api/generate";

export async function callGemini(
  prompt: string,
  model: string = "gemini-2.0-flash",
  apiKey: string = process.env.GOOGLE_FREE_GENERATIVE_LANGUAGE_KEY!
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContentStream({
    model,
    config: { thinkingConfig: { thinkingBudget: -1 } },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  let fullResponse = "";
  for await (const chunk of response) {
    fullResponse += chunk.text;
  }
  return fullResponse;
}

export async function callOllama(
  prompt: string,
  model: string
): Promise<string> {
  const response = await fetch(OLLAMA_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      format: "json",
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`);
  }

  const data: any = await response.json();
  return data.response ?? data;
}

export function cleanJsonResponse(data: string): string {
  return data
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .replace(/undefined/g, "")
    .trim();
}

export function sanitizeModelName(name: string) {
  return name.replace(/[:*?"<>|]/g, "_");
}

export interface AIRequestOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

export async function requestAI(
  prompt: string,
  model: string,
  options: AIRequestOptions = {}
): Promise<string> {
  const { maxRetries = 3, retryDelayMs = 1000 } = options;
  let tryCount = 0;

  while (tryCount < maxRetries) {
    try {
      if (model.includes("gemini")) {
        // Carry over the 1-minute delay logic for Gemini if it's from get-forms style,
        // but let's keep it simple here and let callers handle specific delays if needed.
        return await callGemini(prompt, model);
      } else {
        return await callOllama(prompt, model);
      }
    } catch (error) {
      tryCount++;
      console.warn(
        `[${model}] Retry ${tryCount}/${maxRetries} - Error:`,
        error instanceof Error ? error.message : error
      );
      if (tryCount >= maxRetries) throw error;
      await new Promise((r) => setTimeout(r, retryDelayMs * tryCount));
    }
  }
  throw new Error("Max retries reached");
}
