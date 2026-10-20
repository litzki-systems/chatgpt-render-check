# chatgpt-render-check

A reproducible simulation of how ChatGPT is reported to turn a fetched web
page into text chunks, and a 1,000-domain benchmark of what that
representation does to chunk boundaries.

**Main result.** If you approximate ChatGPT's reported chunks with a plain
html2text conversion, the cut points land elsewhere than in the reconstructed
ChatGPT text on **363 of 376 multi-chunk pages (96.5%)**. The two renderings differ by design in how they write
links, images, emphasis and form fields, so different cut points are
expected; the benchmark measures how large that difference is in practice. Pages
without links never shift (0 of 50), which is consistent with link
rendering being the main source of the difference.

> **This is a simulation.** It reconstructs a rendering path from public
> LinkedIn posts. It uses no data from the leak itself, its match with real
> ChatGPT output is untested, and it makes no statement about which pages
> ChatGPT cites or how likely a citation is.

## The question

In September 2026, Metehan Yeşilyurt (Peec AI) published a two-part
"ChatGPT retrieval system LEAK" series on LinkedIn:

* [Part 1](https://www.linkedin.com/posts/metehanyesilyurt_chatgpt-retrieval-system-leak-alert-ugcPost-7502755977935478784-xcpd/) (2026-09-07): fetched pages look like `html2text` output, with structural containers removed, split into text blocks of roughly 170 words, plus eight formatting fingerprints.
* [Part 2](https://www.linkedin.com/posts/metehanyesilyurt_chatgpt-retrieval-system-leak-alert-part-ugcPost-7503484262952693760-SvQf/) (2026-09-09): ChatGPT holds two representations of one passage, a search-result record with `【n†text】` citation anchors and a fetched-page record without them, and rescales chunk scores in a described way.

According to Malte Landwehr ([Peec AI, LinkedIn, 19 October 2026](https://www.linkedin.com/posts/landwehr_on-october-20-i-will-have-a-live-chat-with-share-7517999964430442496-4twc/)), OpenAI
patched the leak in the week before that post. The rendering path described
here can therefore no longer be observed in new records.

This repository takes those descriptions as hypotheses, rebuilds them as
code and asks a practical question for anyone building tools on top of
them:

> If a tool approximates ChatGPT's reported page text with a plain
> html2text conversion, how often does it place the chunk boundaries
> somewhere else, and on which pages?

## Method

```text
HTML → structural cleanup → html2text → paragraph-based chunks (~170 words) → measurements
```

The renderer offers three modes:

| Mode | Represents | Links appear as |
|---|---|---|
| `stock` | unmodified html2text baseline | `[text](url)` |
| `snippet` | reported search-result record | `【n†text】` |
| `page_contents` | reported fetched-page record | `text` |

`snippet` and `page_contents` share the seven non-link fingerprints from
part 1 (emphasis, images, rules, tables, headings, bullets, form
placeholders) and differ only in the link wrapper. The chunker splits on
paragraphs with a 170-word target and counts words either on the markdown
text (`markdown`) or with markup removed (`plain`).

The benchmark population is the first 1,000 domains of
[Tranco list 74V6X](https://tranco-list.eu/list/74V6X) (generated
2026-09-06). Each homepage is fetched once, rendered in `stock` and
`page_contents`, chunked, and compared on inner chunk offsets (every
boundary except the end of the page). 502 domains rendered successfully;
475 produced text in at least one mode.

## Results

### Why boundaries move, and what the benchmark measures

`stock` and `page_contents` differ on purpose: `stock` writes links as
`[text](url)` and keeps image URLs, emphasis and form controls the way
html2text does, while `page_contents` writes link text only, collapses
images, uses different emphasis and adds `[Input: …]` and `[Button: …]`
placeholders. The two texts therefore have different lengths, and cutting
both into blocks of about 170 words almost always puts the cuts in
different places. That a page shifts is expected from the construction.
What the benchmark adds is the size of the effect on real pages: how many
pages are affected, and which properties of a page decide it.

### Chunk boundaries

| Population | n | Inner boundary shift | Share |
|---|---:|---:|---:|
| All successfully rendered domains | 502 | 365 | 72.7% |
| Non-empty cohort | 475 | 365 | 76.8% |
| Multi-chunk pages, `markdown` mode | 376 | 363 | 96.5% |
| Multi-chunk pages, `plain` mode | 373 | 362 | 97.1% |

In the lowest link-density quartile, 0 of 50 pages without links shift,
while 60 of 75 pages with at least one link do. This follows from the
construction as well: without links, the largest rendering difference
disappears.

An earlier version of this analysis reported 87% and 92%, because it
counted a change in a page's total word count as a boundary shift. The
correction from 2026-09-27 and the figures before and after it are in
[`docs/findings.md`](docs/findings.md), section 4.

### What the benchmark shows about popular homepages

These figures come from the fetch and render steps and do not depend on
the boundary comparison.

* **498 of 1,000 domains could not be fetched at all.** DNS failure 219,
  HTTP 403 99, timeout 50, blocked by `robots.txt` 47, TLS error 23, HTTP
  404 21, other network errors 23, remaining HTTP errors and empty
  responses 16. Most DNS failures are infrastructure domains without a
  website of their own, such as CDN, DNS and update hosts (`akamaiedge.net`,
  `cloudfront.net`, `root-servers.net`, `windowsupdate.com`).
* **27 of the 502 fetched homepages contain no text at all** after
  rendering, in either mode. Among them are TikTok, Spotify, MSN, Twitch,
  Roblox, Duolingo, Temu, Ryanair, Meta, FIFA and five Amazon country shops
  (UK, Japan, Spain, Italy, Australia). Two patterns explain them. 15
  return less than 5 KB of HTML, typical of bot checks or redirects; this
  includes all five Amazon shops, Yandex, Temu, FIFA and Ryanair. The other
  12, among them TikTok, Spotify, Twitch, Meta and Roblox, deliver large
  pages whose visible content is built with JavaScript, which a plain HTML
  fetch does not run.
* **22.4% of non-empty homepages fit into a single text block.** In the
  original stock benchmark, 121 of 539 non-empty renderings stay below 170
  words (`docs/renderer-baseline-analysis.md`).

### Further findings

In [`docs/findings.md`](docs/findings.md): removing the `【n†text】` anchor
wrapper never moves a boundary (finding 3), one of the two quoted
score-normalization examples reproduces and the other does not (findings 1
and 2), and form placeholders change word counts without moving boundaries
(finding 6).

## Limits

* The renderer reconstructs a second-hand description. Nobody involved
  here has access to ChatGPT's implementation, and the reconstruction has
  not been compared with real ChatGPT records.
* `bin/chatgpt-render-fingerprint-conformance.mjs` scores 8/8 for
  `snippet` and `page_contents`. That measures agreement with **our own
  transcription** of the posts' feature list on a synthetic fixture, not
  fidelity to ChatGPT.
* The benchmark covers homepages of popular domains only. Deep pages,
  articles and documentation may behave differently.
* Results describe text structure. They say nothing about retrieval,
  ranking, citation or visibility.
* The repository does not claim that ChatGPT uses `html2text`, that 170
  words is a hard limit, or that chunk position causes citation.

## Reproduce the numbers

Requirements: Node.js 18 or newer, Python 3 with the packages in
`requirements.txt`.

```bash
pip install -r requirements.txt
npm test                 # renderer, chunker and normalization tests
npm run reproduce        # recomputes the main result from the committed scan data
```

`npm run reproduce` runs `benchmark/03-full-width-diff.mjs` on the
committed per-domain scans and prints all figures above as JSON. It also
rewrites `benchmark/full-comparison.jsonl`; the result is byte-identical
to the committed file.

To fetch fresh data instead (results will differ, since the web changes):

```bash
python3 scripts/extract-tranco-top1000.py /path/to/tranco-74V6X.csv experiments/tranco-74V6X-top1000.csv
node bin/chatgpt-render-benchmark.mjs \
  --file experiments/tranco-74V6X-top1000.csv \
  --out experiments/results/tranco-74V6X-render.jsonl \
  --concurrency 4 --timeout 10000
```

The full Tranco snapshot used here has SHA-256
`f759ed99b859b05f098ec5e281bd4a993e6223fd79920af92febb3c9709eef28`. The
workflow in `.github/workflows/tranco-benchmark.yml` downloads and checks
it automatically.

Single pages:

```bash
node bin/chatgpt-render-check.mjs --file urls.txt --out report.md
node bin/chatgpt-render-measure.mjs https://example.com/
```

## Fetching etiquette

Requests identify themselves with the User-Agent
`ChatGPTRenderCheckBot/1.3 (+https://github.com/litzki-systems/chatgpt-render-check)`,
honor `robots.txt` before every page fetch and record failures by category
(`dns`, `tls`, `timeout`, `http_403`, `http_429`, `http_5xx`,
`empty_body`, `robots_disallowed`, `other`).

## Repository layout

| Path | Contents |
|---|---|
| `lib/` | Renderer (`render.mjs`), measurements (`measure.mjs`), score normalization (`normalize-scores.mjs`) |
| `scripts/` | html2text bridge, Tranco extraction |
| `bin/` | Command-line tools: single checks, benchmark, baseline, audit, fingerprint conformance, meta tags, fidelity rig |
| `benchmark/` | Full 1,000-domain `stock` versus `page_contents` comparison: scripts, scan data, write-up |
| `dry-run/` | 40-domain pilot that preceded the full comparison |
| `experiments/` | Tranco top 1,000 list and synthetic test fixtures |
| `docs/` | Findings, benchmark reports, data-quality audits, normalization notes, fidelity protocol |
| `tests/` | Regression tests (`npm test`) |

Start with [`docs/findings.md`](docs/findings.md). Some documents mention
GitHub Actions run IDs (for example `34161247425`); those runs belong to
the private working repository this publication was prepared from, and
the data they produced is committed here.

This publication covers the rendering simulation and the benchmark. Work
on observing live ChatGPT answers is not part of it.

## License

* Code: [MIT](LICENSE)
* Documentation and measurement data (`docs/`, `benchmark/`, `dry-run/`, `experiments/`): [CC BY 4.0](LICENSE-DOCS)

The Tranco list is the work of its authors; please cite it when you use it:
Victor Le Pochat, Tom Van Goethem, Samaneh Tajalizadehkhoob, Maciej
Korczyński and Wouter Joosen. 2019. "Tranco: A Research-Oriented Top Sites
Ranking Hardened Against Manipulation." NDSS 2019.
https://doi.org/10.14722/ndss.2019.23386

## Author

Thorsten Litzki, [Litzki Systems](https://litzki-systems.com)
