#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchChatgptPreview } from '../lib/render.mjs';
import { measureChunks } from '../lib/measure.mjs';

function usage() {
  console.error('Usage: chatgpt-render-benchmark --file experiments/tranco-74V6X-top1000.csv [--out results.jsonl]');
  process.exit(1);
}

const argv = process.argv.slice(2);
const fileIndex = argv.indexOf('--file');
const outIndex = argv.indexOf('--out');
const timeoutIndex = argv.indexOf('--timeout');
const concurrencyIndex = argv.indexOf('--concurrency');
const artifactsIndex = argv.indexOf('--artifacts-dir');
if (fileIndex === -1 || !argv[fileIndex + 1]) usage();

const inputPath = argv[fileIndex + 1];
const outputPath = outIndex === -1 ? null : argv[outIndex + 1];
const timeout = timeoutIndex === -1 ? 10000 : Number(argv[timeoutIndex + 1]);
const concurrency = concurrencyIndex === -1 ? 4 : Number(argv[concurrencyIndex + 1]);
const artifactsDir = artifactsIndex === -1 ? 'artifacts' : argv[artifactsIndex + 1];
if (!Number.isFinite(timeout) || timeout < 1000 || !Number.isFinite(concurrency) || concurrency < 1) usage();

const raw = await fs.readFile(inputPath, 'utf8');
const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
const rows = lines[0]?.toLowerCase().startsWith('rank,domain') ? lines.slice(1) : lines;
const domains = rows.map(line => {
  const [rank, domain] = line.split(',').map(value => value.trim());
  return { rank: Number(rank), domain };
}).filter(row => Number.isInteger(row.rank) && row.domain);

if (domains.length === 0) {
  console.error('No valid rank,domain rows found.');
  process.exit(1);
}

const results = new Array(domains.length);
const errorCounts = {}; // D: DNS/TLS/timeout/403/429/5xx/empty-body counted separately
let next = 0;
let completed = 0;

async function worker() {
  while (true) {
    const index = next++;
    if (index >= domains.length) return;
    const { rank, domain } = domains[index];
    const url = `https://${domain}/`;
    const started = Date.now();
    let rendered;
    try {
      rendered = await fetchChatgptPreview(url, { timeoutMs: timeout, artifactsDir });
    } catch (error) {
      rendered = { error: error.message, errorCategory: 'other' };
    }

    const base = {
      rank,
      domain,
      url,
      checked_at: new Date().toISOString(),
      elapsed_ms: Date.now() - started,
    };

    if (rendered?.error) {
      results[index] = { ...base, status: 'error', renderer_error: rendered.error, error_category: rendered.errorCategory ?? 'other' };
      errorCounts[rendered.errorCategory ?? 'other'] = (errorCounts[rendered.errorCategory ?? 'other'] ?? 0) + 1;
    } else {
      results[index] = {
        ...base,
        status: 'ok',
        renderer: rendered.renderer,
        chunk_words: rendered.chunkWords,
        visible_chunks_hypothesis: rendered.visibleToModel.length,
        total_chunks: rendered.totalChunks,
        language: rendered.language,
        measurements: measureChunks(rendered.allChunks, { language: rendered.language }),
        meta_tags: rendered.metaTags,
        html_sha256: rendered.htmlSha256,
        markdown_sha256: rendered.markdownSha256,
      };
    }

    completed += 1;
    process.stderr.write(`\r${completed}/${domains.length} completed`);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, domains.length) }, () => worker()));
process.stderr.write('\n');

const header = {
  benchmark: 'tranco-74V6X-top1000',
  tranco_list: '74V6X',
  tranco_generated: '2026-09-06',
  input: inputPath,
  checked_at: new Date().toISOString(),
  count: results.length,
  renderer: 'chatgpt-render-check',
  renderer_is_simulation: true,
  artifacts_dir: artifactsDir,
  error_counts: errorCounts,
};
const serialized = JSON.stringify(header) + '\n' + results.map(row => JSON.stringify(row)).join('\n') + '\n';

if (outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, serialized, 'utf8');
  console.error(`written: ${outputPath}`);
} else {
  process.stdout.write(serialized);
}
