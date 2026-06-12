import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()

  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchJobs() {
      try {
        const res = await fetch('/api/jobs', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Failed to load jobs')
          return
        }
        setJobs(data)
      } catch {
        setError('Network error — is the server running?')
      } finally {
        setLoading(false)
      }
    }

    fetchJobs()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(id, e) {
    // stopPropagation prevents the click from bubbling up to the card's onClick
    e.stopPropagation()
    if (!window.confirm('Delete this job application?')) return

    const res = await fetch(`/api/jobs/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      setJobs(jobs => jobs.filter(job => job.id !== id))
    }
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Job Tracker</h1>
        <div className="dashboard-actions">
          <span className="user-email">{user?.email}</span>
          <Link to="/jobs/new" className="btn-primary btn-add">
            + Add job
          </Link>
          <button className="btn-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>

      {loading && <p className="status-msg">Loading…</p>}
      {error && <p className="error-msg">{error}</p>}

      {!loading && !error && jobs.length === 0 && (
        <div className="empty-state">
          <p>No applications yet.</p>
          <Link to="/jobs/new" className="btn-primary" style={{ width: 'auto', display: 'inline-block' }}>
            Add your first job
          </Link>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="job-list">
          {jobs.map(job => (
            // Clicking anywhere on the card goes to the edit form
            <div
              key={job.id}
              className="job-card"
              onClick={() => navigate(`/jobs/${job.id}/edit`)}
            >
              <div className="job-card-top">
                <p className="job-identity">
                  <span className="job-company">{job.company}</span>
                  <span className="job-title-sep">·</span>
                  <span className="job-title">{job.job_title}</span>
                </p>
                <div className="job-card-right">
                  <span className={`status-badge status-${job.status.toLowerCase().replace(' ', '-')}`}>
                    {job.status}
                  </span>
                  <button
                    className="btn-delete-card"
                    onClick={(e) => handleDelete(job.id, e)}
                    aria-label="Delete job"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {(job.applied_at || job.source || job.salary_min || job.salary_max) && (
                <p className="job-card-meta">
                  {[
                    job.applied_at && new Date(job.applied_at).toLocaleDateString('en-GB'),
                    job.source,
                    (job.salary_min || job.salary_max) && [
                      job.salary_min ? `£${job.salary_min.toLocaleString()}` : '',
                      job.salary_max ? `£${job.salary_max.toLocaleString()}` : '',
                    ].filter(Boolean).join(' – '),
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
