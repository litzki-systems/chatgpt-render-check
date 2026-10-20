#!/usr/bin/env node
// Full-benchmark step 4: apply the dry run's boundary-shift/cosmetic/
// identical classification to every domain with both stock and
// page_contents metrics (not just the 40-domain sample), split by
// link-density quartile, and separately flag the form-placeholder effect
// noted in the dry run (agoda.com/starlink.com: zero links, but a text
// difference from `page_contents`'s `[Input: ...]`/`[Button: ...]`
// placeholders where `stock` renders empty form controls as nothing).
//
// Correction, 2026-09-27 — what counts as a boundary shift. `boundaries_*`
// are arrays of CUMULATIVE word offsets, one per chunk (see
// cumulativeWordOffsets in 01-fetch-remaining.mjs), so the LAST entry is the
// page's total word count, not a boundary between chunks. Comparing the full
// arrays therefore classified a pure total-word-count change as a
// `boundary_shift`, including on pages rendered as a single chunk, where no
// inner boundary exists at all. This script now compares inner boundaries
// only (`boundaries.slice(0, -1)`) and reports the total-word-count-only case
// separately as `total_words_shift_only`. The effect on the headline figure
// is large: 438/475 (92%) of the non-empty cohort under the old definition,
// 365/475 (77%) under this one, with 73 rows reclassified from
// `boundary_shift` to `cosmetic`.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FULL_CACHE = join(__dirname, 'full-scan-cache.jsonl');
const OUT = join(__dirname, 'full-comparison.jsonl');

function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Inner chunk boundaries only. `boundaries_*` carries one cumulative word
 * offset per chunk, so the final entry is the total word count of the page
 * rather than a boundary between two chunks; a single-chunk rendering has no
 * inner boundary at all and yields []. See the correction note at the top. */
function innerBoundaries(boundaries) {
  return boundaries.slice(0, -1);
}

function totalWords(boundaries) {
  return boundaries.at(-1) ?? 0;
}

const rows = (await fs.readFile(FULL_CACHE, 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l));
const ok = rows.filter(r => r.status === 'ok' && r.stock.char_length > 0);
const byDomain = new Map(ok.map(r => [r.domain, r]));

const comparisons = ok.map(r => {
  const { stock, page_contents } = r;
  const charDelta = page_contents.char_length - stock.char_length;
  const boundaryShiftMarkdown = !arraysEqual(innerBoundaries(stock.boundaries_markdown), innerBoundaries(page_contents.boundaries_markdown));
  const boundaryShiftPlain = !arraysEqual(innerBoundaries(stock.boundaries_plain), innerBoundaries(page_contents.boundaries_plain));
  const anyBoundaryShift = boundaryShiftMarkdown || boundaryShiftPlain;

  // Total word count differing while every inner boundary holds. Under the
  // pre-2026-09-27 definition this was indistinguishable from a real shift.
  const totalWordsShiftMarkdown = totalWords(stock.boundaries_markdown) !== totalWords(page_contents.boundaries_markdown);
  const totalWordsShiftPlain = totalWords(stock.boundaries_plain) !== totalWords(page_contents.boundaries_plain);
  const totalWordsShiftOnly = !anyBoundaryShift && (totalWordsShiftMarkdown || totalWordsShiftPlain);

  // An inner boundary can only exist where a mode produced more than one
  // chunk, so under the corrected definition this is implied by
  // anyBoundaryShift rather than an independent filter. The field is kept for
  // schema continuity with earlier runs of full-comparison.jsonl, and the
  // report asserts the identity rather than leaving it implicit.
  const multiChunkReassignment = anyBoundaryShift && (stock.total_chunks > 1 || page_contents.total_chunks > 1);

  let category;
  if (anyBoundaryShift) category = 'boundary_shift';
  else if (charDelta !== 0) category = 'cosmetic';
  else category = 'identical';

  return {
    rank: r.rank, domain: r.domain, url: r.url,
    link_count: r.link_count, link_density: r.link_density,
    stock_char_length: stock.char_length,
    page_contents_char_length: page_contents.char_length,
    char_delta: charDelta,
    stock_chunks: stock.total_chunks,
    page_contents_chunks: page_contents.total_chunks,
    stock_chunks_plain: stock.total_chunks_plain,
    page_contents_chunks_plain: page_contents.total_chunks_plain,
    boundary_shift_markdown: boundaryShiftMarkdown,
    boundary_shift_plain: boundaryShiftPlain,
    total_words_shift_markdown: totalWordsShiftMarkdown,
    total_words_shift_plain: totalWordsShiftPlain,
    total_words_shift_only: totalWordsShiftOnly,
    multi_chunk_reassignment: multiChunkReassignment,
    category,
  };
});

await fs.writeFile(OUT, comparisons.map(c => JSON.stringify(c)).join('\n') + '\n', 'utf8');

// Quartiles over the full ok population, by link density.
const sorted = [...comparisons].sort((a, b) => a.link_density - b.link_density);
const n = sorted.length;
const q = Math.floor(n / 4);
const quartiles = {
  q1_lowest: sorted.slice(0, q),
  q2: sorted.slice(q, 2 * q),
  q3: sorted.slice(2 * q, 3 * q),
  q4_highest: sorted.slice(3 * q),
};

function summarize(list) {
  const counts = { boundary_shift: 0, cosmetic: 0, identical: 0 };
  let multiChunk = 0;
  let totalWordsOnly = 0;
  for (const c of list) {
    counts[c.category] += 1;
    if (c.multi_chunk_reassignment) multiChunk += 1;
    if (c.total_words_shift_only) totalWordsOnly += 1;
  }
  return {
    n: list.length,
    ...counts,
    multi_chunk_reassignment: multiChunk,
    total_words_shift_only: totalWordsOnly,
  };
}

/** Share of inner-boundary shifts among the domains that actually have an
 * inner boundary to shift, i.e. more than one chunk in at least one of the
 * two representations. Reported separately per countMode, because the chunk
 * counts differ between them (markdown counts markup tokens as words). */
function innerShiftAmongMultiChunk(list) {
  const md = list.filter(c => c.stock_chunks > 1 || c.page_contents_chunks > 1);
  const pl = list.filter(c => c.stock_chunks_plain > 1 || c.page_contents_chunks_plain > 1);
  const share = (hits, total) => (total ? Number((hits / total).toFixed(4)) : null);
  const mdHits = md.filter(c => c.boundary_shift_markdown).length;
  const plHits = pl.filter(c => c.boundary_shift_plain).length;
  return {
    markdown: { n: md.length, inner_shift: mdHits, share: share(mdHits, md.length) },
    plain: { n: pl.length, inner_shift: plHits, share: share(plHits, pl.length) },
  };
}

const report = {
  total_ok_domains: n,
  boundary_definition: 'inner boundaries only (boundaries_*.slice(0, -1)); the final cumulative offset is the page total word count and is reported separately as total_words_shift_only. Corrected 2026-09-27.',
  overall: summarize(comparisons),
  inner_shift_among_multi_chunk: innerShiftAmongMultiChunk(comparisons),
  by_link_density_quartile: Object.fromEntries(Object.entries(quartiles).map(([k, v]) => [k, summarize(v)])),
};

// Non-empty cohort (correction, 2026-09-26). The `ok && char_length > 0` filter
// above is weaker than this project's own cohort definition in
// docs/data-quality-audit.md, which excludes a rendering of zero WORDS as an
// "empty render". 28 rows pass the character filter while producing zero chunks
// (char_length === 1, total_chunks === 0) — genuinely empty renderings that
// nonetheless sit in the denominator, 27 of them counted as `identical`. They
// are kept in full-comparison.jsonl (they are real measurements of real fetches,
// nothing is discarded), but a boundary-shift rate stated over them understates
// the effect. Both figures are reported so either can be cited knowingly.
const emptyRender = c => {
  const row = byDomain.get(c.domain);
  return row ? row.stock.total_chunks === 0 && row.page_contents.total_chunks === 0 : false;
};
const nonEmpty = comparisons.filter(c => !emptyRender(c));
report.non_empty_cohort = {
  ...summarize(nonEmpty),
  excluded_empty_renders: comparisons.length - nonEmpty.length,
  note: 'zero-chunk renderings excluded, matching docs/data-quality-audit.md',
};
report.non_empty_cohort_inner_shift_among_multi_chunk = innerShiftAmongMultiChunk(nonEmpty);

// Under the corrected definition an inner boundary presupposes more than one
// chunk, so multi_chunk_reassignment must equal boundary_shift exactly. Assert
// it rather than let a future edit reintroduce the conflation silently.
for (const [label, list] of [['overall', comparisons], ['non_empty_cohort', nonEmpty]]) {
  const check = summarize(list);
  if (check.boundary_shift !== check.multi_chunk_reassignment) {
    throw new Error(`${label}: boundary_shift (${check.boundary_shift}) != multi_chunk_reassignment (${check.multi_chunk_reassignment}); an inner boundary cannot exist on a single-chunk rendering`);
  }
}

// Zero vs. nonzero links inside the lowest density quartile. Stated explicitly
// because the split is the actual finding (presence, not density) and because
// the boundary domain must be counted somewhere: adobe.io sits exactly on the
// Q1 upper bound and belongs to the nonzero group.
const q1 = quartiles.q1_lowest;
report.q1_zero_vs_nonzero_links = {
  exactly_zero_links: summarize(q1.filter(c => c.link_count === 0)),
  nonzero_links: summarize(q1.filter(c => c.link_count > 0)),
};

// Form-placeholder effect on zero-link pages (link_density === 0). Corrected
// 2026-09-27: under the inner-boundary definition this effect moves NO inner
// boundary on any of the affected domains — every one of them is a total-word-
// count change, mostly on single-chunk pages. Both counts are emitted so the
// earlier reading stays traceable.
const zeroLink = comparisons.filter(c => c.link_density === 0);
const zeroLinkShifts = zeroLink.filter(c => c.category === 'boundary_shift');
const zeroLinkTotalOnly = zeroLink.filter(c => c.total_words_shift_only);
report.zero_link_boundary_shifts = {
  count: zeroLinkShifts.length,
  of_zero_link_domains: zeroLink.length,
  domains: zeroLinkShifts.map(c => c.domain),
  total_words_shift_only_count: zeroLinkTotalOnly.length,
  total_words_shift_only_domains: zeroLinkTotalOnly.map(c => c.domain),
};

console.log(JSON.stringify(report, null, 2));
console.error(`\nwritten: ${OUT}`);
