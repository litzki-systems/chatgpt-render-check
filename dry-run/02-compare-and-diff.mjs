#!/usr/bin/env node
// Dry-run step 3: for each sampled domain, diff the stock vs page_contents
// metrics already cached by 01-scan-and-sample.mjs. No new fetches.
//
// A domain is "boundary-shift" if the word-offset a chunk ends at differs
// between modes for at least one chunk (chunk count differing counts as a
// shift too, trivially). Otherwise, if only char_length differs, it is
// "cosmetic". If neither differs at all, it is "identical".
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(__dirname, 'sample.json');
const CACHE = join(__dirname, 'full-scan-cache.jsonl');
const OUT = join(__dirname, 'comparison.jsonl');

const sample = JSON.parse(await fs.readFile(SAMPLE, 'utf8'));
const cacheRows = (await fs.readFile(CACHE, 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l));
const byDomain = new Map(cacheRows.map(r => [r.domain, r]));

function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const comparisons = sample.domains.map(({ group, rank, domain, url, link_count, link_density }) => {
  const row = byDomain.get(domain);
  const { stock, page_contents } = row;

  const charDelta = page_contents.char_length - stock.char_length;
  const boundaryShiftMarkdown = !arraysEqual(stock.boundaries_markdown, page_contents.boundaries_markdown);
  const boundaryShiftPlain = !arraysEqual(stock.boundaries_plain, page_contents.boundaries_plain);
  const anyBoundaryShift = boundaryShiftMarkdown || boundaryShiftPlain;

  let category;
  if (anyBoundaryShift) category = 'boundary_shift';
  else if (charDelta !== 0) category = 'cosmetic';
  else category = 'identical';

  return {
    group, rank, domain, url, link_count, link_density,
    stock_char_length: stock.char_length,
    page_contents_char_length: page_contents.char_length,
    char_delta: charDelta,
    stock_chunks_markdown: stock.total_chunks,
    page_contents_chunks_markdown: page_contents.total_chunks,
    stock_chunks_plain: stock.total_chunks_plain,
    page_contents_chunks_plain: page_contents.total_chunks_plain,
    boundary_shift_markdown: boundaryShiftMarkdown,
    boundary_shift_plain: boundaryShiftPlain,
    category,
    stock_boundaries_markdown: stock.boundaries_markdown,
    page_contents_boundaries_markdown: page_contents.boundaries_markdown,
  };
});

await fs.writeFile(OUT, comparisons.map(c => JSON.stringify(c)).join('\n') + '\n', 'utf8');

function summarize(group) {
  const rows = comparisons.filter(c => c.group === group);
  const counts = { boundary_shift: 0, cosmetic: 0, identical: 0 };
  for (const r of rows) counts[r.category] += 1;
  return { n: rows.length, ...counts };
}

console.log('=== top_quartile ===', JSON.stringify(summarize('top_quartile')));
console.log('=== bottom_quartile ===', JSON.stringify(summarize('bottom_quartile')));
console.log(`\nwritten: ${OUT}`);
