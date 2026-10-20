#!/usr/bin/env node
import { fetchChatgptPreview } from '../lib/render.mjs';
import { measureChunks } from '../lib/measure.mjs';

const urls = process.argv.slice(2).filter(a => a.startsWith('http://') || a.startsWith('https://'));
if (!urls.length) {
  console.error('Usage: chatgpt-render-measure <url> [<url> ...]');
  process.exit(1);
}

function pct(value) {
  return value == null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

const results = [];
for (const url of urls) {
  process.stderr.write(`fetching ${url} ... `);
  const rendered = await fetchChatgptPreview(url);
  if (rendered.error) {
    process.stderr.write(`ERROR: ${rendered.error}\n`);
    results.push(rendered);
    continue;
  }
  const measurements = measureChunks(rendered.allChunks, { language: rendered.language });
  process.stderr.write(`ok, ${rendered.totalChunks} chunks\n`);
  results.push({ ...rendered, measurements });
}

let report = '# ChatGPT Render Measurements\n\n';
report += 'This report measures the simulation output. It does not establish ChatGPT ranking, retrieval probability, or internal pipeline behavior.\n\n';
for (const r of results) {
  report += `## ${r.url}\n\n`;
  if (r.error) {
    report += `**ERROR:** ${r.error}\n\n`;
    continue;
  }
  const m = r.measurements;
  report += `| Metric | Value |\n|---|---:|\n`;
  report += `| Detected language | ${r.language ?? 'unknown'} |\n`;
  report += `| Total chunks | ${r.totalChunks} |\n`;
  report += `| Total words | ${m.totalWords} |\n`;
  report += `| Words in first 3 chunks | ${m.visibleWords} |\n`;
  report += `| First 3 chunk coverage | ${pct(m.visibleCoverage)} |\n`;
  if (!m.languageCovered) {
    report += `| Anchor metrics | language not covered (anchors are English-only) |\n\n`;
    continue;
  }
  report += `| Anchor coverage in first 3 chunks | ${pct(m.anchorCoverage)} |\n`;
  report += `| First relevant anchor | chunk ${m.firstRelevantChunk ?? 'n/a'} |\n`;
  report += `| Content displacement | ${m.contentDisplacementWords ?? 'n/a'} words |\n`;
  report += `| Content displacement ratio | ${pct(m.contentDisplacementRatio)} |\n\n`;
  report += '| Anchor | Found | Chunk | Word offset | First 3 chunks |\n|---|---:|---:|---:|---:|\n';
  for (const a of m.anchors) report += `| ${a.label} | ${a.found ? 'yes' : 'no'} | ${a.chunk ?? 'n/a'} | ${a.wordOffset ?? 'n/a'} | ${a.visible ? 'yes' : 'no'} |\n`;
  report += '\n';
}

console.log(report);
