#!/usr/bin/env node
// A0: fingerprint-conformance test.
//
// Renders the synthetic fixture (experiments/fixtures/fingerprint-conformance.html)
// under each renderer mode and checks how many of the eight fingerprint
// features from the Peec AI infographic (Metehan Yesilyurt, 2026-09-07) are
// present: bullet, rule, table separator, heading, italic, image, link, and
// form input/button. This is a conformance check against that secondary
// source's claimed markers, not a live comparison against ChatGPT's actual
// output — see docs/fidelity-protocol.md.
//
// TWO REPRESENTATIONS
// -------------------
// Seven of the eight features are properties of the html2text render step
// and are claimed for both of ChatGPT's representations of a passage. The
// eighth — the link representation — is not: part 2 of the same source
// (2026-09-09) reports the 【n†text】 citation anchor as present in the
// search-result record (`snippet::parts`) and stripped in the fetched-page
// record (`page_contents`), where only the anchor text survives.
//
// So the link feature is scored against the target for the representation
// the mode claims to produce. That is not the same as branching the test
// on its subject: the criterion comes from what the source says each
// representation contains, and each mode is scored against exactly one
// fixed target. (An earlier version of this file did branch on the subject
// — it swapped in looser, stock-specific patterns so stock could "pass" on
// its own unrelated defaults, which undercounted the real gap. Both
// fingerprint modes are still scored against the same seven shared
// patterns.)
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderAsMarkdown } from '../lib/render.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '..', 'experiments', 'fixtures', 'fingerprint-conformance.html');

// Shared across both representations: properties of the render step itself.
const RENDER_FEATURES = [
  { key: 'bullet', label: 'Bullet', test: md => /^\s*[*-]\s+Fixture bullet item/m.test(md) },
  { key: 'rule', label: 'Rule', test: md => /^\* \* \*\s*$/m.test(md) || /^-{3,}\s*$/m.test(md) },
  { key: 'table_separator', label: 'Table separator', test: md => /^-+\|-+/m.test(md) },
  { key: 'heading', label: 'Heading', test: md => /^#+\s+Fixture Heading/m.test(md) },
  { key: 'italic', label: 'Italic', test: md => /\*fixture italic text\*/.test(md) },
  { key: 'image', label: 'Image', test: md => /Image: fixture image alt text/.test(md) },
  {
    key: 'form_input_and_button',
    label: 'Form input and Button',
    test: md => /\[Input: fixture input placeholder\]/.test(md) && /\[Button: Fixture Button\]/.test(md),
  },
];

// Representation-specific: what the source says a link looks like in each.
const LINK_TARGETS = {
  snippet: {
    label: 'Link (anchor wrapper present)',
    test: md => /【\d+†fixture link text】/.test(md),
  },
  page_contents: {
    label: 'Link (anchor text, wrapper stripped)',
    test: md =>
      /(^|[^†])\bfixture link text\b/.test(md) &&
      !/【\d+†/.test(md) &&
      !/https:\/\/example\.com\/fixture-page/.test(md),
  },
};

// Which representation each mode claims to produce. `stock` claims neither;
// it is the unmodified-html2text baseline, scored against both targets to
// show the size of the gap in each direction.
const MODE_REPRESENTATION = {
  snippet: 'snippet',
  page_contents: 'page_contents',
  stock: null,
};

function scoreMode(md, representation) {
  const results = RENDER_FEATURES.map(f => ({ key: f.key, label: f.label, matched: f.test(md) }));
  const linkKeys = representation ? [representation] : Object.keys(LINK_TARGETS);
  for (const key of linkKeys) {
    const target = LINK_TARGETS[key];
    results.push({
      key: `link_${key}`,
      label: representation ? target.label : `${target.label} [vs ${key} target]`,
      matched: target.test(md),
    });
  }
  return results;
}

async function run() {
  const html = await fs.readFile(FIXTURE, 'utf8');
  const report = { fixture: FIXTURE, modes: {} };

  for (const mode of ['snippet', 'page_contents', 'stock']) {
    const md = await renderAsMarkdown(html, { mode });
    const representation = MODE_REPRESENTATION[mode];
    const results = scoreMode(md, representation);
    // stock is scored against both link targets, so its denominator would
    // be 9; score it out of 8 against whichever link target it does better
    // on, so the number stays comparable to the fingerprint modes.
    const renderMatched = results.filter(r => !r.key.startsWith('link_') && r.matched).length;
    const linkMatched = results.filter(r => r.key.startsWith('link_') && r.matched).length;
    const matched = renderMatched + Math.min(linkMatched, 1);
    const total = RENDER_FEATURES.length + 1;
    report.modes[mode] = { representation, matched, total, rate: matched / total, results, markdown: md };
  }

  console.log(`# Fingerprint conformance (fixture: ${FIXTURE})\n`);
  console.log('This checks whether the renderer output matches OUR OWN transcription of the');
  console.log('eight-feature list attributed to a secondary source (Peec AI infographic,');
  console.log('Metehan Yesilyurt, 2026-09-07). It measures agreement with that transcription,');
  console.log('not agreement with ChatGPT\'s actual output — no real ChatGPT rendering was');
  console.log('compared here. See docs/fidelity-protocol.md for the rig that compares against');
  console.log('a real observed sample.\n');
  console.log('Seven features are shared by both representations. The link feature is scored');
  console.log('against the target for the representation the mode produces: the 【n†text】');
  console.log('anchor for `snippet`, the stripped anchor text for `page_contents`.\n');

  for (const [mode, data] of Object.entries(report.modes)) {
    const rep = data.representation ? `represents: ${data.representation}` : 'represents: neither (baseline)';
    console.log(`## mode: ${mode} — ${data.matched}/${data.total} (${(data.rate * 100).toFixed(0)}%) — ${rep}\n`);
    console.log('| Feature | Matched |\n|---|---:|');
    for (const r of data.results) console.log(`| ${r.label} | ${r.matched ? 'yes' : 'no'} |`);
    console.log('');
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  }
}

run();
