import fs from "fs/promises";
import * as fsSync from "fs";
import path from "path";
import zlib from "zlib";
import readline from "readline";
import https from "https";
import inquirer from "inquirer";
import {
  LOCAL_SAVE_DIR,
  PATH_EXISTING_WORDS,
  PATH_FILTERED_WORDS,
  PATH_UNFILTERED_WORDS,
  ensureDir,
  readJson,
  writeJson,
  createDifferenceFile,
} from "@/lib";

// --- Configuration ---
const GOOGLE_NGRAMS_BASE_URL =
  "https://storage.googleapis.com/books/ngrams/books/googlebooks-eng-all-1gram-20120701-";
const NGRAMS_OUTPUT_DIR = path.join(LOCAL_SAVE_DIR, "top_words_by_letter");
const TOP_LIMIT = 1000;

// --- Task 1: Word Difference & Merging ---

/**
 * Merges new word lists (e.g. Untitled-1.json) and compares them against existing words.
 */
async function processNewWordLists() {
  try {
    console.log("\n--- 🔍 Starting Word List Ingestion ---");

    // These paths are examples from the original script
    const file1Path = path.join(LOCAL_SAVE_DIR, "Untitled-1.json");
    const file2Path = path.join(LOCAL_SAVE_DIR, "Untitled-2.json");

    if (!fsSync.existsSync(file1Path) || !fsSync.existsSync(file2Path)) {
      console.warn(
        `⚠️  Source files not found in ${LOCAL_SAVE_DIR}: Untitled-1.json or Untitled-2.json`
      );
      console.log(
        "Please ensure these files exist or update the paths in the script."
      );
      return;
    }

    const words1: { word: string }[] = await readJson(file1Path);
    const words2: { word: string }[] = await readJson(file2Path);

    const mergedWordsSet = new Set([
      ...words1.map((item) => item.word.toLowerCase().trim()),
      ...words2.map((item) => item.word.toLowerCase().trim()),
    ]);

    await writeJson(PATH_UNFILTERED_WORDS, Array.from(mergedWordsSet));
    console.log(
      `✅ Saved ${mergedWordsSet.size} unique words to ${path.basename(
        PATH_UNFILTERED_WORDS
      )}.`
    );

    // Compare with existing database words
    if (fsSync.existsSync(PATH_EXISTING_WORDS)) {
      await createDifferenceFile(
        PATH_EXISTING_WORDS,
        PATH_UNFILTERED_WORDS,
        PATH_FILTERED_WORDS
      );
    } else {
      console.warn(
        `⚠️  Existing words file not found at ${PATH_EXISTING_WORDS}. Skipping filtering.`
      );
    }
  } catch (error) {
    console.error("❌ Error in processNewWordLists:", error);
  }
}

// --- Task 2: Google Ngrams Processing ---

/**
 * Downloads a file from a URL to a destination path.
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fsSync.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} — ${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(dest).catch(() => {});
        reject(err);
      });
  });
}

/**
 * Processes a single Google Ngram letter file.
 */
async function processNgramLetter(letter: string) {
  const url = `${GOOGLE_NGRAMS_BASE_URL}${letter}.gz`;
  const tempFile = path.join(LOCAL_SAVE_DIR, `${letter}.gz`);

  console.log(`⬇️  Downloading ${letter.toUpperCase()}...`);
  await downloadFile(url, tempFile);

  console.log(`📦 Processing ${letter.toUpperCase()}...`);
  const stream = fsSync.createReadStream(tempFile).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream });

  const counts = new Map<string, number>();

  for await (const line of rl) {
    const [word, , matchCount] = line.split("\t");
    if (!/^[a-z]+$/.test(word)) continue; // Keep lowercase words only

    const count = parseInt(matchCount, 10);
    counts.set(word, (counts.get(word) ?? 0) + count);
  }

  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_LIMIT)
    .map(([word, freq], rank) => ({
      word,
      rank: rank + 1,
      frequency: freq,
    }));

  await ensureDir(NGRAMS_OUTPUT_DIR);
  await writeJson(path.join(NGRAMS_OUTPUT_DIR, `${letter}.json`), sorted);

  console.log(`✅ Done ${letter.toUpperCase()}: ${sorted.length} words saved.`);
  await fs.unlink(tempFile);
}

/**
 * Fetches top words for all letters.
 */
async function fetchAllNgrams() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz".split("");
  console.log("\n--- 🌐 Starting Google Ngrams Ingestion ---");
  for (const letter of alphabet) {
    try {
      await processNgramLetter(letter);
    } catch (err) {
      console.error(`❌ Failed for ${letter}:`, err);
    }
  }
}

/**
 * Merges top frequency words from each letter into a single interleaved list.
 */
async function mergeTopWords() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz".split("");
  const lists: string[][] = [];

  console.log("\n--- 🔄 Merging Top Words (Interleaved) ---");
  for (const letter of alphabet) {
    const filePath = path.join(NGRAMS_OUTPUT_DIR, `${letter}.json`);
    if (!fsSync.existsSync(filePath)) continue;

    const content = await readJson<any[]>(filePath);
    const array = content.map((entry) => entry.word);
    lists.push(array);
  }

  const merged: string[] = [];
  let index = 0;
  let hasMore = true;

  while (hasMore) {
    hasMore = false;
    for (const list of lists) {
      if (index < list.length) {
        merged.push(list[index]);
        hasMore = true;
      }
    }
    index++;
  }

  const outputPath = path.join(LOCAL_SAVE_DIR, "merged_top_words.json");
  await writeJson(outputPath, merged);
  console.log(`✅ Success: Merged list saved to ${outputPath}`);
}

// --- Main Menu ---

async function main() {
  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: "Select an ingestion task:",
      choices: [
        {
          name: "1. Process new word lists (Diff merged vs existing)",
          value: "diff",
        },
        {
          name: "2. Download top words from Google Ngrams (By letter)",
          value: "ngrams",
        },
        {
          name: "3. Merge/Interleave Ngram results into single list",
          value: "merge",
        },
        { name: "Execute All Ngram Tasks (2 & 3)", value: "all_ngrams" },
        {
          name: "Calculate Difference (Existing vs Unfiltered)",
          value: "create_diff",
        },
        { name: "Exit", value: "exit" },
      ],
    },
  ]);

  switch (choice) {
    case "diff":
      await processNewWordLists();
      break;
    case "ngrams":
      await fetchAllNgrams();
      break;
    case "merge":
      await mergeTopWords();
      break;
    case "all_ngrams":
      await fetchAllNgrams();
      await mergeTopWords();
      break;
    case "create_diff":
      await createDifferenceFile(
        PATH_EXISTING_WORDS,
        PATH_UNFILTERED_WORDS,
        PATH_FILTERED_WORDS
      );
      break;
    case "exit":
      return;
  }

  console.log("\n✨ Task completed successfully.\n");
}

// Run the script
main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
