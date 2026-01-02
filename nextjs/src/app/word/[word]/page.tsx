import type { Metadata } from "next";
import { cache } from "react";

import {
  getWordDetails,
  getTitleForWord,
  getLdjsonForWord,
  getAllWords,
  buildDefListProps,
  buildWordForms,
} from "@/lib";
import DefList, { DefListProps } from "@/components/DefList";

// both react body and generateMetadata making same api call, cache it within the same render
const getWordDetailsCached = cache(async (word: string) => {
  return getWordDetails({ word });
});

export async function generateStaticParams() {
  // in dev mode, SSG is disabled
  if (process.env.NODE_ENV === "development") {
    return [];
  }
  const allWords = await getAllWords();

  const staticParams = allWords.map((word) => {
    return {
      word,
    };
  });
  return staticParams;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ word: string }>;
}): Promise<Metadata> {
  const { word: paramWord } = await params;

  const { word, definitions } = await getWordDetailsCached(paramWord);

  const title = getTitleForWord(word);

  const { definition, sentences } = definitions[0];

  // sometimes only definition exists e.g. page for a past tense of verb
  let description: string;
  if (!sentences?.[0]?.sentence) {
    description = `${definition}`;
  } else {
    description = `${definition}: ${sentences?.[0]?.sentence}`;
  }

  return {
    title,
    description,
  };
}

export default async function SentencePage({
  params,
}: {
  params: Promise<{
    word: string;
  }>;
}) {
  // for server side rendering, slug is dynamic meaning it is defined at runtime by request so we need to await it at next.js@15
  // for static site generation, slug can be considered static at react component level because generateStaticParams() is produced it during build time
  // paramWord is in the url-encoded format. don't use it directly in the ui but use it in the api call
  const { word: paramWord } = await params;

  // in static site generation, even react body calls are made at build time and you won't see any request at client side. this have following downsides: you won't see latest data and to see them, site needs to be rebuilt
  // you can utilize useEffect on word to fetch data at client side but site will suffer from SEO perspective
  const wordDetails = await getWordDetailsCached(paramWord);
  // console.log("wordDetails", wordDetails);

  const allWords = await getAllWords();

  // build everything before passing to client component
  const defListProps = buildDefListProps({
    wordDetails,
    allWords,
  });

  const wordForms = buildWordForms({ wordDetails });

  // // json-ld disabled since google seems to ignore it
  // const jsonLdSection = (
  //   <script
  //     type="application/ld+json"
  //     dangerouslySetInnerHTML={{
  //       __html: JSON.stringify(getLdjsonForWord(wordDetails)),
  //     }}
  //   ></script>
  // );
  return (
    <main>
      <section className="landing-section">
        <div className="container wrdPage">
          <DefList defList={defListProps} wordForms={wordForms} />
        </div>
      </section>
    </main>
  );
}
