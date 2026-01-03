import {
  PATH_WORDS,
  PATH_WORD_FORMS,
  readJson,
  appendJson,
  requestAI,
  cleanJsonResponse,
  MODELS,
} from "@/lib";
import { unlink } from "fs/promises";

// --- Configuration ---
const OUTPUT_FILE = PATH_WORD_FORMS;
const MAX_RETRIES = 3;

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

// --- Orchestration ---

async function processWord(word: string, model: string): Promise<void> {
  const prompt = generatePrompt(word);
  let attempts = 0;

  while (attempts < MAX_RETRIES) {
    try {
      console.log(`[${model}] Processing: "${word}" (Attempt ${attempts + 1})`);

      if (model === MODELS.GEMINI_PRO) {
        // Carry over the 1-minute delay for Gemini if it's rate-limited
        await new Promise((r) => setTimeout(r, 60000));
      }

      const rawData = await requestAI(prompt, model, { maxRetries: 1 }); // Retries handled by the outer loop
      const forms = JSON.parse(cleanJsonResponse(rawData)) as WordForms;

      await appendJson(OUTPUT_FILE, forms);

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
    words = await readJson<string[]>(PATH_WORDS);
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
