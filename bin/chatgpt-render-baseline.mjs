#!/usr/bin/env node
import fs from 'node:fs/promises';

function usage() {
  console.error('Usage: chatgpt-render-baseline --file benchmark.jsonl [--out baseline.md]');
  process.exit(1);
}

const argv = process.argv.slice(2);
const fileIndex = argv.indexOf('--file');
const outIndex = argv.indexOf('--out');
if (fileIndex === -1 || !argv[fileIndex + 1]) usage();

const inputPath = argv[fileIndex + 1];
const outputPath = outIndex === -1 ? null : argv[outIndex + 1];
const lines = (await fs.readFile(inputPath, 'utf8')).trim().split(/\r?\n/).filter(Boolean);
const rows = lines.slice(1).map(line => JSON.parse(line));
const rendered = rows.filter(r => r.status === 'ok' && (r.measurements?.totalWords ?? 0) > 0);
const empty = rows.filter(r => r.status === 'ok' && (r.measurements?.totalWords ?? 0) === 0);
const errors = rows.filter(r => r.status !== 'ok');

const quantile = (values, q) => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.floor((v.length - 1) * q)];
};
const median = values => quantile(values, 0.5);
const fmt = value => value == null ? 'n/a' : Number.isInteger(value) ? String(value) : value.toFixed(3);
const values = key => rendered.map(r => r.measurements?.[key]).filter(Number.isFinite);

const firstRelevant = values('firstRelevantChunk');
const displacement = values('contentDisplacementWords');
const displacementRatio = values('contentDisplacementRatio');
const totalWords = values('totalWords');
const visibleCoveragePct = values('visibleCoverage').map(x => x * 100);
const displacementRatioPct = displacementRatio.map(x => x * 100);

const linesOut = [
  '# Renderer Baseline', '',
  `Input: \`${inputPath}\``, '',
  '| Cohort | Count | Share |',
  '| --- | ---: | ---: |',
  `| Rendered | ${rendered.length} | ${(rendered.length / rows.length * 100).toFixed(1)}% |`,
  `| Empty render | ${empty.length} | ${(empty.length / rows.length * 100).toFixed(1)}% |`,
  `| Retrieval or HTTP error | ${errors.length} | ${(errors.length / rows.length * 100).toFixed(1)}% |`, '',
  '| Measurement | Median | P75 | P90 | P95 | Maximum |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  `| Total rendered words | ${fmt(median(totalWords))} | ${fmt(quantile(totalWords,.75))} | ${fmt(quantile(totalWords,.9))} | ${fmt(quantile(totalWords,.95))} | ${fmt(Math.max(...totalWords))} |`,
  `| Visible coverage | ${fmt(median(visibleCoveragePct))}% | ${fmt(quantile(visibleCoveragePct,.75))}% | ${fmt(quantile(visibleCoveragePct,.9))}% | ${fmt(quantile(visibleCoveragePct,.95))}% | ${fmt(Math.max(...visibleCoveragePct))}% |`,
  `| First relevant chunk | ${fmt(median(firstRelevant))} | ${fmt(quantile(firstRelevant,.75))} | ${fmt(quantile(firstRelevant,.9))} | ${fmt(quantile(firstRelevant,.95))} | ${fmt(Math.max(...firstRelevant))} |`,
  `| Content displacement, words | ${fmt(median(displacement))} | ${fmt(quantile(displacement,.75))} | ${fmt(quantile(displacement,.9))} | ${fmt(quantile(displacement,.95))} | ${fmt(Math.max(...displacement))} |`,
  `| Content displacement ratio | ${fmt(median(displacementRatioPct))}% | ${fmt(quantile(displacementRatioPct,.75))}% | ${fmt(quantile(displacementRatioPct,.9))}% | ${fmt(quantile(displacementRatioPct,.95))}% | ${fmt(Math.max(...displacementRatioPct))}% |`, '',
  `Rows with a detected first relevant anchor: ${firstRelevant.length} of ${rendered.length}.`,
  `Rows with zero rendered words: ${empty.length}.`,
  `Rows with retrieval or HTTP errors: ${errors.length}.`, '',
  'This report describes the renderer simulation only. It does not estimate AI visibility, retrieval probability, citation probability, or ranking impact.'
];

const output = linesOut.join('\n') + '\n';
if (outputPath) await fs.writeFile(outputPath, output, 'utf8');
else process.stdout.write(output);
