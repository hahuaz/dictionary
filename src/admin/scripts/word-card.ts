import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";

import { LOCAL_MNT_DICTIONARY } from "@/lib/constants";
import { speechSynthesis } from "@/lib";
const uiDir = path.join(process.cwd(), "ui");

import ffmpeg from "fluent-ffmpeg";

function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration; // in seconds
      resolve(duration);
    });
  });
}

async function takeScreenshot() {
  // read the current word from word.json
  const wordJsonPath = path.join(uiDir, "word.json");
  const wordData = await import(`file://${wordJsonPath}`);
  const word = wordData.word;
  const highlights = wordData.highlights || [];
  highlights.push(word);

  const firstDef = wordData.definitions[0];
  const pos = firstDef.partOfSpeech;
  const definition = firstDef.definition;
  const exampleSentence = firstDef.sentences[0].sentence;
  // wrap highlighted words in <span>
  const builtSentence = exampleSentence.replace(
    new RegExp(`\\b(${highlights.join("|")})\\b`, "gi"),
    `<span>$1</span>`
  );

  // built wordData to pass to puppeteer
  const wordJustText = {
    word,
    pos,
    definition,
    sentence: exampleSentence,
  };

  const wordImageText = {
    word,
    definition,
    sentence: builtSentence,
  };

  const wordDir = path.join(LOCAL_MNT_DICTIONARY, "words", word);

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

  const filePath = `file:${path.join(uiDir, "just-text.html")}`;
  await page.goto(filePath, { waitUntil: "networkidle0" });

  // Inject JSON data into the page
  await page.evaluate((data) => {
    document.querySelector(".word")!.textContent = data.word;
    document.querySelector(".pos")!.textContent = data.pos;
    document.querySelector(".definition")!.textContent = data.definition;
    document.querySelector(".sentence")!.textContent = data.sentence;
  }, wordJustText);

  // create a individual word directory if not exists
  await import("fs/promises").then((fs) =>
    fs.mkdir(path.join(LOCAL_MNT_DICTIONARY, "words", word), {
      recursive: true,
    })
  );

  // Take screenshot
  // await page.screenshot({
  //   path: `${wordDir}/${word}-${pos}-just-text.png`,
  //   fullPage: true,
  // });

  // now do it for image-text.html
  const page2 = await browser.newPage();
  const filePath2 = `file:${path.join(uiDir, "image-text.html")}`;
  await page2.goto(filePath2, { waitUntil: "networkidle0" });

  // Inject JSON data into the page
  await page2.evaluate((data) => {
    document.querySelector(".word")!.textContent = data.word;
    // document.querySelector(".pos")!.textContent = pos;
    document.querySelector(".definition")!.textContent = data.definition;
    document.querySelector(".sentence")!.innerHTML = data.sentence;
  }, wordImageText);

  // Take screenshot
  await page2.screenshot({
    path: `${wordDir}/${word}-${pos}-image-text.png`,
    fullPage: true,
  });

  await browser.close();

  // generate speech audio for the word
  const text = `${word} - ${definition}. ${exampleSentence}`;

  console.log("Generating audio for text:", text);

  const audioBuffer = await speechSynthesis({
    text,
    encoding: "OGG_OPUS",
    speakingRate: 0.9,
  });

  const audioPath = path.join(wordDir, `${word}-${pos}.wav`);
  await import("fs/promises").then((fs) =>
    fs.writeFile(audioPath, audioBuffer)
  );

  // save second audio in case first fails
  const altAudioBuffer = await speechSynthesis({
    text,
    encoding: "OGG_OPUS",
    speakingRate: 1.0,
  });
  const altAudioPath = path.join(wordDir, `${word}-${pos}-alt.wav`);
  await import("fs/promises").then((fs) =>
    fs.writeFile(altAudioPath, altAudioBuffer)
  );

  // write word to existing.json if not already there
  const existingJsonPath = path.join(
    LOCAL_MNT_DICTIONARY,
    "words",
    "existing.json"
  );
  const fs = await import("fs/promises");
  let existingData: string[] = [];
  const existingJson = await fs.readFile(existingJsonPath, "utf-8");
  existingData = JSON.parse(existingJson);
  if (!existingData.includes(word)) {
    existingData.push(word);
    await fs.writeFile(
      existingJsonPath,
      JSON.stringify(existingData, null, 2),
      "utf-8"
    );
  }
  console.log(`Finished processing word: ${word}`);

  let duration = await getAudioDuration(audioPath);
  // add 1 sec to end
  duration += 1;

  const videoOutputPath = path.join(wordDir, `AA${word}-${pos}.mp4`);

  ffmpeg()
    .addInput(`${wordDir}/${word}-${pos}-image-text.png`)
    .loop(duration) // show the image for the entire audio duration
    .addInput(audioPath)
    .outputOptions(["-c:v libx264", "-c:a aac", "-b:a 192k", "-shortest"])
    .save(videoOutputPath);

  // create a similar video with alt audio
  const altVideoOutputPath = path.join(wordDir, `AA${word}-${pos}-alt.mp4`);

  const altDuration = (await getAudioDuration(altAudioPath)) + 1;

  ffmpeg()
    .addInput(`${wordDir}/${word}-${pos}-image-text.png`)
    .loop(altDuration) // show the image for the entire audio duration
    .addInput(altAudioPath)
    .outputOptions(["-c:v libx264", "-c:a aac", "-b:a 192k", "-shortest"])
    .save(altVideoOutputPath);

  console.log(`Generated videos for word: ${word}`);

  // there is image in ui/1.png, copy it to wordDir as well
  const srcImagePath = path.join(uiDir, "1.png");
  const destImagePath = path.join(wordDir, `${word}-reference.png`);
  await fs.copyFile(srcImagePath, destImagePath);

  // also put image into dictionary/images
  const dictImagePath = path.join(
    LOCAL_MNT_DICTIONARY,
    "images",
    `${word}-${Date.now()}.png`
  );
  await fs.copyFile(srcImagePath, dictImagePath);
}

takeScreenshot();
