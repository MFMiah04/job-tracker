// Stages that are something for you to do until you mark them as waiting on them
export const ACTIVE_STAGES = ['OA', 'Interview']

// What a job's dashboard tag says:
//   'todo'    — it has open tasks (added on the To do page or the job's page)
//   'waiting' — it's at OA/Interview, has no open tasks, and every round is marked as waiting on them
//   null      — nothing to show (e.g. an OA with no task yet, or Applied, Offer, Rejected)
export function nextStep(job) {
  if (job.open_tasks > 0) return 'todo'
  if (ACTIVE_STAGES.includes(job.status) && !(job.todo_stages > 0)) return 'waiting'
  return null
}
