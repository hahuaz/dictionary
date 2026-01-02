import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { once } from "events";
import path from "path";
import fs from "fs/promises";

import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  BatchGetCommand,
  TransactWriteCommand,
  ScanCommand,
  QueryCommandInput,
  BatchGetCommandInput,
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

import {
  speechSynthesis,
  chunk,
  LOCAL_SAVE_DIR,
  PATH_ALL_SENTENCES,
} from "@/lib";
import {
  // brands & enums
  Word,
  SentId,
  DefinitionId,
  PartOfSpeech,
  // item shapes (for clarity at call sites / refactors)
  WordHead,
  WordDefinition,
  SentenceHead,
  WordToSentenceEdge,
  // constructors & helpers
  asWord,
  asSentId,
  asDefId,
  asLetterBucket,
  makeWordHead,
  makeWordDefinition,
  makeSentenceHead,
  makeEdge,
  isWordDefinition,
  isWordToSentenceEdge,
  pkFromSentId,
  defIdFromSK,
  sentIdFromPk,
  pkFromWord,
  wordFromPk,
  PK_Sent,
  isWordHead,
  FormKey,
} from "@/types";

import {
  SearchPopulatedResponse,
  GetWordDetailsResponse,
  CreateWord,
  LETTER_BUCKETS,
} from "../../shared/types";

const { V4_SINGLE_TABLE_NAME, SENTENCE_BUCKET_NAME } = process.env;

/**
 * Creates a new word along with its definitions and example sentences.
 * 1. check if word exists
 * 2. create word head
 * 3. create definitions
 * 4. create audio
 * 5. create sentence heads
 * 6. create word-to-sentence edges
 */
export async function createWord(payload: {
  wordDetail: CreateWord;
  docClient: DynamoDBDocumentClient;
  s3: S3Client;
}) {
  let { wordDetail } = payload;
  const { docClient, s3 } = payload;

  const isValid = validateCreateWordRequest([wordDetail]);
  if (!isValid) {
    throw new Error("word is not valid");
  }

  wordDetail = refactorCreateWordRequest(wordDetail);
  let { word, definitions } = wordDetail;

  // 1. check if word exists
  const exists = await isWordExists({ word, docClient });
  if (exists) {
    const message = `Word "${word}" already exists.`;
    console.log(message);
    return 400;
  }

  const createdAt = Date.now();
  // 2. create WORD head (with search attributes)
  await createWordHead({ word, docClient, createdAt });
  console.log("created WORD head:", word);

  for (let i = 0; i < definitions.length; i++) {
    const { definition, partOfSpeech, sentences, existingSentences } =
      definitions[i];
    const defId = asDefId(i);

    // 3. create definitions
    await createWordDefinition({
      word,
      defId,
      partOfSpeech,
      definition,
      docClient,
      createdAt,
    });
    console.log("created definition:", defId, definition);

    for (let j = 0; j < sentences?.length; j++) {
      const sentenceText = sentences[j];
      const sentId = asSentId(randomUUID());

      // 4. create audio
      await createAudioForSentence({ sentenceText, sentId, s3 });

      // 5. create sentence heads
      await createSentenceHead({
        sentId,
        sentence: sentenceText,
        docClient,
        createdAt,
      });

      // 6. create word-to-sentence edges
      await createWordToSentenceEdge({
        word,
        defId,
        sentId,
        docClient,
        skipExistenceCheck: true,
      });

      console.log("created sentence:", sentenceText);
    }

    // link existing sentences if any
    if (existingSentences && existingSentences.length > 0) {
      for (const { sentId, sentence } of existingSentences) {
        await createWordToSentenceEdge({
          word,
          defId,
          sentId,
          docClient,
        });
        console.log(`linked existing sentence :`, sentence);
      }
    }
  }
  return 200;
}

/**
 * Given a prefix, search for words that start with that prefix.
 * @param param0
 */
export async function searchWords({
  prefix,
  limit = null,
  docClient,
}: {
  prefix: string;
  limit?: number | null;
  docClient: DynamoDBDocumentClient;
}): Promise<Word[]> {
  const first = prefix[0].toUpperCase();
  const pkBucket = asLetterBucket(first);

  const params: QueryCommandInput = {
    TableName: V4_SINGLE_TABLE_NAME!,
    IndexName: "PrefixSearchV2",
    KeyConditionExpression:
      "PrefixSearchPK = :pk AND begins_with(PrefixSearchSK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": `LETTER#${pkBucket}`,
      ":prefix": prefix,
    },
    // GSI only includes keys so other attributes are not available
    ProjectionExpression: "PrefixSearchSK",
  };
  if (limit) params.Limit = limit;
  const { Items } = await docClient.send(new QueryCommand(params));
  if (!Items?.length) return [];
  const words = Items.map((it) => asWord(it.PrefixSearchSK!));
  return words;
}

/**
 * Given a prefix, search for words that start with that prefix.
 * @param param0
 */
export async function searchBaseWords({
  prefix,
  limit = null,
  docClient,
}: {
  prefix: string;
  limit?: number | null;
  docClient: DynamoDBDocumentClient;
}): Promise<Word[]> {
  const first = prefix[0].toUpperCase();
  const pkBucket = asLetterBucket(first);

  const params: QueryCommandInput = {
    TableName: V4_SINGLE_TABLE_NAME!,
    IndexName: "PrefixSearchV2",
    ExpressionAttributeValues: {
      ":pk": `LETTER#${pkBucket}`,
      ":prefix": prefix,
      ":falseVal": false,
    },
    KeyConditionExpression:
      "PrefixSearchPK = :pk AND begins_with(PrefixSearchSK, :prefix)",
    FilterExpression:
      "isInflected = :falseVal OR attribute_not_exists(isInflected)",
  };

  if (limit) params.Limit = limit;
  const { Items } = await docClient.send(new QueryCommand(params));
  if (!Items?.length) return [];
  const words = Items.map((it) => asWord(it.PrefixSearchSK!));
  return words;
}

/**
 * Given a prefix, search words that are populated with other attribtues. Attributes extended as needed.
 */
export async function searchPopulated({
  prefix,
  limit = null,
  docClient,
}: {
  prefix: string;
  limit?: number | null;
  docClient: DynamoDBDocumentClient;
}): Promise<SearchPopulatedResponse> {
  const first = prefix[0].toUpperCase();
  const pkBucket = asLetterBucket(first);

  const params: QueryCommandInput = {
    TableName: V4_SINGLE_TABLE_NAME!,
    IndexName: "PrefixSearchV2",
    KeyConditionExpression:
      "PrefixSearchPK = :pk AND begins_with(PrefixSearchSK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": `LETTER#${pkBucket}`,
      ":prefix": prefix,
    },
    // GSI only includes keys so other attributes are not available
    ProjectionExpression: "PrefixSearchSK, PK, SK",
  };

  if (limit) params.Limit = limit;

  const { Items } = await docClient.send(new QueryCommand(params));
  if (!Items?.length) return [];

  const searchItems = Items as Partial<WordHead>[];

  const wordRecords: WordHead[] = [];
  for (const chunkedKeys of chunk(
    searchItems.map((it) => ({ PK: it.PK!, SK: it.SK! })),
    100
  )) {
    const input: BatchGetCommandInput = {
      RequestItems: {
        [V4_SINGLE_TABLE_NAME!]: {
          Keys: chunkedKeys,
        },
      },
    };

    const { Responses } = await docClient.send(new BatchGetCommand(input));
    if (Responses?.[V4_SINGLE_TABLE_NAME!]) {
      wordRecords.push(...(Responses[V4_SINGLE_TABLE_NAME!] as WordHead[]));
    }
  }

  const words = wordRecords.map((e) => {
    return {
      word: e.word,
      createdAt: e.createdAt,
    };
  });

  return words;
}

export async function wordsCreatedBeforeDate({
  date,
  docClient,
}: {
  date: Date;
  docClient: DynamoDBDocumentClient;
}): Promise<Word[]> {
  // use searchpopulated to scan all words
  let words: any[] = [];
  for (let bucket of LETTER_BUCKETS) {
    const results = await searchPopulated({
      prefix: bucket.toLowerCase(),
      docClient,
    });

    console.log("results", results);
    words.push(...results);
  }

  if (!words || words.length === 0) return [];

  // turn date into timestamp
  const timestamp = date.getTime();

  words = words
    .filter((w) => {
      return w.createdAt < timestamp;
    })
    .map((w) => w.word);

  // save to old_words.json
  const oldwordspath = path.join(LOCAL_SAVE_DIR, "old_words.json");

  await fs.writeFile(oldwordspath, JSON.stringify(words, null, 2), {
    encoding: "utf8",
  });
  console.log(`Saved ${words.length} words to ${oldwordspath}`);
  return words;
}

/**
 * Given a word, fetch its definitions and example sentences, grouped by definition.
 * 1. get word aggregate (all definitions + edges)
 * 2. split definitions and edges
 * 3. map definitionId → set of sentIds
 * 4. batch get all sentence heads
 * 5. build API response
 */
export async function getWordDetails({
  word,
  docClient,
}: {
  word: Word;
  docClient: DynamoDBDocumentClient;
}): Promise<any> {
  // 1. get word aggregate (all definitions + edges)
  const wordAgg = await getWordAggregate({ docClient, word });
  if (wordAgg.length === 0) {
    return null;
  }

  const wordHead = wordAgg.find(isWordHead) as WordHead | undefined;

  if (!wordHead) {
    throw new Error(`Word head not found for word "${word}"`);
  }

  // 2. split definitions and word-to-sentence edges
  const defs: WordDefinition[] = wordAgg.filter(isWordDefinition);
  const wordToSentenceEdges: WordToSentenceEdge[] =
    wordAgg.filter(isWordToSentenceEdge);

  // if no definitions, return
  if (defs.length === 0) {
    console.warn(`Word "${word}" has no definitions.`);
    throw new Error("Data integrity error");
  }

  // 3. map definitionId → set of sentIds
  const defToSentences = new Map<DefinitionId, Set<SentId>>();
  for (const definition of defs) {
    defToSentences.set(defIdFromSK(definition.SK), new Set());
  }

  for (const wordToSentence of wordToSentenceEdges) {
    const defId = wordToSentence.definitionId;
    const set = defToSentences.get(defId);
    if (!set) {
      console.warn(
        `${JSON.stringify(
          wordToSentence
        )} definitionId has no matching definition in ${JSON.stringify(defs)}`
      );
      // TODO: fix
      // throw new Error("Data integrity error");
    } else {
      set.add(sentIdFromPk(wordToSentence.SK));
    }
  }

  // 4. batch get all sentence heads
  const allSentIds = Array.from(
    new Set(Array.from(defToSentences.values()).flatMap((s) => Array.from(s)))
  );
  const sentIdToSentence = await batchGetSentenceHeads(docClient, allSentIds);

  // 6. build API response
  const response = buildWordDetailsResponse({
    wordHead,
    defs,
    defToSentences,
    sentIdToSentence,
  });

  return response;
}

/**
 * Given a sentence ID, fetch all words that refers to this sentence.
 */
export async function getWordsFromSentence({
  sentId,
  docClient,
}: {
  sentId: SentId;
  docClient: DynamoDBDocumentClient;
}): Promise<Word[]> {
  const { Items } = await docClient.send(
    new QueryCommand({
      TableName: V4_SINGLE_TABLE_NAME!,
      IndexName: "SentenceWords",
      KeyConditionExpression: "SentenceWordsPK = :pk",
      ExpressionAttributeValues: { ":pk": pkFromSentId(sentId) },
    })
  );

  if (!Items || Items.length === 0) return [];

  const words = Items.map((e) => {
    return wordFromPk(e.SentenceWordsSK);
  }).filter(Boolean) as Word[];

  return words;
}

// TODO: find all sentences that have more than one word linked to it
export async function findFirstMultiWordSentence({
  pageLimit = 100,
  docClient,
}: {
  pageLimit?: number;
  docClient: DynamoDBDocumentClient;
}): Promise<{ sentenceId: SentId; words: Word[] } | null> {
  const seen = new Map<SentId, Set<Word>>();
  let lastKey: Record<string, any> | undefined;

  do {
    const res = await docClient.send(
      new ScanCommand({
        TableName: V4_SINGLE_TABLE_NAME!,
        IndexName: "SentenceWords",
        ProjectionExpression: "SentenceWordsPK, SentenceWordsSK",
        Limit: pageLimit,
        ExclusiveStartKey: lastKey,
      })
    );

    for (const it of res.Items ?? []) {
      const item: Pick<
        WordToSentenceEdge,
        "SentenceWordsPK" | "SentenceWordsSK"
      > = it as any;
      const sentPk = item.SentenceWordsPK;
      const wordSk = item.SentenceWordsSK;

      const sentId = sentIdFromPk(sentPk);
      const word = wordFromPk(wordSk);

      let set = seen.get(sentId);
      if (!set) {
        set = new Set<Word>();
        seen.set(sentId, set);
      }
      set.add(word);

      if (set.size >= 2) {
        return { sentenceId: sentId, words: Array.from(set) };
      }
    }

    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  return null;
}

/**
 * Creates example sentences for an existing word and definition.
 */
export async function addSentencesToWord(payload: {
  word: Word;
  defId: DefinitionId;
  sentences: string[];
  docClient: DynamoDBDocumentClient;
  s3: S3Client;
}) {
  const { word, defId, sentences, docClient, s3 } = payload;
  let created = 0;

  for (const sentenceText of sentences) {
    const sentId = asSentId(randomUUID());
    const createdAt = Date.now();

    await createAudioForSentence({ sentenceText, sentId, s3 });

    await createSentenceHead({
      sentId,
      sentence: sentenceText,
      docClient,
      createdAt,
    });

    await createWordToSentenceEdge({
      word,
      defId,
      sentId,
      docClient,
      skipExistenceCheck: false,
    });

    created++;
  }

  return {
    statusCode: 200,
  };
}

/**
 * Given an existing word and new definition + example sentences, create definition and sentences.
 * Existing word is required
 * DefinitionId is incremental. Find the max existing definitionId and add 1.
 */
export async function addDefToWord(payload: {
  word: Word;
  def: string;
  partOfSpeech: PartOfSpeech;
  sentences: string[];
  docClient: DynamoDBDocumentClient;
  s3: S3Client;
}) {
  const { word, def, partOfSpeech, sentences, docClient, s3 } = payload;

  // 1. fetch existing definitions to find max defId
  const items = await getWordAggregate({ docClient, word });
  if (items.length === 0) {
    throw new Error(`Word "${word}" does not exist.`);
  }

  const defs: WordDefinition[] = items.filter(isWordDefinition);

  if (defs.length === 0) {
    throw new Error(
      `Word "${word}" has no existing definitions. Delete and recreate?`
    );
  }

  const existingDefIds = defs.map((d) => defIdFromSK(d.SK));
  const maxDefId = Math.max(...existingDefIds.map((id) => Number(id)));
  const newDefId = asDefId(maxDefId + 1);
  const createdAt = Date.now();

  // 2. create new definition
  await createWordDefinition({
    word,
    defId: newDefId,
    partOfSpeech,
    definition: def,
    docClient,
    createdAt,
  });
  console.log("created definition:", newDefId, def);

  // 3. create sentences and edges
  for (const sentenceText of sentences) {
    const sentId = asSentId(randomUUID());
    await createAudioForSentence({ sentenceText, sentId, s3 });

    await createSentenceHead({
      sentId,
      sentence: sentenceText,
      docClient,
      createdAt,
    });

    await createWordToSentenceEdge({
      word,
      defId: newDefId,
      sentId,
      docClient,
      skipExistenceCheck: false,
    });

    console.log("created sentence:", sentenceText);
  }
}

/**
 * Creates word-to-sentence edge (relation) for an existing word, definition, and sentence.
 */
export async function createWordToSentenceEdge({
  word,
  defId,
  sentId,
  docClient,
  skipExistenceCheck = false,
}: {
  word: Word;
  defId: DefinitionId;
  sentId: SentId;
  docClient: DynamoDBDocumentClient;
  // if client calls this function, check existence; if called internally from createWord, skip
  skipExistenceCheck?: boolean;
}) {
  if (!word || !defId || !sentId) {
    throw new Error("word, defId, and sentId are required");
  }

  const now = Date.now();

  const edgeItem = makeEdge({
    word,
    sentId,
    createdAt: now,
    definitionId: defId,
  });

  const TransactItems: any[] = [];

  if (!skipExistenceCheck) {
    TransactItems.push(
      {
        ConditionCheck: {
          TableName: V4_SINGLE_TABLE_NAME!,
          Key: { PK: pkFromWord(word), SK: `DEF#${defId}` },
          ConditionExpression: "attribute_exists(PK)",
        },
      },
      {
        ConditionCheck: {
          TableName: V4_SINGLE_TABLE_NAME!,
          Key: { PK: pkFromSentId(sentId), SK: "SENT#" },
          ConditionExpression: "attribute_exists(PK)",
        },
      }
    );
  }

  // always add the Put
  TransactItems.push({
    Put: {
      TableName: V4_SINGLE_TABLE_NAME!,
      Item: edgeItem,
      ConditionExpression:
        "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    },
  });

  await docClient.send(
    new TransactWriteCommand({
      TransactItems,
    })
  );
}

export async function dumpAllWordsToJson({
  docClient,
  endDate,
}: {
  docClient: DynamoDBDocumentClient;
  // the dump will include words created before endDate
  endDate?: Date;
}) {
  const outPath = path.join(LOCAL_SAVE_DIR, `all_words.json`);

  // const ws = createWriteStream(outPath, { encoding: "utf8" });
  // const writeOrDrain = async (chunk: string) => {
  //   if (!ws.write(chunk)) await once(ws, "drain");
  // };

  // let wroteAny = false;
  // await writeOrDrain("[");

  // try {
  //   for (const bucket of LETTER_BUCKETS) {
  //     let lastKey: Record<string, any> | undefined;

  //     do {
  //       // list the entire bucket using endDate filter if provided
  //       const res = await docClient.send(
  //         new QueryCommand({
  //           TableName: V4_SINGLE_TABLE_NAME!,
  //           IndexName: "PrefixSearchV2",
  //           KeyConditionExpression: "PrefixSearchPK = :pk",
  //           ExpressionAttributeValues: {
  //             ":pk": `LETTER#${bucket}`,
  //           },
  //           ExclusiveStartKey: lastKey,
  //         })
  //       );

  //       for (const it of res.Items ?? []) {
  //         // Prefer 'word', else derive from base PK if the GSI is KEYS_ONLY
  //         const raw =
  //           (it as any).word ??
  //           (typeof (it as any).PK === "string" &&
  //           (it as any).PK.startsWith("WORD#")
  //             ? (it as any).PK.slice(5)
  //             : undefined);

  //         if (!raw) continue;

  //         const w = asWord(raw);

  //         if (wroteAny) await writeOrDrain(",");
  //         else wroteAny = true;

  //         await writeOrDrain(JSON.stringify(w));
  //       }

  //       lastKey = res.LastEvaluatedKey;
  //     } while (lastKey);
  //   }
  // } finally {
  //   await writeOrDrain("]");
  //   ws.end();
  // }

  // sort by letter count in a word
  const fileData = await fs.readFile(outPath, "utf-8");
  const words: string[] = JSON.parse(fileData);
  words.sort((a, b) => a.length - b.length);
  await fs.writeFile(outPath, JSON.stringify(words, null, 2), "utf-8");
}

export async function dumpAllSentencesToJson({
  docClient,
}: {
  docClient: DynamoDBDocumentClient;
}) {
  const outPath = PATH_ALL_SENTENCES;

  const ws = createWriteStream(outPath, { encoding: "utf8" });
  const writeOrDrain = async (chunk: string) => {
    if (!ws.write(chunk)) await once(ws, "drain");
  };

  let wroteAny = false;
  await writeOrDrain("[");

  try {
    let lastKey: Record<string, any> | undefined;

    do {
      const res = await docClient.send(
        new ScanCommand({
          TableName: V4_SINGLE_TABLE_NAME!,
          ProjectionExpression: "PK, SK, sentence",
          FilterExpression: "begins_with(PK, :pk) AND SK = :sk",
          ExpressionAttributeValues: {
            ":pk": "SENT#",
            ":sk": "SENT#",
          },
          ExclusiveStartKey: lastKey,
        })
      );

      for (const it of res.Items ?? []) {
        const sentence = (it as any).sentence as string | undefined;
        if (!sentence) continue;

        const sentId = sentIdFromPk((it as any).PK);

        if (wroteAny) await writeOrDrain(",");
        else wroteAny = true;

        await writeOrDrain(JSON.stringify({ sentId, sentence }));
      }

      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
  } finally {
    await writeOrDrain("]");
    ws.end();
  }

  return { outPath, wroteCount: wroteAny ? "≥1" : ("0" as const) };
}

export async function deleteWord({
  word,
  docClient,
  s3,
}: {
  word: Word;
  docClient: DynamoDBDocumentClient;
  s3: S3Client;
}): Promise<void> {
  // 1) Load aggregate (head + defs + edges)
  const aggItems = await getWordAggregate({ docClient, word });
  if (!aggItems.length) {
    console.log(`Word "${word}" does not exist.`);
    return;
  }

  // 2) Which sentences become orphaned after we remove this word's edges?
  const edges = aggItems.filter(isWordToSentenceEdge);
  const sentenceIds = Array.from(
    new Set(edges.map((e) => sentIdFromPk(e.SK)).filter(Boolean))
  ) as SentId[];

  const sentencesToDelete: SentId[] = [];
  for (const sid of sentenceIds) {
    const wordsPointing = await getWordsFromSentence({
      sentId: sid,
      docClient,
    });
    // if only this word points to it (<=1), once we delete the edge it becomes orphan → delete
    if ((wordsPointing?.length ?? 0) <= 1) {
      sentencesToDelete.push(sid);
    }
  }

  // 3) Delete the entire word aggregate (head + defs + edges), one by one
  for (const it of aggItems) {
    await docClient.send(
      new DeleteCommand({
        TableName: V4_SINGLE_TABLE_NAME!,
        Key: { PK: `WORD#${word}`, SK: (it as any).SK },
      })
    );
  }

  // 4) Delete orphaned sentences (head) one by one
  for (const sid of sentencesToDelete) {
    await docClient.send(
      new DeleteCommand({
        TableName: V4_SINGLE_TABLE_NAME!,
        Key: { PK: pkFromSentId(sid), SK: "SENT#" },
      })
    );
  }

  // 5) Delete S3 audio objects (key = sentId) one by one
  for (const sid of sentencesToDelete) {
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: SENTENCE_BUCKET_NAME!,
          Key: sid,
        })
      );
    } catch (e) {
      console.warn(`Failed to delete S3 audio for ${sid}:`, e);
    }
  }
}

// unexported helpers

async function createSentenceHead({
  sentId,
  sentence,
  docClient,
  createdAt = Date.now(),
}: {
  sentId: SentId;
  sentence: string;
  docClient: DynamoDBDocumentClient;
  createdAt?: number;
}) {
  const sentenceItem: SentenceHead = makeSentenceHead({
    sentId,
    sentence,
    createdAt,
  });
  await docClient.send(
    new PutCommand({
      TableName: V4_SINGLE_TABLE_NAME!,
      Item: sentenceItem,
      ConditionExpression:
        "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    })
  );
}

async function createWordHead({
  word,
  docClient,
  createdAt = Date.now(),
  isInflected = false,
}: {
  word: Word;
  docClient: DynamoDBDocumentClient;
  createdAt?: number;
  isInflected?: boolean;
}) {
  const wordHead = makeWordHead({
    word,
    createdAt,
    isInflected,
  });

  await docClient.send(
    new PutCommand({
      TableName: V4_SINGLE_TABLE_NAME!,
      Item: wordHead,
      ConditionExpression: "attribute_not_exists(PK)", // idempotency
    })
  );
}

async function createWordDefinition({
  word,
  defId,
  partOfSpeech,
  definition,
  docClient,
  createdAt = Date.now(),
}: {
  word: Word;
  defId: DefinitionId;
  partOfSpeech: PartOfSpeech;
  definition: string;
  docClient: DynamoDBDocumentClient;
  createdAt?: number;
}) {
  const defItem: WordDefinition = makeWordDefinition({
    word,
    defId,
    partOfSpeech,
    definition,
    createdAt,
  });

  await docClient.send(
    new PutCommand({
      TableName: V4_SINGLE_TABLE_NAME!,
      Item: defItem,
      ConditionExpression:
        "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    })
  );
}
async function getWordAggregate({
  docClient,
  word,
}: {
  docClient: DynamoDBDocumentClient;
  word: Word;
}) {
  const items: Array<WordDefinition | WordToSentenceEdge> = [];
  let lastKey: Record<string, any> | undefined;

  do {
    const input: QueryCommandInput = {
      TableName: V4_SINGLE_TABLE_NAME!,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `WORD#${word}` },
      // we only need DEF fields + edge SK/definitionId
      // TODO: definition is reserved keyword for dynamodb and using it throws error
      // ProjectionExpression:
      //   "SK, createdAt, definition, partOfSpeech, definitionId",
      ExclusiveStartKey: lastKey,
    };
    const res = await docClient.send(new QueryCommand(input));
    if (res.Items?.length) items.push(...(res.Items as any[]));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

async function batchGetSentenceHeads(
  docClient: DynamoDBDocumentClient,
  sentIds: SentId[]
): Promise<Map<SentId, SentenceHead>> {
  const map = new Map<SentId, SentenceHead>();
  for (const ids of chunk(sentIds, 100)) {
    const input: BatchGetCommandInput = {
      RequestItems: {
        [V4_SINGLE_TABLE_NAME!]: {
          Keys: ids.map((id) => ({ PK: pkFromSentId(id), SK: "SENT#" })),
          ProjectionExpression: "PK, SK, sentence, audioS3Key, createdAt",
        },
      },
    };
    const res = await docClient.send(new BatchGetCommand(input));
    const sentenceHeads = (res.Responses?.[V4_SINGLE_TABLE_NAME!] ??
      []) as SentenceHead[];
    for (const s of sentenceHeads) {
      const id = sentIdFromPk(s.PK);
      map.set(id, s);
    }
  }
  return map;
}

const buildWordDetailsResponse = ({
  wordHead,
  defs,
  defToSentences,
  sentIdToSentence,
}: {
  wordHead: WordHead;
  defs: WordDefinition[];
  defToSentences: Map<DefinitionId, Set<SentId>>;
  sentIdToSentence: Map<SentId, SentenceHead>;
}): GetWordDetailsResponse => {
  // 1) sort definitions to keep UI consistent
  const orderedDefs = [...defs].sort(
    (a, b) => Number(defIdFromSK(a.SK)) - Number(defIdFromSK(b.SK))
  );

  // 2) map each definition → { definition, sentences }
  const definitionsResp: GetWordDetailsResponse["definitions"] =
    orderedDefs.map((def) => {
      const defId = defIdFromSK(def.SK);

      // collect & sort sentences for this def
      const sentenceHeads: SentenceHead[] = Array.from(
        defToSentences.get(defId) ?? []
      )
        .map((id) => sentIdToSentence.get(id))
        .filter((s): s is SentenceHead => !!s)
        // sort sentences to keep UI consistent by SK
        .sort((a, b) => a.SK.localeCompare(b.SK));

      return {
        definition: def.definition,
        partOfSpeech: def.partOfSpeech,
        sentences: sentenceHeads.map((s) => ({
          sentence: s.sentence,
          audio: s.audioS3Key,
        })),
      };
    });

  // build forms

  return {
    word: wordHead.word,
    forms: wordHead.forms,
    definitions: definitionsResp,
  };
};

/**
 * Checks the existence of a word in the database.
 */
async function isWordExists({
  word,
  docClient,
}: {
  word: Word;
  docClient: DynamoDBDocumentClient;
}): Promise<boolean> {
  const res = await docClient.send(
    new GetCommand({
      TableName: V4_SINGLE_TABLE_NAME!,
      Key: { PK: `WORD#${word}`, SK: "WORD#" },
      ProjectionExpression: "PK",
    })
  );
  return Boolean(res.Item);
}

export async function createAudioForSentence({
  sentenceText,
  sentId,
  s3,
}: {
  sentenceText: string;
  sentId: SentId;
  s3: S3Client;
}): Promise<void> {
  const audioBuffer = await speechSynthesis({
    text: sentenceText,
  });
  await s3.send(
    new PutObjectCommand({
      Bucket: SENTENCE_BUCKET_NAME!,
      Key: sentId,
      Body: audioBuffer,
    })
  );
}

export async function deleteAudioForSentence({
  sentId,
  s3,
}: {
  sentId: SentId;
  s3: S3Client;
}): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: SENTENCE_BUCKET_NAME!,
      Key: sentId,
    })
  );
}

// given sentence id, delete sentence from db, audio from s3, all edges from db
export async function deleteSentence({
  sentId,
  docClient,
  s3,
}: {
  sentId: SentId;
  docClient: DynamoDBDocumentClient;
  s3: S3Client;
}): Promise<void> {
  // 1) delete sentence head
  await docClient.send(
    new DeleteCommand({
      TableName: V4_SINGLE_TABLE_NAME!,
      Key: { PK: pkFromSentId(sentId), SK: "SENT#" },
    })
  );

  // 2) delete audio from s3
  await deleteAudioForSentence({ sentId, s3 });

  // 3) delete all edges pointing to this sentence
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: V4_SINGLE_TABLE_NAME!,
        IndexName: "SentenceWords",
        KeyConditionExpression: "SentenceWordsPK = :pk",
        ExpressionAttributeValues: { ":pk": pkFromSentId(sentId) },
        ProjectionExpression: "PK, SK",
        ExclusiveStartKey: lastKey,
      })
    );

    for (const it of res.Items ?? []) {
      await docClient.send(
        new DeleteCommand({
          TableName: V4_SINGLE_TABLE_NAME!,
          Key: { PK: it.PK, SK: it.SK },
        })
      );
    }

    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
}

// Validate the incoming request data for creating a new word.
export function validateCreateWordRequest(data: any): data is CreateWord[] {
  if (!Array.isArray(data)) return false;
  for (const item of data) {
    if (typeof item.word !== "string") return false;
    if (!Array.isArray(item.definitions)) return false;
    for (const def of item.definitions) {
      if (typeof def.definition !== "string") return false;
      if (typeof def.partOfSpeech !== "string") return false;
      if (def.sentences) {
        if (!Array.isArray(def.sentences)) return false;
        for (const sent of def.sentences) {
          if (typeof sent !== "string") return false;
        }
      }
      if (def.existingSentences) {
        if (!Array.isArray(def.existingSentences)) return false;
        for (const exSent of def.existingSentences) {
          if (
            typeof exSent.sentId !== "string" ||
            typeof exSent.sentence !== "string"
          )
            return false;
        }
      }
    }
  }
  return true;
}

// refactor incomin request for creating a new word
export function refactorCreateWordRequest(item: any): CreateWord {
  const word: Word = item.word.trim().toLowerCase() as Word;
  const definitions: CreateWord["definitions"] = item.definitions.map(
    (def: any) => {
      let definition: string = def.definition.trim().toLowerCase();
      // remove dots at the end
      if (definition.endsWith(".")) {
        definition = definition.slice(0, -1);
      }
      const partOfSpeech: PartOfSpeech = def.partOfSpeech;
      const sentences: string[] | undefined = def.sentences
        ? def.sentences.map((s: string) => s.trim())
        : undefined;
      const existingSentences:
        | { sentId: SentId; sentence: string }[]
        | undefined = def.existingSentences
        ? def.existingSentences.map((exSent: any) => ({
            sentId: asSentId(exSent.sentId),
            sentence: exSent.sentence.trim(),
          }))
        : undefined;

      return {
        definition,
        partOfSpeech,
        sentences,
        existingSentences,
      };
    }
  );

  return {
    word,
    definitions,
  };
}

// scan word definitions and save partofspeech to a set then log the set
export async function listAllPartOfSpeech({
  docClient,
}: {
  docClient: DynamoDBDocumentClient;
}) {
  const partOfSpeechSet = new Set<PartOfSpeech>();
  let lastKey: Record<string, any> | undefined;

  do {
    // scan should only include DEF# starts with
    const res = await docClient.send(
      new ScanCommand({
        TableName: V4_SINGLE_TABLE_NAME!,
        ProjectionExpression: "partOfSpeech",
        FilterExpression: "begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":sk": "DEF#",
        },
        ExclusiveStartKey: lastKey,
      })
    );

    for (const it of res.Items ?? []) {
      const pos = (it as any).partOfSpeech as PartOfSpeech | undefined;
      if (pos) {
        partOfSpeechSet.add(pos);
      }
    }

    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  console.log("All Part of Speech:", Array.from(partOfSpeechSet));
  return Array.from(partOfSpeechSet);
}

// get all the definitions via #DEF and lowercase them and rewrite them to db if changed
export async function normalizeAllDefinitions({
  docClient,
}: {
  docClient: DynamoDBDocumentClient;
}) {
  let lastKey: Record<string, any> | undefined;
  let updatedCount = 0;

  do {
    // scan should only include DEF# starts with
    const res = await docClient.send(
      new ScanCommand({
        TableName: V4_SINGLE_TABLE_NAME!,
        FilterExpression: "begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":sk": "DEF#",
        },
        ExclusiveStartKey: lastKey,
      })
    );

    for (const it of res.Items ?? []) {
      const defItem: WordDefinition = it as any;
      const originalDef = defItem.definition;
      let normalizedDef = originalDef.trim().toLowerCase();
      // remove dots at the end
      if (normalizedDef.endsWith(".")) {
        normalizedDef = normalizedDef.slice(0, -1);
      }

      if (normalizedDef !== originalDef) {
        // update the definition in db
        defItem.definition = normalizedDef;
        await docClient.send(
          new PutCommand({
            TableName: V4_SINGLE_TABLE_NAME!,
            Item: defItem,
          })
        );
        updatedCount++;
        console.log(
          `Updated definition for ${defItem.PK} ${defItem.SK}: "${originalDef}" → "${normalizedDef}"`
        );
      }
    }

    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  console.log(
    `Normalized definitions completed. Total updated: ${updatedCount}`
  );
  return updatedCount;
}

// add forms to existing word
// {
//   "word": "light",
//   "plural": "lights",
//   "comparative": "lighter",
//   "superlative": "lightest",
//   "present_participle": "lighting",
//   "past_tense": "lit",
//   "past_participle": "lit"
// }
export async function addFormsToExistingWord(payload: {
  body: any;
  docClient: DynamoDBDocumentClient;
}) {
  const { body, docClient } = payload;
  const { word, ...forms } = body;

  if (!word || typeof word !== "string") {
    throw new Error("Valid word is required.");
  }

  const lowercaseWord = word.toLowerCase();

  const validForms = Object.entries(forms).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, any>);

  if (Object.keys(validForms).length === 0) {
    console.warn("No valid forms provided to add.", body);
    return;
  }

  // Get existing item to merge forms
  const existingItem = await isWordExists({
    word: lowercaseWord,
    docClient,
  } as { word: Word; docClient: DynamoDBDocumentClient });
  if (!existingItem) {
    throw new Error(`Word "${word}" does not exist.`);
  }

  // Update with merged forms
  const result = await docClient.send(
    new UpdateCommand({
      TableName: process.env.V4_SINGLE_TABLE_NAME,
      Key: {
        PK: `WORD#${lowercaseWord}`,
        SK: "WORD#",
      },
      UpdateExpression: "SET #forms = :forms",
      ExpressionAttributeNames: {
        "#forms": "forms",
      },
      ExpressionAttributeValues: {
        ":forms": validForms,
      },
    })
  );

  // TODO: consider createing word ref if it's irregular like good better best
  // create word ref from forms if word doesn't exist
  // // if forms of tense same as the base word filter
  // // for word act, acted is past_tense and past_participle.
  // // for word cut, base word is same as past_tense and past_participle

  // const pendingWords: any = [];

  // Object.entries(validForms).forEach(([formKey, form]) => {
  //   const formWord = form.toLowerCase();
  //   if (formWord === lowercaseWord) {
  //     return;
  //   }

  //   // if pendingWords already has formWord, skip
  //   if (pendingWords.find((pw: any) => pw.formWord === formWord)) {
  //     return;
  //   }

  //   let partOfSpeech: PartOfSpeech = "unknown";
  //   let definition: string = `Form of the word ${lowercaseWord}`;

  //   if (formKey === "plural") {
  //     partOfSpeech = "noun";
  //     definition = `plural form of ${lowercaseWord}`;
  //   } else if (formKey === "comparative") {
  //     partOfSpeech = "adjective";
  //     definition = `comparative form of ${lowercaseWord}`;
  //   } else if (formKey === "superlative") {
  //     partOfSpeech = "adjective";
  //     definition = `superlative form of ${lowercaseWord}`;
  //   } else if (formKey === "present_participle") {
  //     partOfSpeech = "verb";
  //     definition = `present participle of ${lowercaseWord}`;
  //   } else if (formKey === "past_tense" || formKey === "past_participle") {
  //     partOfSpeech = "verb";

  //     if (
  //       forms?.past_tense &&
  //       forms?.past_participle &&
  //       forms.past_tense === forms.past_participle
  //     ) {
  //       // shared form
  //       definition = `past tense and past participle of ${lowercaseWord}`;
  //     } else if (formKey === "past_tense") {
  //       definition = `past tense of ${lowercaseWord}`;
  //     } else {
  //       definition = `past participle of ${lowercaseWord}`;
  //     }
  //   }

  //   pendingWords.push({ formWord, partOfSpeech, definition });
  // });

  // console.log("pendingWords", pendingWords);

  // // loop through pendingWords and create word heads and definitions one by one
  // for (const pending of pendingWords) {
  //   const { formWord, partOfSpeech, definition } = pending;

  //   const exists = await isWordExists({ word: formWord, docClient });

  //   if (!exists) {
  //     await createWordHead({
  //       word: formWord,
  //       docClient,
  //       isInflected: true,
  //     });

  //     // create word definition without sentences
  //     await createWordDefinition({
  //       word: formWord,
  //       defId: asDefId(0),
  //       partOfSpeech,
  //       definition,
  //       docClient,
  //     });
  //   }
  // }
}
