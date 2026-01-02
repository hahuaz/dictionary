// import { clsx, type ClassValue } from "clsx";
// import { twMerge } from "tailwind-merge";
import type {
  GetWordDetailsResponse,
  SearchPopulatedResponse,
} from "../../../shared/types";
import { LETTER_BUCKETS } from "../../../shared/types/index";
import {
  SITE_URL,
  AUDIO_URL,
  API_URL,
  LOCAL_API_URL,
  STOP_WORDS_EN,
} from "./constants";

// export function cn(...inputs: ClassValue[]) {
//   return twMerge(clsx(inputs));
// }

/**
 * Fetch all the words that start with a given prefix.
 * It can be utilized with alphabet to get all words in the database to create static pages or for search.
 */
export async function searchWords({
  prefix,
  includeAuthToken = true,
  // TODO: use signal to abort request
  signal,
}: {
  prefix: string;
  // build search won't be restricted by including auth token but client search will be
  includeAuthToken?: boolean;
  signal?: AbortSignal;
}): Promise<string[]> {
  const response = await fetch(`${API_URL}search?prefix=${prefix}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      // TODO: remove auth token implementation
      ...(includeAuthToken && {
        Authorization: `Bearer ${process.env.APIGATEWAY_AUTH_TOKEN}`,
      }),
    },
  });
  const data = await response.json();
  return data;
}

export async function getAllWords(): Promise<string[]> {
  const allWords: Awaited<ReturnType<typeof searchPopulated>> = [];

  for (let letterBucket of LETTER_BUCKETS) {
    // transfer letter to lowercase because in the api, prefix is case-insensitive
    const letter = letterBucket.toLowerCase();

    const words = await searchPopulated({ prefix: letter });
    allWords.push(...words);
  }
  // only return the word strings
  return allWords.map((w) => w.word);
}

export async function searchPopulated({
  prefix,
  signal,
}: {
  prefix: string;
  signal?: AbortSignal;
}): Promise<SearchPopulatedResponse> {
  const response = await fetch(
    `${LOCAL_API_URL}search-populated?prefix=${prefix}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal,
    }
  );
  const data = await response.json();
  // order by word ascending
  data.sort((a: { word: string }, b: { word: string }) =>
    a.word.localeCompare(b.word)
  );

  return data;
}

export async function searchBaseWords({
  prefix,
  signal,
}: {
  prefix: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  const response = await fetch(
    `${LOCAL_API_URL}search-base-words?prefix=${prefix}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal,
    }
  );
  const data = await response.json();
  return data;
}

export async function getWordDetails({
  word,
}: {
  word: string;
}): Promise<GetWordDetailsResponse> {
  const response = await fetch(`${LOCAL_API_URL}word?word=${word}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const data = await response.json();
  return data;
}

export function getUrlForWord(word: string): string {
  return `${SITE_URL}word/${encodeURIComponent(word)}`;
}

export function getTitleForWord(word: string): string {
  return `${word.toUpperCase()} Definition, Example & Pronunciation`;
}

export function getAudioUrlFromKey(key: string): string | null {
  if (!key) return null;
  return `${AUDIO_URL}${key}`;
}
const isDev = process.env.NODE_ENV === "development";

export const buildDefListProps = ({
  allWords,
  wordDetails,
}: {
  allWords: string[];
  wordDetails: GetWordDetailsResponse;
}) => {
  const createLinks = (text: string): string => {
    return text
      .split(/(\s+)/)
      .map((token) => {
        if (/^\s+$/.test(token)) return token;

        const clean = token.replace(/[.,!?;:()"]/g, "").toLowerCase();

        if (clean === wordDetails.word.toLowerCase()) return token;
        if (STOP_WORDS_EN.has(clean)) return token;

        if (allWords.includes(clean)) {
          const url = `/word/${encodeURIComponent(clean)}`;
          return `<a href="${url}" class="lnk">${token}</a>`;
        }

        return token;
      })
      .join("");
  };

  return {
    word: wordDetails.word,
    definitions: wordDetails.definitions.map((def) => ({
      ...def,
      builtDefinition: createLinks(def.definition),
      sentences: def.sentences.map((sent) => ({
        builtSentence: createLinks(sent.sentence),
        sentence: sent.sentence,
        audio: sent.audio,
      })),
    })),
  };
};
