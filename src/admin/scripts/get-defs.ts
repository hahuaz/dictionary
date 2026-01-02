import {
  PATH_ALL_WORDS,
  PATH_PENDING_WORDS,
  PATH_NEW_WORDS,
  LOCAL_SAVE_DIR,
} from "@/lib";

import fs, { readdir, unlink } from "fs/promises";
import { PATH_WORDS_FOR_PROMPT } from "../../lib/constants";
import { CreateWord } from "@shared/types";
import { dirname, join } from "path";

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

async function runAIWithRetry({
  prompt,
  word,
  model,
  maxTry = 3,
  waitMsBetweenRetries = 300,
}) {
  let tryCount = 0;

  while (tryCount < maxTry) {
    try {
      let data: any;

      // ✅ Gemini Model
      if (model === "gemini-2.5-pro") {
        const ai = new GoogleGenAI({
          apiKey: process.env.GOOGLE_FREE_GENERATIVE_LANGUAGE_KEY,
        });
        const config = {
          thinkingConfig: { thinkingBudget: -1 },
        };
        const contents = [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ];

        const response = await ai.models.generateContentStream({
          model,
          config,
          contents,
        });

        let streamedText = "";
        for await (const chunk of response) {
          streamedText += chunk.text;
        }
        data = streamedText;
      }

      // ✅ Ollama / Local Models
      else {
        const response = await fetch("http://172.17.16.1:11434/api/generate", {
          method: "POST",
          body: JSON.stringify({
            model,
            prompt,
            format: "json",
            stream: false,
          }),
        });

        data = await response.json();
        data = data.response ?? data;
      }

      // ✅ Cleanup formatting artifacts
      const cleaned = String(data)
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .replace(/undefined/g, "")
        // remove " at start and end if exists
        .replace(/^"/, "")
        .replace(/"$/, "")
        .trim();

      return cleaned; // ✅ return clean text result
    } catch (err) {
      tryCount++;
      console.log(`Retry ${tryCount}/${maxTry} for model ${model} —`, err);

      if (tryCount >= maxTry) throw err;

      await new Promise((r) => setTimeout(r, waitMsBetweenRetries * tryCount));
    }
  }
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
    availableModes._5,
    // availableModes._7,
  ];

  try {
    // clean up model directories
    for (const curModel of selectedModels) {
      const directoryPath = LOCAL_SAVE_DIR + "/words/" + curModel;
      const files = await readdir(directoryPath);

      const deletePromises = files.map((file) =>
        unlink(join(directoryPath, file))
      );

      await Promise.all(deletePromises);

      // defs dir
      const defsDirectoryPath = LOCAL_SAVE_DIR + "/defs/" + curModel;
      const defsFiles = await readdir(defsDirectoryPath);

      const defsDeletePromises = defsFiles.map((file) =>
        unlink(join(defsDirectoryPath, file))
      );

      await Promise.all(defsDeletePromises);
    }
  } catch (error) {}

  for (const word of wordsForPromptArray) {
    const prompt = `for the word "${word}", give definitions as string of array. don't include same meaning twice. return only the array in json format. do not add any explanations.`;

    for (const curModel of selectedModels) {
      try {
        let raw = await runAIWithRetry({
          prompt,
          word,
          model: curModel,
        });

        const outputPath = `${LOCAL_SAVE_DIR}/defs/${curModel}/${word}.json`;

        await fs.mkdir(dirname(outputPath), { recursive: true });
        await fs.writeFile(
          outputPath,
          JSON.stringify({ word, data: JSON.parse(raw!) }, null, 2)
        );

        // re-order for most used definitions first
        const promptReorder = `reorder the following definitions for the word "${word}" from most common to least common usage. return only the array in json format. do not add any explanations.
        the definitions: ${raw}`;

        let reordered = await runAIWithRetry({
          prompt: promptReorder,
          word,
          model: curModel,
        });
        await fs.writeFile(
          outputPath,
          JSON.stringify({ word, data: JSON.parse(reordered!) }, null, 2)
        );

        // loop through defs and ask for example sentence for each
        const defsArray = JSON.parse(reordered!);
        const defsWithExamples: {
          definition: string;
          sentences: string[];
          partOfSpeech: string;
        }[] = [];

        for (const def of defsArray) {
          const promptExample = `for the definition "${def}" of the word "${word}", give one simple example sentence using the word in that meaning. return only the sentence as a string. do not add any explanations.`;

          let exampleSentence = await runAIWithRetry({
            prompt: promptExample,
            word,
            model: curModel,
          });

          // get part of speech from sentence
          const promptPOS = `for the sentence "${exampleSentence}" using the word "${word}", identify the part of speech of the word in that sentence. return only the part of speech as a string (e.g., noun, verb, adjective). do not add any explanations.`;
          let partOfSpeech = await runAIWithRetry({
            prompt: promptPOS,
            word,
            model: curModel,
          });

          defsWithExamples.push({
            definition: def,
            sentences: [exampleSentence!],
            partOfSpeech: partOfSpeech!,
          });
        }

        const wordsOutputPath = `${LOCAL_SAVE_DIR}/words/${curModel}/${word}.json`;
        await fs.mkdir(dirname(wordsOutputPath), { recursive: true });
        const wordOutput: CreateWord[] = [
          {
            word,
            definitions: defsWithExamples,
          },
        ];
        await fs.writeFile(
          wordsOutputPath,
          JSON.stringify(wordOutput, null, 2)
        );

        console.log("✅ Saved:", word, curModel);
      } catch {
        console.log("❌ Fail:", word, curModel);
      }
    }
  }

  // for (const word of wordsForPromptArray) {
  //   const prompt = `for the word "${word}", give definitions as string of array. return only the array in json format. do not add any explanations.`;
  //   console.log("word", word);

  //   let maxTry = 3;

  //   for (const curModel of selectedModels) {
  //     let tryCount = 0;
  //     let success = false;

  //     while (tryCount < maxTry && !success) {
  //       try {
  //         let data: any;

  //         if (curModel === availableModes._7) {
  //           // wait 1 min
  //           await new Promise((r) => setTimeout(r, 1000 * 60));
  //           console.log("gemini start");
  //           data = await gemini({ prompt, word });
  //         } else {
  //           console.log(curModel, "start");
  //           const response = await fetch(
  //             "http://172.17.16.1:11434/api/generate",
  //             {
  //               method: "POST",
  //               body: JSON.stringify({
  //                 model: curModel,
  //                 prompt,
  //                 // format: {
  //                 //   type: "array",
  //                 //   items: {
  //                 //     type: "object",
  //                 //     properties: {
  //                 //       definition: { type: "string" },
  //                 //       part_of_speech: { type: "string" },
  //                 //       sentence: { type: "string" },
  //                 //     },
  //                 //     required: ["definition", "part_of_speech", "sentence"],
  //                 //   },
  //                 // },
  //                 format: "json",
  //                 stream: false,
  //               }),
  //             }
  //           );
  //           data = await response.json();
  //           data = data.response ?? data;

  //           // // if data consist of ```json or ``` remove them
  //           data = String(data)
  //             .replace(/```json/g, "")
  //             .replace(/```/g, "")
  //             // replace undefined
  //             .replace(/undefined/g, "")
  //             .trim();
  //         }

  //         // write defs to defs file. if not exists, create it
  //         const defsFilePath =
  //           LOCAL_SAVE_DIR + "/defs/" + curModel + "/" + word + ".json";
  //         await fs.mkdir(dirname(defsFilePath), { recursive: true });
  //         data = JSON.parse(data);
  //         await fs.writeFile(
  //           defsFilePath,
  //           JSON.stringify({ word, data }, null, 2)
  //         );

  //         success = true;

  //         // // configure the output
  //         // // write word to file
  //         // const output: CreateWord[] = [
  //         //   {
  //         //     word,
  //         //     definitions: [],
  //         //   },
  //         // ];

  //         // for (const item of JSON.parse(data as any)) {
  //         //   output[0].definitions.push({
  //         //     // remove dot at the end of definition if exists
  //         //     definition: String(item.definition).replace(/\.$/, ""),
  //         //     partOfSpeech: item.partOfSpeech,
  //         //     sentences: [item.sentence],
  //         //   });
  //         // }

  //         // // create model directory if not exists
  //         // const modelDir = LOCAL_SAVE_DIR + "/words/" + curModel;
  //         // try {
  //         //   await fs.access(modelDir);
  //         // } catch (error) {
  //         //   await fs.mkdir(modelDir, { recursive: true });
  //         // }

  //         // // write ollama response to file
  //         // await fs.writeFile(
  //         //   LOCAL_SAVE_DIR + "/words/" + curModel + "/" + word + ".json",
  //         //   JSON.stringify(output, null, 2)
  //         // );

  //         // success = true;
  //         // console.log("Saved word:", word, "model:", curModel);
  //       } catch (error) {
  //         console.log("err", error);
  //         tryCount++;
  //         if (tryCount >= maxTry) {
  //           console.log(
  //             "Max retries reached for word:",
  //             word,
  //             "model:",
  //             curModel
  //           );
  //         } else {
  //           // tiny backoff without changing much
  //           await new Promise((r) => setTimeout(r, 200 * tryCount));
  //         }
  //       }
  //     }
  //   }
  // }
}
executeScript();
