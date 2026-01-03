import {
  Word,
  WordDefinition,
  PartOfSpeech,
  SentenceHead,
  SentId,
  WordHead,
} from "../../src/types";

export type {
  Word,
  WordDefinition,
  PartOfSpeech,
  SentenceHead,
  SentId,
  WordHead,
};

export const LETTER_BUCKETS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "Y",
  "Z",
  // "X",
  // "#",
] as const;

export type LetterBucket = (typeof LETTER_BUCKETS)[number];

// Api request types

export type CreateWord = {
  word: Word;
  definitions: {
    definition: string;
    partOfSpeech: PartOfSpeech;
    sentences: string[];
    existingSentences?: {
      sentId: SentId;
      sentence: string;
    }[];
  }[];
};

// Api response types

export type GetWordDetailsResponse = {
  word: Word;
  forms: WordHead["forms"];
  definitions: {
    definition: WordDefinition["definition"];
    partOfSpeech: WordDefinition["partOfSpeech"];
    sentences: {
      sentence: SentenceHead["sentence"];
      audio: SentenceHead["audioS3Key"];
    }[];
  }[];
};

export type SearchPopulatedResponse = {
  word: Word;
  createdAt: number;
}[];
