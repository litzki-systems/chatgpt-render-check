# Chunk-score normalization

Status: **reconstructed from a secondary source, partially reproduced.** The
web case checks out against one of the two readings the source quotes. The
news case does not. Neither is verified against a primary dump held in this
repository.

Implementation: `lib/normalize-scores.mjs`. Tests: `tests/normalize-scores.test.mjs`.

## The described transformation

A second-hand report of a leaked ChatGPT SSE stream (Metehan Yesilyurt,
part 2, posted 2026-09-09) describes raw per-chunk scores from the search
result record (`snippet::scores`) being rescaled when the same page is
carried into the fetched-page record (`page_contents`):

```
multiplier = target / max(rawScores)
scaled_i   = raw_i * multiplier
```

`target` is 1.0 for ordinary web results and 0.5 for news results, so the
highest-scoring chunk of a page lands exactly on the target. The report
states this held for 76 of 96 fetched pages in the examined turn; the
other 20 were fresh, non-indexed fetches with no carried-over raw scores.

The report also describes the multiplier as "drifting" in the sixth decimal
place — quoting 1.001633, 1.001621 and 1.001616 for one dataset — and says
this is unresolved.

## What the quoted figures actually support

### Web case: reproduced, and the drift is in the transcription

The source quotes the same worked example (a SoundGuys article) twice, with
slightly different scaled values. Checking each reading against the formula
separates them:

| Reading | Quoted scaled values | Worst deviation | Within 6-dp rounding |
|---|---|---:|---|
| A | 0.983294, 0.995270, 1.000000 | 1.7e-5 | no |
| B | 0.983277, 0.995265, 1.000000 | 1.8e-7 | yes |

Reading B is reproduced by a single constant multiplier
(1.001616105316 = 1.0 / 0.9983865022659302) to within the rounding implied
by its own six quoted decimal places.

Reading A is not, and no single multiplier produces it. Its per-element
implied multipliers are 1.001633563, 1.001620961 and 1.001616105 — which
are precisely the three "drifting" values the report quotes. **The drift is
a property of reading A, not of the transformation.**

This is a statement about the two sets of figures as quoted. It does not
establish that reading B is the correct transcription of the underlying
dump, only that reading B is internally consistent with the described
formula and reading A is not. Resolving which reading is right requires the
primary data.

### News case: not reproduced

| Chunk | Raw | Predicted (`0.5 / max`) | Observed | Deviation | Explainable by input precision |
|---|---|---|---|---:|---|
| 0 | 0.949978 | 0.500000 | 0.500000 | 0 | yes |
| 1 | 0.940083 | 0.494792 | 0.494797 | 5.0e-6 | no (~5x budget) |
| 2 | 0.855529 | 0.450289 | 0.450341 | 5.2e-5 | no (~52x budget) |

The news raw values are themselves quoted to only six decimal places. Even
allowing for that — perturbing numerator and denominator by ±5e-7 and
allowing another ±5e-7 for rounding of the output — the worst deviation
the quoted precision can account for is about 1.0e-6. The observed
deviations exceed that by a factor of roughly 5 and 52.

So `0.5 / max` alone does not describe the news path. Either a further step
is involved, the target is not exactly 0.5, or the figures are imprecisely
reported. `normalizeChunkScores()` returns `targetConfirmed: false` for
`resultType: 'news'` so this stays visible at the call site, and the test
suite asserts the non-reproduction rather than tolerating it.

**Open lead, not adopted:** a two-parameter affine fit
(`observed ≈ 0.525774 · raw + 5.263e-4`) matches all three news points to
within 2.5e-7. With three points and two free parameters, a good fit is
close to guaranteed and carries almost no evidential weight. It is recorded
here so a future check with more news data knows what to test, not because
it is believed.

## How to state a result from this

Report the deviation with the number. `checkNormalization()` returns
`worstDeviation` alongside `roundingBudget` and a boolean
`withinRounding` for exactly this reason: the honest form is "reproduced to
within 1.8e-7 on one quoted example", never "reproduces ChatGPT's scoring".
One worked example is one data point, from a second-hand transcription of a
UI capture.

## Scope limits carried over from the source

The report is explicit that all of it comes from the ChatGPT **UI**, not the
API, and that A/B test assignment (Statsig), model selection and the
Instant/Medium/High setting change the retrieval configuration. The values
are a snapshot of a dynamic system. Nothing here should be treated as a
stable specification, and a future capture disagreeing with these figures is
an expected outcome, not necessarily a contradiction.
