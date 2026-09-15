import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const VALID_STATUSES = ['Wishlist', 'Applied', 'OA', 'Interview', 'Offer', 'Rejected']

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000)
}

export default function Dashboard() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()

  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [jobEvents, setJobEvents] = useState({}) // { [jobId]: events[] }

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

  async function handleCardHeaderClick(e, jobId) {
    e.stopPropagation()
    if (expandedId === jobId) {
      setExpandedId(null)
      return
    }
    setExpandedId(jobId)
    // Lazy-load events on first expand
    if (!jobEvents[jobId]) {
      try {
        const res = await fetch(`/api/jobs/${jobId}/events`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setJobEvents(prev => ({ ...prev, [jobId]: data }))
        }
      } catch {}
    }
  }

  async function handleStatusChange(e, job, direction) {
    e.stopPropagation()
    const currentIndex = VALID_STATUSES.indexOf(job.status)
    const newStatus = VALID_STATUSES[(currentIndex + direction + VALID_STATUSES.length) % VALID_STATUSES.length]

    // Optimistic update
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: newStatus } : j))

    const res = await fetch(`/api/jobs/${job.id}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })

    if (!res.ok) {
      // Roll back on error
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: job.status } : j))
      return
    }

    // Re-fetch events to keep history panel up to date
    const evRes = await fetch(`/api/jobs/${job.id}/events`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (evRes.ok) {
      const evData = await evRes.json()
      setJobEvents(prev => ({ ...prev, [job.id]: evData }))
    } else {
      setJobEvents(prev => { const n = { ...prev }; delete n[job.id]; return n })
    }
  }

  async function handleDelete(id, e) {
    e.stopPropagation()
    if (!window.confirm('Delete this job application?')) return

    const res = await fetch(`/api/jobs/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      setJobs(jobs => jobs.filter(job => job.id !== id))
      if (expandedId === id) setExpandedId(null)
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
          {jobs.map(job => {
            const isExpanded = expandedId === job.id
            const events = jobEvents[job.id] || []

            return (
              <div key={job.id} className={`job-card${isExpanded ? ' expanded' : ''}`} onClick={() => navigate(`/jobs/${job.id}/edit`)}>
                {/* Header row — click to expand/collapse */}
                <div
                  className="job-card-top"
                  onClick={(e) => handleCardHeaderClick(e, job.id)}
                >
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

                {/* Meta row */}
                {(job.salary_min || job.salary_max) && (
                  <p className="job-card-meta">
                    {[
                      (job.salary_min || job.salary_max) && [
                        job.salary_min ? `£${job.salary_min.toLocaleString()}` : '',
                        job.salary_max ? `£${job.salary_max.toLocaleString()}` : '',
                      ].filter(Boolean).join(' – '),
                    ].filter(Boolean).join(' · ')}
                  </p>
                )}

                {/* Expanded history */}
                {isExpanded && (
                  <div className="job-card-history">
                    {events.length === 0 ? (
                      <p className="event-empty">No status history yet.</p>
                    ) : (
                      <ul className="event-list">
                        {events.map((ev, i) => {
                          const prev = events[i - 1]
                          const days = prev ? daysBetween(prev.created_at, ev.created_at) : null
                          return (
                            <li key={i} className="event-row">
                              <span className={`status-badge status-${ev.status.toLowerCase().replace(' ', '-')} event-badge`}>
                                {ev.status}
                              </span>
                              <span className="event-date">
                                {new Date(ev.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                              {days !== null && days > 0 && (
                                <span className="event-delta">+{days}d</span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
