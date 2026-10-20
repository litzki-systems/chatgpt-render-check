const DEFAULT_ANCHORS = [
  { key: 'h1', label: 'H1', pattern: /^#\s+(.+)$/m },
  { key: 'value_proposition', label: 'Value proposition', pattern: /\b(save money|live better|greatest choice|empower the world|productivity|mission|value proposition)\b/i },
  { key: 'product_service', label: 'Product or service', pattern: /\b(product|products|service|services|solution|solutions|cloud|software|platform)\b/i },
  { key: 'evidence', label: 'Evidence', pattern: /\b(?:evidence|proof|verified|verification|benchmark|study|research|report|reports|measured|measurement|survey|audit|tested|test results|results|case stud(?:y|ies)|customer stories|facts|at a glance)\b|\b(?:over\s+\d[\d,.]*|\d[\d,.]*\s*(?:%|percent|million|billion|thousand|ms|seconds?|users?|customers?|services?))\b/i },
  { key: 'cta', label: 'CTA', pattern: /\b(get started|learn more|shop now|buy now|sign up|start free|try (?:it|now)|contact us|explore)\b/i },
];

function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// chunkMarkdown (lib/render.mjs) returns { text, splitReason } objects;
// plain strings are also accepted for callers (and the existing test
// suite) that build chunk arrays by hand.
function chunkText(chunk) {
  return typeof chunk === 'string' ? chunk : chunk.text;
}

// E: anchors are English-only phrases (lib/measure.mjs DEFAULT_ANCHORS). For
// any other detected language, anchor metrics are not meaningful and must
// be reported as "language not covered" rather than a false zero/absence.
export function measureChunks(chunks, { visibleChunks = 3, anchors = DEFAULT_ANCHORS, language = 'en' } = {}) {
  const texts = chunks.map(chunkText);
  const markdown = texts.join('\n\n');
  const visible = texts.slice(0, visibleChunks);
  const totalWords = wordCount(markdown);
  const visibleWords = wordCount(visible.join('\n\n'));

  if (language !== 'en') {
    return {
      totalWords,
      visibleWords,
      visibleCoverage: totalWords ? visibleWords / totalWords : null,
      languageCovered: false,
      language,
      anchorCoverage: null,
      firstRelevantChunk: null,
      contentDisplacementWords: null,
      contentDisplacementRatio: null,
      anchors: null,
    };
  }

  const anchorResults = anchors.map(anchor => {
    const match = markdown.match(anchor.pattern);
    if (!match || match.index == null) {
      return { key: anchor.key, label: anchor.label, found: false, chunk: null, wordOffset: null, visible: false };
    }

    const chunk = texts.findIndex(t => t.includes(match[0])) + 1;
    const wordOffset = wordCount(markdown.slice(0, match.index)) + 1;
    return {
      key: anchor.key,
      label: anchor.label,
      found: true,
      chunk,
      wordOffset,
      visible: chunk > 0 && chunk <= visibleChunks,
    };
  });

  const relevant = anchorResults.filter(a => a.key !== 'h1' && a.found);
  const firstRelevant = relevant[0];
  const displacementWords = firstRelevant ? firstRelevant.wordOffset - 1 : null;
  const visibleAnchorCount = anchorResults.filter(a => a.found && a.visible).length;
  const foundAnchorCount = anchorResults.filter(a => a.found).length;

  return {
    totalWords,
    visibleWords,
    visibleCoverage: totalWords ? visibleWords / totalWords : null,
    languageCovered: true,
    language,
    anchorCoverage: foundAnchorCount ? visibleAnchorCount / foundAnchorCount : null,
    firstRelevantChunk: firstRelevant?.chunk ?? null,
    contentDisplacementWords: displacementWords,
    contentDisplacementRatio: totalWords ? displacementWords / totalWords : null,
    anchors: anchorResults,
  };
}

export { DEFAULT_ANCHORS };
