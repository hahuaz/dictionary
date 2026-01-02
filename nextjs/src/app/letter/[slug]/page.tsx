import Link from "next/link";

import { searchPopulated, SITE_NAME } from "@/lib";

import { LETTER_BUCKETS, LetterBucket } from "@shared/types/index";

export const generateStaticParams = async () => {
  return LETTER_BUCKETS.map((letter) => {
    return {
      slug: letter.toLowerCase(),
    };
  });
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: LetterBucket }>;
}) {
  const { slug: letter } = await params;

  return {
    title: `${SITE_NAME} - Practice English`,
    description: `Words that starts with letter "${letter}".`,
  };
}

const LetterPage = async ({
  params,
}: {
  params: Promise<{ slug: LetterBucket }>;
}) => {
  const { slug: letter } = await params;

  const words = await searchPopulated({
    prefix: letter,
  }).then((res) => res.map((w) => w.word));

  return (
    <section className="landing-section letter-page">
      <div className="container">
        <div className="letters-nav">
          {LETTER_BUCKETS.map((e) => {
            e = e.toLowerCase() as LetterBucket;
            return (
              <span
                className={`letter-item ${e === letter ? "active" : ""}`}
                key={e}
              >
                <Link href={`/letter/${e}`} prefetch={false}>
                  {e.toUpperCase()}
                </Link>
              </span>
            );
          })}
        </div>

        <div className="words-grid">
          {words.map((word, i) => (
            <span key={i} className="word">
              <Link href={`/word/${word}`} prefetch={false}>
                {i + 1 + ". " + word}
              </Link>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LetterPage;
