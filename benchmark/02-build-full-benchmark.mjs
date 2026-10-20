#!/usr/bin/env node
// Full-benchmark step 2: merge the reused dry-run cache (486 domains) with
// the freshly fetched remainder (benchmark/01-fetch-remaining.mjs) into one
// 1000-row dataset, then emit:
//
//   benchmark/full-scan-cache.jsonl        - 1000 rows, every domain from
//     the Tranco-74V6X-top1000 list, status ok/error, both stock and
//     page_contents metrics for the ok rows. Superset of dry-run's cache.
//
//   benchmark/page-contents-benchmark.jsonl - same header+rows shape as the
//     original stock-mode artifact (dry-run/source-tranco-74V6X-render.jsonl),
//     but reporting page_contents-mode metrics: total_chunks, char_length,
//     total_words (markdown/plain countMode). It intentionally does NOT
//     carry anchorCoverage/meta_tags/html_sha256 — those come from
//     measureChunks() and extractMetaTags() in the production pipeline
//     (bin/chatgpt-render-benchmark.mjs), which this dry-run-derived cache
//     never ran (see benchmark/page-contents-vs-stock-full.md, "Schema
//     scope" for why that line was not re-run here). The fields present are
//     exactly the ones the comparison in step 4 needs and were specified in
//     the task: chunk count, chunk boundaries, word count (both countModes),
//     and total character count before chunking.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(__dirname, '..', 'dry-run', 'source-tranco-74V6X-render.jsonl');
const DRY_RUN_CACHE = join(__dirname, '..', 'dry-run', 'full-scan-cache.jsonl');
const REMAINING_CACHE = join(__dirname, 'remaining-scan-cache.jsonl');
const FULL_CACHE_OUT = join(__dirname, 'full-scan-cache.jsonl');
const BENCHMARK_OUT = join(__dirname, 'page-contents-benchmark.jsonl');

async function readJsonl(path) {
  const raw = await fs.readFile(path, 'utf8');
  return raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
}

async function main() {
  const originalRows = (await readJsonl(SOURCE)).slice(1); // drop header
  const dryRunCache = await readJsonl(DRY_RUN_CACHE);
  const remainingCache = await readJsonl(REMAINING_CACHE);

  const byDomain = new Map();
  for (const r of dryRunCache) byDomain.set(r.domain, r);
  for (const r of remainingCache) byDomain.set(r.domain, r); // remaining covers domains dry-run cache never touched; no overlap

  // Rebuild in original Tranco rank order, so row order is stable and
  // directly zippable against the original stock benchmark file.
  const full = originalRows.map(r => byDomain.get(r.domain)).filter(Boolean);
  if (full.length !== originalRows.length) {
    throw new Error(`coverage mismatch: ${originalRows.length} tranco rows but only found ${full.length} in the merged caches`);
  }

  await fs.writeFile(FULL_CACHE_OUT, full.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

  const ok = full.filter(r => r.status === 'ok');
  const errors = full.filter(r => r.status !== 'ok');
  console.error(`merged: ${full.length} total, ${ok.length} ok, ${errors.length} error`);

  const errorCounts = {};
  for (const r of errors) errorCounts[r.error_category ?? 'other'] = (errorCounts[r.error_category ?? 'other'] ?? 0) + 1;

  const header = {
    benchmark: 'tranco-74V6X-top1000',
    tranco_list: '74V6X',
    tranco_generated: '2026-09-06',
    input: 'experiments/tranco-74V6X-top1000.csv',
    checked_at: new Date().toISOString(),
    count: full.length,
    renderer: 'chatgpt-render-check',
    renderer_is_simulation: true,
    mode: 'page_contents',
    derivation: 'merged from dry-run/full-scan-cache.jsonl (486 reused, no re-fetch) + benchmark/remaining-scan-cache.jsonl (514 fetched once, this run)',
    error_counts: errorCounts,
  };

  const rows = full.map(r => {
    if (r.status !== 'ok') {
      return { rank: r.rank, domain: r.domain, url: r.url, checked_at: r.checked_at, status: 'error', renderer_error: r.error, error_category: r.error_category };
    }
    return {
      rank: r.rank, domain: r.domain, url: r.url, checked_at: r.checked_at, status: 'ok',
      renderer: 'html2text (ChatGPT-compatible)',
      mode: 'page_contents',
      chunk_words: 170,
      total_chunks_markdown: r.page_contents.total_chunks,
      total_chunks_plain: r.page_contents.total_chunks_plain,
      char_length: r.page_contents.char_length,
      total_words_markdown: r.page_contents.boundaries_markdown.at(-1) ?? 0,
      total_words_plain: r.page_contents.boundaries_plain.at(-1) ?? 0,
      chunk_boundaries_markdown: r.page_contents.boundaries_markdown,
      chunk_boundaries_plain: r.page_contents.boundaries_plain,
    };
  });

  const serialized = JSON.stringify(header) + '\n' + rows.map(r => JSON.stringify(r)).join('\n') + '\n';
  await fs.writeFile(BENCHMARK_OUT, serialized, 'utf8');
  console.error(`written: ${FULL_CACHE_OUT}`);
  console.error(`written: ${BENCHMARK_OUT}`);
}

main();
