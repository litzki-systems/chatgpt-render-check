# Findings

This document collects every result of the project in one place. Each
finding names the script, test or data file that produces it, so every
number can be recomputed from this repository.

Everything here measures a **simulation**: a reconstruction of how ChatGPT
is reported to render a fetched web page, built from two public LinkedIn
posts by Metehan Yeşilyurt (Peec AI). The project uses no data from the
leak itself. Whether the reconstruction matches real ChatGPT output is
untested, and none of the findings says anything about which pages ChatGPT
cites.

Source posts:
[part 1](https://www.linkedin.com/posts/metehanyesilyurt_chatgpt-retrieval-system-leak-alert-ugcPost-7502755977935478784-xcpd/)
(chunking and html2text observation, used in findings 3, 4 and 6) and
[part 2](https://www.linkedin.com/posts/metehanyesilyurt_chatgpt-retrieval-system-leak-alert-part-ugcPost-7503484262952693760-SvQf/)
(chunk scoring and normalization observation, used in findings 1, 2 and 5).

Overview:

1. The web example's multiplier "drift" resolves to one of two quoted readings.
2. The news example's 0.5 scaling target does not reproduce.
3. Stripping citation anchors leaves chunk boundaries untouched.
4. **Main result:** approximating the reported `page_contents` text with plain html2text (`stock`) misplaces the chunk boundaries on almost every multi-chunk page.
5. Pre-indexed versus fresh retrieval is out of reach for this method.
6. Form placeholders change word counts on link-free pages but move no boundary.

Finding 4 also carries a dated correction log. The corrections stay
visible on purpose, so earlier published figures remain traceable.

## 1. The web example's multiplier "drift" resolves to one reading of the source

Reproduce with: `npm test` (see `tests/normalize-scores.test.mjs`).
Code: `lib/normalize-scores.mjs`. Background: `docs/score-normalization.md`.

The secondary source quotes its own worked web example (SoundGuys article,
raw scores `0.9816903471946716, 0.9936593174934387, 0.9983865022659302`)
twice, with two different sets of scaled values:

| Reading | Scaled values quoted | Worst deviation from `raw_i / max(raw) * 1.0` | Within 6-decimal rounding |
|---|---|---:|---|
| A | 0.983294, 0.995270, 1.000000 | 1.7e-5 | no |
| B | 0.983277, 0.995265, 1.000000 | 1.8e-7 | yes |

A single constant multiplier (`1.001616105316` = `1.0 / 0.9983865022659302`)
reproduces reading B within the rounding implied by its six quoted decimal
places.

Reading A needs a different multiplier per element: `1.001633563`,
`1.001620961`, `1.001616105`. These are exactly the three values the source
describes as unresolved "drift". The drift therefore belongs to one of the
two quoted number series, and the formula itself holds.

## 2. The news example's 0.5 scaling target does not reproduce

Reproduce with: `npm test`. Same files as finding 1.

| Chunk | Raw | Predicted (`raw / max(raw) * 0.5`) | Observed | Deviation |
|---|---|---|---|---:|
| 0 | 0.949978 | 0.500000 | 0.500000 | 0 |
| 1 | 0.940083 | 0.494792 | 0.494797 | 5.0e-6 |
| 2 | 0.855529 | 0.450289 | 0.450341 | 5.2e-5 |

With raw values quoted to six decimal places, input rounding explains
deviations up to about 1.0e-6. The observed deviations are about 5 and 52
times that bound, so `raw / max(raw) * 0.5` on its own does not describe
this example. The test suite asserts this non-reproduction explicitly.

A two-parameter affine fit (`observed ≈ 0.525774 · raw + 5.263e-4`) matches
all three points to within 2.5e-7. Three points against two free parameters
confirm nothing, so this stays an open lead.

## 3. Two text representations of one passage, both reconstructed

Reproduce with: `npm test` (see `tests/render.test.mjs`).
Code: `scripts/html2text_render.py`, `lib/render.mjs`.

The renderer produces three modes:

* `stock`: unmodified html2text, links as `[text](url)`.
* `snippet`: the reported search-result representation, links as `【n†text】` citation anchors.
* `page_contents`: the reported fetched-page representation, identical to `snippet` with the anchor wrapper removed and the anchor text kept as plain text.

The anchor wrapper carries no surrounding whitespace. Removing it changes
the character count and keeps the word count, so chunk boundaries stay in
place. The test suite verifies this on a 40-link synthetic fixture under
both word-counting modes (`markdown` and `plain`).

## 4. Main result: how far plain html2text is from the reported `page_contents`

Reproduce with: `npm run reproduce` (runs `benchmark/03-full-width-diff.mjs`
on the committed scan data and rewrites `benchmark/full-comparison.jsonl`
byte for byte).
Full write-up: `benchmark/page-contents-vs-stock-full.md`.
Earlier 40-domain pilot: `dry-run/findings.md`.

### What is measured, and what is expected by construction

`stock` and `page_contents` differ on purpose. `stock` writes links as
`[text](url)` and keeps image URLs, underscore emphasis and form controls
as html2text renders them; `page_contents` keeps link text only,
collapses images to `Image: <alt>`, uses asterisk emphasis and adds
`[Input: …]` and `[Button: …]` placeholders. The two texts therefore differ
in length, and splitting both into blocks of about 170 words almost always
puts the cuts in different places. A shift on a given page is the expected
outcome, not a discovery.

The benchmark measures the size of that difference on real pages. The
practical reading: a tool that approximates ChatGPT's reported chunks with
a plain html2text conversion places the cuts somewhere else on almost
every page long enough to be chunked.

### Population

The input is the first 1,000 domains of Tranco list 74V6X. 502 of them
rendered successfully: 486 reused from a same-day re-scan of the original
stock benchmark's 572 successful domains, plus 16 newly fetched. The other
498 failed both the original attempt and a retry (`dns` 219, `http_403` 99,
`timeout` 50, `robots_disallowed` 47, smaller categories for the rest).

27 of the 502 render to zero chunks in **both** modes (for example
`dzen.ru`, `tiktok.com`, `roblox.com`, `spotify.com`, `msn.com`,
`yandex.ru`). The **non-empty cohort** excludes them and has 475 domains.
Two domains render empty in exactly one mode and stay in the cohort,
because one mode producing text where the other produces none is itself a
result: `agoda.com` (stock empty, `page_contents` 249 characters in one
chunk, consisting of its `[Input: …]` placeholders, see finding 6) and
`youku.com` (the reverse).

Chunking uses `targetWords: 170` with paragraph-preferring splits, matching
the original benchmark's `chunk_words: 170`.

### What counts as a boundary shift

The renderer records chunk boundaries as cumulative word offsets, one entry
per chunk. The final entry equals the page's total word count and marks the
end of the page, not a cut between two chunks. A **boundary shift** means
at least one *inner* offset (every entry except the last) differs between
`stock` and `page_contents`. A change in total word count alone is reported
separately as `total_words_shift_only`.

### Result

| Population | n | Inner boundary shift | Share |
|---|---:|---:|---:|
| All successfully rendered domains | 502 | 365 | 72.7% |
| Non-empty cohort | 475 | 365 | **76.8%** |

In the non-empty cohort, 98 domains differ only in character count or total
word count (73 of them in total word count) and 12 are identical.

A page that fits into one chunk has no inner boundary to move. Restricted to
domains with more than one chunk in at least one representation:

| Word-counting mode | n | Inner boundary shift | Share |
|---|---:|---:|---:|
| `markdown` | 376 | 363 | **96.5%** |
| `plain` | 373 | 362 | **97.1%** |

The denominators are the same for the full population and the non-empty
cohort, since a zero-chunk rendering is never multi-chunk. For context,
121 of 539 non-empty stock renderings (22.4%) stay below 170 words and
therefore form a single chunk (`docs/renderer-baseline-analysis.md`).

In short: **once a page is long enough to be chunked, a plain html2text
approximation almost never places the cuts where the reported
`page_contents` rendering does.**

### Link presence predicts the shift

Within the lowest link-density quartile (125 domains; density is the
`<a href>` count divided by the stock-rendered character length, at most
0.00516), splitting at exactly zero links gives:

| | n | Inner boundary shift | Total words only |
|---|---:|---:|---:|
| Exactly 0 links | 50 | **0 (0%)** | 7 |
| More than 0 links, density ≤ 0.00516 | 75 | 60 (80%) | 13 |

Pages without links never shift. A single link lifts the rate to 80%, even
at the very bottom of nonzero density. This is consistent with link
rendering being the main source of the difference: links are where
`[text](url)` and plain link text diverge most, and without links that
difference disappears. Link presence matters far more than link density. The split comes from `q1_zero_vs_nonzero_links` in the script
output. `adobe.io` (rank 175, density 0.005160684963640629, exactly the
quartile's upper bound) and `cloudflareinsights.com` are among the
nonzero-link domains without an inner shift.

### Correction log

The current figures above replace earlier ones. Both corrections are
reproducible: the script emits the old and the new reading side by side.

**2026-09-26: cohort.** The first full analysis used every domain with
`status === 'ok'` and a non-zero stock character length as its denominator.
That kept the 27 empty renderings in, all of them counted as identical.
`docs/data-quality-audit.md` already excludes renderings of zero words, so
the analysis now reports the non-empty cohort as well (`non_empty_cohort`
in the script output). The 27 rows stay in `full-comparison.jsonl`, because
they are real measurements of real fetches.

**2026-09-27: boundary definition.** The first analysis compared the offset
arrays in full, including the final entry. A page whose total word count
changed by one word therefore counted as a boundary shift, including
single-chunk pages, which have no inner boundary at all (65 of the
affected pages were single-chunk in both modes). Comparing only inner
offsets (`boundaries_*.slice(0, -1)`) moves 73 domains from
`boundary_shift` to `cosmetic`. The headline figures changed as follows:

| Population | Before correction | After correction |
|---|---:|---:|
| All successfully rendered domains | 438 / 502 (87%) | 365 / 502 (72.7%) |
| Non-empty cohort | 438 / 475 (92%) | 365 / 475 (76.8%) |
| Zero-link domains with a shift | 7 / 50 (14%) | 0 / 50 (0%) |
| Low-density domains with links | 73 / 75 (97%) | 60 / 75 (80%) |

An earlier version of the link table also read `74 | 73 (99%)` and dropped
`adobe.io`, leaving the two halves at 124 against a quartile of 125; that is
fixed as well.

The figure restricted to multi-chunk pages (96.5% and 97.1%) was added with
this correction. `multi_chunk_reassignment` now coincides with
`boundary_shift` by construction, and the script asserts that identity.

## 5. Pre-indexed versus fresh retrieval is out of reach for this method

The secondary source distinguishes two retrieval paths: a pre-indexed one,
where raw chunk scores from the search-result record carry over into the
fetched-page record and get rescaled, and a fresh fetch, where they do not.
Telling the two apart needs those scores. They appear only in ChatGPT's
internal response stream, which this repository does not access, and the
public ChatGPT interface shows which sources an answer used, not how they
were scored.

This is a limit of the available evidence. The same limit applies to the
news scaling target in finding 2: confirming or refuting the 0.5 value
needs the same scores.

## 6. Form placeholders change word counts on link-free pages but move no boundary

Reproduce with: `npm run reproduce` (field `zero_link_boundary_shifts`).

7 of the 50 zero-link domains differ in total rendered word count:
`live.com`, `outlook.com`, `paypal.com`, `ack.de`, `tinyurl.com`,
`agoda.com`, `starlink.com`. None of them is a boundary shift. Their
offset arrays show why:

```
live.com      [1]   → [2]        outlook.com  [1]   → [2]
paypal.com    [24]  → [37]       ack.de       [160] → [161]
tinyurl.com   [2]   → [3]        starlink.com [18]  → [19]
agoda.com     []    → [4]
```

Six are single-chunk on both sides in both counting modes, so each array
holds only the total word count. `agoda.com` gains a rendering where the
other mode produced none (0 chunks to 1). None of the seven is multi-chunk
in either representation.

Character counts move in both directions (`paypal.com` +431 characters
under `page_contents`, `live.com` −65). This fits `page_contents` writing
`[Input: …]` and `[Button: …]` placeholders that sometimes exceed and
sometimes fall short of what `stock` renders for the same, often empty or
script-driven, form controls. All seven pages stay below the 170-word
threshold (`ack.de` comes closest at 160 to 161), so the placeholders
change the *text* inside a chunk and leave the cuts alone.

## Open question: does the reconstruction match real ChatGPT records?

Real ChatGPT records contain no `stock` version, so finding 4 cannot be
checked against them directly: `stock` exists only in this simulation, as
the stand-in a tool builder might use. What real records can test is the
reconstruction itself:

1. **`page_contents` fidelity.** For a page with a real fetched-page record,
   does this repository's `page_contents` rendering produce the same text
   and the same chunk boundaries? `bin/chatgpt-render-fidelity.mjs` and
   `docs/fidelity-protocol.md` describe the comparison.
2. **Finding 3.** Do real search-result records (`snippet::parts`) and real
   fetched-page records (`page_contents`) of the same page share their
   chunk boundaries, as the reconstruction predicts?

If the reconstruction matches, finding 4 carries over: plain html2text then
misplaces the real cuts as often as it misplaces the reconstructed ones.

OpenAI patched the leak in October 2026 (Malte Landwehr, Peec AI,
[LinkedIn, 19 October 2026](https://www.linkedin.com/posts/landwehr_on-october-20-i-will-have-a-live-chat-with-share-7517999964430442496-4twc/)), so new records of
this kind are no longer available. Anyone who already holds such records
can run both checks with the code in this repository.
