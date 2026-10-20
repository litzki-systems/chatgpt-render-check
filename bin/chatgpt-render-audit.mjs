#!/usr/bin/env node
import fs from 'node:fs/promises';

function usage() {
  console.error('Usage: chatgpt-render-audit --file experiments/results/tranco-74V6X-render.jsonl [--out audit.md]');
  process.exit(1);
}

const argv = process.argv.slice(2);
const fileIndex = argv.indexOf('--file');
const outIndex = argv.indexOf('--out');
if (fileIndex === -1 || !argv[fileIndex + 1]) usage();

const inputPath = argv[fileIndex + 1];
const outputPath = outIndex === -1 ? null : argv[outIndex + 1];
const lines = (await fs.readFile(inputPath, 'utf8')).split(/\r?\n/).filter(Boolean);
if (lines.length < 2) throw new Error('Benchmark JSONL contains no domain results.');

const header = JSON.parse(lines[0]);
const rows = lines.slice(1).map(JSON.parse);

const classify = row => {
  if (row.status === 'error') {
    const error = row.renderer_error ?? 'unknown error';
    const m = error.match(/^HTTP (\d+)/i);
    if (m) return `http_${m[1]}`;
    if (/aborted|timeout/i.test(error)) return 'timeout_or_abort';
    if (/fetch failed/i.test(error)) return 'fetch_failed';
    return 'other_error';
  }
  const words = row.measurements?.totalWords ?? 0;
  if (words === 0) return 'ok_empty_render';
  return 'ok_rendered';
};

const cohorts = new Map();
for (const row of rows) {
  const cohort = classify(row);
  if (!cohorts.has(cohort)) cohorts.set(cohort, []);
  cohorts.get(cohort).push(row);
}

const count = name => cohorts.get(name)?.length ?? 0;
const rendered = cohorts.get('ok_rendered') ?? [];
const empty = cohorts.get('ok_empty_render') ?? [];
const errors = rows.filter(r => r.status === 'error');

const numeric = (field, source = rendered) => source
  .map(r => r.measurements?.[field])
  .filter(v => Number.isFinite(v));

const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const p90 = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)];
};

const firstRelevant = numeric('firstRelevantChunk');
const displacement = numeric('contentDisplacementWords');
const displacementRatio = numeric('contentDisplacementRatio');
const totalWords = numeric('totalWords');
const visibleCoverage = numeric('visibleCoverage');

const errorCounts = [...new Set(errors.map(r => classify(r)))].map(name => [name, count(name)])
  .sort((a, b) => b[1] - a[1]);

const emptyRows = [...empty].sort((a, b) => a.rank - b.rank);
const generatedAt = new Date().toISOString();

const pct = (n, d) => d ? `${(100 * n / d).toFixed(1)}%` : 'n/a';

const linesOut = [
  '# Tranco 74V6X Data Quality Audit',
  '',
  `Generated: ${generatedAt}`,
  '',
  '## Cohort definition',
  '',
  '| Cohort | Count | Share | Included in renderer statistics |',
  '| --- | ---: | ---: | --- |',
  `| Rendered | ${count('ok_rendered')} | ${pct(count('ok_rendered'), rows.length)} | Yes |`,
  `| Empty render | ${count('ok_empty_render')} | ${pct(count('ok_empty_render'), rows.length)} | No |`,
  `| Retrieval or HTTP error | ${errors.length} | ${pct(errors.length, rows.length)} | No |`,
  '',
  'A rendered cohort requires HTTP success and at least one rendered word. Empty renders remain a separate diagnostic cohort. Retrieval and HTTP errors remain outside renderer statistics because the renderer did not receive a usable page representation.',
  '',
  '## Rendered cohort summary',
  '',
  '| Measurement | Median | P90 |',
  '| --- | ---: | ---: |',
  `| Total rendered words | ${median(totalWords) ?? 'n/a'} | ${p90(totalWords) ?? 'n/a'} |`,
  `| Visible coverage | ${median(visibleCoverage) != null ? (100 * median(visibleCoverage)).toFixed(1) + '%' : 'n/a'} | ${p90(visibleCoverage) != null ? (100 * p90(visibleCoverage)).toFixed(1) + '%' : 'n/a'} |`,
  `| First relevant chunk | ${median(firstRelevant) ?? 'n/a'} | ${p90(firstRelevant) ?? 'n/a'} |`,
  `| Content displacement words | ${median(displacement) ?? 'n/a'} | ${p90(displacement) ?? 'n/a'} |`,
  `| Content displacement ratio | ${median(displacementRatio) != null ? (100 * median(displacementRatio)).toFixed(1) + '%' : 'n/a'} | ${p90(displacementRatio) != null ? (100 * p90(displacementRatio)).toFixed(1) + '%' : 'n/a'} |`,
  '',
  '## Error taxonomy',
  '',
  '| Class | Count |',
  '| --- | ---: |',
  ...errorCounts.map(([name, n]) => `| ${name} | ${n} |`),
  '',
  '## Empty render cohort',
  '',
  `There are ${emptyRows.length} HTTP-successful rows with zero rendered words. The benchmark does not infer the cause from the renderer result. These cases require page-level inspection before they can be assigned a technical cause.`,
  '',
  '| Rank | Domain |',
  '| ---: | --- |',
  ...emptyRows.map(r => `| ${r.rank} | ${r.domain} |`),
  '',
  '## Interpretation rule',
  '',
  'The benchmark separates page retrieval from renderer behavior. A failed fetch says nothing about document structure. An empty render says that the current reconstruction produced no text and therefore requires a separate technical audit. Only the rendered cohort enters descriptive renderer statistics.',
  '',
  'This audit does not establish ChatGPT retrieval, ranking, citation probability, or causality.',
  '',
  `Source benchmark: ${header.benchmark ?? 'unknown'}`,
];

const output = linesOut.join('\n') + '\n';
if (outputPath) await fs.writeFile(outputPath, output, 'utf8');
else process.stdout.write(output);
