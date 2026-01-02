import type { MetadataRoute } from "next";

import { getUrlForWord, searchPopulated, searchWords, SITE_URL } from "@/lib";
import { LETTER_BUCKETS } from "@shared/types";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let sitemap: MetadataRoute.Sitemap = [];

  const staticDate = new Date("2025-01-01");

  // Add static pages
  sitemap = sitemap.concat([
    {
      url: SITE_URL,
      lastModified: staticDate,
    },
    {
      url: `${SITE_URL}about`,
      lastModified: staticDate,
    },
    {
      url: `${SITE_URL}terms`,
      lastModified: staticDate,
    },
  ]);

  // Add dynamic pages
  const allWordHeads: Awaited<ReturnType<typeof searchPopulated>> = [];
  for (const letterBucket of LETTER_BUCKETS) {
    const letter = letterBucket.toLowerCase();
    const words = await searchPopulated({ prefix: letter });
    allWordHeads.push(...words);
  }

  sitemap = sitemap.concat(
    allWordHeads.map((wh) => ({
      url: getUrlForWord(wh.word),
      lastModified: new Date(wh.createdAt),
    }))
  );

  console.log("sitemap length", sitemap.length);
  return sitemap;
}
