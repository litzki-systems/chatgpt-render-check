import assert from 'node:assert/strict';
import { checkNormalization, normalizeChunkScores, NORMALIZATION_TARGETS } from '../lib/normalize-scores.mjs';

// Worked example quoted by the secondary source (SoundGuys article, Sony
// WH-1000XM5 vs Bose). The source quotes this page's scaled values twice,
// with slightly different figures; both readings are kept here because the
// difference between them is the finding, not noise to be tidied away.
const WEB_RAW = [0.9816903471946716, 0.9936593174934387, 0.9983865022659302];
const WEB_OBSERVED_READING_A = [0.983294, 0.995270, 1.000000];
const WEB_OBSERVED_READING_B = [0.983277, 0.995265, 1.000000];

// News example (tomsguide.com, system2-news-all engine). Raw values are
// themselves quoted to only 6 decimal places.
const NEWS_RAW = [0.949978, 0.940083, 0.855529];
const NEWS_OBSERVED = [0.500000, 0.494797, 0.450341];

// --- basic mechanics -------------------------------------------------------

const web = normalizeChunkScores(WEB_RAW);
assert.equal(web.target, 1.0);
assert.equal(web.resultType, 'web');
assert.equal(web.targetConfirmed, true);
assert.equal(web.scores.length, 3);
assert.ok(Math.abs(Math.max(...web.scores) - 1.0) < 1e-12, 'highest chunk must land on the target');
assert.ok(web.scores[0] < web.scores[1] && web.scores[1] < web.scores[2], 'rescaling must preserve order');

const news = normalizeChunkScores(NEWS_RAW, { resultType: 'news' });
assert.equal(news.target, 0.5);
assert.ok(Math.abs(Math.max(...news.scores) - 0.5) < 1e-12, 'news results scale to 0.5, not 1.0');
assert.equal(news.targetConfirmed, false, 'the news target is not reproduced by the quoted example');

assert.equal(NORMALIZATION_TARGETS.web, 1.0);
assert.equal(NORMALIZATION_TARGETS.news, 0.5);

// An explicit target override is never reported as a confirmed target.
assert.equal(normalizeChunkScores(WEB_RAW, { target: 1.0 }).targetConfirmed, false);

// --- input validation ------------------------------------------------------

assert.throws(() => normalizeChunkScores([]), TypeError);
assert.throws(() => normalizeChunkScores([0.5, NaN]), TypeError);
assert.throws(() => normalizeChunkScores([0, 0]), RangeError);
assert.throws(() => normalizeChunkScores(WEB_RAW, { resultType: 'video' }), TypeError);

// --- what the quoted examples actually support -----------------------------

// Reading B is reproduced by a single constant multiplier, within the
// rounding implied by 6 decimal places.
const checkB = checkNormalization(WEB_RAW, WEB_OBSERVED_READING_B);
assert.equal(checkB.withinRounding, true, 'reading B must be reproduced within its own quoted precision');
assert.ok(checkB.worstDeviation < 5e-7, `reading B worst deviation ${checkB.worstDeviation}`);

// Reading A is not, and no single multiplier produces it — the per-element
// implied multipliers are the "drift" the source reports as unresolved.
const checkA = checkNormalization(WEB_RAW, WEB_OBSERVED_READING_A);
assert.equal(checkA.withinRounding, false, 'reading A must NOT be silently reported as reproduced');
assert.ok(checkA.worstDeviation > 1e-5, `reading A worst deviation ${checkA.worstDeviation}`);
const impliedA = WEB_RAW.map((raw, i) => WEB_OBSERVED_READING_A[i] / raw);
assert.ok(
  Math.max(...impliedA) - Math.min(...impliedA) > 1e-5,
  'reading A must require a per-element multiplier, i.e. it is not one rescaling'
);

// The news example deviates far beyond what its quoted precision allows,
// so `0.5 / max` alone does not describe it. This assertion is the guard
// against quietly upgrading the news path to "confirmed" later on.
const checkNews = checkNormalization(NEWS_RAW, NEWS_OBSERVED, { resultType: 'news' });
assert.equal(checkNews.withinRounding, false, 'the news example must not be reported as reproduced');
assert.ok(
  checkNews.worstDeviation > 10 * checkNews.roundingBudget,
  `news deviation ${checkNews.worstDeviation} must exceed the rounding budget ${checkNews.roundingBudget} by a wide margin`
);
assert.equal(checkNews.targetConfirmed, false);

// --- checkNormalization contract -------------------------------------------

assert.throws(() => checkNormalization(WEB_RAW, [1.0]), TypeError);
assert.equal(checkB.perChunk.length, 3);
assert.ok(checkB.perChunk.every(c => typeof c.deviation === 'number'));
assert.ok(checkB.roundingBudget > 0);

console.log('normalize-scores tests passed');
