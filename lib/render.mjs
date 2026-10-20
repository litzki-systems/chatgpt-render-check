import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const gzipAsync = promisify(gzip);

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '..', 'scripts', 'html2text_render.py');

const DEFAULT_CHUNK_WORDS = 170; // matches the chunk size observed in the Peec AI control test
const DEFAULT_VISIBLE_CHUNKS = 3; // hypothesis from that same control test, not a confirmed spec
const DEFAULT_TIMEOUT_MS = 10_000;
// Contactable, project-identifying UA (D): a generic UA is the documented
// cause of most fetch failures in the 2026-09 audit (WAFs rejecting unknown bots).
const DEFAULT_USER_AGENT = 'ChatGPTRenderCheckBot/1.3 (+https://github.com/litzki-systems/chatgpt-render-check)';

/** Classify a fetch failure into one of a fixed set of error categories,
 * so callers can count DNS/TLS/timeout/HTTP-status/empty-body failures
 * separately instead of lumping everything into one generic bucket. */
export function classifyFetchError(error, response) {
  if (response) {
    if (response.status === 403) return 'http_403';
    if (response.status === 429) return 'http_429';
    if (response.status >= 500) return 'http_5xx';
    return `http_${response.status}`;
  }
  if (error?.name === 'AbortError') return 'timeout';
  const code = error?.cause?.code ?? error?.code;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns';
  if (typeof code === 'string' && (code.startsWith('ERR_TLS') || code.startsWith('CERT_') || code === 'EPROTO')) return 'tls';
  return 'other';
}

/** Fetch and parse robots.txt for `origin`, returning whether `pathname`
 * is disallowed for `userAgent` (falling back to `*`). Any failure to
 * fetch/parse robots.txt is treated as "allowed" — absence of a robots.txt
 * is not a disallow signal. */
export async function isDisallowedByRobots(url, userAgent, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let robotsUrl;
  try {
    robotsUrl = new URL('/robots.txt', url).toString();
  } catch {
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let body;
  try {
    const res = await fetch(robotsUrl, { signal: controller.signal, headers: { 'User-Agent': userAgent } });
    clearTimeout(timer);
    if (!res.ok) return false;
    body = await res.text();
  } catch {
    clearTimeout(timer);
    return false;
  }

  const uaToken = userAgent.split('/')[0].trim().toLowerCase();
  const groups = []; // { agents: [], disallow: [], seenRule }
  let current = null;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      // A new User-agent line after this group already saw a rule starts a
      // fresh record; consecutive User-agent lines with no rule between
      // them share one record (standard robots.txt grouping).
      if (!current || current.seenRule) {
        current = { agents: [], disallow: [], seenRule: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (key === 'disallow' && current) {
      current.seenRule = true;
      if (value) current.disallow.push(value);
    }
  }

  const { pathname } = new URL(url);
  const applicable = groups.filter(g => g.agents.includes(uaToken) || g.agents.includes('*'));
  const specific = applicable.filter(g => g.agents.includes(uaToken));
  const relevant = specific.length ? specific : applicable;
  for (const group of relevant) {
    for (const rule of group.disallow) {
      if (rule === '/' || pathname.startsWith(rule)) return true;
    }
  }
  return false;
}

export const RENDER_MODES = ['stock', 'snippet', 'page_contents'];

const CITATION_ANCHOR_RE = /【\d+†(.*?)】/g;

/**
 * Remove the 【n†...】 citation-anchor wrapper, keeping the anchor text.
 *
 * Mirrors strip_citation_anchors() in scripts/html2text_render.py, and is
 * exported separately because an observed sample captured from a search
 * result carries the anchors while the fetched-page representation does
 * not; comparing the two requires normalizing one side.
 *
 * The wrapper carries no surrounding whitespace, so this changes the
 * character count but not the word count — and therefore not the chunk
 * boundaries. tests/render.test.mjs asserts that invariant.
 */
export function stripCitationAnchors(text) {
  return text.replace(CITATION_ANCHOR_RE, '$1');
}

/**
 * HTML -> Markdown via the Python html2text renderer (scripts/html2text_render.py).
 *
 * mode 'stock'         - plain html2text defaults (default, matches prior behavior).
 * mode 'snippet'       - fingerprint-adjusted rendering (asterisk emphasis,
 *                        link -> 【n†text】, image collapsing, form control
 *                        placeholders): the search-result representation.
 * mode 'page_contents' - as 'snippet', with the citation-anchor wrapper
 *                        stripped again: the fetched-page representation the
 *                        model reads.
 *
 * See docs/fidelity-protocol.md — unverified hypothesis, not a confirmed
 * ChatGPT spec.
 */
export function renderAsMarkdown(html, { timeoutMs = DEFAULT_TIMEOUT_MS, mode = 'stock' } = {}) {
  if (!RENDER_MODES.includes(mode)) {
    return Promise.reject(new Error(`unknown mode '${mode}'; expected one of ${RENDER_MODES.join(', ')}`));
  }
  return new Promise((resolve, reject) => {
    const proc = execFile(
      'python3',
      [SCRIPT, mode],
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr?.trim() || err.message));
        resolve(stdout);
      }
    );
    proc.stdin.write(html);
    proc.stdin.end();
  });
}

/**
 * Extract raw <meta> tags in document order as { name, value } pairs.
 * "name" is whichever identifying attribute the tag carries
 * (name, property, http-equiv, charset), in that priority order.
 * No interpretation or filtering — this is the raw meta_tags layer (A2).
 */
export function extractMetaTags(html) {
  const tags = [];
  const re = /<meta\b([^>]*)>/gi;
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match;
  while ((match = re.exec(html))) {
    const attrs = {};
    let a;
    attrRe.lastIndex = 0;
    while ((a = attrRe.exec(match[1]))) {
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    }
    const name = attrs.name ?? attrs.property ?? attrs['http-equiv'] ?? (attrs.charset !== undefined ? 'charset' : undefined);
    if (name === undefined) continue;
    const value = name === 'charset' ? attrs.charset : (attrs.content ?? '');
    tags.push({ name, value });
  }
  return tags;
}

const ENGLISH_STOPWORDS = new Set(['the', 'and', 'is', 'of', 'to', 'in', 'that', 'it', 'for', 'on', 'with', 'as', 'are', 'this', 'be']);

/**
 * Determine a page's language: the `<html lang="...">` attribute's primary
 * subtag, if present; otherwise a coarse English-stopword-frequency
 * heuristic over the rendered text. Returns a lowercase ISO-639-1-ish
 * subtag (e.g. 'en', 'de') or 'unknown' if neither signal is conclusive.
 */
export function detectLanguage(html, text = '') {
  const attrMatch = html.match(/<html\b[^>]*\blang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
  const langAttr = attrMatch?.[1] ?? attrMatch?.[2] ?? attrMatch?.[3];
  if (langAttr && langAttr.trim()) {
    return langAttr.trim().split(/[-_]/)[0].toLowerCase();
  }

  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length < 20) return 'unknown';
  const stopwordHits = words.filter(w => ENGLISH_STOPWORDS.has(w)).length;
  return stopwordHits / words.length > 0.08 ? 'en' : 'unknown';
}

const SENTENCE_END_RE = /(?<=[.!?])\s+/;

/**
 * Strip markdown syntax before word-counting: heading hashes, list markers,
 * table separator rows, blockquote markers. A link's anchor text counts as
 * text; its URL does not.
 */
export function stripMarkdownSyntax(text) {
  return text
    .replace(/^[\s:|-]*-[\s:|-]*$/gm, '') // table separator rows, e.g. "---|---" or "| --- | --- |"
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

function countWords(text, countMode) {
  const source = countMode === 'plain' ? stripMarkdownSyntax(text) : text;
  const trimmed = source.trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}

/**
 * Split an over-hardCap paragraph into pieces at sentence ends; a single
 * sentence that itself exceeds hardCap falls back to a word-window split.
 * Returns [{ text, splitReason }], splitReason is 'sentence-boundary' or
 * 'word-window'.
 */
function splitOversizedParagraph(paragraph, hardCap, countMode) {
  const sentences = paragraph.split(SENTENCE_END_RE);
  const pieces = [];
  let bucket = [];
  let bucketWords = 0;

  function flushBucket() {
    if (bucket.length) {
      pieces.push({ text: bucket.join(' '), splitReason: 'sentence-boundary' });
      bucket = [];
      bucketWords = 0;
    }
  }

  for (const sentence of sentences) {
    const sw = countWords(sentence, countMode);
    if (sw > hardCap) {
      flushBucket();
      const tokens = sentence.trim().split(/\s+/);
      for (let i = 0; i < tokens.length; i += hardCap) {
        pieces.push({ text: tokens.slice(i, i + hardCap).join(' '), splitReason: 'word-window' });
      }
      continue;
    }
    if (bucketWords + sw > hardCap && bucket.length) {
      flushBucket();
      bucket = [sentence];
      bucketWords = sw;
    } else {
      bucket.push(sentence);
      bucketWords += sw;
    }
  }
  flushBucket();
  return pieces;
}

/**
 * Split markdown into ~targetWords-word blocks, preferring paragraph breaks
 * (double newline) over single line breaks. The word count is a soft
 * target, not a hard boundary, unless `hardCap` is set.
 *
 * Accepts either a legacy numeric second argument (chunkWords — kept for
 * backward compatibility, behaves exactly as before: countMode 'markdown',
 * no hardCap) or an options object:
 *   { targetWords = 170, hardCap = null, countMode = 'markdown' }
 * countMode 'markdown' counts markdown syntax as words (today's/legacy
 * behavior, default, kept so past runs stay comparable). countMode 'plain'
 * strips markdown syntax first (see stripMarkdownSyntax).
 *
 * Returns an array of { text, splitReason }. splitReason is null unless a
 * paragraph exceeded hardCap and had to be split, in which case it is
 * 'sentence-boundary' or 'word-window'.
 */
export function chunkMarkdown(md, options = DEFAULT_CHUNK_WORDS) {
  const {
    targetWords = DEFAULT_CHUNK_WORDS,
    hardCap = null,
    countMode = 'markdown',
  } = typeof options === 'number' ? { targetWords: options } : (options ?? {});

  if (!md || !md.trim()) return [];
  const paragraphs = md.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let current = [];
  let wordCount = 0;

  function flush() {
    if (current.length > 0) {
      chunks.push({ text: current.join('\n\n'), splitReason: null });
      current = [];
      wordCount = 0;
    }
  }

  for (const para of paragraphs) {
    const words = countWords(para, countMode);

    if (hardCap && words > hardCap) {
      flush();
      for (const piece of splitOversizedParagraph(para, hardCap, countMode)) {
        chunks.push(piece);
      }
      continue;
    }

    if (wordCount + words > targetWords && current.length > 0) {
      flush();
      current = [para];
      wordCount = words;
    } else {
      current.push(para);
      wordCount += words;
    }
  }
  flush();
  return chunks;
}

/**
 * Fetch a URL, render it to markdown, split into chunks. Never throws.
 * Failures come back as { error }, so a batch run over many URLs never
 * aborts on one bad domain.
 */
export async function fetchChatgptPreview(url, opts = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    userAgent = DEFAULT_USER_AGENT,
    chunkWords = DEFAULT_CHUNK_WORDS,
    visibleChunks = DEFAULT_VISIBLE_CHUNKS,
    mode = 'stock',
    hardCap = null,
    countMode = 'markdown',
    respectRobots = true,
    artifactsDir = null,
  } = opts;

  if (respectRobots && (await isDisallowedByRobots(url, userAgent, { timeoutMs }))) {
    return { url, error: 'disallowed by robots.txt', errorCategory: 'robots_disallowed' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': userAgent } });
    clearTimeout(timer);
  } catch (error) {
    clearTimeout(timer);
    return { url, error: error.message, errorCategory: classifyFetchError(error) };
  }

  if (!res.ok) {
    return { url, error: `HTTP ${res.status}`, errorCategory: classifyFetchError(null, res) };
  }

  const html = await res.text();
  if (!html.trim()) {
    return { url, error: 'empty body', errorCategory: 'empty_body' };
  }

  const htmlSha256 = createHash('sha256').update(html).digest('hex');
  if (artifactsDir) {
    try {
      await fs.mkdir(artifactsDir, { recursive: true });
      const gzipped = await gzipAsync(Buffer.from(html, 'utf8'));
      await fs.writeFile(join(artifactsDir, `${htmlSha256}.html.gz`), gzipped);
    } catch {
      // best-effort; a failed artifact write must not fail the render
    }
  }

  const md = await renderAsMarkdown(html, { timeoutMs, mode });
  const markdownSha256 = createHash('sha256').update(md).digest('hex');
  const chunks = chunkMarkdown(md, { targetWords: chunkWords, hardCap, countMode });
  const metaTags = extractMetaTags(html);
  const language = detectLanguage(html, md);
  return {
    url,
    renderer: 'html2text (ChatGPT-compatible)',
    mode,
    chunkWords,
    countMode,
    totalChunks: chunks.length,
    visibleToModel: chunks.slice(0, visibleChunks),
    allChunks: chunks,
    metaTags,
    htmlSha256,
    markdownSha256,
    language,
  };
}
