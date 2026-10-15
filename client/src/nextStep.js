// Stages where something is on you (to do) until you mark it as waiting on them
export const ACTIVE_STAGES = ['OA', 'Interview']

// What a job needs next:
//   'todo'    — it has open tasks, or it's at OA/Interview and you haven't marked it as waiting
//   'waiting' — you've marked its current stage as done and are waiting to hear back
//   null      — neither (e.g. Applied, Offer, Rejected)
// Pass `openTasks` when you have a fresher count than the job's own open_tasks.
export function nextStep(job, openTasks = job.open_tasks) {
  if (openTasks > 0) return 'todo'
  if (!ACTIVE_STAGES.includes(job.status)) return null
  return job.waiting_status === job.status ? 'waiting' : 'todo'
}

// Can this job be marked as waiting right now? Only at OA/Interview, and only once its tasks are done.
export function canMarkWaiting(job, openTasks = job.open_tasks) {
  return ACTIVE_STAGES.includes(job.status) && !(openTasks > 0)
}
