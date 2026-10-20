# stock vs. page_contents: full Tranco-74V6X-top1000 comparison

Status: full-width analysis of the dry run's question
(`dry-run/findings.md`).

## Coverage

| | Domains |
|---|---:|
| Full Tranco-74V6X-top1000 list | 1,000 |
| ok in the original stock-mode benchmark (34161247425, 2026-09-07) | 572 |
| still ok when re-scanned for the dry run (two days later) | 486 |
| re-fetched for this run (never-ok originally + dry-run's 86 failures) | 514 |
| newly ok out of those 514 | 16 |
| **total ok, this dataset** | **502** |
| **total permanent failure, this dataset** | **498** |

486 of the 502 ok domains were reused directly from the dry-run cache — not
re-fetched. Only the 514-domain gap was fetched, once each, in this run.

### Permanent failures (both original attempt and this run's retry failed)

498 domains, by error category:

| Category | Count |
|---|---:|
| `dns` | 219 |
| `http_403` | 99 |
| `timeout` | 50 |
| `robots_disallowed` | 47 |
| `other` | 23 |
| `tls` | 23 |
| `http_404` | 21 |
| `empty_body` | 3 |
| `http_429` | 3 |
| `http_400` | 2 |
| `http_498` | 2 |
| `http_5xx` | 2 |
| `http_402` | 2 |
| `http_418` | 1 |
| `http_401` | 1 |

`dns` (219) dominates — most of the original 428 stock-benchmark failures
were domains that do not resolve as bare `https://domain/`, not sites that
reject this fetcher specifically. Full per-domain list with error category
and timestamp: `benchmark/full-scan-cache.jsonl`, rows with
`status: 'error'`.

## Error-category analysis: not evenly distributed, but not a limitation on the boundary-shift result

The category counts above are far from even (`dns` alone is 44% of all
failures), so the question is whether that imbalance reflects something
that should qualify the boundary-shift result. It does not: the
boundary-shift analysis runs only over the 502 domains that rendered
successfully, and nothing below changes which domains that is. This
section documents why the failures skew the way they do, for anyone
auditing the coverage gap.

### `dns` (219, 44% of failures): overwhelmingly zone-apex infrastructure domains, not broken websites

Spot-checked via `getent hosts` (DNS lookup only, no HTTP fetch, no data
written to any tracked file) on 7 domains from this category:
`akamai.net`, `akamaiedge.net`, `cloudfront.net`, `gvt1.com`, `ytimg.com`,
`root-servers.net` — none resolve at the bare apex; `facebook.com`
(control) does. That is the general pattern across the category: reading
down the full list of 219 `dns`-failed domains by name, the overwhelming
majority are CDN edge nodes (`akamaiedge.net`, `edgekey.net`,
`edgesuite.net`, `cloudfront.net`, `azurefd.net`, `msedge.net`,
`bunnyinfra.net`), cloud/DNS-provider infrastructure
(`trafficmanager.net`, `azure-dns.com`, `herokudns.com`, `nstld.com`,
`impervadns.net` — a bot-protection *vendor's* own DNS infrastructure),
ad-tech/analytics pixel domains (`demdex.net`, `omtrdc.net`, `2mdn.net`,
`criteo.net`, `bidswitch.net`, `imrworldwide.com`, `go-mpulse.net`), and
platform-internal asset/backend domains (`ytimg.com`, `twimg.com`,
`ggpht.com`, `fbcdn.net`-adjacent, `steamstatic.com`,
`ssl-images-amazon.com`, `nintendo.net`, `pvp.net`). A pattern match against
~90 recognized infrastructure-name fragments (`akamai`, `cdn`, `msedge`,
`azure`, `aws`, `dns`, known ad-tech/cloud vendor names, etc.) accounts for
126/219 (58%) directly; manual review of the remaining 93 found the same
pattern in effectively all of them — none identified as a genuinely broken
consumer-facing website.

This is expected for a Tranco-derived list: Tranco ranks by passive-DNS
query volume, which counts every lookup for a CDN edge host or tracking
pixel referenced across millions of pages, not just lookups for sites
people navigate to directly. Most `dns` failures are therefore an artifact
of the domain list's source, not of this project's fetch layer or of
sites blocking it.

**TLD is consistent with this**: `.net` is 12.9% of the full 1000-domain
list but 32.9% of `dns` failures — a 2.55x relative risk, and `.net` is
also overrepresented in `timeout` (1.86x) and `tls` (1.69x) failures. This
matches: `.net` is the conventional TLD for exactly this kind of backend
infrastructure (`akamai.net`, `cloudfront.net`, `trafficmanager.net`,
`msedge.net`).

### `http_403` (99, 20% of failures): not concentrated among the most prominent domains

The natural hypothesis — that higher-traffic, more prominent sites run
stronger bot mitigation — does not hold on this data. `http_403` domains
skew toward *lower*-ranked domains, not higher:

| | in category | baseline share |
|---|---:|---:|
| rank ≤ 100 | 3/99 (3%) | 10% |
| rank ≤ 250 | 17/99 (17%) | 25% |
| rank ≤ 500 | 33/99 (33%) | 50% |

Median rank of an `http_403` domain is 651, not near the top. `.gov`
(4.59x relative risk, n=5) and `.ai` (10.1x, n=3) are the only TLDs
noticeably overrepresented, both on sample sizes too small to treat as
more than a lead. No bot-protection vendor is identifiable from the data
this project stores (domain, URL, HTTP status, error category, timestamp —
no response headers), so any specific-vendor attribution here would be
speculation, not a finding.

### `robots_disallowed` (47, 9% of failures): concentrated at the top, and exactly where expected

Unlike `http_403`, this category *is* concentrated among high-rank
domains: 12/47 (26%) are rank ≤100, vs. a 10% baseline (2.55x). The
domains are recognizable major platforms with well-known bot-facing
robots.txt policies: `facebook.com` (rank 3), `instagram.com` (11),
`twitter.com`/`x.com` (15, 50), `netflix.com` (41), `pinterest.com` (57),
`chatgpt.com` (77), `baidu.com` (85), `reddit.com` (105), `imdb.com`
(258), `reuters.com` (275). This is a declared, non-adversarial signal —
this project's fetcher respects robots.txt (`lib/render.mjs
isDisallowedByRobots`) — not a blocking mechanism, and its concentration
among major social/media platforms is exactly what a robots.txt-respecting
fetcher run against a global top-domains list should show.

### `tls` (23, 5% of failures): `.ru` overrepresented, small sample

`.ru` is 4.5% of the full list but 17.4% of `tls` failures (3.86x relative
risk, n=4 — too small to generalize beyond noting it as a candidate
pattern, not a conclusion).

## Boundary-shift result, full 502-domain population

| | n | boundary_shift | cosmetic | identical | multi-chunk reassignment | total-words-only |
|---|---:|---:|---:|---:|---:|---:|
| **Overall** | 502 | 365 (73%) | 98 (20%) | 39 (8%) | 365 (73%) | 73 (15%) |
| **Non-empty cohort** | 475 | 365 (77%) | 98 (21%) | 12 (3%) | 365 (77%) | 73 (15%) |

**What counts as a boundary shift (correction, 2026-09-27).** These figures
replace the 438 (87%) / 438 (92%) previously published here. `boundaries_*` is
an array of *cumulative* word offsets, one entry per chunk
(`cumulativeWordOffsets`, `01-fetch-remaining.mjs:51`), so its **last entry is
the page's total word count, not a boundary between two chunks** — as
`02-build-full-benchmark.mjs:89` itself relies on
(`total_words_markdown: boundaries_markdown.at(-1)`). The old classification
compared the arrays in full, so a page whose total word count changed by a
single word was counted as a boundary shift even when every inner boundary
held, and even on pages rendered as one single chunk, where no inner boundary
exists at all. 65 of the 438 were single-chunk in both modes.

`03-full-width-diff.mjs` now compares `boundaries_*.slice(0, -1)`. The 73
rows whose *only* difference was the total word count moved from
`boundary_shift` to `cosmetic` and are counted separately as
`total_words_shift_only`, so the earlier reading stays reproducible rather
than disappearing. `multi_chunk_reassignment` is now *identical to*
`boundary_shift` by construction — an inner boundary presupposes more than one
chunk — and the script asserts that identity instead of leaving it implicit.

**The finding is weaker than published but not overturned:** a clear majority
of pages still have content genuinely reassigned between chunks. The sharper
statement is the conditional one, since a single-chunk page cannot exhibit the
effect at all:

| among domains with >1 chunk in at least one representation | n | inner shift | share |
|---|---:|---:|---:|
| `countMode: 'markdown'` | 376 | 363 | **96.5%** |
| `countMode: 'plain'` | 373 | 362 | **97.1%** |

Both denominators are the same for the full ok population and the non-empty
cohort: a zero-chunk rendering is never multi-chunk, so the empty-render
exclusion cannot touch these rows. Emitted as
`inner_shift_among_multi_chunk` and
`non_empty_cohort_inner_shift_among_multi_chunk`. Read together with the
22.4% of pages that render below 170 words (121 of 539 non-empty stock renderings, `dry-run/source-tranco-74V6X-render.jsonl`, see `docs/renderer-baseline-analysis.md`): once
a page is long enough to be chunked at all, the two representations almost
never agree on where the cuts fall.

**Which row to cite (correction, 2026-09-26).** The `Overall` row's population
is defined by `status === 'ok' && stock.char_length > 0`. That filter is weaker
than this project's own cohort definition in `docs/data-quality-audit.md`,
which excludes a rendering of zero *words* as an "empty render": 27 of the 502
rows produce zero chunks in **both** modes (`char_length === 1`,
`total_chunks === 0`) — `dzen.ru`, `tiktok.com`, `roblox.com`, `spotify.com`,
`msn.com`, `yandex.ru` and 21 others. Nothing can shift on a page with no
chunks, but those rows still occupy the denominator and all 27 land in
`identical`. The `Non-empty cohort` row removes exactly them. Both rows come
from `03-full-width-diff.mjs` (`overall` and `non_empty_cohort`); the 27 rows
stay in `full-comparison.jsonl`, since they are real measurements of real
fetches.

Two domains render empty in exactly one mode and are kept in both rows on
purpose — one mode yielding text where the other yields none is a result, not
a missing measurement: `agoda.com` (stock 1 char / 0 chunks, `page_contents`
249 chars / 1 chunk, driven entirely by `[Input: …]` placeholders) and
`youku.com` (stock 241 chars, `page_contents` empty).

By link-density quartile (each quartile = 25% of the 502 domains, ranked by
`<a href>` count / stock-rendered character length):

| Quartile | n | density range | boundary_shift | cosmetic | identical | total-words-only |
|---|---:|---|---:|---:|---:|---:|
| Q1 (lowest) | 125 | 0 – 0.00516 | 60 (48%) | 28 | 37 | 20 |
| Q2 | 125 | 0.00516 – 0.00913 | 108 (86%) | 17 | 0 | 13 |
| Q3 | 125 | 0.00915 – 0.01614 | 101 (81%) | 24 | 0 | 18 |
| Q4 (highest) | 127 | 0.01627 – 4.0 | 96 (76%) | 29 | 2 | 22 |

(Corrected 2026-09-27; the previous values 80/121/119/118 counted
total-word-count-only changes as shifts.)

## This refines, and partly overturns, the dry run's quartile-correlation framing

The 40-domain dry-run sample showed a clean gradient — 80% boundary-shift
in its top-density quartile, 10% in its bottom. At full width, quartiles
Q2–Q4 all sit at 76–86%, and even Q1 is at 48%, not 10%.

The reason is visible in Q1 itself. It is not uniformly zero-density: only
50 of its 125 domains have exactly zero links, the rest have some (up to
0.00516). Splitting Q1 on that line is decisive:

| | n | boundary_shift | cosmetic | identical | total-words-only |
|---|---:|---:|---:|---:|---:|
| Exactly zero `<a href>` count | 50 | **0 (0%)** | 13 (26%) | 37 (74%) | 7 |
| Nonzero but low density (rest of Q1) | 75 | 60 (80%) | 15 | 0 | 13 |

(Corrected 2026-09-27. The previous values were `50 | 7 (14%)` and
`75 | 73 (97%)`; all 7 zero-link cases were total-word-count-only — see the
form-placeholder section below — and 13 of the 73 nonzero-link cases were too.)

The nonzero-link `cosmetic` rows include `adobe.io` (rank 175, density
0.005160684963640629 — exactly the Q1 upper bound) and
`cloudflareinsights.com`. An earlier version of this table
read `74 | 73 (99%) | 1 | 0`, which dropped `adobe.io` and left the two halves
summing to 124 against a stated quartile size of 125. The split is now emitted
as `q1_zero_vs_nonzero_links` by `03-full-width-diff.mjs`.

**The predictor is not link density as a graded quantity — it is closer to
binary: whether the page has any links at all.** The corrected figures make
that split sharper, not weaker: zero links now means zero inner boundary
shifts (0/50), while a single link takes the rate to 80% (60/75) at the very
bottom of nonzero density. Form controls and images, named alongside links in
the earlier version of this sentence, drop out of it — the 7 zero-link cases
they accounted for move no inner boundary at all. The
dry run's bottom-quartile sample happened to be drawn almost entirely from
the exactly-zero group (18 of 20 domains had density 0.0 — see
`dry-run/sample.json`), which is why it looked like a smooth quartile
gradient rather than the sharp zero/nonzero split the full population
shows.

73% of the full ok population (365/502), and 77% of the non-empty cohort
(365/475), shows `multi_chunk_reassignment` — content genuinely reassigned
between chunks. Under the corrected definition this is the same set as
`boundary_shift`, because an inner boundary cannot exist unless one mode
produced more than one chunk; the field is retained for schema continuity and
the script asserts the identity. The previously published 74%/78% (371) rested
on the old full-array comparison.

## The form-placeholder effect (dry-run side finding), full width

**Reinterpreted, 2026-09-27: this effect changes the text, but it moves no
chunk boundary.** Among the 50 exactly-zero-link domains, 7 (14%) show a
difference in total rendered word count: `live.com`, `outlook.com`,
`paypal.com`, `ack.de`, `tinyurl.com`, `agoda.com`, `starlink.com`. Under the
corrected inner-boundary definition **none of them is a `boundary_shift`** —
`zero_link_boundary_shifts.count` is now 0, and all 7 appear under
`total_words_shift_only_domains`. The word-offset arrays make it plain:

```
live.com      [1]   → [2]
outlook.com   [1]   → [2]
paypal.com    [24]  → [37]
ack.de        [160] → [161]
tinyurl.com   [2]   → [3]
agoda.com     []    → [4]
starlink.com  [18]  → [19]
```

Six of the seven are single-chunk on both sides in both countModes, so the
array holds nothing but the total word count and there is no inner boundary to
move. The seventh, `agoda.com`, is not a shift either but a rendering appearing
where the other mode produced none (`stock` 0 chunks, `page_contents` 1); it
survives the empty-render filter only because that filter requires zero chunks
on *both* sides. Not one of the seven is multi-chunk in either
representation.

Character deltas still vary in both directions (`paypal.com`: +431 chars in
`page_contents`; `live.com`: −65), consistent with `page_contents`'s
`[Input: ...]`/`[Button: ...]` placeholders sometimes adding substantial text
where `stock` renders an empty or JS-driven form control as nothing at all.
That mechanism is real and reproducible. What cannot be claimed for it any
more is chunk-boundary impact: on a page short enough to fit one chunk — and
all seven of these are — added placeholder text has to cross the 170-word
threshold before any boundary exists to move, and on these pages it never
does. `ack.de` comes closest at 160 → 161 words, still ten short. The earlier statement that 7/50 zero-link pages "still show a boundary
shift" was an artifact of counting the total word count as a boundary.

## Files

* `01-fetch-remaining.mjs` — fetches the 514-domain gap, dual-renders each.
* `remaining-scan-cache.jsonl` — raw result for those 514 (16 ok, 498 error).
* `02-build-full-benchmark.mjs` — merges dry-run cache (486) + remaining (16)
  into the full dataset.
* `full-scan-cache.jsonl` — all 1000 domains, ok/error, both modes' metrics
  for the 502 ok rows.
* `page-contents-benchmark.jsonl` — page_contents-mode-only benchmark, same
  header+rows shape as the original stock artifact
  (`dry-run/source-tranco-74V6X-render.jsonl`). **Schema scope:** carries
  chunk count, chunk boundaries, word count (markdown/plain), and character
  count — the fields this task asked for — but not `anchorCoverage`,
  `meta_tags`, or `html_sha256`/`markdown_sha256`. Those come from
  `measureChunks()`/`extractMetaTags()` in the production pipeline
  (`bin/chatgpt-render-benchmark.mjs`), which this run did not re-invoke;
  doing so would have meant a third full fetch pass rather than reusing the
  dry-run cache as instructed. If a `measureChunks`-complete page_contents
  benchmark is wanted later, that is a `bin/chatgpt-render-benchmark.mjs
  --mode page_contents` run (the script does not currently take a `--mode`
  flag — out of scope here, not added).
* `03-full-width-diff.mjs` — computes the classification above. Compares
  **inner** chunk boundaries only (`boundaries_*.slice(0, -1)`) since
  2026-09-27; reports `total_words_shift_only` separately.
* `full-comparison.jsonl` — per-domain diff detail for all 502 ok domains.
