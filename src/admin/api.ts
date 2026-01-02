import express from "express";
import cors from "cors";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { fromIni } from "@aws-sdk/credential-providers";
import { Readable } from "stream";

import {
  createWord,
  findFirstMultiWordSentence,
  createWordToSentenceEdge,
  getWordDetails,
  getWordsFromSentence,
  addDefToWord,
  addSentencesToWord,
  searchPopulated,
  deleteWord,
  dumpAllSentencesToJson,
  sortJsonArray,
  LOCAL_SAVE_DIR,
  PATH_ALL_SENTENCES,
  dumpAllWordsToJson,
  PATH_SORTED_SENTENCES,
  deleteAudioForSentence,
  createAudioForSentence,
  deleteSentence,
  wordsCreatedBeforeDate,
  listAllPartOfSpeech,
  normalizeAllDefinitions,
  addFormsToExistingWord,
  searchBaseWords,
} from "@/lib";
import { SentId, Word } from "@/types";
import path from "path";

const { APP_REGION } = process.env;

let searchPopulatedCache: { [prefix: string]: any } = {};
let searchBaseWordsCache: { [prefix: string]: any } = {};

const credentials = fromIni({ profile: process.env.MY_AWS_PROFILE });

const s3 = new S3Client({
  region: APP_REGION,
  credentials: credentials,
});
const dynamodbClient = new DynamoDBClient({
  region: APP_REGION,
  credentials: credentials,
});
const docClient = DynamoDBDocumentClient.from(dynamodbClient);

const app = express();
const router = express.Router();
const PORT = process.env.PORT || 5555;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// log incoming requests
// app.use((req, res, next) => {
//   console.log(`${req.method} ${req.url}`);
//   next();
// });

// Routes
router.post("/word", async (req, res) => {
  let statusCode: number = 200;
  const word = req.body[0].word;

  await deleteWord({
    word,
    docClient,
    s3,
  });

  for (const wordDetail of req.body) {
    statusCode = await createWord({
      wordDetail,
      docClient,
      s3,
    });
  }

  res.status(statusCode).json({ message: "ok" });
});

router.delete("/word", async (req, res) => {
  const word = req.query.word as Word;

  await deleteWord({
    word,
    docClient,
    s3,
  });

  res.status(200).json({ message: "ok" });
});

router.get("/word", async (req, res) => {
  const word = req.query.word as Word;
  if (!word) {
    res.status(400).json({ message: "word is required" });
    return;
  }

  const wordDetails = await getWordDetails({
    word,
    docClient,
  });

  res.status(200).json(wordDetails);
});

router.delete("/sentence", async (req, res) => {
  const sentId = req.query.sentId as SentId;
  if (!sentId) {
    res.status(400).json({ message: "sentId is required" });
    return;
  }

  await deleteSentence({
    sentId,
    docClient,
    s3,
  });

  res.status(200).json({ message: "ok" });
});

router.get("/search-populated", async (req, res) => {
  const prefix = req.query.prefix as string;
  if (!prefix) {
    res.status(400).json({ message: "prefix is required" });
    return;
  }

  if (searchPopulatedCache[prefix]) {
    res.status(200).json(searchPopulatedCache[prefix]);
    return;
  }

  console.log("cache miss for prefix:", prefix);
  const results = await searchPopulated({
    prefix,
    docClient,
  });

  searchPopulatedCache[prefix] = results;

  res.status(200).json(results);
});

router.get("/search-base-words", async (req, res) => {
  const prefix = req.query.prefix as string;
  if (!prefix) {
    res.status(400).json({ message: "prefix is required" });
    return;
  }
  
  if (searchBaseWordsCache[prefix]) {
    res.status(200).json(searchBaseWordsCache[prefix]);
    return;
  }

  console.log("cache miss for prefix:", prefix);  
  const results = await searchBaseWords({
  prefix,
  docClient,
});

searchBaseWordsCache[prefix] = results;

res.status(200).json(results);
});

router.post("/add-def-to-word", async (req, res) => {
  console.log("req.body", req.body);

  await addDefToWord({
    word: req.body.word,
    def: req.body.definition,
    partOfSpeech: req.body.partOfSpeech,
    sentences: req.body.sentences,
    docClient,
    s3,
  });

  res.status(200).json({ message: "ok" });
});

router.post("/add-sentences-to-word", async (req, res) => {
  await addSentencesToWord({
    word: req.body.word,
    defId: req.body.defId,
    sentences: req.body.sentences,
    docClient,
    s3,
  });

  res.status(200).json({ message: "ok" });
});

router.post("/word-to-sentence", async (req, res) => {
  await createWordToSentenceEdge({
    word: req.body.word,
    defId: req.body.definitionId,
    sentId: req.body.sentId,
    docClient,
  });

  res.status(200).json({ message: "ok" });
});

router.get("/words-from-sentence", async (req, res) => {
  const sentId = req.query.sentId as SentId;
  if (!sentId) {
    res.status(400).json({ message: "sentId is required" });
    return;
  }

  const relationItems = await getWordsFromSentence({
    sentId,
    docClient,
  });

  res.status(200).json({ words: relationItems });
});

router.get("/find-first-multi-word-sentence", async (req, res) => {
  const result = await findFirstMultiWordSentence({
    docClient,
  });
  console.log("findFirstMultiWordSentence result", result);
  res.status(200).json(result);
});

router.get("/proxy", async (req, res) => {
  const target = req.query.url;
  if (typeof target !== "string" || !target) {
    res.status(400).json({ message: "url is required" });
  }

  // Basic safety: allow only http(s) and (optionally) an allowlist of hosts
  let url: URL;
  try {
    url = new URL(target as string);
    if (!["http:", "https:"].includes(url.protocol)) {
      res.status(400).json({ message: "Only http/https allowed" });
    }
    // Example allowlist (uncomment & edit as needed)
    // const ALLOWED_HOSTS = new Set(["example.com", "cdn.example.com"]);
    // if (!ALLOWED_HOSTS.has(url.hostname)) {
    //   return res.status(403).json({ message: "Host not allowed" });
    // }
  } catch {
    res.status(400).json({ message: "Invalid url" });
  }

  const controller = new AbortController();
  // If the client disconnects, abort the upstream fetch
  req.on("close", () => controller.abort());

  try {
    const upstream = await fetch(url!, {
      signal: controller.signal,
      redirect: "follow",
      // Forward Range so the player can seek
      headers: {
        ...(req.headers.range ? { Range: String(req.headers.range) } : {}),
        // Some CDNs care about UA/Referer
        ...(req.get("user-agent")
          ? { "User-Agent": req.get("user-agent")! }
          : {}),
        ...(req.get("referer") ? { Referer: req.get("referer")! } : {}),
      },
    });

    if (!upstream.ok && upstream.status !== 206) {
      res.status(upstream.status).send(await upstream.text());
    }

    // Content headers
    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    const acceptRanges = upstream.headers.get("accept-ranges") || "bytes";
    const cacheControl =
      upstream.headers.get("cache-control") || "private, max-age=3600";

    // Set CORS if you need cross-origin access to *your* proxy
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", cacheControl);

    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);

    // 206 if partial content, else mirror the status (usually 200)
    res.status(upstream.status === 206 ? 206 : upstream.status);

    if (!upstream.body) res.end();

    // Stream the upstream body to the client
    // Node 18+: convert Web ReadableStream -> Node Readable
    Readable.fromWeb(upstream.body as any).pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ message: "Error fetching URL" });
    }
  }
});

router.post("/add-forms", async (req, res) => {
  for (const body of req.body) {
    await addFormsToExistingWord({
      body,
      docClient,
    });
  }

  res.status(200).json({ message: "ok" });
});

router.get("/ping", async (req, res) => {
  let message: any = "pong";

  const results = await searchBaseWords({
    prefix: "sa",
    docClient,
  });
  console.log("results", results);

  // await normalizeAllDefinitions({
  //   docClient,
  // });

  // await wordsCreatedBeforeDate({
  //   docClient,
  //   date: new Date("2025-10-01"),
  // });

  // await listAllPartOfSpeech({
  //   docClient,
  // });

  // await dumpAllWordsToJson({
  //   docClient,
  // });

  // message = await dumpAllSentencesToJson({
  //   docClient,
  // });

  // await sortJsonArray({
  //   inPath: PATH_ALL_SENTENCES,
  //   outPath: PATH_SORTED_SENTENCES,
  // });

  res.status(200).json({ message });
});

// Mount router
app.use("/api", router);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
