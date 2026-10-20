# Data Quality Audit

## Benchmark

This audit covers the first Tranco 1,000 domains from snapshot `74V6X`, generated 06 September 2026. The benchmark run was executed through GitHub Actions on 07 September 2026.

Run: `34161247425`

Artifact: `tranco-74V6X-render-results`

## Cohort definition

The benchmark separates three primary data states:

| Cohort | Count | Share | Statistical renderer analysis |
| --- | ---: | ---: | --- |
| Rendered | 539 | 53.9% | Included |
| Empty render | 33 | 3.3% | Excluded pending audit |
| Retrieval or HTTP error | 428 | 42.8% | Excluded |

The earlier 572 HTTP-successful rows contain 33 empty renders. Therefore the usable renderer population for the current statistical baseline is **539 domains**, not 572.

### Rendered

The URL returned successfully and the reconstructed renderer produced at least one word.

### Empty render

The URL returned successfully, but the reconstructed renderer produced zero words. The benchmark does not infer why this happened. Possible causes include application shells, JavaScript-dependent content, aggressive structural cleanup, parser incompatibility, consent or interstitial pages, or genuinely empty responses. Each case requires page-level inspection.

### Retrieval or HTTP error

The renderer did not receive a usable page representation. These rows remain part of the benchmark quality record but are excluded from renderer measurements.

## Error taxonomy

The 428 failed rows break down as follows:

| Error class | Count |
| --- | ---: |
| Fetch failed | 263 |
| HTTP 403 | 83 |
| Timeout or abort | 40 |
| HTTP 404 | 23 |
| HTTP 400 | 3 |
| HTTP 401 | 3 |
| HTTP 503 | 3 |
| HTTP 498 | 2 |
| HTTP 406 | 2 |
| HTTP 429 | 2 |
| HTTP 418 | 1 |
| HTTP 520 | 1 |
| HTTP 402 | 1 |
| HTTP 449 | 1 |

The dominant limitation is therefore external retrieval, with `fetch failed` and HTTP 403 accounting for most failed rows. These failures must not be interpreted as properties of the page's information architecture.

## Empty render cohort

The 33 empty renders are:

| Rank | Domain |
| ---: | --- |
| 12 | mail.ru |
| 54 | tiktok.com |
| 58 | roblox.com |
| 68 | msn.com |
| 219 | twitch.tv |
| 291 | weibo.com |
| 418 | espn.com |
| 420 | dailymotion.com |
| 440 | dropcatch.com |
| 471 | amazon.co.za |
| 481 | duolingo.com |
| 498 | amazon.co.jp |
| 562 | 360yield.com |
| 578 | aboutads.info |
| 590 | 3lift.com |
| 594 | ieee.org |
| 598 | imgsmail.ru |
| 613 | threads.com |
| 650 | mega.co.nz |
| 680 | fontawesome.com |
| 683 | hihonorcloud.com |
| 707 | amazon.es |
| 713 | amazon.it |
| 725 | fifa.com |
| 734 | creativecdn.com |
| 787 | meta.com |
| 855 | agoda.com |
| 864 | jetbrains.com |
| 886 | arcgis.com |
| 913 | ryanair.com |
| 926 | playrix.com |
| 965 | jd.com |
| 971 | tsyndicate.com |

This cohort contains several large application-heavy sites and infrastructure or advertising domains. That pattern is suggestive, but the current benchmark output alone does not establish the technical cause. No causal classification is assigned at this stage.

## Usable renderer baseline

After excluding empty renders and retrieval failures, 539 domains remain.

| Measurement | Median | P90 | Maximum |
| --- | ---: | ---: | ---: |
| Total rendered words | 707 | 2,587 | 21,682 |
| Visible coverage, first 3 chunks | 67.9% | 100.0% | 100.0% |
| First relevant chunk | 1 | 5 | 44 |
| Content displacement, words | 89.5 | 707.8 | 6,789 |
| Content displacement ratio | 9.3% | 76.3% | 100.0% |

For `first relevant chunk`, 448 of the 539 rendered domains contained at least one non-H1 semantic anchor. Of those, 280 placed the first relevant anchor in chunk 1, 72 in chunk 2, and 33 in chunk 3. The remaining cases occur later or have no detected relevant anchor.

These measurements show substantial variation in document position. They establish a useful renderer baseline for later comparative work. They do not establish AI retrieval or citation effects.

## Next audit step

The next technical task is to inspect the 33 empty renders with page-level diagnostics and determine whether the zero output comes from:

1. JavaScript application shells.
2. Structural cleanup removing the meaningful content.
3. Parser incompatibility.
4. Consent, interstitial, or bot-defense responses.
5. Other reproducible page characteristics.

Only after that classification should the benchmark define the final inclusion rule for comparative experiments.

## Reproducible audit

The repository includes `bin/chatgpt-render-audit.mjs` for generating this cohort report from a benchmark JSONL file:

```bash
node bin/chatgpt-render-audit.mjs \
  --file experiments/results/tranco-74V6X-render.jsonl \
  --out experiments/results/tranco-74V6X-audit.md
```

The audit intentionally keeps retrieval quality separate from renderer measurements.
