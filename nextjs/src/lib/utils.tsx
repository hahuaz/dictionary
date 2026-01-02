import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { GetWordDetailsResponse, SearchPopulatedResponse } from "@shared/types";
import {
  SITE_URL,
  AUDIO_URL,
  API_URL,
  LOCAL_API_URL,
  STOP_WORDS_EN,
} from "@/lib";
import { LETTER_BUCKETS } from "@shared/types/index";
import { DefListProps } from "@/components/DefList";
import Link from "next/link";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

/**
 * For each letter in the word, wait for a time proportional to its position in the alphabet.
 */
export async function waitForWord(word: string): Promise<void> {
  for (let i = 0; i < word.length; i++) {
    const char = word[i].toUpperCase(); // Ensure the character is in uppercase
    const charCode = char.charCodeAt(0) - 65 + 1; // Calculate wait time (A=1, B=2, ..., Z=26)

    if (charCode >= 1 && charCode <= 26) {
      // console.log(`Waiting for letter ${char} at position ${i + 1}...`);
      await new Promise((resolve) => setTimeout(resolve, charCode * 500)); // Wait for the corresponding time in seconds
    } else {
      console.log(`Skipping invalid character: ${char}`);
    }
  }
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/**
 * Schema.org JSON-LD using DefinedTermSet → DefinedTerm + example sentences as Quotation. It’s flexible (URLs, language, POS mapping, audio URL builder) and returns either an object or a <script> string.
 */
export function getLdjsonForWord(data: GetWordDetailsResponse) {
  const wordText = data.word;
  const wordUrl = getUrlForWord(wordText);
  const wordTitle = getTitleForWord(wordText);

  const entryId = `${wordUrl}#entry`;
  const senseBaseId = `${wordUrl}#sense`;
  const language = "en";
  const urlObject = new URL(wordUrl);

  const hasDefinedTerm = data.definitions
    .map((d, i) => {
      // only first three defs are handled
      if (i >= 2) return null;

      const rawPos = d.partOfSpeech || "";
      const posKey = rawPos.toLowerCase().trim(); // normalize for map lookup
      const posSlug = rawPos ? `-${slugify(rawPos)}` : "";
      const senseId = `${senseBaseId}${posSlug}-${i + 1}`;

      // Sentences as Quotation[] (only if present)
      // only include up to two sentences to avoid bloating the ld+json
      const subjectOf = [];

      for (let i = 0; i < Math.min(d.sentences.length, 1); i++) {
        const cur = d.sentences[i];
        const quote: any = {
          "@type": "Quotation",
          "@id": `${senseId}-q${i + 1}`,
          text: cur.sentence,
        };
        const url = getAudioUrlFromKey(cur.audio);

        quote.audio = {
          "@type": "AudioObject",
          contentUrl: url,
        };
        subjectOf.push(quote);
      }

      const sense: any = {
        "@type": "DefinedTerm",
        "@id": senseId,
        name: wordText,
        termCode: posKey,
        description: d.definition,
      };

      if (subjectOf) sense.subjectOf = subjectOf;

      return sense;
    })
    .filter((d) => d !== null);

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    inLanguage: language,
    url: wordUrl,
    name: wordTitle,
    mainEntity: {
      "@type": "DefinedTermSet",
      "@id": entryId,
      name: wordText,
      hasDefinedTerm,
    },
  };
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
}): DefListProps => {
  const createLinks = (text: string) =>
    text.split(/(\s+)/).map((token, i) => {
      // keep spaces as-is
      if (/^\s+$/.test(token)) return token;

      const clean = token.replace(/[.,!?;:()"]/g, "").toLowerCase();

      // don't link if current word
      if (clean === wordDetails.word.toLowerCase()) {
        return token;
      }

      // don't link if stop
      if (STOP_WORDS_EN.has(clean)) {
        return token;
      }

      if (allWords.includes(clean)) {
        return (
          <Link
            href={`/word/${encodeURIComponent(clean)}`}
            key={`${clean}-${i}`}
            className={"lnk"}
            prefetch={false}
          >
            {token}
          </Link>
        );
      }
      return token;
    });

  let defListProps: DefListProps = {
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

  return defListProps;
};

export const buildWordForms = ({
  wordDetails,
}: {
  wordDetails: GetWordDetailsResponse;
}): React.ReactElement => {
  const isPluralExists = wordDetails?.forms?.plural;
  const isDegreesExists =
    wordDetails?.forms?.comparative || wordDetails?.forms?.superlative;
  const isConjugationExists =
    wordDetails?.forms?.present_participle ||
    wordDetails?.forms?.past_tense ||
    wordDetails?.forms?.past_participle;

  if (!isPluralExists && !isDegreesExists && !isConjugationExists) {
    return <></>;
  }

  return (
    <div className="frms">
      {isPluralExists && (
        <p>
          <span>plural</span> <b>{wordDetails.forms?.plural}</b>
        </p>
      )}
      {isDegreesExists && (
        <p>
          <span>degrees</span>{" "}
          <b>
            {wordDetails.forms?.comparative}{" "}
            {wordDetails.forms?.superlative
              ? `- ${wordDetails.forms?.superlative}`
              : ""}
          </b>
        </p>
      )}
      {isConjugationExists && (
        <p>
          <span>conjugation</span>{" "}
          <b>
            {wordDetails.forms?.present_participle}
            {" - "}
            {wordDetails.forms?.past_tense}
            {" - "}
            {wordDetails.forms?.past_participle}
          </b>
        </p>
      )}
    </div>
  );
};
