import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Admin-only page: who has signed up, and a way to remove an account
export default function Admin() {
  const { user, apiFetch } = useAuth()

  const [users, setUsers] = useState([])
  const [maxUsers, setMaxUsers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await apiFetch('/api/admin/users')
        const data = await res.json()
        if (!res.ok) {
          setError(res.status === 403 ? 'This page is only available to the admin account.' : data.error || 'Failed to load accounts')
          return
        }
        setUsers(data.users)
        setMaxUsers(data.maxUsers)
      } catch {
        setError('Network error — is the server running?')
      } finally {
        setLoading(false)
      }
    }
    fetchUsers()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRemove(account) {
    const jobs = account.job_count === 1 ? '1 application' : `${account.job_count} applications`
    if (!window.confirm(`Remove ${account.email} and their ${jobs}? This cannot be undone.`)) return

    setError('')
    try {
      const res = await apiFetch(`/api/admin/users/${account.id}`, { method: 'DELETE' })
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== account.id))
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Could not remove that account')
    } catch {
      setError('Network error — the account was not removed')
    }
  }

  return (
    <div className="dashboard">
      <AppHeader />

      {loading && <p className="status-msg">Loading…</p>}
      {error && <p className="error-msg">{error}</p>}

      {!loading && maxUsers !== null && (
        <>
          <p className="job-count">
            {users.length} of {maxUsers} accounts used
          </p>
          <table className="changelog-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Joined</th>
                <th>Applications</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map(account => (
                <tr key={account.id}>
                  <td>{account.email}</td>
                  <td>{formatDate(account.created_at)}</td>
                  <td>{account.job_count}</td>
                  <td className="changelog-actions">
                    {account.id === user?.id ? (
                      <span className="admin-you">You</span>
                    ) : (
                      <button className="btn-delete-exp" onClick={() => handleRemove(account)}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
