// Chunk-score normalization, reconstructed from a secondary source.
//
// SOURCE AND STATUS
// -----------------
// A second-hand report of a leaked ChatGPT SSE stream (Metehan Yesilyurt,
// part 2, posted 2026-09-09) describes raw per-chunk scores from the search
// result record (`snippet::scores`) being rescaled when the same page is
// carried into the fetched-page record (`page_contents`):
//
//     multiplier = target / max(rawScores)
//     scaled_i   = raw_i * multiplier
//
// where `target` is 1.0 for ordinary web results and 0.5 for news results.
// No primary dump is held in this repository. This module reconstructs the
// described arithmetic so it can be checked against observed values; it does
// not verify that ChatGPT computes scores this way.
//
// WHAT THE QUOTED EXAMPLES ACTUALLY SUPPORT
// -----------------------------------------
// The source quotes the same web example twice with slightly different
// figures, and reports a multiplier that "drifts" in the 6th decimal place
// (1.001633 / 1.001621 / 1.001616) which it describes as unresolved. Checking
// both readings against the formula separates them cleanly:
//
//   reading B (0.983277, 0.995265, 1.000000): reproduced to <= 1.8e-7,
//     i.e. within rounding at 6 decimal places. One constant multiplier
//     explains all three chunks.
//   reading A (0.983294, 0.995270, 1.000000): deviates by up to 1.7e-5 and
//     cannot be produced by any single multiplier. The per-element implied
//     multipliers are exactly the three "drifting" values quoted.
//
// So for the web case the drift is a property of reading A, not of the
// formula. That is an observation about the quoted figures, not proof that
// reading B is the correct transcription of the dump.
//
// The news example does NOT reproduce. Deviations reach 5.2e-5, which is
// ~52x larger than the worst case permitted by its 6-decimal-place inputs
// (~1.0e-6). Something beyond `0.5 / max` is happening there, or the figures
// are imprecisely reported. This module therefore treats the news target as
// unconfirmed and says so at the call site. (A two-parameter affine fit
// matches all three news points to <= 2.5e-7, but three points and two free
// parameters make that unfalsifiable — it is recorded in
// docs/score-normalization.md as an open lead, not adopted here.)
//
// See docs/score-normalization.md and tests/normalize-scores.test.mjs.

/** Rescale targets by result type, per the secondary source. */
export const NORMALIZATION_TARGETS = {
  web: 1.0,
  news: 0.5,
};

/** Result types whose target value is reproduced by the quoted examples. */
const CONFIRMED_TARGETS = new Set(['web']);

/**
 * Rescale raw chunk scores so the highest one lands on the target value.
 *
 * @param {number[]} rawScores - raw per-chunk scores, in chunk order.
 * @param {object}   [options]
 * @param {'web'|'news'} [options.resultType='web'] - selects the target.
 * @param {number}  [options.target] - overrides the target directly.
 * @returns {{
 *   multiplier: number,
 *   scores: number[],
 *   target: number,
 *   resultType: string,
 *   targetConfirmed: boolean,
 * }}
 *   `targetConfirmed` is false when the target value is one the quoted
 *   examples do not reproduce (currently: news). Callers that report
 *   numbers to a reader must surface that rather than printing the scores
 *   as if they were established.
 */
export function normalizeChunkScores(rawScores, { resultType = 'web', target } = {}) {
  if (!Array.isArray(rawScores) || rawScores.length === 0) {
    throw new TypeError('rawScores must be a non-empty array');
  }
  if (rawScores.some(s => typeof s !== 'number' || !Number.isFinite(s))) {
    throw new TypeError('rawScores must contain only finite numbers');
  }

  const resolvedTarget = target ?? NORMALIZATION_TARGETS[resultType];
  if (resolvedTarget === undefined) {
    throw new TypeError(`unknown resultType '${resultType}'; pass an explicit target`);
  }

  const max = Math.max(...rawScores);
  if (max <= 0) {
    throw new RangeError('max(rawScores) must be > 0 to rescale');
  }

  const multiplier = resolvedTarget / max;
  return {
    multiplier,
    scores: rawScores.map(s => s * multiplier),
    target: resolvedTarget,
    resultType,
    targetConfirmed: target === undefined && CONFIRMED_TARGETS.has(resultType),
  };
}

/**
 * Compare reconstructed scores against observed ones and report the worst
 * absolute deviation, alongside how much deviation the observed values'
 * own decimal precision could account for on its own.
 *
 * This exists so a fidelity claim about the formula is always stated with
 * its error bar: "reproduced to within X" rather than "reproduces".
 *
 * @param {number[]} rawScores
 * @param {number[]} observedScores - the scaled values as observed.
 * @param {object}   [options]
 * @param {'web'|'news'} [options.resultType='web']
 * @param {number}  [options.decimals=6] - decimal places the observed
 *   (and raw) values are quoted to; sets the rounding budget.
 * @returns {{
 *   worstDeviation: number,
 *   roundingBudget: number,
 *   withinRounding: boolean,
 *   perChunk: Array<{ raw: number, predicted: number, observed: number, deviation: number }>,
 *   multiplier: number,
 *   targetConfirmed: boolean,
 * }}
 */
export function checkNormalization(rawScores, observedScores, { resultType = 'web', decimals = 6 } = {}) {
  if (rawScores.length !== observedScores.length) {
    throw new TypeError('rawScores and observedScores must have the same length');
  }

  const { multiplier, scores, target, targetConfirmed } = normalizeChunkScores(rawScores, { resultType });
  const eps = 0.5 * 10 ** -decimals;
  const max = Math.max(...rawScores);

  const perChunk = rawScores.map((raw, i) => ({
    raw,
    predicted: scores[i],
    observed: observedScores[i],
    deviation: Math.abs(scores[i] - observedScores[i]),
  }));

  // Worst deviation the quoted precision alone could produce: perturb both
  // the numerator and the denominator by +-eps, then allow eps for the
  // rounding of the observed value itself.
  const roundingBudget = rawScores.reduce((worst, raw) => {
    const center = (raw / max) * target;
    let span = 0;
    for (const dn of [-eps, eps]) {
      for (const dd of [-eps, eps]) {
        span = Math.max(span, Math.abs(((raw + dn) / (max + dd)) * target - center));
      }
    }
    return Math.max(worst, span + eps);
  }, 0);

  const worstDeviation = perChunk.reduce((w, c) => Math.max(w, c.deviation), 0);

  return {
    worstDeviation,
    roundingBudget,
    withinRounding: worstDeviation <= roundingBudget,
    perChunk,
    multiplier,
    targetConfirmed,
  };
}
