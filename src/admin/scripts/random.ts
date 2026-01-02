import fs from "fs/promises";
import { dirname } from "path";

import { LOCAL_SAVE_DIR } from "@/lib";
import {
  PATH_EXISTING_WORDS,
  PATH_CANDIDATE_WORDS,
  PATH_FILTERED_WORDS,
} from "@/lib";
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
createDifferenceFile();

// async function createDifferenceFile() {
//   try {
//     const file1 = await fs.readFile(
//       LOCAL_SAVE_DIR + "/Untitled-1.json",
//       "utf-8"
//     );
//     const file2 = await fs.readFile(
//       LOCAL_SAVE_DIR + "/Untitled-2.json",
//       "utf-8"
//     );

//     const words1: { word: string }[] = JSON.parse(file1);
//     const words2: { word: string }[] = JSON.parse(file2);

//     const wordSet1 = new Set(words1.map((item) => item.word));
//     const wordSet2 = new Set(words2.map((item) => item.word));

//     const mergedWords = new Set<string>([...wordSet1, ...wordSet2]);

//     await fs.writeFile(
//       LOCAL_SAVE_DIR + "/new_words.json",
//       JSON.stringify(Array.from(mergedWords), null, 2)
//     );

//     // compare new_words.json with all_words.json and save the difference to pending_words.json
//     const allWordsFile = await fs.readFile(
//       LOCAL_SAVE_DIR + "/all_words.json",
//       "utf-8"
//     );
//     const allWords: string[] = JSON.parse(allWordsFile);

//     const newWordsSet = new Set(Array.from(mergedWords));
//     const allWordsSet = new Set(allWords);

//     const difference = Array.from(newWordsSet).filter(
//       (word) => !allWordsSet.has(word)
//     );

//     await fs.writeFile(
//       LOCAL_SAVE_DIR + "/pending_words.json",
//       JSON.stringify(difference, null, 2)
//     );

//     console.log(
//       `Successfully created pending_words.json with ${difference.length} words`
//     );
//   } catch (error) {
//     console.error("Error creating difference file:", error);
//   }
// }

// createDifferenceFile();
// import fs from "fs";
// import zlib from "zlib";
// import readline from "readline";
// import https from "https";
// import path from "path";

// const BASE_URL =
//   "https://storage.googleapis.com/books/ngrams/books/googlebooks-eng-all-1gram-20120701-";
// const OUTPUT_DIR = "./top_words_by_letter";
// const TOP_LIMIT = 1000;

// async function downloadFile(url, dest) {
//   return new Promise((resolve, reject) => {
//     const file = fs.createWriteStream(dest);
//     https
//       .get(url, (res) => {
//         if (res.statusCode !== 200) {
//           reject(`HTTP ${res.statusCode} — ${url}`);
//           return;
//         }
//         res.pipe(file);
//         file.on("finish", () => file.close(() => resolve()));
//       })
//       .on("error", (err) => {
//         reject(err);
//       });
//   });
// }

// async function processLetter(letter) {
//   const url = `${BASE_URL}${letter}.gz`;
//   const file = `./${letter}.gz`;

//   console.log(`⬇️ Downloading ${letter.toUpperCase()} …`);
//   await downloadFile(url, file);

//   console.log(`📦 Processing ${letter.toUpperCase()} …`);
//   const stream = fs.createReadStream(file).pipe(zlib.createGunzip());

//   const rl = readline.createInterface({ input: stream });

//   const counts = new Map();

//   for await (const line of rl) {
//     const [word, , matchCount] = line.split("\t");
//     if (!/^[a-z]+$/.test(word)) continue; // Keep lowercase words only

//     const count = parseInt(matchCount, 10);
//     counts.set(word, (counts.get(word) ?? 0) + count);
//   }

//   const sorted = [...counts.entries()]
//     .sort((a, b) => b[1] - a[1])
//     .slice(0, TOP_LIMIT)
//     .map(([word, freq], rank) => ({
//       word,
//       rank: rank + 1,
//       frequency: freq,
//     }));

//   fs.mkdirSync(OUTPUT_DIR, { recursive: true });
//   fs.writeFileSync(
//     `${OUTPUT_DIR}/${letter}.json`,
//     JSON.stringify(sorted, null, 2)
//   );

//   console.log(`✅ Done: ${letter.toUpperCase()} → ${sorted.length} words`);

//   fs.unlinkSync(file); // Clean up compressed file
// }

// async function fetchAll() {
//   const alphabet = "abcdefghijklmnopqrstuvwxyz".split("");

//   for (const letter of alphabet) {
//     try {
//       await processLetter(letter);
//     } catch (err) {
//       console.error(`❌ Failed for ${letter}:`, err);
//     }
//   }

//   console.log("🎉 All letters processed!");
// }

// // fetchAll();

// // write top_words_by_letter to new file just by string of arrays. order is important. if a word is written from a letter, then next letter b should come in array. and so on.
// async function mergeTopWords() {
//   const alphabet = "abcdefghijklmnopqrstuvwxyz".split("");
//   const lists = [];

//   // ✅ Load each letter file as an array
//   for (const letter of alphabet) {
//     const filePath = path.join(OUTPUT_DIR, `${letter}.json`);
//     if (!fs.existsSync(filePath)) continue;

//     const content = fs.readFileSync(filePath, "utf-8");
//     const array = JSON.parse(content).map((entry) => entry.word);
//     lists.push(array);
//   }

//   const merged = [];
//   let more = true;
//   let index = 0;

//   // ✅ Round-robin interleave
//   while (more) {
//     more = false;

//     for (const list of lists) {
//       if (index < list.length) {
//         merged.push(list[index]);
//         more = true; // continue while loop
//       }
//     }

//     index++;
//   }

//   fs.writeFileSync("./merged_top_words.json", JSON.stringify(merged, null, 2));

//   console.log("✅ merged_top_words.json created successfully!");
// }
// mergeTopWords();
