import { PATH_WORDS, PATH_WORD_FORMS } from "@/lib";
import fs, { unlink } from "fs/promises";
import { GoogleGenAI } from "@google/genai";

// --- Configuration ---
const OUTPUT_FILE = PATH_WORD_FORMS;
const MAX_RETRIES = 3;
const OLLAMA_API_URL = "http://172.17.16.1:11434/api/generate";

const MODELS = {
  DEEPSEEK: "deepseek-v3.1:671b-cloud",
  GEMINI: "gemini-2.5-pro",
};

const SELECTED_MODELS = [MODELS.DEEPSEEK];

// --- Types ---
interface WordForms {
  word: string;
  plural: string | null;
  comparative: string | null;
  superlative: string | null;
  present_participle: string | null;
  past_tense: string | null;
  past_participle: string | null;
}

function generatePrompt(word: string): string {
  return `For the word “${word}”, return a JSON object that includes, when applicable, its plural, comparative, superlative, present_participle, past_tense, and past_participle forms.
The JSON should be structured as below.
- if prop is not applicable for the word, return null
- if word can't be noun, return null for plural
- directly return the JSON object without any extra text

Example output:
{
  "word": "light",
  "plural": "lights",
  "comparative": "lighter",
  "superlative": "lightest",
  "present_participle": "lighting",
  "past_tense": "lit",
  "past_participle": "lit"
}
`;
}

// --- API Helpers ---

/**
 * Calls Gemini API with "Thinking" configuration if applicable.
 */
async function callGemini(prompt: string): Promise<string> {
  const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_FREE_GENERATIVE_LANGUAGE_KEY!,
  });

  // Replicating the user's specific streaming logic and config
  const config = {
    thinkingConfig: {
      thinkingBudget: -1,
    },
  };

  const response = await ai.models.generateContentStream({
    model: MODELS.GEMINI,
    config,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  let fullResponse = "";
  for await (const chunk of response) {
    fullResponse += chunk.text;
  }
  return fullResponse;
}

/**
 * Calls local Ollama API.
 */
async function callOllama(model: string, prompt: string): Promise<string> {
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

/**
 * Cleans the AI response and parses it as JSON.
 */
function parseAiResponse(data: string | object): WordForms {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .replace(/undefined/g, "")
    .trim();

  return JSON.parse(cleaned);
}

// --- Persistence Helpers ---

async function saveResult(result: WordForms) {
  let data: WordForms[] = [];
  try {
    const content = await fs.readFile(OUTPUT_FILE, "utf-8");
    data = JSON.parse(content);
  } catch {
    // File doesn't exist yet
  }

  data.push(result);
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(data, null, 2));
}

// --- Orchestration ---

async function processWord(word: string, model: string): Promise<void> {
  const prompt = generatePrompt(word);
  let attempts = 0;

  while (attempts < MAX_RETRIES) {
    try {
      console.log(`[${model}] Processing: "${word}" (Attempt ${attempts + 1})`);

      let rawData: string;
      if (model === MODELS.GEMINI) {
        // Carry over the 1-minute delay for Gemini if it's rate-limited
        await new Promise((r) => setTimeout(r, 60000));
        rawData = await callGemini(prompt);
      } else {
        rawData = await callOllama(model, prompt);
      }

      const forms = parseAiResponse(rawData);
      await saveResult(forms);

      console.log(`[${model}] Success: "${word}"`);
      return;
    } catch (error) {
      attempts++;
      console.error(
        `[${model}] Error for "${word}":`,
        error instanceof Error ? error.message : error
      );

      if (attempts < MAX_RETRIES) {
        const delay = 1000 * attempts;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  console.error(`[${model}] MAX RETRIES REACHED for "${word}"`);
}

async function main() {
  console.log("--- Starting Word Forms Extraction ---");

  // Initial cleanup
  try {
    await unlink(OUTPUT_FILE);
  } catch {}

  // Load words
  let words: string[];
  try {
    const rawWords = await fs.readFile(PATH_WORDS, "utf-8");
    words = JSON.parse(rawWords);
  } catch (error) {
    console.error("Could not load words from prompt file.");
    return;
  }

  console.log(`Processing ${words.length} words`);

  for (const word of words) {
    for (const model of SELECTED_MODELS) {
      await processWord(word, model);
    }
  }

  console.log("--- Extraction Complete ---");
}

main().catch(console.error);
