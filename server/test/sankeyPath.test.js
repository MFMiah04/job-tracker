const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPath } = require('../routes/stats');

test('a job still in progress ends at Active', () => {
  assert.deepEqual(buildPath(['Applied', 'OA']), ['Applied', 'OA', 'Active']);
});

test('each Interview event is its own round', () => {
  assert.deepEqual(
    buildPath(['Applied', 'Interview', 'Interview', 'Offer']),
    ['Applied', 'Interview 1', 'Interview 2', 'Offer', 'Active']
  );
});

test('an ending is labelled with the stage it happened at', () => {
  assert.deepEqual(buildPath(['Applied', 'Rejected']), ['Applied', 'Rejected (Applied)']);
  assert.deepEqual(buildPath(['Applied', 'OA', 'Withdrawn']), ['Applied', 'OA', 'Withdrawn (OA)']);
});

test('endings after any interview round share one node', () => {
  assert.deepEqual(
    buildPath(['Applied', 'Interview', 'Interview', 'Rejected']),
    ['Applied', 'Interview 1', 'Interview 2', 'Rejected (Interview)']
  );
});

test('repeated non-interview stages are counted once', () => {
  assert.deepEqual(buildPath(['Applied', 'Applied', 'OA', 'OA']), ['Applied', 'OA', 'Active']);
});

test('the first ending wins', () => {
  assert.deepEqual(buildPath(['Applied', 'Withdrawn', 'Rejected']), ['Applied', 'Withdrawn (Applied)']);
});

test('no pipeline stage means no path', () => {
  assert.deepEqual(buildPath([]), []);
  assert.deepEqual(buildPath(['Rejected']), []);
});
