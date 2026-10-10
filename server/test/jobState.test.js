const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveJobState } = require('../routes/jobs');

// Events as recalculateJobStatus passes them: latest first
const ev = (status, date) => ({ status, created_at: new Date(date) });

test('status is the latest event, furthest is the highest pipeline stage', () => {
  const state = deriveJobState([
    ev('Rejected', '2026-03-20'),
    ev('Interview', '2026-03-10'),
    ev('OA', '2026-03-05'),
    ev('Applied', '2026-03-01'),
  ]);
  assert.equal(state.status, 'Rejected');
  assert.equal(state.furthestStatus, 'Interview');
  assert.deepEqual(state.appliedAt, new Date('2026-03-01'));
});

test('rejected straight from Applied keeps Applied as the furthest stage', () => {
  const state = deriveJobState([ev('Rejected', '2026-03-09'), ev('Applied', '2026-03-01')]);
  assert.equal(state.furthestStatus, 'Applied');
});

test('applied date uses the earliest Applied event when there are several', () => {
  const state = deriveJobState([ev('Applied', '2026-03-08'), ev('Applied', '2026-03-01')]);
  assert.deepEqual(state.appliedAt, new Date('2026-03-01'));
});

test('applied date falls back to the earliest event when none is Applied', () => {
  const state = deriveJobState([ev('Interview', '2026-03-09'), ev('OA', '2026-03-04')]);
  assert.equal(state.status, 'Interview');
  assert.deepEqual(state.appliedAt, new Date('2026-03-04'));
});

test('a job with only an ending has no furthest stage', () => {
  const state = deriveJobState([ev('Withdrawn', '2026-03-02')]);
  assert.equal(state.status, 'Withdrawn');
  assert.equal(state.furthestStatus, null);
});

test('no events defaults to Applied with no dates', () => {
  assert.deepEqual(deriveJobState([]), { status: 'Applied', furthestStatus: null, appliedAt: null });
});
