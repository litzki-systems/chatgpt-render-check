#!/usr/bin/env node
import fs from 'node:fs/promises';
import { fetchChatgptPreview } from '../lib/render.mjs';

function printHelp() {
  console.log(`chatgpt-render-check — reproducible simulation of ChatGPT's observed retrieval rendering for a page

Usage:
  chatgpt-render-check <url> [<url> ...] [options]
  chatgpt-render-check --file urls.txt [options]

Options:
  --file <path>          Read URLs from a file (one per line, # comments allowed)
  --out <path>           Write report to this file instead of stdout
  --format <md|json>     Output format (default: md)
  --chunk-words <n>      Target words per chunk (default: 170)
  --visible <n>          Chunks considered "visible to the model" (default: 3)
  --timeout <ms>         Per-URL fetch/render timeout in ms (default: 10000)
  --mode <stock|snippet|page_contents>
                         Renderer mode (default: stock; see README).
                         snippet = search-result representation (links as
                         【n†text】); page_contents = fetched-page
                         representation (anchor wrapper stripped).
  --count-mode <markdown|plain>  Word-counting mode for chunking (default: markdown)
  --hard-cap <n>         Hard per-chunk word ceiling; splits oversized paragraphs (default: none)
  --artifacts-dir <path> Store gzip'd raw HTML under this dir, keyed by sha256 (default: artifacts)
  --no-robots            Skip robots.txt checking (default: robots.txt is honored)
  -h, --help             Show this help
`);
}

function parseArgs(argv) {
  const opts = {
    urls: [], file: null, out: null, format: 'md',
    chunkWords: 170, visibleChunks: 3, timeoutMs: 10_000,
    mode: 'stock', countMode: 'markdown', hardCap: null,
    artifactsDir: 'artifacts', respectRobots: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
    else if (a === '--file') opts.file = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--format') opts.format = argv[++i];
    else if (a === '--chunk-words') opts.chunkWords = parseInt(argv[++i], 10);
    else if (a === '--visible') opts.visibleChunks = parseInt(argv[++i], 10);
    else if (a === '--timeout') opts.timeoutMs = parseInt(argv[++i], 10);
    else if (a === '--mode') opts.mode = argv[++i];
    else if (a === '--count-mode') opts.countMode = argv[++i];
    else if (a === '--hard-cap') opts.hardCap = parseInt(argv[++i], 10);
    else if (a === '--artifacts-dir') opts.artifactsDir = argv[++i];
    else if (a === '--no-robots') opts.respectRobots = false;
    else if (a.startsWith('http://') || a.startsWith('https://')) opts.urls.push(a);
    else { console.error(`Unknown argument: ${a}`); process.exit(1); }
  }
  return opts;
}

function toMarkdown(results) {
  let md = `# ChatGPT Render Check\n\nGenerated: ${new Date().toISOString()}\n\n`;
  md += 'Simulated with html2text, tuned to match observed ChatGPT retrieval output (HTML → markdown → ~170-word chunks). Diagnostic only — not a ranking or score, and not a verified account of ChatGPT\'s actual internal pipeline; see README for the evidence this simulation is based on.\n\n---\n\n';
  for (const r of results) {
    md += `## ${r.url}\n\n`;
    if (r.error) { md += `**ERROR:** ${r.error}\n\n---\n\n`; continue; }
    md += `- Renderer: \`${r.renderer}\`\n- Chunks total: ${r.totalChunks}\n- Flagged as visible to model (hypothesis): ${r.visibleToModel.length}\n\n`;
    r.allChunks.forEach((c, i) => {
      const visible = i < r.visibleToModel.length;
      const label = c.splitReason ? ` — hard-cap split (${c.splitReason})` : '';
      md += `### Chunk ${i + 1}${visible ? ' — flagged as visible to model' : ''}${label}\n\n`;
      md += '```\n' + c.text.trim() + '\n```\n\n';
    });
    md += '---\n\n';
  }
  return md;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.file) {
    const raw = await fs.readFile(opts.file, 'utf8');
    const fromFile = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    opts.urls.push(...fromFile);
  }

  if (!opts.urls.length) { printHelp(); process.exit(1); }

  const results = [];
  for (const url of opts.urls) {
    process.stderr.write(`fetching ${url} ... `);
    const r = await fetchChatgptPreview(url, opts);
    process.stderr.write(r.error ? `ERROR: ${r.error}\n` : `ok, ${r.totalChunks} chunks\n`);
    results.push(r);
  }

  const output = opts.format === 'json' ? JSON.stringify(results, null, 2) : toMarkdown(results);

  if (opts.out) {
    await fs.writeFile(opts.out, output);
    console.error(`written: ${opts.out}`);
  } else {
    console.log(output);
  }
}

main();
