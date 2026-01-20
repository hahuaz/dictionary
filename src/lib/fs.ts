import fs from "fs/promises";
import { dirname } from "path";

/**
 * Utility to ensure a directory exists.
 */
export async function ensureDir(path: string) {
  try {
    await fs.access(path);
  } catch {
    await fs.mkdir(path, { recursive: true });
  }
}

/**
 * Safely reads a JSON file and returns data or default value.
 */
export async function readJson<T>(path: string, defaultValue?: T): Promise<T> {
  try {
    const content = await fs.readFile(path, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if (defaultValue !== undefined) return defaultValue;
    throw error;
  }
}

/**
 * Writes data to a JSON file.
 */
export async function writeJson(path: string, data: any) {
  await ensureDir(dirname(path));
  await fs.writeFile(path, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Appends an item to a JSON array in a file.
 */
export async function appendJson<T>(path: string, item: T) {
  let data: T[] = [];
  try {
    const current = await fs.readFile(path, "utf-8");
    data = JSON.parse(current);
    if (!Array.isArray(data)) data = [];
  } catch {
    // File doesn't exist or is invalid JSON
  }
  data.push(item);
  await writeJson(path, data);
}

/**
 * Finds words in candidate list that don't exist in the database yet and saves to filtered path.
 */
export async function createDifferenceFile(
  pathExisting: string,
  pathCandidate: string,
  pathOutput: string,
) {
  console.log("--- Creating Difference File ---");
  try {
    const [existingWords, candidateWords] = await Promise.all([
      readJson<string[]>(pathExisting, []),
      readJson<string[]>(pathCandidate, []),
    ]);

    const existingSet = new Set(existingWords.map((w) => w.toLowerCase()));
    const differenceWords = candidateWords.filter(
      (word) => !existingSet.has(word.toLowerCase()),
    );

    await writeJson(pathOutput, differenceWords);

    console.log(`✅ Success: Found ${differenceWords.length} new words.`);
    console.log(`Saved to: ${pathOutput}`);
    return differenceWords;
  } catch (error) {
    console.error("❌ Error in createDifferenceFile:", error);
    throw error;
  }
}
