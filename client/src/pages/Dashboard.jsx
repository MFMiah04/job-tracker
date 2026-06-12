import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()

  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // useEffect with [] runs once after the component first mounts — like "on page load"
  // Never fetch data directly in the component body — that runs on every render
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

  async function handleDelete(id) {
    if (!window.confirm('Delete this job application?')) return

    const res = await fetch(`/api/jobs/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      // Optimistic UI — filter out the deleted job immediately instead of re-fetching
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
        <div className="table-wrapper">
          <table className="jobs-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Status</th>
                <th>Applied</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {/* .map() turns the jobs array into an array of <tr> elements */}
              {jobs.map(job => (
                <tr key={job.id}>
                  <td><strong>{job.company}</strong></td>
                  <td>{job.job_title}</td>
                  <td>
                    <span className={`status-badge status-${job.status.toLowerCase().replace(' ', '-')}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="date-cell">
                    {job.applied_at
                      ? new Date(job.applied_at).toLocaleDateString('en-GB')
                      : '—'}
                  </td>
                  <td className="actions-cell">
                    <Link to={`/jobs/${job.id}/edit`} className="btn-action">Edit</Link>
                    <button className="btn-action btn-delete" onClick={() => handleDelete(job.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
