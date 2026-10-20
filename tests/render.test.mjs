import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chunkMarkdown, detectLanguage, extractMetaTags, renderAsMarkdown, stripCitationAnchors } from '../lib/render.mjs';
import { measureChunks } from '../lib/measure.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// extractMetaTags: name/property/http-equiv/charset priority, document order preserved.
const html = `<html><head>
  <meta charset="utf-8">
  <meta name="description" content="A test page">
  <meta property="og:title" content="OG Title">
  <meta http-equiv="refresh" content="30">
  <meta content="orphan content, no identifying attribute">
</head><body></body></html>`;

const tags = extractMetaTags(html);
assert.deepEqual(tags, [
  { name: 'charset', value: 'utf-8' },
  { name: 'description', value: 'A test page' },
  { name: 'og:title', value: 'OG Title' },
  { name: 'refresh', value: '30' },
]);

// Fingerprint fixture: both fingerprint modes must hit the seven shared
// render features; they differ only in the link representation.
const fixturePath = join(__dirname, '..', 'experiments', 'fixtures', 'fingerprint-conformance.html');
const fixtureHtml = await fs.readFile(fixturePath, 'utf8');

const snippetMd = await renderAsMarkdown(fixtureHtml, { mode: 'snippet' });
assert.match(snippetMd, /\*fixture italic text\*/, 'snippet mode must use asterisk emphasis');
assert.match(snippetMd, /Image: fixture image alt text/, 'snippet mode must collapse images to Image: <alt>');
assert.match(snippetMd, /【\d+†fixture link text】/, 'snippet mode must collapse links to 【n†text】');
assert.match(snippetMd, /\[Input: fixture input placeholder\]/, 'snippet mode must placeholder form inputs');
assert.match(snippetMd, /\[Button: Fixture Button\]/, 'snippet mode must placeholder buttons');
assert.doesNotMatch(snippetMd, /https:\/\/example\.com\/fixture-page/, 'snippet mode must drop link URLs');

// page_contents is snippet with the citation-anchor wrapper stripped: same
// seven render features, anchor text kept as plain text, wrapper gone.
const pageMd = await renderAsMarkdown(fixtureHtml, { mode: 'page_contents' });
assert.match(pageMd, /\*fixture italic text\*/, 'page_contents keeps asterisk emphasis');
assert.match(pageMd, /Image: fixture image alt text/, 'page_contents keeps collapsed images');
assert.match(pageMd, /\[Input: fixture input placeholder\]/, 'page_contents keeps input placeholders');
assert.match(pageMd, /fixture link text/, 'page_contents must keep the link anchor text');
assert.doesNotMatch(pageMd, /【\d+†/, 'page_contents must strip the citation-anchor wrapper');
assert.doesNotMatch(pageMd, /https:\/\/example\.com\/fixture-page/, 'page_contents must drop link URLs');
assert.equal(stripCitationAnchors(snippetMd), pageMd, 'page_contents must equal snippet with anchors stripped');

// Stock mode must NOT produce the fingerprint markers — it is the
// "unmodified html2text" baseline the fingerprint modes are compared
// against. bin/chatgpt-render-fingerprint-conformance.mjs checks these same
// markers with the same single pattern per feature for both fingerprint
// modes; asserting the negative here keeps that scoring honest.
const stockMd = await renderAsMarkdown(fixtureHtml, { mode: 'stock' });
assert.match(stockMd, /_fixture italic text_/, 'stock mode keeps underscore emphasis (default html2text)');
assert.doesNotMatch(stockMd, /\*fixture italic text\*/, 'stock mode must not use asterisk emphasis');
assert.doesNotMatch(stockMd, /Image: fixture image alt text/, 'stock mode must not collapse images to Image: <alt>');
assert.doesNotMatch(stockMd, /【\d+†fixture link text】/, 'stock mode must not collapse links to 【n†text】');
assert.doesNotMatch(stockMd, /\[Input:/, 'stock mode does not add input placeholders');
assert.doesNotMatch(stockMd, /\[Button:/, 'stock mode does not add button placeholders');

await assert.rejects(
  () => renderAsMarkdown(fixtureHtml, { mode: 'chatgpt' }),
  /unknown mode/,
  'a retired or misspelled mode name must fail loudly, not fall back to a default'
);

// The citation-anchor wrapper carries no surrounding whitespace, so
// stripping it changes the character count but must not move a single
// chunk boundary. This is what makes one shared chunker correct for both
// representations; if it ever fails, the two representations need separate
// chunking and docs/score-normalization.md's premise is void.
const linkedParagraphs = Array.from({ length: 40 }, (_, i) =>
  `<p>Paragraph ${i} with running prose long enough to matter for the boundary calculation, plus <a href="https://example.com/t-${i}">an inline link with several words of anchor text</a> and more trailing prose after it.</p>`
).join('\n');
const anchorHeavyMd = await renderAsMarkdown(`<html lang="en"><body><main>${linkedParagraphs}</main></body></html>`, { mode: 'snippet' });
const anchorStrippedMd = stripCitationAnchors(anchorHeavyMd);
assert.ok(/【\d+†/.test(anchorHeavyMd), 'fixture must actually produce citation anchors');
assert.ok(anchorHeavyMd.length > anchorStrippedMd.length, 'stripping must shorten the character count');

for (const countMode of ['markdown', 'plain']) {
  const withAnchors = chunkMarkdown(anchorHeavyMd, { targetWords: 170, countMode });
  const without = chunkMarkdown(anchorStrippedMd, { targetWords: 170, countMode });
  assert.equal(withAnchors.length, without.length, `chunk count must not change with anchors stripped (${countMode})`);
  const wordsOf = t => stripCitationAnchors(t).trim().split(/\s+/).filter(Boolean).length;
  const offsets = chunks => { let o = 0; return chunks.map(c => (o += wordsOf(c.text))); };
  assert.deepEqual(offsets(withAnchors), offsets(without), `chunk boundaries must not move with anchors stripped (${countMode})`);
}

// chunkMarkdown: legacy numeric call keeps old markdown-syntax word counting.
const heavyMarkdown = '# Heading one two three\n\n' + '- item four five\n- item six seven'.repeat(1);
const legacyChunks = chunkMarkdown(heavyMarkdown, 5);
assert.ok(legacyChunks.every(c => typeof c.text === 'string' && c.splitReason === null));

// countMode 'plain' must not count heading/list syntax or link URLs as words.
const syntaxHeavy = '# Heading\n\n- one\n- two\n\n[anchor text](https://example.com/long/url/path)';
const markdownCount = chunkMarkdown(syntaxHeavy, { targetWords: 1000, countMode: 'markdown' });
const plainCount = chunkMarkdown(syntaxHeavy, { targetWords: 1000, countMode: 'plain' });
assert.equal(markdownCount.length, 1);
assert.equal(plainCount.length, 1);
// same content, but plain mode must have fewer countable words (no '#', '-', URL)
const wc = s => s.trim().split(/\s+/).filter(Boolean).length;
assert.ok(wc(plainCount[0].text.replace(/^#{1,6}\s+|^\s*-\s+/gm, '')) <= wc(markdownCount[0].text));

// hardCap must split an oversized paragraph and tag the pieces with a split_reason.
const longSentence = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ') + '.';
const oversizedParagraph = `${longSentence} ${longSentence} ${longSentence}`;
const capped = chunkMarkdown(oversizedParagraph, { targetWords: 170, hardCap: 30, countMode: 'markdown' });
assert.ok(capped.length > 1, 'oversized paragraph must be split under hardCap');
assert.ok(capped.every(c => c.splitReason === 'sentence-boundary' || c.splitReason === 'word-window'));
assert.ok(capped.every(c => c.text.trim().split(/\s+/).length <= 30));

// E: language detection and anchor gating.
assert.equal(detectLanguage('<html lang="de-DE"><body></body></html>', 'irrelevant'), 'de');
assert.equal(detectLanguage('<html><body></body></html>', 'the quick brown fox is running and it is very fast to the store and back and it is on the way and this is for the record as it is with the plan'), 'en');
assert.equal(detectLanguage('<html><body></body></html>', 'Der schnelle Fuchs läuft schnell durch den dunklen Wald über die grüne Wiese am frühen Morgen und springt dabei sehr hoch und weit dorthin'), 'unknown');

const nonEnglishMeasurement = measureChunks(['# Titel', 'Willkommen, dies ist ein evidence proof verified Text'], { language: 'de' });
assert.equal(nonEnglishMeasurement.languageCovered, false);
assert.equal(nonEnglishMeasurement.anchors, null);
assert.equal(nonEnglishMeasurement.anchorCoverage, null);
assert.ok(nonEnglishMeasurement.totalWords > 0, 'word counts must still be reported for non-English pages');

const englishMeasurement = measureChunks(['# Title', 'measured 94% verification coverage'], { language: 'en' });
assert.equal(englishMeasurement.languageCovered, true);
assert.ok(Array.isArray(englishMeasurement.anchors));

console.log('render/meta-tag tests passed');
