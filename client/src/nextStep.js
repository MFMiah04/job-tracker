// Stages that are something for you to do until you mark them as waiting on them
export const ACTIVE_STAGES = ['OA', 'Interview']

// What a job needs next:
//   'todo'    — it has open tasks, or an OA/Interview round in its history still marked to do
//   'waiting' — it's at OA/Interview and every round is marked as waiting on them
//   null      — neither (e.g. Applied, Offer, Rejected)
export function nextStep(job) {
  if (job.open_tasks > 0 || job.todo_stages > 0) return 'todo'
  return ACTIVE_STAGES.includes(job.status) ? 'waiting' : null
}

// How many to-do items a job contributes to the To do count (open tasks + rounds still to do)
export function todoItems(job) {
  return (job.open_tasks || 0) + (job.todo_stages || 0)
}
