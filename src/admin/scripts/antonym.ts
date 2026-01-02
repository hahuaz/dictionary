import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";

import { LOCAL_MNT_DICTIONARY } from "@/lib/constants";
import { speechSynthesis } from "@/lib";
const uiDir = path.join(process.cwd(), "ui");

async function takeScreenshot() {
  // read the current word from antonym.json
  const antonymJsonPath = path.join(uiDir, "antonym.json");
  const allAntonyms = await import(`file://${antonymJsonPath}`);
  console.log("All antonyms:", allAntonyms);
  // All antonyms: [Module: null prototype] {
  // default: [Antonym]
  // }

  const firstAntonym = allAntonyms.default[0];

  const [word1, word2] = firstAntonym;

  // built wordData to pass to puppeteer
  const wordData = {
    word1,
    word2,
  };

  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    defaultViewport: {
      width: 1080,
      height: 1350,
      deviceScaleFactor: 1,
    },
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  const filePath = `file:${path.join(uiDir, "antonym.html")}`;
  await page.goto(filePath, { waitUntil: "networkidle0" });

  // Inject JSON data into the page
  await page.evaluate((data) => {
    document.querySelector(".word1")!.textContent = data.word1;
    document.querySelector(".word2")!.textContent = data.word2;
  }, wordData);

  const wordsMerged = `${word1}-${word2}`;
  const wordsMergedDir = path.join(
    LOCAL_MNT_DICTIONARY,
    "antonyms",
    wordsMerged
  );

  await import("fs/promises").then((fs) =>
    fs.mkdir(wordsMergedDir, {
      recursive: true,
    })
  );

  const antonymDir = path.join(LOCAL_MNT_DICTIONARY, "antonyms");

  // Take screenshot
  await page.screenshot({
    path: `${wordsMergedDir}/${wordsMerged}.png`,
    fullPage: true,
  });

  await browser.close();

  // generate speech audio for the word
  const text = `${word1}. ${word2}.`;

  console.log("Generating audio for text:", text);

  const audioBuffer = await speechSynthesis({
    text,
    encoding: "LINEAR16",
    speakingRate: 0.9,
  });

  const audioPath = path.join(wordsMergedDir, `${wordsMerged}.wav`);
  await import("fs/promises").then((fs) =>
    fs.writeFile(audioPath, audioBuffer)
  );

  // save second audio in case first fails
  const altAudioBuffer = await speechSynthesis({
    text,
    encoding: "LINEAR16",
    speakingRate: 1.0,
  });
  const altAudioPath = path.join(wordsMergedDir, `${wordsMerged}-alt.wav`);
  await import("fs/promises").then((fs) =>
    fs.writeFile(altAudioPath, altAudioBuffer)
  );

  // append antonym to existing.json
  const existingJsonPath = path.join(
    LOCAL_MNT_DICTIONARY,
    "antonyms",
    "existing.json"
  );
  const fs = await import("fs/promises");
  let existingData: string[] = [];
  const existingJson = await fs.readFile(existingJsonPath, "utf-8");
  existingData = JSON.parse(existingJson);
  const antonymArray = [word1, word2];
  // @ts-ignore
  existingData.push(antonymArray);
  await fs.writeFile(
    existingJsonPath,
    JSON.stringify(existingData, null, 2),
    "utf-8"
  );

  console.log(`Finished processing antonym: ${word1} - ${word2}`);
}

takeScreenshot();
