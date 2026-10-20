#!/usr/bin/env node
// B: renderer-fidelity test rig.
//
// Compares this project's reconstruction (HTML -> markdown -> chunks) against
// a real ChatGPT-observed stream sample: { url, rendered_body, chunks: [{text}] },
// optionally with html_path (raw HTML captured alongside the observation) or
// inline html; otherwise the URL is fetched. See docs/fidelity-protocol.md.
//
// This measures fidelity of the reconstruction against one sample. It does
// not establish ChatGPT retrieval probability, citation probability, or
// general renderer fidelity across pages.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chunkMarkdown, renderAsMarkdown } from '../lib/render.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'experiments', 'fixtures');
const SYNTHETIC_FIXTURES = ['fidelity-sample-1.json', 'fidelity-sample-2.json'];

const TARGET_WORDS_OPTIONS = [140, 155, 170, 185, 200];
const COUNT_MODES = ['markdown', 'plain'];
const RECONSTRUCTION_MODE = 'stock'; // matches the historical default full-body pipeline

function usage() {
  console.error('Usage: chatgpt-render-fidelity [--file sample.json] [--json]');
  console.error('  With no --file, runs the two bundled SYNTHETIC fixtures instead.');
  process.exit(1);
}

/** Character-level similarity via Levenshtein distance, normalized to [0,1].
 * Capped at CAP characters per side to keep the DP tractable on long bodies —
 * a coarser but still meaningful similarity on very long pages. */
const CAP = 4000;
function normalizedCharSimilarity(a, b) {
  const s1 = (a ?? '').slice(0, CAP);
  const s2 = (b ?? '').slice(0, CAP);
  const maxLen = Math.max(s1.length, s2.length) || 1;
  if (s1 === s2) return 1;
  let prev = new Array(s2.length + 1);
  for (let j = 0; j <= s2.length; j++) prev[j] = j;
  for (let i = 1; i <= s1.length; i++) {
    const curr = new Array(s2.length + 1);
    curr[0] = i;
    for (let j = 1; j <= s2.length; j++) {
      curr[j] = s1[i - 1] === s2[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  const dist = prev[s2.length];
  return 1 - dist / maxLen;
}

function wordBoundaryOffsets(chunkTexts) {
  // cumulative word count at the END of each chunk except the last one —
  // i.e. the word-offset of each boundary BETWEEN chunks.
  const offsets = [];
  let total = 0;
  for (let i = 0; i < chunkTexts.length - 1; i++) {
    total += chunkTexts[i].trim().split(/\s+/).filter(Boolean).length;
    offsets.push(total);
  }
  return offsets;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function compareBoundaries(reconstructedTexts, observedTexts) {
  const reconstructedOffsets = wordBoundaryOffsets(reconstructedTexts);
  const observedOffsets = wordBoundaryOffsets(observedTexts);
  const reconstructedSet = new Set(reconstructedOffsets);

  const exactMatches = observedOffsets.filter(o => reconstructedSet.has(o)).length;
  const exactBoundaryFraction = observedOffsets.length ? exactMatches / observedOffsets.length : (reconstructedOffsets.length ? 0 : null);

  const deviations = observedOffsets.map(o => {
    if (reconstructedOffsets.length === 0) return o;
    return Math.min(...reconstructedOffsets.map(r => Math.abs(r - o)));
  });
  const medianBoundaryDeviationWords = observedOffsets.length ? median(deviations) : 0;

  return { exactBoundaryFraction, medianBoundaryDeviationWords };
}

async function loadHtml(sample) {
  if (sample.html) return sample.html;
  if (sample.html_path) return fs.readFile(sample.html_path, 'utf8');
  const res = await fetch(sample.url);
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
  return res.text();
}

async function runFidelity(sample, label) {
  const html = await loadHtml(sample);
  const reconstructedMarkdown = await renderAsMarkdown(html, { mode: RECONSTRUCTION_MODE });
  const observedChunkTexts = sample.chunks.map(c => c.text);
  const observedBody = sample.rendered_body ?? observedChunkTexts.join('\n\n');

  const bodySimilarity = normalizedCharSimilarity(reconstructedMarkdown.trim(), observedBody.trim());

  const rows = [];
  for (const targetWords of TARGET_WORDS_OPTIONS) {
    for (const countMode of COUNT_MODES) {
      const reconstructedChunks = chunkMarkdown(reconstructedMarkdown, { targetWords, countMode });
      const reconstructedTexts = reconstructedChunks.map(c => c.text);
      const { exactBoundaryFraction, medianBoundaryDeviationWords } = compareBoundaries(reconstructedTexts, observedChunkTexts);
      rows.push({
        targetWords,
        countMode,
        bodySimilarity,
        exactBoundaryFraction,
        medianBoundaryDeviationWords,
        chunksHere: reconstructedTexts.length,
        chunksThere: observedChunkTexts.length,
      });
    }
  }

  rows.sort((a, b) => {
    if (b.bodySimilarity !== a.bodySimilarity) return b.bodySimilarity - a.bodySimilarity;
    const bf = (b.exactBoundaryFraction ?? -1) - (a.exactBoundaryFraction ?? -1);
    if (bf !== 0) return bf;
    return a.medianBoundaryDeviationWords - b.medianBoundaryDeviationWords;
  });

  print(rows, label, sample);
  return rows;
}

function pct(v) {
  return v == null ? 'n/a' : `${(v * 100).toFixed(1)}%`;
}

function print(rows, label, sample) {
  console.log(`# Fidelity: ${label}`);
  if (sample._synthetic) {
    console.log('\n**SYNTHETIC FIXTURE** — not a real ChatGPT observation. Exercises the rig only.');
    if (sample._note) console.log(sample._note);
  }
  console.log(`\nReconstruction mode: ${RECONSTRUCTION_MODE}\n`);
  console.log('Best combination first, full table below.\n');
  console.log('| targetWords | countMode | body similarity | exact boundary hits | median boundary deviation (words) | chunks here | chunks there |');
  console.log('|---:|---|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    console.log(`| ${r.targetWords} | ${r.countMode} | ${pct(r.bodySimilarity)} | ${pct(r.exactBoundaryFraction)} | ${r.medianBoundaryDeviationWords} | ${r.chunksHere} | ${r.chunksThere} |`);
  }
  console.log('');
}

async function main() {
  const argv = process.argv.slice(2);
  const fileIndex = argv.indexOf('--file');
  const asJson = argv.includes('--json');

  const results = {};
  if (fileIndex !== -1 && argv[fileIndex + 1]) {
    const raw = await fs.readFile(argv[fileIndex + 1], 'utf8');
    const sample = JSON.parse(raw);
    results[argv[fileIndex + 1]] = await runFidelity(sample, argv[fileIndex + 1]);
  } else {
    for (const fixture of SYNTHETIC_FIXTURES) {
      const path = join(FIXTURES_DIR, fixture);
      const raw = await fs.readFile(path, 'utf8');
      const sample = JSON.parse(raw);
      results[fixture] = await runFidelity(sample, fixture);
    }
  }

  if (asJson) console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
