// sort.ts
// Sorts a large JSON array of { sentId, sentence } by "sentence" w/o OOM.
//
// Usage:
//   npm i stream-json
//   ts-node sort.ts input.json output.json
//
// Or with Node (JS):
//   node sort.js input.json output.json

import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline";
import { pipeline } from "stream";
import { promisify } from "util";
import { chain } from "stream-chain";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/StreamArray";

const pump = promisify(pipeline);

type Row = { sentId: string; sentence: string };

const CHUNK_SIZE = 200_000; // adjust based on memory (e.g., 100k–500k)

function bySentence(a: Row, b: Row) {
  // Stable case-insensitive compare, tweak to your preference:
  return a.sentence.localeCompare(b.sentence, "en", { sensitivity: "base" });
}

async function* jsonArrayStreamer(filePath: string) {
  // Yields each element of the top-level JSON array as plain object
  const source = fs.createReadStream(filePath);
  const pipelineStream = chain([source, parser(), streamArray()]);
  for await (const { value } of pipelineStream as AsyncIterable<{
    key: number;
    value: Row;
  }>) {
    yield value;
  }
}

async function writeChunk(filePath: string, rows: Row[]) {
  rows.sort(bySentence);
  const ws = fs.createWriteStream(filePath, { encoding: "utf8" });
  for (const r of rows) {
    ws.write(JSON.stringify(r) + "\n");
  }
  await new Promise((res, rej) => ws.end(res));
}

class MinHeap<T> {
  private a: T[] = [];
  constructor(private cmp: (x: T, y: T) => number) {}
  push(x: T) {
    this.a.push(x);
    this.bubbleUp(this.a.length - 1);
  }
  pop(): T | undefined {
    if (this.a.length === 0) return undefined;
    const top = this.a[0];
    const last = this.a.pop()!;
    if (this.a.length > 0) {
      this.a[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }
  private bubbleUp(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(this.a[i], this.a[p]) >= 0) break;
      [this.a[i], this.a[p]] = [this.a[p], this.a[i]];
      i = p;
    }
  }
  private bubbleDown(i: number) {
    const n = this.a.length;
    while (true) {
      let m = i;
      const l = (i << 1) + 1,
        r = l + 1;
      if (l < n && this.cmp(this.a[l], this.a[m]) < 0) m = l;
      if (r < n && this.cmp(this.a[r], this.a[m]) < 0) m = r;
      if (m === i) break;
      [this.a[i], this.a[m]] = [this.a[m], this.a[i]];
      i = m;
    }
  }
}

async function mergeChunksToJsonArray(
  chunkFiles: string[],
  outputPath: string
) {
  type Cursor = {
    idx: number; // which chunk
    rl: readline.Interface;
    current: Row | null;
  };

  // open readers
  const readers: Cursor[] = [];
  for (let i = 0; i < chunkFiles.length; i++) {
    const rs = fs.createReadStream(chunkFiles[i], { encoding: "utf8" });
    const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
    readers.push({ idx: i, rl, current: null });
  }

  // init heap with first line from each chunk
  const heap = new MinHeap<Cursor>((a, b) => {
    // a.current and b.current should be non-null when in heap
    // but add fallback to keep TS happy.
    const av = a.current ?? ({ sentence: "" } as Row);
    const bv = b.current ?? ({ sentence: "" } as Row);
    return bySentence(av, bv);
  });

  // Read first lines
  for (const c of readers) {
    const iter = c.rl[Symbol.asyncIterator]();
    const first = await iter.next();
    (c as any)._iter = iter; // stash the iterator
    if (!first.done) {
      c.current = JSON.parse(first.value) as Row;
      heap.push(c);
    }
  }

  const ws = fs.createWriteStream(outputPath, { encoding: "utf8" });
  ws.write("[");
  let wroteAny = false;

  // k-way merge
  while (true) {
    const c = heap.pop();
    if (!c) break;
    const row = c.current!;
    if (wroteAny) ws.write(",");
    else wroteAny = true;
    ws.write(JSON.stringify(row));

    const iter: AsyncIterator<string> = (c as any)._iter;
    const nxt = await iter.next();
    if (!nxt.done) {
      c.current = JSON.parse(nxt.value) as Row;
      heap.push(c);
    } else {
      c.current = null;
      c.rl.close();
    }
  }

  ws.write("]");
  await new Promise((res, rej) => ws.end(res));

  // close any remaining
  await Promise.all(
    readers.map(
      (c) =>
        new Promise<void>((res) => {
          try {
            c.rl.close();
          } catch {}
          res();
        })
    )
  );
}

export async function sortJsonArray({ inPath, outPath }) {
  if (!inPath || !outPath) {
    console.error("Usage: node sort.js <input.json> <output.json>");
    process.exit(1);
  }

  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "sent-sort-")
  );
  const chunkFiles: string[] = [];

  // 1) Read input array, emit sorted chunks
  let buf: Row[] = [];
  let chunkIndex = 0;

  for await (const row of jsonArrayStreamer(inPath)) {
    // Filter/validate shape if needed
    if (!row || typeof row.sentence !== "string") continue;
    buf.push(row as Row);

    if (buf.length >= CHUNK_SIZE) {
      const chunkPath = path.join(tmpDir, `chunk-${chunkIndex++}.ndjson`);
      await writeChunk(chunkPath, buf);
      chunkFiles.push(chunkPath);
      buf = [];
    }
  }
  // flush remaining
  if (buf.length > 0) {
    const chunkPath = path.join(tmpDir, `chunk-${chunkIndex++}.ndjson`);
    await writeChunk(chunkPath, buf);
    chunkFiles.push(chunkPath);
  }

  // 2) Merge chunks into final sorted JSON array
  if (chunkFiles.length === 0) {
    // empty input
    await fs.promises.writeFile(outPath, "[]", "utf8");
  } else if (chunkFiles.length === 1) {
    // trivial: convert NDJSON to JSON array
    const ws = fs.createWriteStream(outPath, { encoding: "utf8" });
    const rl = readline.createInterface({
      input: fs.createReadStream(chunkFiles[0], { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    ws.write("[");
    let first = true;
    for await (const line of rl) {
      if (!line) continue;
      ws.write(first ? line : "," + line);
      first = false;
    }
    ws.write("]");
    await new Promise((res) => ws.end(res));
  } else {
    await mergeChunksToJsonArray(chunkFiles, outPath);
  }

  // 3) Cleanup temp files
  for (const f of chunkFiles) {
    try {
      await fs.promises.unlink(f);
    } catch {}
  }
  try {
    await fs.promises.rmdir(tmpDir);
  } catch {}

  console.log(`Sorted -> ${outPath}`);
}
