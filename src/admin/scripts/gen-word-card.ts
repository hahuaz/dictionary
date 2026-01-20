import puppeteer from "puppeteer";
import path from "path";
import fs from "fs/promises";
import { pathToFileURL } from "url";
import ffmpeg from "fluent-ffmpeg";

import {
  ASSET_DICTIONARY_DIR,
  DESKTOP_DIR,
  VIEW_DIR,
  speechSynthesis,
  ensureDir,
  readJson,
  writeJson,
} from "@/lib";

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
import { PassThrough } from "stream";

/**
 * Captures the page animation as a video using Puppeteer CDP Screencast
 * and merges it with the audio file.
 */
async function recordVideo(
  page: any,
  audioPath: string,
  outputPath: string,
  duration: number,
  onStart?: () => Promise<void>,
): Promise<void> {
  const stream = new PassThrough();
  const FPS = 30;
  const FRAME_INTERVAL = 1000 / FPS;

  // 1. Create a Promise for FFMPEG completion
  const ffmpegDone = new Promise<void>((resolve, reject) => {
    ffmpeg(stream)
      .inputFormat("image2pipe")
      .inputFPS(FPS)
      .addInput(audioPath)
      .outputOptions([
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 192k",
        "-movflags +faststart",
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

  // 2. Run CDP Screencast Logic
  try {
    const client = await page.target().createCDPSession();

    let latestBuffer: Buffer | null = null;
    let frameCount = 0;

    // Listen for frames and update latest buffer
    const frameHandler = async (frame: any) => {
      try {
        latestBuffer = Buffer.from(frame.data, "base64");
        await client.send("Page.screencastFrameAck", {
          sessionId: frame.sessionId,
        });
      } catch (e) {
        // Ignore
      }
    };
    client.on("Page.screencastFrame", frameHandler);

    // Start CFR Timer to feed FFMPEG
    const timer = setInterval(() => {
      if (latestBuffer) {
        stream.write(latestBuffer);
        frameCount++;
      }
    }, FRAME_INTERVAL);

    // 2. Start Screencast
    await client.send("Page.startScreencast", {
      format: "jpeg",
      quality: 90,
      everyNthFrame: 1,
    });

    if (onStart) {
      await onStart();
    }

    // Record for duration + buffer
    await new Promise((r) => setTimeout(r, (duration + 1.0) * 1000));

    clearInterval(timer);

    await client.send("Page.stopScreencast");
    client.off("Page.screencastFrame", frameHandler);
    await client.detach();

    // Allow stream to flush
    stream.end();
  } catch (e) {
    console.error("Recording error:", e);
    stream.end();
    throw e;
  }

  // 3. Wait for FFMPEG to finish processing the stream
  await ffmpegDone;
}

/**
 * Main function to process the word card.
 */
async function processWordCard() {
  console.log("--- Starting Word Card Generation ---");
  let browser;
  try {
    // 1. Load word data from ui/word-details
    const wordJsonPath = path.join(VIEW_DIR, "word-details.json");
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
      `<span>$1</span>`,
    );

    const wordDir = path.join(ASSET_DICTIONARY_DIR, "words", word);
    await ensureDir(wordDir);

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
      return { path: audioPath, durationPromise: getAudioDuration(audioPath) };
    };

    const mainAudio = await generateAndSaveAudio(0.9);
    const altAudio = await generateAndSaveAudio(1.0, "-alt");

    const [mainDuration, altDuration] = await Promise.all([
      mainAudio.durationPromise,
      altAudio.durationPromise,
    ]);

    // 4. Puppeteer & Video Recording
    console.log("Launching Puppeteer...");
    browser = await puppeteer.launch({
      defaultViewport: {
        width: 1080,
        height: 1350,
        deviceScaleFactor: 1,
      },
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    const page = await browser.newPage();
    const imageTextUrl = pathToFileURL(
      path.join(VIEW_DIR, "word-card.html"),
    ).href;
    const bgImageUrl = pathToFileURL(path.join(DESKTOP_DIR, "1.png")).href;

    await page.goto(imageTextUrl, { waitUntil: "networkidle0" });

    await page.evaluate(
      (data) => {
        const wordEl = document.querySelector(".word");
        const defEl = document.querySelector(".definition");
        const sentEl = document.querySelector(".sentence");
        const imgEl = document.querySelector(".img") as HTMLElement;

        if (wordEl) {
          const spacedWord = `\u00A0${data.word}\u00A0`;
          wordEl.textContent = spacedWord;
          wordEl.setAttribute("data-text", spacedWord);
        }
        if (defEl) defEl.textContent = data.definition;
        if (sentEl) sentEl.innerHTML = data.sentence;
        if (imgEl) imgEl.style.backgroundImage = `url("${data.bgImageUrl}")`;
      },
      { word, definition, sentence: highlightedSentence, bgImageUrl },
    );

    // (Optional) Take a static reference screenshot just in case
    const screenshotPath = path.join(wordDir, `${word}-${pos}-word-card.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    console.log("Recording videos...");

    // Record Main Video
    await recordVideo(
      page,
      mainAudio.path,
      path.join(wordDir, `AA${word}-${pos}.mp4`),
      mainDuration,
      async () => {
        await page.evaluate(() => {
          const el = document.querySelector(".word");
          if (el) {
            el.classList.remove("animate");
            void (el as HTMLElement).offsetWidth; // Trigger reflow
            el.classList.add("animate");
          }
        });
      },
    );

    // Record Alt Video (Reload/Reset animation)
    // To be clean, we can just trigger the animation again in the same page state
    await recordVideo(
      page,
      altAudio.path,
      path.join(wordDir, `AA${word}-${pos}-alt.mp4`),
      altDuration,
      async () => {
        await page.evaluate(() => {
          const el = document.querySelector(".word");
          if (el) {
            el.classList.remove("animate");
            void (el as HTMLElement).offsetWidth; // Trigger reflow
            el.classList.add("animate");
          }
        });
      },
    );

    await browser.close();
    browser = null;

    // 5. Update existing.json
    const existingJsonPath = path.join(
      ASSET_DICTIONARY_DIR,
      "words",
      "existing.json",
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
    const srcImagePath = path.join(DESKTOP_DIR, "1.png");
    try {
      await fs.access(srcImagePath);
      await fs.copyFile(
        srcImagePath,
        path.join(wordDir, `${word}-reference.png`),
      );

      const dictImagesDir = path.join(ASSET_DICTIONARY_DIR, "images");
      await ensureDir(dictImagesDir);
      const dictImagePath = path.join(
        dictImagesDir,
        `${word}-${Date.now()}.png`,
      );
      await fs.copyFile(srcImagePath, dictImagePath);
      console.log("✅ Reference images copied.");
    } catch (err) {
      console.warn(
        "⚠️ Reference image not found on Desktop/1.png, skipping copy.",
      );
    }

    console.log(`--- Finished processing word: ${word} ---`);
  } catch (error) {
    console.error("❌ Critical error in word-card script:", error);
  } finally {
    if (browser) await (browser as any).close();
  }
}

processWordCard().catch(console.error);
