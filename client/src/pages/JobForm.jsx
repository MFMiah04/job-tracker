import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const STATUSES = ['Applied', 'OA', 'Interview', 'Offer', 'Rejected']

const EMPTY_FORM = {
  company: '',
  job_title: '',
  status: 'Applied',
  source: '',
  salary_min: '',
  salary_max: '',
  applied_at: '',
  notes: '',
}

export default function JobForm() {
  const { id } = useParams()   // id is present on /jobs/:id/edit, undefined on /jobs/new
  const isEditing = Boolean(id)

  const { token } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [error, setError] = useState('')

  // In edit mode, fetch the existing job and pre-populate the form
  useEffect(() => {
    if (!isEditing) return

    async function fetchJob() {
      try {
        const res = await fetch(`/api/jobs/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (!res.ok) {
          setFetchError(data.error || 'Failed to load job')
          return
        }
        // applied_at comes back as a full ISO timestamp — slice to YYYY-MM-DD for the date input
        setForm({
          company: data.company || '',
          job_title: data.job_title || '',
          status: data.status || 'Applied',
          source: data.source || '',
          salary_min: data.salary_min ?? '',
          salary_max: data.salary_max ?? '',
          applied_at: data.applied_at ? data.applied_at.slice(0, 10) : '',
          notes: data.notes || '',
        })
      } catch {
        setFetchError('Network error — is the server running?')
      }
    }

    fetchJob()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Single onChange handler for all fields — [e.target.name] is computed property syntax
  // This avoids writing a separate handler for every field
  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const url = isEditing ? `/api/jobs/${id}` : '/api/jobs'
    const method = isEditing ? 'PUT' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        // Convert empty strings to null so the DB gets NULL, not an empty string
        body: JSON.stringify({
          ...form,
          salary_min: form.salary_min === '' ? null : Number(form.salary_min),
          salary_max: form.salary_max === '' ? null : Number(form.salary_max),
          applied_at: form.applied_at || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        return
      }

      navigate('/')
    } catch {
      setError('Network error — is the server running?')
    } finally {
      setLoading(false)
    }
  }

  if (fetchError) {
    return (
      <div className="form-page">
        <p className="error-msg">{fetchError}</p>
        <Link to="/">← Back to dashboard</Link>
      </div>
    )
  }

  return (
    <div className="form-page">
      <div className="form-card">
        <div className="form-page-header">
          <h1>{isEditing ? 'Edit application' : 'Add application'}</h1>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="company">Company *</label>
              <input
                id="company"
                name="company"
                type="text"
                value={form.company}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="job_title">Job title *</label>
              <input
                id="job_title"
                name="job_title"
                type="text"
                value={form.job_title}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                name="status"
                value={form.status}
                onChange={handleChange}
              >
                {STATUSES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="source">Source</label>
              <input
                id="source"
                name="source"
                type="text"
                placeholder="LinkedIn, referral, etc."
                value={form.source}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="salary_min">Salary min (£)</label>
              <input
                id="salary_min"
                name="salary_min"
                type="number"
                value={form.salary_min}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="salary_max">Salary max (£)</label>
              <input
                id="salary_max"
                name="salary_max"
                type="number"
                value={form.salary_max}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="applied_at">Date applied</label>
            <input
              id="applied_at"
              name="applied_at"
              type="date"
              value={form.applied_at}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              placeholder="Recruiter name, interview notes, next steps…"
              value={form.notes}
              onChange={handleChange}
            />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => navigate('/')}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving…' : isEditing ? 'Save changes' : 'Add application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
