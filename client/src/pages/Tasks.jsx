import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'
import TaskPanel from '../components/TaskPanel'

function formatDay(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// To do page: open tasks (soonest due first), then OA/Interview rounds still marked to do.
// A round can get a task for the details, or be marked as waiting once it's done.
export default function Tasks() {
  const { apiFetch } = useAuth()
  const [jobs, setJobs] = useState([])
  const [tasks, setTasks] = useState(null) // null until TaskPanel has loaded
  const [stages, setStages] = useState(null) // null until loaded
  const [addFor, setAddFor] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchJobsAndStages() {
      try {
        const [jobsRes, stagesRes] = await Promise.all([
          apiFetch('/api/jobs'),
          apiFetch('/api/tasks/stages'),
        ])
        // Jobs for the "which job?" picker, A–Z by company
        if (jobsRes.ok) {
          const data = await jobsRes.json()
          setJobs([...data].sort((a, b) => a.company.localeCompare(b.company, 'en', { sensitivity: 'base' })))
        }
        setStages(stagesRes.ok ? await stagesRes.json() : [])
      } catch {
        setStages([])
        setError('Network error — some of the list could not be loaded')
      }
    }
    fetchJobsAndStages()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleMarkWaiting(stage) {
    setError('')
    try {
      const res = await apiFetch(`/api/jobs/${stage.job_id}/events/${stage.id}`, {
        method: 'PUT',
        body: JSON.stringify({ waiting: true }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Could not update that round')
        return
      }
      setStages(prev => prev.filter(s => s.id !== stage.id))
    } catch {
      setError('Network error — the round was not updated')
    }
  }

  const openTaskCount = (tasks || []).filter(t => !t.done_at).length
  const loaded = tasks !== null && stages !== null

  const stagesSection = stages && (stages.length > 0 || error) && (
    <div className="todo-jobs">
      <p className="history-label">Rounds to do</p>
      {error && <p className="error-msg">{error}</p>}
      <ul className="task-list">
        {stages.map(stage => (
          <li key={stage.id} className="task-item">
            <div className="task-body">
              <p className="task-title">
                <Link to={`/jobs/${stage.job_id}/edit`} className="task-job-title">
                  {stage.company} · {stage.job_title}
                </Link>
              </p>
              <p className="task-meta">
                <span className={`status-badge status-${stage.status.toLowerCase()} event-badge`}>{stage.status}</span>
                {' '}since {formatDay(stage.created_at)}
              </p>
            </div>
            <div className="task-actions">
              <button type="button" className="btn-edit-card" onClick={() => setAddFor({ jobId: stage.job_id })}>
                + Task
              </button>
              <button type="button" className="btn-edit-card" onClick={() => handleMarkWaiting(stage)}>
                Waiting
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className="dashboard">
      <AppHeader todoCount={loaded ? openTaskCount + stages.length : undefined} />
      <TaskPanel jobs={jobs} onTasksChange={setTasks} addFor={addFor} extra={stagesSection} />
    </div>
  )
}
