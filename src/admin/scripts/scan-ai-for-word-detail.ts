import {
  PATH_EXISTING_WORDS,
  PATH_FILTERED_WORDS,
  PATH_CANDIDATE_WORDS,
  LOCAL_SAVE_DIR,
} from "@/lib";

import fs, { readdir, unlink } from "fs/promises";
import { PATH_WORDS } from "../../lib/constants";
import { CreateWord } from "@shared/types";
import { join } from "path";

import { GoogleGenAI } from "@google/genai";

async function createDifferenceFile() {
  try {
    // Read and parse the first JSON file
    const file1Content = await fs.readFile(PATH_EXISTING_WORDS, "utf-8");
    const file1Words: string[] = JSON.parse(file1Content);

    // Read and parse the second JSON file
    const file2Content = await fs.readFile(PATH_CANDIDATE_WORDS, "utf-8");
    const file2Words: string[] = JSON.parse(file2Content);

    // Create a Set from file1 for faster lookup
    const file1Set = new Set(file1Words);

    // Find words in file2 that are not in file1
    const differenceWords = file2Words.filter((word) => !file1Set.has(word));

    // Write the result to a third JSON file
    await fs.writeFile(
      PATH_FILTERED_WORDS,
      JSON.stringify(differenceWords, null, 2)
    );

    console.log(`Successfully created  with ${differenceWords.length} words`);
    console.log("Difference words:", differenceWords);
  } catch (error) {
    console.error("Error processing files:", error);
  }
}
// createDifferenceFile();

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
    _4: "deepseek-v3.1:671b-cloud",
    _5: "gpt-oss:120b-cloud",
  };

  const wordsForPrompt = await fs.readFile(PATH_WORDS, "utf-8");
  const wordsForPromptArray = JSON.parse(wordsForPrompt);

  const selectedModels = [availableModes._4, availableModes._5];

  try {
    // clean up model directories
    for (const curModel of selectedModels) {
      const directoryPath = LOCAL_SAVE_DIR + "/words/" + curModel;
      const files = await readdir(directoryPath);

      const deletePromises = files.map((file) =>
        unlink(join(directoryPath, file))
      );

      await Promise.all(deletePromises);
    }
  } catch (error) {}

  for (const word of wordsForPromptArray) {
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
    console.log("word", word);

    let maxTry = 3;

    for (const curModel of selectedModels) {
      let tryCount = 0;
      let success = false;

      while (tryCount < maxTry && !success) {
        try {
          let data: any;

          if (curModel === "random") {
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

          // configure the output
          // write word to file
          const output: CreateWord[] = [
            {
              word,
              definitions: [],
            },
          ];

          // if data consist of ```json or ``` remove them
          data = String(data)
            .replace(/```json/g, "")
            .replace(/```/g, "")
            // replace undefined
            .replace(/undefined/g, "")
            .trim();

          for (const item of JSON.parse(data as any)) {
            output[0].definitions.push({
              // remove dot at the end of definition if exists
              definition: String(item.definition).replace(/\.$/, ""),
              partOfSpeech: item.partOfSpeech,
              sentences: [item.sentence],
            });
          }

          // create model directory if not exists
          const modelDir = LOCAL_SAVE_DIR + "/words/" + curModel;
          try {
            await fs.access(modelDir);
          } catch (error) {
            await fs.mkdir(modelDir, { recursive: true });
          }

          // write ollama response to file
          await fs.writeFile(
            LOCAL_SAVE_DIR + "/words/" + curModel + "/" + word + ".json",
            JSON.stringify(output, null, 2)
          );

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
