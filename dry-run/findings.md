# Dry run: stock vs. page_contents on the Tranco-1000 population

Status: dry run only. No full re-run was performed here; the full
population is analysed in `benchmark/page-contents-vs-stock-full.md`.

## Question

Does re-rendering the Tranco-1000 benchmark in `page_contents` mode
(instead of the `stock` mode the existing benchmark and fidelity rig use)
change results enough to justify the cost of a full re-run?

## Method, and one deviation from the task order worth flagging

The task specified: rank by link density from the existing stock output,
draw a sample, run both modes on the sample. In practice, the existing
stock-mode benchmark artifact (`dry-run/source-tranco-74V6X-render.jsonl`,
downloaded from GitHub Actions run `34161247425`, 2026-09-07) stores only
aggregate measurements, not the rendered markdown — so link density could
not be computed from it directly.

Instead, `dry-run/01-scan-and-sample.mjs` re-fetches each of the 572
domains that rendered successfully in that run **once**, and renders both
`stock` and `page_contents` from that single HTML snapshot. This still
satisfies the task's actual intent (rank by link density, sample by
quartile, compare modes) while avoiding two separate fetches per domain,
which would have confounded the mode comparison with any change to the
live page between requests. It also halves the network load of this dry
run. All three steps (density ranking, mode rendering, per-domain caching)
happen in one pass; `02-compare-and-diff.mjs` then only reads the cache —
no further fetching.

Of the 572 previously-ok domains, 486 rendered successfully again today;
86 failed this time (34 newly robots-disallowed, 31 HTTP 403, 8 timeout,
and smaller categories — see `full-scan-cache.jsonl` error counts). This
is expected churn for a live-web population re-checked two days later, not
a defect in this dry run.

Sample: 20 domains from the top link-density quartile, 20 from the bottom,
drawn from the 486. Link density = `<a href>` count in the raw HTML /
character length of the `stock`-mode rendered text. Full sample:
`dry-run/sample.json`. Full per-domain comparison: `dry-run/comparison.jsonl`.

Chunking used `targetWords: 170, countMode: 'markdown'` in both modes,
matching the original benchmark's `chunk_words: 170`. A domain is
**boundary-shift** if the word-offset any chunk ends at differs between
`stock` and `page_contents`; **cosmetic** if only the character count
differs; **identical** if neither differs.

## Result

| Group | n | boundary-shift | cosmetic | identical | link density range |
|---|---:|---:|---:|---:|---|
| Top quartile (link-dense) | 20 | 16 (80%) | 3 (15%) | 1 (5%) | 0.053 – 4.0 |
| Bottom quartile (link-sparse) | 20 | 2 (10%) | 0 | 18 (90%) | 0.0 (all) |

The effect correlates with link density, as expected: 80% boundary-shift
in the top quartile vs. 10% in the bottom.

**A finer cut matters here.** Of the 16 top-quartile boundary-shift
domains, 10 have more than one chunk in at least one mode — meaning a
piece of content is genuinely reassigned across a chunk boundary, not just
a change in the final word count of a single-chunk page. Examples
(word-offset boundaries, `stock` vs `page_contents`):

* `wikipedia.org`: 4 chunks → 3 chunks. Boundaries [132, 266, 408, 493] →
  [143, 279, 418]. A full chunk's worth of content moves.
* `otto.de`: 5 chunks both modes, every internal boundary shifts by
  4–13 words: [168, 331, 489, 636, 698] → [164, 324, 482, 629, 691].
* `ietf.org`: 2 chunks → 3 chunks.
* `icloud-content.com`: 3 chunks → 1 chunk (this page is link/asset-heavy
  enough that `page_contents` collapses it almost entirely).

The remaining 6 top-quartile shifts are single-chunk pages where only the
total word count differs — a real difference in what the model would see
as chunk 1, but not a boundary reassignment in the sense of content moving
between chunks.

**The 2 bottom-quartile shifts are not link-driven.** Both
(`agoda.com`, `starlink.com`) have zero links; the difference comes from
`page_contents`'s form-input/button placeholder replacement (also part of
the fingerprint, independent of the citation-anchor question this dry run
was framed around) adding a few words of text where `stock` renders
nothing for an empty form control. Worth knowing: link density alone does
not fully predict which pages will differ — form-heavy, link-sparse pages
can shift too, for a different reason.

## Recommendation

The effect is substantial and correlates with link density as predicted:
80% of link-dense pages show a boundary shift, a third of those with clear
multi-chunk reassignment (content moving to a different chunk, chunk count
itself changing on `wikipedia.org` and `ietf.org`). This is not the
"cosmetic-only, character-count-changes-but-chunking-stays-put" outcome
that would argue against a re-run — that was already established (and
still holds) for the narrower snippet-vs-page_contents anchor-stripping
comparison (`tests/render.test.mjs`), which is whitespace-neutral by construction.
`stock` vs. `page_contents` is a materially larger diff (full markdown
link syntax and raw image URLs replaced/collapsed, form controls added),
and this dry run shows that difference does move chunk boundaries on a
meaningful share of real pages.

**A full Tranco-1000 re-run under `page_contents` would likely change
reported chunk counts and boundary positions for a substantial share of
link-dense domains** — not a rounding effect. The cost of a full re-run (a few
hundred fetches, ~10 minutes at the concurrency used here) is modest
against the signal seen; it was carried out afterwards, see
`benchmark/page-contents-vs-stock-full.md`.

## Files

* `source-tranco-74V6X-render.jsonl` — the existing stock-mode benchmark
  artifact this dry run started from (unmodified, not a new domain list).
* `01-scan-and-sample.mjs` — fetch, dual-mode render, cache, sample.
* `full-scan-cache.jsonl` — per-domain raw results for all 486
  successfully-rescanned domains (not just the sample), for anyone who
  wants a different sample cut without re-fetching.
* `sample.json` — the drawn 20+20 sample.
* `02-compare-and-diff.mjs` — reads the cache, computes the diff.
* `comparison.jsonl` — per-domain diff detail for the sample.
