// The one list of job statuses on the server: the pipeline in order, then the two endings
const PIPELINE = ['Applied', 'OA', 'Interview', 'Offer', 'Accepted'];
const TERMINAL = ['Rejected', 'Withdrawn'];
const VALID_STATUSES = [...PIPELINE, ...TERMINAL];

module.exports = { PIPELINE, TERMINAL, VALID_STATUSES };
