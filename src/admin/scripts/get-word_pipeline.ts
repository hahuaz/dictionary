import { PATH_WORDS, LOCAL_SAVE_DIR } from "@/lib";

import fs from "fs/promises";
import { dirname, join } from "path";
import { GoogleGenAI } from "@google/genai";
import { CreateWord, PartOfSpeech } from "@shared/types";
import { asWord } from "@/types";

// --- Configuration ---
const OLLAMA_API_URL = "http://172.17.16.1:11434/api/generate";
const MAX_RETRIES = 3;
const WAIT_MS_BETWEEN_RETRIES = 500;
// there are two flows to generate word. one is to generate word from single prompt and other is to generate word from multiple prompts via pipeline. Create pipeline directory to store pipeline related files.
const PIPELINE_DIR = join(LOCAL_SAVE_DIR, "pipeline");

const MODELS = {
  GEMINI: "gemini-2.5-pro",
  DEEPSEEK: "deepseek-v3.1:671b-cloud",
  GPT_OSS_120B: "gpt-oss:120b-cloud",
  QWEN_VL: "qwen3-vl:235b-cloud",
};

const SELECTED_MODELS = [MODELS.DEEPSEEK, MODELS.GPT_OSS_120B];

const sanitizePath = (name: string) => name.replace(/[:*?"<>|]/g, "_");

// --- AI Service Helpers ---

async function callGemini(prompt: string, model: string): Promise<string> {
  const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_FREE_GENERATIVE_LANGUAGE_KEY!,
  });

  const config = {
    thinkingConfig: { thinkingBudget: -1 },
  };

  const response = await ai.models.generateContentStream({
    model,
    config,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  let streamedText = "";
  for await (const chunk of response) {
    streamedText += chunk.text;
  }
  return streamedText;
}

async function callOllama(prompt: string, model: string): Promise<string> {
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

async function runAIWithRetry(prompt: string, model: string): Promise<string> {
  let tryCount = 0;

  while (tryCount < MAX_RETRIES) {
    try {
      let data: string;

      if (model === MODELS.GEMINI) {
        data = await callGemini(prompt, model);
      } else {
        data = await callOllama(prompt, model);
      }

      // Cleanup formatting artifacts
      const cleaned = data
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .replace(/undefined/g, "")
        .replace(/^"/, "")
        .replace(/"$/, "")
        .trim();

      return cleaned;
    } catch (err) {
      tryCount++;
      console.log(
        `[${model}] Retry ${tryCount}/${MAX_RETRIES} —`,
        err instanceof Error ? err.message : err
      );

      if (tryCount >= MAX_RETRIES) throw err;
      await new Promise((r) =>
        setTimeout(r, WAIT_MS_BETWEEN_RETRIES * tryCount)
      );
    }
  }
  throw new Error("Max retries reached");
}

async function getDefinitions(word: string, model: string): Promise<string[]> {
  const prompt = `for the word "${word}", give definitions as string of array. don't include same meaning twice. return only the array in json format. do not add any explanations.`;
  const raw = await runAIWithRetry(prompt, model);
  return JSON.parse(raw);
}

async function reorderDefinitions(
  word: string,
  definitions: string[],
  model: string
): Promise<string[]> {
  const prompt = `reorder the following definitions for the word "${word}" from most common to least common usage. return only the array in json format. do not add any explanations.
  the definitions: ${JSON.stringify(definitions)}`;
  const raw = await runAIWithRetry(prompt, model);
  return JSON.parse(raw);
}

async function getDefinitionDetails(word: string, def: string, model: string) {
  const promptExample = `for the definition "${def}" of the word "${word}", give one simple example sentence using the word in that meaning. return only the sentence as a string. do not add any explanations.`;
  const exampleSentence = await runAIWithRetry(promptExample, model);

  const promptPOS = `for the sentence "${exampleSentence}" using the word "${word}", identify the part of speech of the word in that sentence. return only the part of speech as a string (e.g., noun, verb, adjective). do not add any explanations.`;
  const partOfSpeech = await runAIWithRetry(promptPOS, model);

  return {
    definition: def,
    sentences: [exampleSentence],
    partOfSpeech: partOfSpeech.toLowerCase() as PartOfSpeech,
  };
}

async function executeScript() {
  console.log("--- Starting Definitions Extraction ---");

  let words: string[];
  try {
    const rawWords = await fs.readFile(PATH_WORDS, "utf-8");
    words = JSON.parse(rawWords);
  } catch (error) {
    console.error("Could not load words from file.");
    return;
  }

  for (const word of words) {
    for (const curModel of SELECTED_MODELS) {
      try {
        console.log(`[${curModel}] Processing: "${word}"`);

        // 1. Get initial definitions
        let defs = await getDefinitions(word, curModel);

        // 2. Reorder them
        defs = await reorderDefinitions(word, defs, curModel);

        // Save intermediate result
        const intermediatePath = join(
          PIPELINE_DIR,
          "defs",
          sanitizePath(curModel),
          `${word}.json`
        );
        await fs.mkdir(dirname(intermediatePath), { recursive: true });
        await fs.writeFile(
          intermediatePath,
          JSON.stringify({ word, data: defs }, null, 2)
        );

        // 3. Get details for each definition
        const defsWithExamples: CreateWord["definitions"] = [];
        for (const def of defs) {
          const detail = await getDefinitionDetails(word, def, curModel);
          defsWithExamples.push(detail);
        }

        // 4. Save Final Output
        const finalPath = join(
          PIPELINE_DIR,
          "words",
          sanitizePath(curModel),
          `${word}.json`
        );
        await fs.mkdir(dirname(finalPath), { recursive: true });

        const wordOutput: CreateWord[] = [
          {
            word: asWord(word),
            definitions: defsWithExamples,
          },
        ];

        await fs.writeFile(finalPath, JSON.stringify(wordOutput, null, 2));
        console.log(`✅ Saved: ${word} [${curModel}]`);
      } catch (error) {
        console.error(
          `❌ Fail: ${word} [${curModel}]`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  console.log("--- Extraction Complete ---");
}

executeScript().catch(console.error);
