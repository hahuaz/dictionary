import puppeteer from "puppeteer";
import path from "path";
import fs from "fs/promises";
import { pathToFileURL } from "url";
import ffmpeg from "fluent-ffmpeg";

import {
  MNT_DICTIONARY_DIR,
  speechSynthesis,
  ensureDir,
  readJson,
  writeJson,
} from "@/lib";

const uiDir = path.join(process.cwd(), "src", "admin", "ui");

// --- Helper Functions ---

/**
 * Gets the duration of an audio file in seconds.
 */
function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration;
      resolve(duration || 0);
    });
  });
}

/**
 * Promisified ffmpeg video creation.
 */
function createVideo(
  imagePath: string,
  audioPath: string,
  outputPath: string,
  duration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .addInput(imagePath)
      .loop(duration)
      .addInput(audioPath)
      .outputOptions([
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 192k",
        "-shortest",
      ])
      .on("end", () => {
        console.log(`✅ Video generated: ${path.basename(outputPath)}`);
        resolve();
      })
      .on("error", (err) => {
        console.error(`❌ Error generating video ${outputPath}:`, err);
        reject(err);
      })
      .save(outputPath);
  });
}

/**
 * Main function to process the word card.
 */
async function processWordCard() {
  console.log("--- Starting Word Card Generation ---");
  let browser;
  try {
    // 1. Load word data from ui/word.json
    const wordJsonPath = path.join(uiDir, "word.json");
    const wordData = await readJson<any>(wordJsonPath);

    const { word, definitions, highlights = [] } = wordData;
    const allHighlights = [...highlights, word];

    const firstDef = definitions[0];
    const pos = firstDef.partOfSpeech;
    const definition = firstDef.definition;
    const exampleSentence = firstDef.sentences[0].sentence;

    // Wrap highlighted words in <span>
    const highlightedSentence = exampleSentence.replace(
      new RegExp(`\\b(${allHighlights.join("|")})\\b`, "gi"),
      `<span>$1</span>`
    );

    const wordDir = path.join(MNT_DICTIONARY_DIR, "words", word);
    await ensureDir(wordDir);

    // 2. Puppeteer Screenshots
    console.log("Launching Puppeteer...");
    browser = await puppeteer.launch({
      defaultViewport: {
        width: 1080,
        height: 1350,
        deviceScaleFactor: 1,
      },
      headless: "new" as any,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    // Take "image-text" screenshot
    const page = await browser.newPage();
    const imageTextUrl = pathToFileURL(
      path.join(uiDir, "image-text.html")
    ).href;
    await page.goto(imageTextUrl, { waitUntil: "networkidle0" });

    await page.evaluate(
      (data) => {
        const wordEl = document.querySelector(".word");
        const defEl = document.querySelector(".definition");
        const sentEl = document.querySelector(".sentence");
        if (wordEl) wordEl.textContent = data.word;
        if (defEl) defEl.textContent = data.definition;
        if (sentEl) sentEl.innerHTML = data.sentence;
      },
      { word, definition, sentence: highlightedSentence }
    );

    const screenshotPath = path.join(wordDir, `${word}-${pos}-image-text.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`✅ Screenshot saved: ${path.basename(screenshotPath)}`);

    await browser.close();
    browser = null;

    // 3. Audio Generation
    const speechText = `${word} - ${definition}. ${exampleSentence}`;
    console.log(`Generating audio for: "${word}"`);

    const generateAndSaveAudio = async (rate: number, suffix: string = "") => {
      const buffer = await speechSynthesis({
        text: speechText,
        encoding: "OGG_OPUS",
        speakingRate: rate,
      });
      const audioPath = path.join(wordDir, `${word}-${pos}${suffix}.wav`);
      await fs.writeFile(audioPath, Buffer.from(buffer));
      return audioPath;
    };

    const mainAudioPath = await generateAndSaveAudio(0.9);
    const altAudioPath = await generateAndSaveAudio(1.0, "-alt");

    // 4. Video Generation
    const durations = await Promise.all([
      getAudioDuration(mainAudioPath),
      getAudioDuration(altAudioPath),
    ]);

    console.log("Generating videos...");
    await Promise.all([
      createVideo(
        screenshotPath,
        mainAudioPath,
        path.join(wordDir, `AA${word}-${pos}.mp4`),
        durations[0] + 1
      ),
      createVideo(
        screenshotPath,
        altAudioPath,
        path.join(wordDir, `AA${word}-${pos}-alt.mp4`),
        durations[1] + 1
      ),
    ]);

    // 5. Update existing.json
    const existingJsonPath = path.join(
      MNT_DICTIONARY_DIR,
      "words",
      "existing.json"
    );
    try {
      const existingData = await readJson<string[]>(existingJsonPath, []);
      if (!existingData.includes(word)) {
        existingData.push(word);
        await writeJson(existingJsonPath, existingData);
      }
    } catch (e) {
      await writeJson(existingJsonPath, [word]);
    }

    // 6. Copy Reference Images
    const srcImagePath = path.join(uiDir, "1.png");
    try {
      await fs.access(srcImagePath);
      await fs.copyFile(
        srcImagePath,
        path.join(wordDir, `${word}-reference.png`)
      );

      const dictImagesDir = path.join(MNT_DICTIONARY_DIR, "images");
      await ensureDir(dictImagesDir);
      const dictImagePath = path.join(
        dictImagesDir,
        `${word}-${Date.now()}.png`
      );
      await fs.copyFile(srcImagePath, dictImagePath);
      console.log("✅ Reference images copied.");
    } catch (err) {
      console.warn("⚠️ Reference image ui/1.png not found, skipping copy.");
    }

    console.log(`--- Finished processing word: ${word} ---`);
  } catch (error) {
    console.error("❌ Critical error in word-card script:", error);
  } finally {
    if (browser) await (browser as any).close();
  }
}

processWordCard().catch(console.error);
