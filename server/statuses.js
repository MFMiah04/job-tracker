// The one list of job statuses on the server: the pipeline in order, then the two endings
const PIPELINE = ['Applied', 'OA', 'Interview', 'Offer', 'Accepted'];
const TERMINAL = ['Rejected', 'Withdrawn'];
const VALID_STATUSES = [...PIPELINE, ...TERMINAL];

// Stages that are something for the user to do until they mark them as waiting
const ACTIVE_STAGES = ['OA', 'Interview'];

module.exports = { PIPELINE, TERMINAL, VALID_STATUSES, ACTIVE_STAGES };
