import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

const EMPTY_FORM = { current: '', next: '', confirm: '' }

// Account page: change your own password
export default function Account() {
  const { apiFetch } = useAuth()

  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Client-side validation before hitting the network
    if (form.next.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (form.next !== form.confirm) {
      setError('New passwords do not match')
      return
    }

    setLoading(true)
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: form.current, new_password: form.next }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not change your password')
        return
      }
      setForm(EMPTY_FORM)
      setSuccess('Password changed.')
    } catch {
      setError('Network error — is the server running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dashboard">
      <AppHeader />

      <div className="form-card">
        <div className="form-page-header">
          <h1>Change password</h1>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="current">Current password</label>
            <input
              id="current"
              name="current"
              type="password"
              autoComplete="current-password"
              value={form.current}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="next">New password</label>
            <input
              id="next"
              name="next"
              type="password"
              autoComplete="new-password"
              value={form.next}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirm">Confirm new password</label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={handleChange}
              required
            />
          </div>

          {error && <p className="error-msg">{error}</p>}
          {success && <p className="success-msg">{success}</p>}

          <button type="submit" className="btn-primary" style={{ width: 'auto' }} disabled={loading}>
            {loading ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>
    </div>
  )
}
