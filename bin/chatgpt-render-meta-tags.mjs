#!/usr/bin/env node
// A2: meta_tags layer.
//
// Aggregates the raw <meta> tags collected per page (lib/render.mjs
// extractMetaTags, stored as `meta_tags` on each row of a
// chatgpt-render-benchmark JSONL output) into per-field frequency across
// the benchmark, and places the infographic's claimed comparison numbers
// alongside — where we actually have them.
//
// IMPORTANT: no URL or numeric table for the Peec AI infographic
// (Metehan Yesilyurt, 2026-09-07) was supplied to this project. The
// REFERENCE_INFOGRAPHIC_COUNTS map below is therefore empty rather than
// guessed; fill it in only from the primary source itself, never from
// memory or inference. Until then this column reads "not available" —
// see docs/fidelity-protocol.md and the README secondary-source note.
import fs from 'node:fs/promises';

const REFERENCE_INFOGRAPHIC_COUNTS = {
  // 'og:title': <count or %>,  <- fill in only from the primary source
};

function usage() {
  console.error('Usage: chatgpt-render-meta-tags --file experiments/results/<benchmark>.jsonl [--out report.md]');
  process.exit(1);
}

const argv = process.argv.slice(2);
const fileIndex = argv.indexOf('--file');
const outIndex = argv.indexOf('--out');
if (fileIndex === -1 || !argv[fileIndex + 1]) usage();

const inputPath = argv[fileIndex + 1];
const outputPath = outIndex === -1 ? null : argv[outIndex + 1];

const raw = await fs.readFile(inputPath, 'utf8');
const rows = raw
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean)
  .map(line => JSON.parse(line))
  .filter(row => row.status === 'ok' && Array.isArray(row.meta_tags));

if (rows.length === 0) {
  console.error('No rows with meta_tags found. Run chatgpt-render-benchmark first.');
  process.exit(1);
}

const pagesWithField = new Map();
const totalOccurrences = new Map();

for (const row of rows) {
  const seenOnThisPage = new Set();
  for (const tag of row.meta_tags) {
    const key = tag.name;
    totalOccurrences.set(key, (totalOccurrences.get(key) ?? 0) + 1);
    seenOnThisPage.add(key);
  }
  for (const key of seenOnThisPage) {
    pagesWithField.set(key, (pagesWithField.get(key) ?? 0) + 1);
  }
}

const fields = [...pagesWithField.keys()].sort((a, b) => pagesWithField.get(b) - pagesWithField.get(a));

let report = '# Meta tags — per-field frequency\n\n';
report += `Benchmark rows with meta_tags: ${rows.length}\n\n`;
report += 'Frequency here is measured directly from the rendered pages in this benchmark. ';
report += 'The "Infographic" column is the Peec AI infographic\'s (Metehan Yesilyurt, 2026-09-07) claimed comparison ';
report += 'number for that field — populated only where we actually have the primary source figure, "not available" otherwise. ';
report += 'This is a side-by-side listing, not a validated match.\n\n';
report += '| Field | Pages with field | % of pages | Total occurrences | Infographic (secondary source) |\n';
report += '|---|---:|---:|---:|---:|\n';
for (const field of fields) {
  const pages = pagesWithField.get(field);
  const pct = ((pages / rows.length) * 100).toFixed(1);
  const total = totalOccurrences.get(field);
  const reference = field in REFERENCE_INFOGRAPHIC_COUNTS ? REFERENCE_INFOGRAPHIC_COUNTS[field] : 'not available';
  report += `| ${field} | ${pages} | ${pct}% | ${total} | ${reference} |\n`;
}

if (outputPath) {
  await fs.writeFile(outputPath, report);
  console.error(`written: ${outputPath}`);
} else {
  console.log(report);
}
