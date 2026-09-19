import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { STATUSES, PIPELINE_RANK } from '../constants'

const EMPTY_FORM = {
  company: '',
  job_title: '',
  source: '',
  salary_min: '',
  salary_max: '',
  notes: '',
}

export default function JobForm() {
  const { id } = useParams()   // id is present on /jobs/:id/edit, undefined on /jobs/new
  const isEditing = Boolean(id)

  const { token } = useAuth()
  const navigate = useNavigate()

  const authJson = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const authOnly = { Authorization: `Bearer ${token}` }

  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [error, setError] = useState('')
  const [events, setEvents] = useState([])
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [newEvent, setNewEvent] = useState({ status: 'Applied', created_at: '', notes: '' })

  // In edit mode, fetch the existing job and pre-populate the form
  useEffect(() => {
    if (!isEditing) return

    async function fetchJob() {
      try {
        const [jobRes, eventsRes] = await Promise.all([
          fetch(`/api/jobs/${id}`, { headers: authOnly }),
          fetch(`/api/jobs/${id}/events`, { headers: authOnly }),
        ])
        const data = await jobRes.json()
        if (!jobRes.ok) {
          setFetchError(data.error || 'Failed to load job')
          return
        }
        setForm({
          company: data.company || '',
          job_title: data.job_title || '',
          source: data.source || '',
          salary_min: data.salary_min ?? '',
          salary_max: data.salary_max ?? '',
          notes: data.notes || '',
        })
        if (eventsRes.ok) setEvents(await eventsRes.json())
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

  async function handleEventDateBlur(eventId, newDate) {
    if (!newDate) return
    await fetch(`/api/jobs/${id}/events/${eventId}`, {
      method: 'PUT',
      headers: authJson,
      body: JSON.stringify({ created_at: newDate }),
    })
  }

  async function handleEventNotesBlur(eventId, notes) {
    await fetch(`/api/jobs/${id}/events/${eventId}`, {
      method: 'PUT',
      headers: authJson,
      body: JSON.stringify({ notes }),
    })
  }

  async function handleEventStatusChange(ev, newStatus) {
    const res = await fetch(`/api/jobs/${id}/events/${ev.id}`, {
      method: 'PUT',
      headers: authJson,
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, status: newStatus } : e))
    }
  }

  async function handleDeleteEvent(eventId) {
    const res = await fetch(`/api/jobs/${id}/events/${eventId}`, {
      method: 'DELETE',
      headers: authOnly,
    })
    if (res.ok) setEvents(prev => prev.filter(e => e.id !== eventId))
  }

  async function handleAddEvent() {
    if (!newEvent.created_at) return
    const res = await fetch(`/api/jobs/${id}/events`, {
      method: 'POST',
      headers: authJson,
      body: JSON.stringify(newEvent),
    })
    if (res.ok) {
      const data = await res.json()
      setEvents(prev => [...prev, data].sort((a, b) => {
        const rankDiff = (PIPELINE_RANK[a.status] ?? 0) - (PIPELINE_RANK[b.status] ?? 0)
        if (rankDiff !== 0) return rankDiff
        const da = a.created_at.slice(0, 10), db = b.created_at.slice(0, 10)
        return da < db ? -1 : da > db ? 1 : 0
      }))
      setNewEvent({ status: 'Applied', created_at: '', notes: '' })
      setShowAddEvent(false)
    }
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
        headers: authJson,
        // Convert empty strings to null so the DB gets NULL, not an empty string
        body: JSON.stringify({
          ...form,
          salary_min: form.salary_min === '' ? null : Number(form.salary_min),
          salary_max: form.salary_max === '' ? null : Number(form.salary_max),
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

          <div className="form-row-salaries">
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

          {isEditing && (
            <div className="history-section">
              <p className="history-label">History</p>
              <ul className="event-list">
                {events.map((ev) => (
                  <li key={ev.id} className="event-row event-row-edit">
                    <div className="event-row-top">
                      <select
                        className={`event-status-select status-${ev.status.toLowerCase().replace(' ', '-')}`}
                        value={ev.status}
                        onChange={e => handleEventStatusChange(ev, e.target.value)}
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input
                        type="date"
                        className="event-date-input"
                        value={ev.created_at ? ev.created_at.slice(0, 10) : ''}
                        onChange={e => setEvents(prev => prev.map(x => x.id === ev.id ? { ...x, created_at: e.target.value } : x))}
                        onBlur={e => handleEventDateBlur(ev.id, e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-delete-event"
                        onClick={() => handleDeleteEvent(ev.id)}
                        aria-label="Remove event"
                      >✕</button>
                    </div>
                    <input
                      type="text"
                      className="event-notes-input"
                      placeholder="Notes (optional)"
                      value={ev.notes || ''}
                      onChange={e => setEvents(prev => prev.map(x => x.id === ev.id ? { ...x, notes: e.target.value } : x))}
                      onBlur={e => handleEventNotesBlur(ev.id, e.target.value)}
                    />
                  </li>
                ))}
              </ul>

              {showAddEvent ? (
                <div className="add-event-form">
                  <div className="event-row-top">
                    <select
                      className={`event-status-select status-${newEvent.status.toLowerCase().replace(' ', '-')}`}
                      value={newEvent.status}
                      onChange={e => setNewEvent(p => ({ ...p, status: e.target.value }))}
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input
                      type="date"
                      className="event-date-input"
                      value={newEvent.created_at}
                      onChange={e => setNewEvent(p => ({ ...p, created_at: e.target.value }))}
                    />
                    <button type="button" className="btn-add-event-confirm" onClick={handleAddEvent}>Add</button>
                    <button type="button" className="btn-delete-event" onClick={() => setShowAddEvent(false)}>✕</button>
                  </div>
                  <input
                    type="text"
                    className="event-notes-input"
                    placeholder="Notes (optional)"
                    value={newEvent.notes}
                    onChange={e => setNewEvent(p => ({ ...p, notes: e.target.value }))}
                  />
                </div>
              ) : (
                <button type="button" className="btn-add-exp" onClick={() => setShowAddEvent(true)}>
                  + Add event
                </button>
              )}
            </div>
          )}

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
