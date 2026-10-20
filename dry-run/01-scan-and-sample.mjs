#!/usr/bin/env node
// Dry-run step 1+2 (combined for efficiency — see dry-run/findings.md for why):
// fetch each domain from the existing stock-mode benchmark's successful
// population ONCE, render it under both `stock` and `page_contents` from
// that single HTML snapshot, and cache every metric needed for both the
// link-density ranking (step 1) and the mode comparison (step 2).
//
// Fetching once and rendering twice — rather than fetching twice, once per
// mode — avoids confounding the comparison with any change to the live
// page between two separate requests, and halves the network load of this
// dry run.
//
// Input:  dry-run/source-tranco-74V6X-render.jsonl (the stock-mode benchmark
//         artifact from GitHub Actions run 34161247425, 2026-09-07 —
//         downloaded via `gh run download`, not re-run)
// Output: dry-run/full-scan-cache.jsonl (one row per domain that still
//         rendered successfully today; includes stock AND page_contents
//         metrics)
//         dry-run/sample.json (the drawn sample: top/bottom link-density
//         quartile, 20 domains each)
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderAsMarkdown, chunkMarkdown, classifyFetchError, isDisallowedByRobots } from '../lib/render.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(__dirname, 'source-tranco-74V6X-render.jsonl');
const CACHE_OUT = join(__dirname, 'full-scan-cache.jsonl');
const SAMPLE_OUT = join(__dirname, 'sample.json');

// Same UA the rest of the project's fetch layer uses (lib/render.mjs
// DEFAULT_USER_AGENT, not exported — duplicated here rather than exporting
// a new constant, to keep this dry run outside the reviewed mode/stripping
// surface per the task scope).
const USER_AGENT = 'ChatGPTRenderCheckBot/1.3 (+https://github.com/litzki-systems/chatgpt-render-check)';
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 4; // matches bin/chatgpt-render-benchmark.mjs default
const CHUNK_WORDS = 170; // matches the original benchmark's chunk_words

const LINK_RE = /\[([^\]]*)\]\([^)]*\)/g;

async function fetchRawHtml(url) {
  if (await isDisallowedByRobots(url, USER_AGENT, { timeoutMs: TIMEOUT_MS })) {
    return { error: 'disallowed by robots.txt', errorCategory: 'robots_disallowed' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT } });
    clearTimeout(timer);
  } catch (error) {
    clearTimeout(timer);
    return { error: error.message, errorCategory: classifyFetchError(error) };
  }
  if (!res.ok) return { error: `HTTP ${res.status}`, errorCategory: classifyFetchError(null, res) };
  const html = await res.text();
  if (!html.trim()) return { error: 'empty body', errorCategory: 'empty_body' };
  return { html };
}

function analyzeMode(html, mode) {
  return renderAsMarkdown(html, { mode }).then(md => {
    const chunks = chunkMarkdown(md, { targetWords: CHUNK_WORDS, countMode: 'markdown' });
    const chunksPlain = chunkMarkdown(md, { targetWords: CHUNK_WORDS, countMode: 'plain' });
    return {
      char_length: md.length,
      total_chunks: chunks.length,
      total_chunks_plain: chunksPlain.length,
      // word-offset each chunk ends at, so boundary positions are comparable
      // across modes independent of char-length differences
      boundaries_markdown: cumulativeWordOffsets(chunks),
      boundaries_plain: cumulativeWordOffsets(chunksPlain),
    };
  });
}

function cumulativeWordOffsets(chunks) {
  let offset = 0;
  return chunks.map(c => (offset += c.text.trim().split(/\s+/).filter(Boolean).length));
}

async function main() {
  const raw = await fs.readFile(SOURCE, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  const rows = lines.slice(1).map(l => JSON.parse(l));
  const okDomains = rows.filter(r => r.status === 'ok').map(r => ({ rank: r.rank, domain: r.domain, url: r.url }));

  console.error(`source population: ${rows.length} rows, ${okDomains.length} previously-ok domains to re-scan`);

  const results = new Array(okDomains.length);
  const errorCounts = {};
  let next = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= okDomains.length) return;
      const { rank, domain, url } = okDomains[index];

      const fetched = await fetchRawHtml(url);
      if (fetched.error) {
        results[index] = { rank, domain, url, status: 'error', error: fetched.error, error_category: fetched.errorCategory };
        errorCounts[fetched.errorCategory] = (errorCounts[fetched.errorCategory] ?? 0) + 1;
      } else {
        try {
          const [stock, pageContents] = await Promise.all([
            analyzeMode(fetched.html, 'stock'),
            analyzeMode(fetched.html, 'page_contents'),
          ]);
          const linkMatches = [...fetched.html.matchAll(/<a\b[^>]*href/gi)]; // link density from raw HTML, mode-independent
          const linkCount = linkMatches.length;
          const linkDensity = stock.char_length > 0 ? linkCount / stock.char_length : 0;
          results[index] = {
            rank, domain, url, status: 'ok',
            html_char_length: fetched.html.length,
            link_count: linkCount,
            link_density: linkDensity,
            stock,
            page_contents: pageContents,
          };
        } catch (error) {
          results[index] = { rank, domain, url, status: 'error', error: error.message, error_category: 'render_error' };
          errorCounts.render_error = (errorCounts.render_error ?? 0) + 1;
        }
      }

      completed += 1;
      process.stderr.write(`\r${completed}/${okDomains.length} rescanned`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, okDomains.length) }, () => worker()));
  process.stderr.write('\n');

  await fs.writeFile(CACHE_OUT, results.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

  const ok = results.filter(r => r.status === 'ok' && r.stock.char_length > 0);
  console.error(`re-scan: ${ok.length} ok, ${results.length - ok.length} failed this time (error_counts: ${JSON.stringify(errorCounts)})`);

  const sorted = [...ok].sort((a, b) => b.link_density - a.link_density);
  const quartileSize = Math.max(1, Math.floor(sorted.length / 4));
  const topQuartile = sorted.slice(0, quartileSize);
  const bottomQuartile = sorted.slice(-quartileSize);

  const SAMPLE_PER_GROUP = 20;
  const topSample = topQuartile.slice(0, SAMPLE_PER_GROUP);
  const bottomSample = bottomQuartile.slice(-SAMPLE_PER_GROUP);

  const sample = {
    drawn_at: new Date().toISOString(),
    source: 'dry-run/source-tranco-74V6X-render.jsonl (GitHub Actions run 34161247425, 2026-09-07)',
    rescanned_population: ok.length,
    top_quartile_size: topQuartile.length,
    bottom_quartile_size: bottomQuartile.length,
    domains: [
      ...topSample.map(r => ({ group: 'top_quartile', rank: r.rank, domain: r.domain, url: r.url, link_count: r.link_count, link_density: r.link_density })),
      ...bottomSample.map(r => ({ group: 'bottom_quartile', rank: r.rank, domain: r.domain, url: r.url, link_count: r.link_count, link_density: r.link_density })),
    ],
  };
  await fs.writeFile(SAMPLE_OUT, JSON.stringify(sample, null, 2) + '\n', 'utf8');

  console.error(`\nsample: ${topSample.length} top-quartile + ${bottomSample.length} bottom-quartile domains -> ${SAMPLE_OUT}`);
  console.error(`link density range: top [${topSample.at(-1)?.link_density.toFixed(5)} .. ${topSample[0]?.link_density.toFixed(5)}], bottom [${bottomSample[0]?.link_density.toFixed(5)} .. ${bottomSample.at(-1)?.link_density.toFixed(5)}]`);
}

main();
