import puppeteer from "puppeteer";
import path from "path";
import fs from "fs/promises";
import {
  MNT_DICTIONARY_DIR,
  speechSynthesis,
  appendJson,
  ensureDir,
} from "@/lib";

const uiDir = path.join(process.cwd(), "src", "admin", "ui");

async function takeScreenshot() {
  // read the current word from antonym.json
  const antonymJsonPath = path.join(uiDir, "antonym.json");

  // Using a more standard way to read JSON since it's a dynamic path
  const rawAntonyms = await fs.readFile(antonymJsonPath, "utf-8");
  const allAntonyms = JSON.parse(rawAntonyms);

  const firstAntonym = allAntonyms[0];
  const [word1, word2] = firstAntonym;

  const wordData = { word1, word2 };

  const browser = await puppeteer.launch({
    defaultViewport: {
      width: 1080,
      height: 1350,
      deviceScaleFactor: 1,
    },
    headless: "new" as any,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const filePath = `file:${path.join(uiDir, "antonym.html")}`;
  await page.goto(filePath, { waitUntil: "networkidle0" });

  await page.evaluate((data) => {
    const w1 = document.querySelector(".word1");
    const w2 = document.querySelector(".word2");
    if (w1) w1.textContent = data.word1;
    if (w2) w2.textContent = data.word2;
  }, wordData);

  const wordsMerged = `${word1}-${word2}`;
  const wordsMergedDir = path.join(MNT_DICTIONARY_DIR, "antonyms", wordsMerged);
  await ensureDir(wordsMergedDir);

  // Take screenshot
  const screenshotPath = path.join(wordsMergedDir, `${wordsMerged}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await browser.close();

  // generate speech audio
  const text = `${word1}. ${word2}.`;
  console.log("Generating audio for text:", text);

  const generateAudio = async (rate: number, suffix: string = "") => {
    const buffer = await speechSynthesis({
      text,
      encoding: "LINEAR16",
      speakingRate: rate,
    });
    const audioPath = path.join(wordsMergedDir, `${wordsMerged}${suffix}.wav`);
    await fs.writeFile(audioPath, Buffer.from(buffer));
  };

  await generateAudio(0.9);
  await generateAudio(1.0, "-alt");

  // append antonym to existing.json
  const existingJsonPath = path.join(
    MNT_DICTIONARY_DIR,
    "antonyms",
    "existing.json"
  );
  await appendJson(existingJsonPath, [word1, word2]);

  console.log(`✅ Finished processing antonym: ${word1} - ${word2}`);
}

takeScreenshot().catch(console.error);
