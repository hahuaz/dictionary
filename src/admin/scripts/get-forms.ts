import {
  PATH_ALL_WORDS,
  PATH_PENDING_WORDS,
  PATH_NEW_WORDS,
  LOCAL_SAVE_DIR,
} from "@/lib";

import fs, { readdir, unlink } from "fs/promises";
import { PATH_WORDS_FOR_PROMPT } from "../../lib/constants";
import { CreateWord } from "@shared/types";
import { join } from "path";

import { GoogleGenAI } from "@google/genai";

// To run this code you need to install the following dependencies:
// npm install @google/genai mime
// npm install -D @types/node

async function gemini({ prompt, word }) {
  const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_FREE_GENERATIVE_LANGUAGE_KEY,
  });
  const config = {
    thinkingConfig: {
      thinkingBudget: -1,
    },
  };
  const model = "gemini-2.5-pro";
  // const model = "gemma-3-27b-it";
  const contents = [
    {
      role: "user",
      parts: [
        {
          text: prompt,
        },
      ],
    },
  ];

  const response = await ai.models.generateContentStream({
    model,
    config,
    contents,
  });
  let fileIndex = 0;
  // for await (const chunk of response) {
  //   console.log(chunk.text);
  // }
  // write to locale dir
  let fullResponse = "";
  for await (const chunk of response) {
    fullResponse += chunk.text;
  }
  return fullResponse;
}

async function executeScript() {
  // hit ollama api on port 11434 to say "hello"
  const availableModes = {
    _1: "gemma3:4b",
    _2: "gemma3:27b",
    _3: "gpt-oss:20b", // this doesn't work with format and returns thinking
    _4: "deepseek-v3.1:671b-cloud",
    _5: "gpt-oss:120b-cloud",
    _6: "qwen3-vl:235b-cloud",
    _7: "gemini-2.5-pro",
  };

  const wordsForPrompt = await fs.readFile(PATH_WORDS_FOR_PROMPT, "utf-8");
  const wordsForPromptArray = JSON.parse(wordsForPrompt);

  const selectedModels = [
    availableModes._4,
    // availableModes._5,
    // availableModes._7,
  ];

  try {
    // clean up model directories
    for (const curModel of selectedModels) {
      const directoryPath = LOCAL_SAVE_DIR + "/forms/" + curModel;
      const files = await readdir(directoryPath);

      const deletePromises = files.map((file) =>
        unlink(join(directoryPath, file))
      );

      await Promise.all(deletePromises);
    }
  } catch (error) {}

  for (const word of wordsForPromptArray) {
    const prompt = `For the word “${word}”, return a JSON object that includes, when applicable, its plural, comparative, superlative, present_participle, past_tense, and past_participle forms.
     The JSON should be structured as below.
- if prop is not applicable for the word, return null
- if word can't be noun, return null for plural
- directly return the JSON object without any extra text

Example output:
---
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
    console.log("word", word);

    let maxTry = 3;

    for (const curModel of selectedModels) {
      let tryCount = 0;
      let success = false;

      while (tryCount < maxTry && !success) {
        try {
          let data: any;

          if (curModel === availableModes._7) {
            // wait 1 min
            await new Promise((r) => setTimeout(r, 1000 * 60));
            console.log("gemini start");
            data = await gemini({ prompt, word });
          } else {
            console.log(curModel, "start");
            const response = await fetch(
              "http://172.17.16.1:11434/api/generate",
              {
                method: "POST",
                body: JSON.stringify({
                  model: curModel,
                  prompt,
                  // format: {
                  //   type: "array",
                  //   items: {
                  //     type: "object",
                  //     properties: {
                  //       definition: { type: "string" },
                  //       part_of_speech: { type: "string" },
                  //       sentence: { type: "string" },
                  //     },
                  //     required: ["definition", "part_of_speech", "sentence"],
                  //   },
                  // },
                  format: "json",
                  stream: false,
                }),
              }
            );
            data = await response.json();
            data = data.response ?? data;
          }

          // if data consist of ```json or ``` remove them
          data = String(data)
            .replace(/```json/g, "")
            .replace(/```/g, "")
            // replace undefined
            .replace(/undefined/g, "")
            .trim();

          const output = JSON.parse(data);

          // create model directory if not exists
          const modelDir = LOCAL_SAVE_DIR + "/forms/" + curModel;
          try {
            await fs.access(modelDir);
          } catch (error) {
            await fs.mkdir(modelDir, { recursive: true });
          }

          // append to index file of curModel
          const filePath =
            LOCAL_SAVE_DIR + "/forms/" + curModel + "/" + "index.json";
          let existingData: any[] = [];
          try {
            const fileContent = await fs.readFile(filePath, "utf-8");
            existingData = JSON.parse(fileContent);
          } catch (error) {
            existingData = [];
          }
          existingData.push(output);
          await fs.writeFile(filePath, JSON.stringify(existingData, null, 2));

          success = true;
          console.log("Saved word:", word, "model:", curModel);
        } catch (error) {
          console.log("err", error);
          tryCount++;
          if (tryCount >= maxTry) {
            console.log(
              "Max retries reached for word:",
              word,
              "model:",
              curModel
            );
          } else {
            // tiny backoff without changing much
            await new Promise((r) => setTimeout(r, 200 * tryCount));
          }
        }
      }
    }
  }
}
executeScript();
