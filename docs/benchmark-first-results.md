# First Tranco benchmark results

## Run

The first full benchmark run used Tranco snapshot **74V6X** and its first 1,000 domains.

* GitHub Actions run: `34161247425`
* Run date: 07 September 2026
* Input: `experiments/tranco-74V6X-top1000.csv`
* Renderer: `chatgpt-render-check`
* Renderer status: simulation
* Regression tests: passed
* Artifact: `tranco-74V6X-render-results`
* Artifact SHA-256: `4851530440a88ae5073afe6fca2b5904f884a54d91097bba1cf8458efc494693`

## Coverage

| Result | Count | Share |
| --- | ---: | ---: |
| Successful HTTP fetch and render | 572 | 57.2% |
| Error | 428 | 42.8% |
| Total | 1,000 | 100% |

The error population is retained as benchmark information. It is not silently removed from the population.

### Error classes

| Error | Count |
| --- | ---: |
| `fetch failed` | 263 |
| HTTP 403 | 83 |
| Operation aborted | 40 |
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

These failures describe the benchmark runner's access conditions. They do not describe AI retrieval behavior.

## Successful renders

Among the 572 successful renders:

| Measurement | Median |
| --- | ---: |
| Total rendered words | 655 |
| Total chunks | 4 |
| Words in first three chunks | 438.5 |
| Coverage of first three chunks | 67.9% |
| Anchor coverage in first three chunks | 100% |
| First relevant chunk | 1 |
| Content displacement | 89.5 words |
| Content displacement ratio | 9.3% |

The chunk target remains approximately 170 words. The implementation respects paragraph boundaries, so 170 is a target rather than a hard cut-off.

## Empty renders

33 of the 572 successful HTTP fetches produced zero rendered words and zero chunks. Examples include:

`mail.ru`, `tiktok.com`, `roblox.com`, `msn.com`, `twitch.tv`, `weibo.com`, `espn.com`, `dailymotion.com`, `amazon.co.za`, `duolingo.com`, `amazon.co.jp`, `ieee.org`, `threads.com`, `mega.co.nz`, `meta.com`, `agoda.com`, `jetbrains.com`, `arcgis.com`, `ryanair.com`, `jd.com`.

These cases require separate diagnosis before they enter any structural comparison. A successful HTTP response with an empty reconstructed representation does not establish that the source page contains no usable content.

## Initial structural observation

The benchmark confirms substantial variation in where semantic anchors occur within the reconstructed representation. The median first relevant anchor occurs in chunk 1, while a smaller group of pages places relevant signals thousands of words into the representation.

This supports further testing of the hypothesis that **the position of a signal within the rendered document depends substantially on the page's information architecture**.

The benchmark alone does not establish that document position changes ChatGPT retrieval, ranking, or citation behavior.

## Interpretation boundary

This run measures the output of the current renderer reconstruction. It does not provide an internal view of ChatGPT Search.

The following conclusions remain out of scope for this dataset alone:

* AI visibility score
* retrieval probability
* citation probability
* ranking impact
* causal effect of document position
* proof that the first three chunks are the complete model input

The next analytical step is to separate three populations:

1. successful, non-empty renders
2. successful HTTP responses with empty reconstructed output
3. HTTP or network failures

Only the first population should enter the initial structural distribution analysis. The second population should be investigated as a renderer or page-delivery class. The third population should remain separately reported.

## Next experiment

Repeat the benchmark under a second run and compare:

* success rate
* empty-render rate
* chunk count
* rendered word count
* anchor positions
* displacement statistics

Stable measurements across repeated runs are the precondition for relating renderer output to anything else.
