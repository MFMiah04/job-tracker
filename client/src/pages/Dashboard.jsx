import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { STATUSES } from '../constants'
import AppHeader from '../components/AppHeader'
import { nextStep, todoItems } from '../nextStep'

// An application still at 'Applied' after this many days is flagged as likely ghosted
const STALE_DAYS = 21

const SORTS = [
  { value: 'applied-desc', label: 'Newest applied' },
  { value: 'applied-asc',  label: 'Oldest applied' },
  { value: 'updated',      label: 'Recently updated' },
  { value: 'company',      label: 'Company A–Z' },
]

// Calendar days from a to b in local time
function daysBetween(a, b) {
  const start = new Date(a)
  start.setHours(0, 0, 0, 0)
  const end = new Date(b)
  end.setHours(0, 0, 0, 0)
  return Math.round((end - start) / 86400000)
}

// Calendar days since dateStr in local time (0 = today, 1 = yesterday).
// Compares midnights rather than elapsed 24h periods, so yesterday evening is 1 even before 24h have passed.
function daysAgo(dateStr) {
  const then = new Date(dateStr)
  then.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((today - then) / 86400000))
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatSalary(min, max) {
  const fmt = n => `£${n.toLocaleString()}`
  if (min && max) return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`
  if (min) return `≥ ${fmt(min)}`
  return `≤ ${fmt(max)}`
}

// Date of the job's most recent history event, falling back to when it was applied for
function lastUpdated(job) {
  return job.last_event_at || job.applied_at
}

const isTodo = job => nextStep(job) === 'todo'
const isWaiting = job => nextStep(job) === 'waiting'

function isStale(job) {
  return job.status === 'Applied' && job.applied_at && daysAgo(job.applied_at) >= STALE_DAYS
}

// Timestamps for sorting — jobs with no date sort last in either direction
function time(dateStr) {
  return dateStr ? new Date(dateStr).getTime() : null
}

function compareDates(a, b, direction) {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return direction * (a - b)
}

function sortJobs(jobs, sortBy) {
  const sorted = [...jobs]
  if (sortBy === 'applied-desc') sorted.sort((a, b) => compareDates(time(a.applied_at), time(b.applied_at), -1))
  if (sortBy === 'applied-asc')  sorted.sort((a, b) => compareDates(time(a.applied_at), time(b.applied_at), 1))
  if (sortBy === 'updated')      sorted.sort((a, b) => compareDates(time(lastUpdated(a)), time(lastUpdated(b)), -1))
  if (sortBy === 'company')      sorted.sort((a, b) => a.company.localeCompare(b.company, 'en', { sensitivity: 'base' }))
  return sorted
}

export default function Dashboard() {
  const { apiFetch } = useAuth()

  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [jobEvents, setJobEvents] = useState({}) // { [jobId]: events[] }

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'todo' | 'waiting' | 'stale' | one of STATUSES
  const [sortBy, setSortBy] = useState('applied-desc')

  useEffect(() => {
    async function fetchJobs() {
      try {
        const res = await apiFetch('/api/jobs')
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

  async function handleToggleExpand(jobId) {
    if (expandedId === jobId) {
      setExpandedId(null)
      return
    }
    setExpandedId(jobId)
    // Lazy-load events on first expand
    if (!jobEvents[jobId]) {
      try {
        const res = await apiFetch(`/api/jobs/${jobId}/events`)
        if (res.ok) {
          const data = await res.json()
          setJobEvents(prev => ({ ...prev, [jobId]: data }))
        }
      } catch {
        // Leave the history empty — collapsing and re-expanding the card retries
      }
    }
  }

  async function handleDelete(id, e) {
    e.stopPropagation()
    if (!window.confirm('Delete this job application?')) return

    const res = await apiFetch(`/api/jobs/${id}`, { method: 'DELETE' })

    if (res.ok) {
      setJobs(jobs => jobs.filter(job => job.id !== id))
      if (expandedId === id) setExpandedId(null)
    }
  }

  // --- search, filter, sort ---
  const statusCounts = jobs.reduce((acc, j) => {
    acc[j.status] = (acc[j.status] || 0) + 1
    return acc
  }, {})
  const staleCount = jobs.filter(isStale).length
  const todoCount = jobs.filter(isTodo).length
  const waitingCount = jobs.filter(isWaiting).length

  // Filters that aren't a plain status
  const SPECIAL_FILTERS = { stale: isStale, todo: isTodo, waiting: isWaiting }

  const query = search.trim().toLowerCase()
  const visibleJobs = sortJobs(
    jobs.filter(job => {
      const special = SPECIAL_FILTERS[statusFilter]
      if (special && !special(job)) return false
      if (!special && statusFilter !== 'all' && job.status !== statusFilter) return false
      if (!query) return true
      return [job.company, job.job_title, job.source].some(v => v && v.toLowerCase().includes(query))
    }),
    sortBy
  )
  const isFiltered = query !== '' || statusFilter !== 'all'

  return (
    <div className="dashboard">
      <AppHeader />

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
        <>
          <div className="job-toolbar">
            <input
              type="search"
              className="job-search"
              placeholder="Search company, title or source"
              aria-label="Search applications"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select
              className="job-filter"
              aria-label="Filter by status"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses ({jobs.length})</option>
              {STATUSES.map(s => (
                <option key={s} value={s}>{s} ({statusCounts[s] || 0})</option>
              ))}
              <option value="todo">To do ({todoCount})</option>
              <option value="waiting">Waiting on them ({waitingCount})</option>
              <option value="stale">No reply in {STALE_DAYS}+ days ({staleCount})</option>
            </select>
            <select
              className="job-filter"
              aria-label="Sort applications"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {isFiltered && (
            <p className="job-count">
              Showing {visibleJobs.length} of {jobs.length}
            </p>
          )}

          {visibleJobs.length === 0 && (
            <p className="status-msg">No applications match.</p>
          )}

          <div className="job-list">
            {visibleJobs.map(job => {
              const isExpanded = expandedId === job.id
              const events = jobEvents[job.id] || []
              const updated = lastUpdated(job)
              const updatedDays = updated ? daysAgo(updated) : null
              const meta = [
                job.applied_at && `Applied ${formatDate(job.applied_at)}`,
                job.source,
                (job.salary_min || job.salary_max) && formatSalary(job.salary_min, job.salary_max),
                updatedDays !== null && (updatedDays === 0 ? 'Updated today' : `Updated ${updatedDays}d ago`),
              ].filter(Boolean)

              return (
                <div key={job.id} className={`job-card${isExpanded ? ' expanded' : ''}`}>
                  {/* Header row — click to expand/collapse */}
                  <div
                    className="job-card-top"
                    onClick={() => handleToggleExpand(job.id)}
                  >
                    <p className="job-identity">
                      <span className="job-company">{job.company}</span>
                      <span className="job-title-sep">·</span>
                      <span className="job-title">{job.job_title}</span>
                    </p>
                    <div className="job-card-right">
                      {isTodo(job) && (
                        <span className="todo-tag" title="Something for you to do on this application">
                          {todoItems(job) > 1 ? `${todoItems(job)} to do` : 'To do'}
                        </span>
                      )}
                      {isWaiting(job) && (
                        <span className="waiting-tag" title="You've marked this stage done — waiting to hear back">
                          Waiting
                        </span>
                      )}
                      {isStale(job) && (
                        <span className="stale-tag" title={`Still at Applied after ${STALE_DAYS}+ days`}>
                          No reply · {daysAgo(job.applied_at)}d
                        </span>
                      )}
                      <span className={`status-badge status-${job.status.toLowerCase().replace(' ', '-')}`}>
                        {job.status}
                      </span>
                      <Link
                        to={`/jobs/${job.id}/edit`}
                        className="btn-edit-card"
                        onClick={e => e.stopPropagation()}
                      >
                        Edit
                      </Link>
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
                  {meta.length > 0 && (
                    <p className="job-card-meta" onClick={() => handleToggleExpand(job.id)}>
                      {meta.join(' · ')}
                    </p>
                  )}

                  {/* Expanded history */}
                  {isExpanded && (
                    <div className="job-card-history">
                      {job.notes && <p className="job-notes">{job.notes}</p>}
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
                                  {formatDate(ev.created_at)}
                                </span>
                                {days !== null && days > 0 && (
                                  <span className="event-delta">+{days}d</span>
                                )}
                                {ev.notes && <span className="event-note">{ev.notes}</span>}
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
        </>
      )}
    </div>
  )
}
