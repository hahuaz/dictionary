import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Search, Volume2 } from "lucide-react";

import DefList from "@/components/DefList";
import { buildDefListProps, getAllWords, getWordDetails } from "@/lib";
import { SITE_NAME } from "@/lib/constants";

import "./index.scss";

export const metadata: Metadata = {
  title: `${SITE_NAME} - Learn English with example sentences`,
  description:
    "Practice and improve your English with thousands of example sentences with pronunciation.",
};

export default async function Home() {
  const wordDetails = await getWordDetails({ word: "light" });

  const allWords = await getAllWords();

  let defListProps = buildDefListProps({
    wordDetails,
    allWords,
  });

  defListProps = {
    word: wordDetails.word,
    definitions: defListProps.definitions.slice(0, 2),
  };

  const checkSvg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mr-2 h-5 w-5 text-primary"
    >
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );

  return (
    <main>
      {/* SECTION 1 */}
      <section className="landing-section home-hero">
        <div className="content container-lg">
          <div className="header">
            <h1 className="title-lg">Read, Hear & Learn in Sentence</h1>
            <p className="subtitle-lg">
              Experience words in context with audio-supported examples.
            </p>
          </div>
          <div className="feature-wrapper">
            <div className="feature-list">
              <div className="feature-card">
                <Volume2 className="icon-primary" />
                <h3 className="feature-title">Listen Examples</h3>
                <p className="feature-desc">
                  Hear how words are pronounced in whole sentences
                </p>
              </div>
              <div className="feature-card">
                <Search className="icon-primary" />
                <h3 className="feature-title">Search Words</h3>
                <p className="feature-desc">
                  Instantly find example sentences for any word
                </p>
              </div>
              <div className="feature-card">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon-primary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 8V4H8"></path>
                  <rect width="16" height="12" x="4" y="8" rx="2"></rect>
                  <path d="M2 14h2"></path>
                  <path d="M20 14h2"></path>
                  <path d="M15 13v2"></path>
                  <path d="M9 13v2"></path>
                </svg>
                <h3 className="feature-title">Multiple Meanings</h3>
                <p className="feature-desc">See how words change meaning</p>
              </div>
            </div>
            <div>
              <Link href="/letter/a">
                <button className="btn">Explore All Words</button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2 */}
      <section className="how-it-works">
        <div className="container-lg">
          <div className="how-grid">
            <div className="how-text">
              <div className="badge-muted">How it works</div>
              <h2 className="how-title">Hear words in context</h2>
              <p className="how-description">
                Search for any word and we'll show you multiple example
                sentences with audio playback so you can hear how it's used.
                <br />
                Repeat the audio as many times as you need to gain confidence in
                your pronunciation.
              </p>
            </div>
            <div className="how-list">
              <DefList defList={defListProps} />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3 */}
      <section className="mission">
        <div className="container-lg">
          <div className="mission-grid">
            <div className="mission-col">
              <div className="badge-muted">Our Mission</div>
              <h2 className="heading-xl">
                Education should be accessible by everyone
              </h2>
              <p className="text-lg-muted">
                We believe that language learning resources should be available
                to all, regardless of background or circumstance. That's why
                we've created a platform that's free to use, with no barriers to
                entry.
              </p>
              <ul className="check-list">
                <li>
                  {checkSvg}
                  <span>No subscription required</span>
                </li>
                <li>
                  {checkSvg}
                  <span>Available on any device</span>
                </li>

                <li>
                  {checkSvg}
                  <span>Designed for all learning levels</span>
                </li>
              </ul>
            </div>

            <div className="mission-col">
              <div className="badge-muted">Our Approach</div>
              <h2 className="heading-xl">Education should be effective</h2>
              <p className="text-lg-muted">
                Learning words in isolation isn't enough. Our approach focuses
                on context and real-world usage, helping you understand not just
                what words mean, but how they're actually used.
              </p>
              <ul className="check-list">
                <li>
                  {checkSvg}
                  <span>Learn through authentic examples</span>
                </li>
                <li>
                  {checkSvg}
                  <span> Hear proper pronunciation</span>
                </li>
                <li>
                  {checkSvg}
                  <span>Understand nuance and context</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="center-cta">
            <Link href="/word/ability">
              <button className="btn">See an example</button>
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 4 */}
      <section className="start-learning">
        <div className="container">
          <div className="start-content">
            <div>
              <h2 className="heading-xl">Start learning today</h2>
              <p className="text-lg-muted">
                Expand your vocabulary by hearing words used in real sentences
              </p>
            </div>

            <div className="categories">
              <h3 className="category-title">Popular Categories</h3>
              <div className="category-grid">
                <button className="btn__outline">🎓 Academic</button>
                <button className="btn__outline">💼 Business</button>
                <button className="btn__outline">🗣️ Conversation</button>
                <button className="btn__outline">📚 Literature</button>
                <button className="btn__outline">🔬 Science</button>
                <button className="btn__outline">🎭 Arts</button>
                <button className="btn__outline">🌐 Technology</button>
                <button className="btn__outline">✈️ Travel</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
