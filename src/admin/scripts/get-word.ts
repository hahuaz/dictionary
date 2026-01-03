import {
  PATH_EXISTING_WORDS,
  PATH_WORDS,
  LOCAL_SAVE_DIR,
  ensureDir,
  readJson,
  writeJson,
  requestAI,
  cleanJsonResponse,
  sanitizeModelName,
  MODELS,
} from "@/lib";

import fs from "fs/promises";
import { join } from "path";
import { CreateWord, PartOfSpeech } from "@shared/types";
import { asWord } from "@/types";

// --- Configuration ---
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Selected models for extraction
const SELECTED_MODELS = [MODELS.DEEPSEEK, MODELS.GPT_OSS_120B];

// --- Logic for single word processing ---

async function processWord(word: string, model: string) {
  const prompt = `for the word "${word}", and you will provide a JSON containing its definitions, parts of speech, and example sentence for each definition. The JSON should be structured as below.
- Give only one example sentence per definition.
- directly return the JSON array without any extra text

Example output:
---
[
  {
    "definition": "The natural agent that stimulates sight and makes things visible",
    "partOfSpeech": "noun",
    "sentence": "The light from the sun is essential for life on Earth."
  },
  {
    "definition": "To make something start to burn",
    "partOfSpeech": "verb",
    "sentence": "He used a match to light the candle."
  },
  {
    "definition": "Having little weight; not heavy",
    "partOfSpeech": "adjective",
    "sentence": "This bag is very light, making it easy to carry."
  }
]`;

  console.log(`[${model}] Processing: "${word}"`);

  const rawResponse = await requestAI(prompt, model, {
    maxRetries: MAX_RETRIES,
    retryDelayMs: RETRY_DELAY_MS,
  });
  const cleaned = cleanJsonResponse(rawResponse);
  const parsed = JSON.parse(cleaned);

  const wordData: CreateWord = {
    word: asWord(word),
    definitions: parsed.map((item: any) => ({
      definition: (item.definition || item.meaning || "")
        .replace(/\.$/, "")
        .trim(),
      partOfSpeech: (
        item.partOfSpeech ||
        item.pos ||
        "noun"
      ).toLowerCase() as PartOfSpeech,
      sentences: [item.sentence || item.example || ""],
    })),
  };

  const outputDir = join(LOCAL_SAVE_DIR, "words", sanitizeModelName(model));
  await ensureDir(outputDir);

  const outputPath = join(outputDir, `${word}.json`);
  await writeJson(outputPath, [wordData]);

  console.log(`✅ Saved: ${word} [${model}]`);
}

// --- Main execution ---

async function executeScript() {
  console.log("--- Starting AI Word Extraction ---");

  try {
    // 1. Load words to process
    const words = await readJson<string[]>(PATH_WORDS, []);

    if (words.length === 0) {
      console.log("No words to process.");
      return;
    }

    // 2. Cleanup model directories for a fresh run
    for (const model of SELECTED_MODELS) {
      const modelDir = join(LOCAL_SAVE_DIR, "words", sanitizeModelName(model));
      await ensureDir(modelDir);
      const files = await fs.readdir(modelDir);
      await Promise.all(files.map((file) => fs.unlink(join(modelDir, file))));
      console.log(`Cleared directory: ${modelDir}`);
    }

    // 3. Process each word with each selected model
    for (const word of words) {
      for (const model of SELECTED_MODELS) {
        try {
          await processWord(word, model);
        } catch (error) {
          console.error(
            `❌ Failed word "${word}" with model "${model}":`,
            error
          );
        }
      }
    }
  } catch (error) {
    console.error("Critical error in executeScript:", error);
  }

  console.log("--- Extraction Complete ---");
}

executeScript().catch(console.error);
