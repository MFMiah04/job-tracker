import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const VALID_STATUSES = ['Wishlist', 'Applied', 'OA', 'Interview', 'Offer', 'Rejected']

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

  async function handleStatusChange(e, job, direction) {
    e.stopPropagation()
    const currentIndex = VALID_STATUSES.indexOf(job.status)
    const newStatus = VALID_STATUSES[(currentIndex + direction + VALID_STATUSES.length) % VALID_STATUSES.length]

    // Optimistic update
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: newStatus } : j))

    const res = await fetch(`/api/jobs/${job.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: job.company,
        job_title: job.job_title,
        source: job.source,
        status: newStatus,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        notes: job.notes,
        applied_at: job.applied_at,
      }),
    })

    if (!res.ok) {
      // Roll back on error
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: job.status } : j))
    }
  }

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

      <nav className="page-tabs">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          Applications
        </NavLink>
        <NavLink to="/stats" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          Stats
        </NavLink>
      </nav>

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
                  <button
                    className="btn-status-cycle"
                    onClick={(e) => handleStatusChange(e, job, -1)}
                    aria-label="Previous status"
                  >◀</button>
                  <span className={`status-badge status-${job.status.toLowerCase().replace(' ', '-')}`}>
                    {job.status}
                  </span>
                  <button
                    className="btn-status-cycle"
                    onClick={(e) => handleStatusChange(e, job, 1)}
                    aria-label="Next status"
                  >▶</button>
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
