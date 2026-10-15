import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'
import TaskPanel from '../components/TaskPanel'
import { nextStep } from '../nextStep'

// To do page: every open task, soonest due first, plus OA/Interview jobs that are
// still to do but have no task yet — each can get a task or be marked as waiting.
export default function Tasks() {
  const { apiFetch } = useAuth()
  const [jobs, setJobs] = useState([])
  const [tasks, setTasks] = useState(null) // null until TaskPanel has loaded
  const [addFor, setAddFor] = useState(null)
  const [error, setError] = useState('')

  // Jobs for the "which job?" picker, A–Z by company
  useEffect(() => {
    async function fetchJobs() {
      try {
        const res = await apiFetch('/api/jobs')
        if (!res.ok) return
        const data = await res.json()
        setJobs([...data].sort((a, b) => a.company.localeCompare(b.company, 'en', { sensitivity: 'base' })))
      } catch {
        // The task list still works; only the picker and job list are empty
      }
    }
    fetchJobs()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Open tasks per job, from the live task list (job.open_tasks goes stale as tasks change here)
  const openByJob = {}
  for (const t of tasks || []) {
    if (!t.done_at) openByJob[t.job_id] = (openByJob[t.job_id] || 0) + 1
  }
  const openTaskCount = Object.values(openByJob).reduce((a, b) => a + b, 0)
  const jobsToActOn = tasks === null ? [] : jobs.filter(job => !openByJob[job.id] && nextStep(job, 0) === 'todo')

  async function handleMarkWaiting(job) {
    setError('')
    try {
      const res = await apiFetch(`/api/jobs/${job.id}/waiting`, {
        method: 'PUT',
        body: JSON.stringify({ waiting: true }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not update that job'); return }
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, waiting_status: data.waiting_status } : j))
    } catch {
      setError('Network error — the job was not updated')
    }
  }

  const jobsSection = jobsToActOn.length > 0 && (
    <div className="todo-jobs">
      <p className="history-label">No task yet</p>
      {error && <p className="error-msg">{error}</p>}
      <ul className="task-list">
        {jobsToActOn.map(job => (
          <li key={job.id} className="task-item">
            <div className="task-body">
              <p className="task-title">
                <Link to={`/jobs/${job.id}/edit`} className="task-job-title">
                  {job.company} · {job.job_title}
                </Link>
              </p>
              <p className="task-meta">
                <span className={`status-badge status-${job.status.toLowerCase()} event-badge`}>{job.status}</span>
                {' '}Add what you need to do, or mark it as waiting once you've done it.
              </p>
            </div>
            <div className="task-actions">
              <button type="button" className="btn-edit-card" onClick={() => setAddFor({ jobId: job.id })}>
                + Task
              </button>
              <button type="button" className="btn-edit-card" onClick={() => handleMarkWaiting(job)}>
                Mark waiting
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className="dashboard">
      <AppHeader todoCount={tasks === null ? undefined : openTaskCount + jobsToActOn.length} />
      <TaskPanel jobs={jobs} onTasksChange={setTasks} addFor={addFor} extra={jobsSection} />
    </div>
  )
}
