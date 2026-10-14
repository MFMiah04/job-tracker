// Add/edit form for a task. Pass `jobs` to show a job picker; leave it out when the job is fixed
// (on a job's own edit page). `values` is { job_id, title, link, given_at, due_at }.
export default function TaskForm({ jobs, values, setValues, onSubmit, onCancel, error, submitLabel }) {
  const set = field => e => setValues(p => ({ ...p, [field]: e.target.value }))

  // Plain <div>, not <form>: on the job edit page this sits inside the job's own form
  function handleKeyDown(e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="add-exp-form task-form" onKeyDown={handleKeyDown}>
      {jobs && (
        <div className="form-group">
          <label htmlFor="task-job">Job *</label>
          <select id="task-job" value={values.job_id} onChange={set('job_id')}>
            <option value="">Choose a job…</option>
            {jobs.map(job => (
              <option key={job.id} value={job.id}>{job.company} · {job.job_title}</option>
            ))}
          </select>
        </div>
      )}
      <div className="form-group">
        <label htmlFor="task-title">Task *</label>
        <input
          id="task-title"
          value={values.title}
          onChange={set('title')}
          placeholder="e.g. HackerRank assessment, first-round interview"
        />
      </div>
      <div className="form-group">
        <label htmlFor="task-link">Link</label>
        <input
          id="task-link"
          type="url"
          value={values.link}
          onChange={set('link')}
          placeholder="https://…"
        />
      </div>
      <div className="add-exp-fields">
        <div className="form-group">
          <label htmlFor="task-given">Given</label>
          <input id="task-given" type="date" value={values.given_at} onChange={set('given_at')} />
        </div>
        <div className="form-group">
          <label htmlFor="task-due">Due by</label>
          <input id="task-due" type="date" value={values.due_at} onChange={set('due_at')} />
        </div>
      </div>
      {error && <p className="error-msg">{error}</p>}
      <div className="add-exp-btns">
        <button type="button" className="btn-primary" style={{ width: 'auto' }} onClick={onSubmit}>{submitLabel}</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
