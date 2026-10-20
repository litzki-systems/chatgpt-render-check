import assert from 'node:assert/strict';
import { measureChunks } from '../lib/measure.mjs';

const headerOnly = [
  '# Example Validator',
  'Version 1.2.0. Updated 2026. Read the documentation for installation details.',
];

const measuredEvidence = [
  '# Benchmark results',
  'Independent research measured 94% verification coverage across 1,000 tested pages.',
];

const falsePositive = measureChunks(headerOnly).anchors.find(anchor => anchor.key === 'evidence');
assert.equal(falsePositive?.found, false, 'years and version numbers must not count as evidence');

const truePositive = measureChunks(measuredEvidence).anchors.find(anchor => anchor.key === 'evidence');
assert.equal(truePositive?.found, true, 'explicit measurement language must count as evidence');
assert.equal(truePositive?.chunk, 1);

console.log('measure evidence anchor tests passed');
