# Renderer Baseline Analysis

## Dataset

This analysis uses benchmark run `34161247425` against the first 1,000 domains of Tranco snapshot `74V6X`.

The benchmark produced 572 HTTP-successful rows. Thirty-three of those rows rendered to zero words. The usable renderer population is therefore 539 domains.

## Distribution

| Measurement | Median | P75 | P90 | P95 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Total rendered words | 707 | 1,355 | 2,587 | 3,776 | 21,682 |
| Visible coverage, first 3 chunks | 67.9% | 100.0% | 100.0% | 100.0% | 100.0% |
| First relevant chunk | 1 | 2 | 4 | 7 | 44 |
| Content displacement, words | 89.5 | 274 | 703 | 1,095 | 6,789 |
| Content displacement ratio | 9.3% | 37.9% | 76.2% | 85.5% | 100.0% |

`First relevant chunk` and `content displacement words` are defined only for rows where at least one non-H1 semantic anchor was detected. That was 448 of the 539 usable renderings.

## Position distribution

Among the 448 pages with a detected relevant anchor:

| First relevant chunk | Domains |
| ---: | ---: |
| 1 | 280 |
| 2 | 72 |
| 3 | 33 |
| 4 | 18 |
| 5 | 9 |
| 6 | 11 |
| 7 | 4 |
| 8 | 2 |
| 9 | 5 |
| 10 | 2 |
| 11 | 3 |
| 12 | 2 |
| 13 | 2 |
| 15 | 1 |
| 21 | 1 |
| 29 | 1 |
| 42 | 1 |
| 44 | 1 |

The leading position dominates, but the tail is substantial. Sixty-eight pages place the first detected relevant anchor after chunk 3.

## Displacement distribution

| Displacement ratio | Domains |
| --- | ---: |
| 0% to 10% | 276 |
| 10% to 25% | 91 |
| 25% to 50% | 67 |
| 50% to 75% | 48 |
| 75% to 100% | 57 |

The renderer therefore produces a meaningful long tail of pages where detected substantive signals occur deep in the rendered document.

## Tranco rank

A preliminary correlation between log Tranco rank and content displacement words is approximately `r = 0.06` in this sample. This is weak and does not support using Tranco rank as a proxy for information architecture or renderer position.

This result reinforces the intended role of Tranco: it supplies an independent sampling frame. It does not explain renderer behavior.

## Interpretation

The baseline supports three observations.

1. Renderer position varies substantially across high-traffic domains.
2. A first-chunk-only analysis would collapse meaningful structural variation into a binary measure.
3. The displacement distribution is sufficiently wide to support matched comparative analysis later.

The baseline does not establish that deeper content receives less retrieval, citation, or model visibility. Those outcomes require independent observations.

## Measurement caveat

The semantic anchors remain heuristics. `first relevant chunk` describes the first detected anchor, not the first objectively meaningful content on a page. Future analysis should therefore retain the underlying anchor fields and avoid treating the aggregate displacement value as a universal semantic score.

## Open question

Whether any of these renderer measurements relate to real retrieval or citation outcomes is outside the scope of this repository. Any such study would need its own outcome data and should keep the renderer definition fixed rather than change it retrospectively.
