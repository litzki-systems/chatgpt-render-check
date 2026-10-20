#!/usr/bin/env node
// Full-benchmark step 1: fetch every domain not already covered by the
// dry-run cache (dry-run/full-scan-cache.jsonl), using the identical
// fetch-once-render-both-modes approach from dry-run/01-scan-and-sample.mjs.
//
// "Not already covered" = the union of:
//   - the 428 domains that never rendered successfully in the original
//     stock-mode benchmark (GitHub Actions run 34161247425, 2026-09-07)
//   - the 86 domains that WERE ok in that run but failed again when
//     dry-run/01-scan-and-sample.mjs re-scanned them two days later
//
// The 486 domains that dry-run/full-scan-cache.jsonl already has as
// status:'ok' are NOT re-fetched here — this script only closes the gap so
// the combined dataset can attempt full 1000-domain coverage, at most once
// per domain since the original benchmark ran.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderAsMarkdown, chunkMarkdown, classifyFetchError, isDisallowedByRobots } from '../lib/render.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(__dirname, '..', 'dry-run', 'source-tranco-74V6X-render.jsonl');
const DRY_RUN_CACHE = join(__dirname, '..', 'dry-run', 'full-scan-cache.jsonl');
const OUT = join(__dirname, 'remaining-scan-cache.jsonl');

const USER_AGENT = 'ChatGPTRenderCheckBot/1.3 (+https://github.com/litzki-systems/chatgpt-render-check)';
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 6;
const CHUNK_WORDS = 170;

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

function cumulativeWordOffsets(chunks) {
  let offset = 0;
  return chunks.map(c => (offset += c.text.trim().split(/\s+/).filter(Boolean).length));
}

async function analyzeMode(html, mode) {
  const md = await renderAsMarkdown(html, { mode });
  const chunks = chunkMarkdown(md, { targetWords: CHUNK_WORDS, countMode: 'markdown' });
  const chunksPlain = chunkMarkdown(md, { targetWords: CHUNK_WORDS, countMode: 'plain' });
  return {
    char_length: md.length,
    total_chunks: chunks.length,
    total_chunks_plain: chunksPlain.length,
    boundaries_markdown: cumulativeWordOffsets(chunks),
    boundaries_plain: cumulativeWordOffsets(chunksPlain),
  };
}

async function main() {
  const allRows = (await fs.readFile(SOURCE, 'utf8')).split('\n').filter(Boolean).slice(1).map(l => JSON.parse(l));
  const dryRunCache = (await fs.readFile(DRY_RUN_CACHE, 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l));
  const dryRunOkDomains = new Set(dryRunCache.filter(r => r.status === 'ok').map(r => r.domain));

  const remaining = allRows.filter(r => !dryRunOkDomains.has(r.domain));
  console.error(`total tranco rows: ${allRows.length}, already covered by dry-run cache: ${dryRunOkDomains.size}, remaining to fetch: ${remaining.length}`);

  const results = new Array(remaining.length);
  const errorCounts = {};
  let next = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= remaining.length) return;
      const { rank, domain, url } = remaining[index];
      const startedAt = new Date().toISOString();

      const fetched = await fetchRawHtml(url);
      if (fetched.error) {
        results[index] = { rank, domain, url, status: 'error', error: fetched.error, error_category: fetched.errorCategory, checked_at: startedAt };
        errorCounts[fetched.errorCategory] = (errorCounts[fetched.errorCategory] ?? 0) + 1;
      } else {
        try {
          const [stock, pageContents] = await Promise.all([
            analyzeMode(fetched.html, 'stock'),
            analyzeMode(fetched.html, 'page_contents'),
          ]);
          const linkCount = [...fetched.html.matchAll(/<a\b[^>]*href/gi)].length;
          const linkDensity = stock.char_length > 0 ? linkCount / stock.char_length : 0;
          results[index] = {
            rank, domain, url, status: 'ok', checked_at: startedAt,
            html_char_length: fetched.html.length,
            link_count: linkCount,
            link_density: linkDensity,
            stock,
            page_contents: pageContents,
          };
        } catch (error) {
          results[index] = { rank, domain, url, status: 'error', error: error.message, error_category: 'render_error', checked_at: startedAt };
          errorCounts.render_error = (errorCounts.render_error ?? 0) + 1;
        }
      }

      completed += 1;
      if (completed % 25 === 0 || completed === remaining.length) {
        process.stderr.write(`\r${completed}/${remaining.length} fetched`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, remaining.length) }, () => worker()));
  process.stderr.write('\n');

  await fs.writeFile(OUT, results.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

  const ok = results.filter(r => r.status === 'ok');
  console.error(`remaining-scan: ${ok.length} newly ok, ${results.length - ok.length} still failing (error_counts: ${JSON.stringify(errorCounts)})`);
  console.error(`written: ${OUT}`);
}

main();
