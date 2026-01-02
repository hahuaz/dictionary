import { LETTER_BUCKETS, LetterBucket } from "../../shared/types";

// primitive branded types
export type Word = string & { readonly __brand: "Word" };
export type SentId = string & { readonly __brand: "SentId" };
export type DefinitionId = `${number}` & { readonly __brand: "DefinitionId" };

export type BaseDBItem = {
  createdAt: number;
};

// TODO: check all existing types for PartOfSpeech values and expand
// [
//   "noun",
//   "verb",
//   "adjective",
//   "pronoun",
//   "adverb",
//   "interjection",
//   "conjunction",
//   "preposition",
//   "possessive determiner",
//   "determiner",
//   "phrase",
//   "modal verb",
//   "phrasal verb",
//   "adverb, preposition",
//   "verb phrase",
//   "suffix",
//   "particle",
//   "prefix",
//   "auxiliary verb",
//   "relative adverb"
// ]

export type PartOfSpeech =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "pronoun"
  | "preposition"
  | "conjunction"
  | "interjection"
  | "modal verb"
  | (string & {});

export type PK_Word = `WORD#${Word}`;
export type PK_Sent = `SENT#${SentId}`;

// {
//   "PK": "WORD#delete",
//   "SK": "WORD#",
//   "word": "delete",
//   "PrefixSearchPK": "LETTER#D",
//   "PrefixSearchSK": "delete",
//   "createdAt": "1759254017388",
// }
export interface WordHead extends BaseDBItem {
  PK: PK_Word;
  SK: "WORD#";
  word: Word;
  PrefixSearchPK: `LETTER#${LetterBucket}`;
  PrefixSearchSK: Word;
  forms?: {
    plural: string | null;
    comparative: string | null;
    superlative: string | null;
    present_participle: string | null;
    past_tense: string | null;
    past_participle: string | null;
  };
  // indicates that this word is not the base form but plural, tense, comparative (e.g., "running", "countries")
  isInflected?: boolean;
}

export type FormKey = keyof NonNullable<WordHead["forms"]>;

// {
//   "PK": "WORD#delete",
//   "SK": "DEF#0",
//   "partOfSpeech": "noun"
//   "definition": "A command or action that removes text, data, or files",
//   "createdAt": "1759254017786",
// }
export interface WordDefinition extends BaseDBItem {
  PK: PK_Word;
  SK: `DEF#${DefinitionId}`;
  partOfSpeech: PartOfSpeech;
  definition: string;
}

// {
//   "PK": "SENT#9999e91a-51f2-4158-b137-803a98251f8e",
//   "SK": "SENT#",
//   "sentence": "He decided to delete the old emails from his inbox."
//   "audioS3Key": "9999e91a-51f2-4158-b137-803a98251f8e",
//   "createdAt": "1759254029493",
// }
export interface SentenceHead extends BaseDBItem {
  PK: PK_Sent;
  SK: "SENT#";
  sentence: string;
  audioS3Key: SentId;
}

// {
//   "PK": "WORD#delete",
//   "SK": "SENT#33c84bce-295b-4fc7-a6c1-1edee5d4fbf0",
//   "sentId": "33c84bce-295b-4fc7-a6c1-1edee5d4fbf0",
//   "definitionId": "1",
//   "SentenceWordsPK": "SENT#33c84bce-295b-4fc7-a6c1-1edee5d4fbf0",
//   "SentenceWordsSK": "WORD#delete",
//   "createdAt": "1759255130924",
// }
export interface WordToSentenceEdge extends BaseDBItem {
  PK: PK_Word;
  SK: PK_Sent;
  sentId: SentId;
  definitionId: DefinitionId;
  SentenceWordsPK: PK_Sent;
  SentenceWordsSK: PK_Word;
}

// runtime type assertions / conversions
export function asWord(s: string): Word {
  if (!s || s.includes("#"))
    throw new Error("Invalid Word (empty or contains '#').");
  return s as Word;
}

export function asSentId(s: string): SentId {
  if (!s) throw new Error("Invalid SentId (empty).");
  return s as SentId;
}

export function asDefId(n: number | string): DefinitionId {
  const str = typeof n === "number" ? String(n) : n;
  if (!/^\d+$/.test(str))
    throw new Error("DefinitionId must be numeric digits.");
  return str as DefinitionId;
}

export function asLetterBucket(ch: string): LetterBucket {
  ch = ch.toUpperCase();
  // TS can't narrow `u` from includes(), so we do one narrow cast at return.
  if ((LETTER_BUCKETS as readonly string[]).includes(ch)) {
    return ch as LetterBucket;
  }
  throw new Error(`Invalid char for LetterBucket: ${ch}`);
}

// helpers to work with PKs
export const pkFromWord = (s: Word): PK_Word => `WORD#${s}`;
export const pkFromSentId = (s: SentId): PK_Sent => `SENT#${s}`;

export const wordFromPk = (pk: PK_Word): Word => {
  if (!pk.startsWith("WORD#"))
    throw new Error("Invalid PK, does not start with WORD#: " + pk);
  return pk.slice(5) as Word;
};

export const sentIdFromPk = (pk: PK_Sent): SentId => {
  if (!pk.startsWith("SENT#"))
    throw new Error("Invalid PK, does not start with SENT#: " + pk);
  return pk.slice(5) as SentId;
};

export const defIdFromSK = (sk: WordDefinition["SK"]): DefinitionId => {
  if (!sk.startsWith("DEF#"))
    throw new Error("Invalid SK, does not start with DEF#: " + sk);
  return sk.slice(4) as DefinitionId;
};

// constructors
export function makeWordHead({
  word,
  createdAt,
  isInflected = false,
}: {
  word: Word;
  createdAt: number;
  isInflected?: boolean;
}): WordHead {
  if (!word || word.length === 0) {
    throw new Error("Invalid word");
  }
  const letterBucket = asLetterBucket(word[0]);
  return {
    PK: pkFromWord(word),
    SK: "WORD#",
    word,
    PrefixSearchPK: `LETTER#${letterBucket}`,
    PrefixSearchSK: word,
    createdAt,
    isInflected,
  };
}

export function makeWordDefinition({
  word,
  defId,
  partOfSpeech,
  definition,
  createdAt,
}: {
  word: Word;
  defId: DefinitionId;
  partOfSpeech: PartOfSpeech;
  definition: string;
  createdAt: number;
}): WordDefinition {
  return {
    PK: pkFromWord(word),
    SK: `DEF#${defId}`,
    partOfSpeech,
    definition,
    createdAt,
  };
}

export function makeSentenceHead({
  sentId,
  sentence,
  createdAt,
}: {
  sentId: SentId;
  sentence: string;
  createdAt: number;
}): SentenceHead {
  return {
    PK: pkFromSentId(sentId),
    SK: "SENT#",
    sentence,
    audioS3Key: sentId,
    createdAt,
  };
}

export function makeEdge({
  word,
  sentId,
  definitionId,
  createdAt,
}: {
  word: Word;
  sentId: SentId;
  createdAt: number;
  definitionId: DefinitionId;
}): WordToSentenceEdge {
  return {
    PK: pkFromWord(word),
    SK: pkFromSentId(sentId),
    sentId,
    definitionId,
    createdAt,
    SentenceWordsPK: pkFromSentId(sentId),
    SentenceWordsSK: pkFromWord(word),
  };
}

// type guards
export function isWordHead(x: any): x is WordHead {
  return (
    !!x &&
    typeof x.PK === "string" &&
    x.PK.startsWith("WORD#") &&
    x.SK === "WORD#" &&
    typeof x.word === "string" &&
    typeof x.createdAt === "number" &&
    typeof x.PrefixSearchPK === "string" &&
    x.PrefixSearchPK.startsWith("LETTER#") &&
    x.PrefixSearchSK === x.word
  );
}

export function isWordDefinition(x: any): x is WordDefinition {
  return (
    !!x &&
    typeof x.PK === "string" &&
    x.PK.startsWith("WORD#") &&
    typeof x.SK === "string" &&
    x.SK.startsWith("DEF#") &&
    typeof x.definition === "string" &&
    typeof x.partOfSpeech === "string"
  );
}

export function isSentenceHead(x: any): x is SentenceHead {
  return (
    !!x &&
    typeof x.PK === "string" &&
    x.PK.startsWith("SENT#") &&
    x.SK === "SENT#" &&
    typeof x.sentence === "string" &&
    typeof x.audioS3Key === "string"
  );
}

export function isWordToSentenceEdge(x: any): x is WordToSentenceEdge {
  if (
    !x ||
    typeof x.PK !== "string" ||
    !x.PK.startsWith("WORD#") ||
    typeof x.SK !== "string" ||
    !x.SK.startsWith("SENT#") ||
    typeof x.sentId !== "string" ||
    typeof x.SentenceWordsPK !== "string" ||
    typeof x.SentenceWordsSK !== "string"
  )
    return false;

  const pkWordStr = x.PK.slice(5); // after "WORD#"
  const skSentStr = x.SK.slice(5); // after "SENT#"
  return (
    x.SentenceWordsPK === `SENT#${x.sentId}` &&
    x.SentenceWordsSK === `WORD#${pkWordStr}` &&
    skSentStr === x.sentId
  );
}
