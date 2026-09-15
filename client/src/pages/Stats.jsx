import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  ResponsiveContainer,
  FunnelChart, Funnel, LabelList, Cell, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'

// Stages shown in funnel — in pipeline order
const FUNNEL_STAGES = ['Applied', 'OA', 'Interview', 'Offer']

// Match the text/foreground colours from the status badges in App.css
const FUNNEL_COLORS = [
  'hsl(215, 60%, 55%)',  // Applied — blue
  'hsl(38,  60%, 55%)',  // OA — amber
  'hsl(270, 50%, 60%)',  // Interview — purple
  'hsl(150, 45%, 50%)',  // Offer — green
]

const PERIODS = ['all', 'week', 'month', 'year']

// Returns the Monday of the week that contains dateStr
function weekStart(dateStr) {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

// Groups jobs by week and fills in any gaps (weeks with 0 applications)
function buildWeeklyData(jobs) {
  const withDates = jobs.filter(j => j.applied_at)
  if (withDates.length === 0) return []

  const counts = {}
  for (const job of withDates) {
    const w = weekStart(job.applied_at)
    counts[w] = (counts[w] || 0) + 1
  }

  const weeks = Object.keys(counts).sort()

  // Single week — return it directly, no gap-filling needed
  if (weeks.length === 1) {
    return [{ label: new Date(weeks[0]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), count: counts[weeks[0]] }]
  }

  // Walk from first to last week, inserting 0s for missing weeks
  const result = []
  const current = new Date(weeks[0])
  const end = new Date(weeks[weeks.length - 1])
  while (current <= end) {
    const key = current.toISOString().slice(0, 10)
    result.push({
      label: new Date(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      count: counts[key] || 0,
    })
    current.setDate(current.getDate() + 7)
  }
  return result
}

function buildDailyData(jobs, days) {
  const counts = {}
  for (const job of jobs) {
    if (!job.applied_at) continue
    const key = new Date(job.applied_at).toISOString().slice(0, 10)
    counts[key] = (counts[key] || 0) + 1
  }
  const result = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    result.push({
      label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      count: counts[key] || 0,
    })
  }
  return result
}

function filterByPeriod(jobs, period) {
  if (period === 'all') return jobs
  const cutoff = new Date()
  if (period === 'week')  cutoff.setDate(cutoff.getDate() - 7)
  if (period === 'month') cutoff.setMonth(cutoff.getMonth() - 1)
  if (period === 'year')  cutoff.setFullYear(cutoff.getFullYear() - 1)
  return jobs.filter(j => j.applied_at && new Date(j.applied_at) >= cutoff)
}

function computeRangeStats(jobs, from, to) {
  const start = from ? new Date(from) : null
  const end   = to   ? new Date(to + 'T23:59:59') : new Date()
  const inRange = jobs.filter(j => {
    if (!j.applied_at) return false
    const d = new Date(j.applied_at)
    if (start && d < start) return false
    if (d > end) return false
    return true
  })
  const submitted = inRange.filter(j => j.status !== 'Wishlist')
  const n = submitted.length
  const responded  = submitted.filter(j => ['OA', 'Interview', 'Offer', 'Rejected'].includes(j.status)).length
  const oa         = submitted.filter(j => ['OA', 'Interview', 'Offer'].includes(j.status)).length
  const interview  = submitted.filter(j => ['Interview', 'Offer'].includes(j.status)).length
  const offers     = submitted.filter(j => j.status === 'Offer').length
  const pct = (num) => n === 0 ? null : Math.round((num / n) * 100)
  return { applied: n, responseRate: pct(responded), oaRate: pct(oa), interviewRate: pct(interview), offers }
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Delta({ a, b }) {
  if (a === null || b === null) return <span className="delta-neutral">—</span>
  const d = b - a
  if (d === 0) return <span className="delta-neutral">—</span>
  if (d > 0)  return <span className="delta-up">▲ +{d}</span>
  return <span className="delta-down">▼ {d}</span>
}

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'hsl(38, 4%, 15%)',
    border: '1px solid hsl(38, 4%, 28%)',
    borderRadius: 6,
    color: 'hsl(38, 20%, 88%)',
    fontSize: 13,
  },
}

const AB_ROWS = [
  { label: 'Applications', key: 'applied',       isRate: false },
  { label: 'Response rate', key: 'responseRate',  isRate: true  },
  { label: 'OA rate',       key: 'oaRate',        isRate: true  },
  { label: 'Interview rate', key: 'interviewRate', isRate: true  },
  { label: 'Offers',        key: 'offers',        isRate: false },
]

export default function Stats() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [period, setPeriod]   = useState('all')

  // Change log
  const [experiments, setExperiments] = useState([])
  const [showChangelog, setShowChangelog] = useState(false)
  const [showAddExp, setShowAddExp] = useState(false)
  const [newExp, setNewExp] = useState({ name: '', start_date: '', end_date: '', notes: '' })
  const [expError, setExpError] = useState('')
  const [editingExp, setEditingExp] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', start_date: '', end_date: '', notes: '' })
  const [editError, setEditError] = useState('')

  // A/B compare
  const [showAB, setShowAB]   = useState(false)
  const [periodA, setPeriodA] = useState({ from: '', to: '' })
  const [periodB, setPeriodB] = useState({ from: '', to: '' })

  useEffect(() => {
    async function fetchJobs() {
      try {
        const res = await fetch('/api/jobs', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'Failed to load jobs'); return }
        setJobs(data)
      } catch {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }
    fetchJobs()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function fetchExperiments() {
      try {
        const res = await fetch('/api/experiments', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        setExperiments(await res.json())
      } catch {}
    }
    fetchExperiments()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleLogout() {
    logout()
    navigate('/login')
  }

  async function handleAddExp(e) {
    e.preventDefault()
    setExpError('')
    if (!newExp.name.trim()) { setExpError('Name is required'); return }
    const res = await fetch('/api/experiments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(newExp),
    })
    const data = await res.json()
    if (!res.ok) { setExpError(data.error || 'Failed to save'); return }
    setExperiments(prev => [data, ...prev])
    setNewExp({ name: '', start_date: '', end_date: '', notes: '' })
    setShowAddExp(false)
  }

  function handleEditStart(exp) {
    setEditingExp(exp)
    setEditForm({ name: exp.name, start_date: exp.start_date || '', end_date: exp.end_date || '', notes: exp.notes || '' })
    setShowAddExp(false)
    setEditError('')
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    setEditError('')
    if (!editForm.name.trim()) { setEditError('Name is required'); return }
    const res = await fetch(`/api/experiments/${editingExp.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    const data = await res.json()
    if (!res.ok) { setEditError(data.error || 'Failed to save'); return }
    setExperiments(prev => prev.map(e => e.id === editingExp.id ? data : e))
    setEditingExp(null)
  }

  async function handleDeleteExp(id) {
    const res = await fetch(`/api/experiments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) setExperiments(prev => prev.filter(e => e.id !== id))
  }

  // --- computed stats ---
  const filteredJobs = filterByPeriod(jobs, period)

  const byStatus = filteredJobs.reduce((acc, j) => {
    acc[j.status] = (acc[j.status] || 0) + 1
    return acc
  }, {})

  const submitted    = filteredJobs.filter(j => j.status !== 'Wishlist')
  const active       = filteredJobs.filter(j => ['Applied', 'OA', 'Interview'].includes(j.status))
  const responded    = submitted.filter(j => ['OA', 'Interview', 'Offer', 'Rejected'].includes(j.status))
  const responseRate = submitted.length
    ? Math.round((responded.length / submitted.length) * 100)
    : 0

  // Cumulative funnel — a job at Interview counts towards Applied, OA, and Interview
  const PIPELINE_ORDER = ['Applied', 'OA', 'Interview', 'Offer']
  const funnelData = FUNNEL_STAGES.map(stage => ({
    name: stage,
    value: filteredJobs.filter(j => {
      const furthest = j.furthest_status || (j.status !== 'Rejected' ? j.status : null)
      if (!furthest) return false
      return PIPELINE_ORDER.indexOf(furthest) >= PIPELINE_ORDER.indexOf(stage)
    }).length,
  }))

  // Rejection breakdown by furthest stage reached
  const rejectedJobs = filteredJobs.filter(j => j.status === 'Rejected')
  const rejectionsByStage = PIPELINE_ORDER.map(stage => ({
    stage,
    count: rejectedJobs.filter(j => (j.furthest_status || 'Applied') === stage).length,
  })).filter(r => r.count > 0)

  const isDaily = period === 'week' || period === 'month'
  const chartData = isDaily
    ? buildDailyData(filteredJobs, period === 'week' ? 7 : 30)
    : buildWeeklyData(filteredJobs)
  const chartTitle = isDaily ? 'Applications per day' : 'Applications per week'

  // A/B stats — use unfiltered jobs so period toggle doesn't affect the comparison
  const statsA = periodA.from ? computeRangeStats(jobs, periodA.from, periodA.to) : null
  const statsB = periodB.from ? computeRangeStats(jobs, periodB.from, periodB.to) : null

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Job Tracker</h1>
        <div className="dashboard-actions">
          <span className="user-email">{user?.email}</span>
          <Link to="/jobs/new" className="btn-primary btn-add">
            + Add job
          </Link>
          <button className="btn-logout" onClick={handleLogout}>Log out</button>
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
      {error   && <p className="error-msg">{error}</p>}

      {!loading && !error && (
        <>
          {/* ---- period toggle ---- */}
          <div className="period-toggle">
            {PERIODS.map(p => (
              <button
                key={p}
                className={`period-btn${period === p ? ' active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {p === 'all' ? 'All time' : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {/* ---- summary cards ---- */}
          <div className="stats-grid">
            <div className="stat-card">
              <p className="stat-value">{submitted.length}</p>
              <p className="stat-label">Applied</p>
            </div>
            <div className="stat-card">
              <p className="stat-value">{active.length}</p>
              <p className="stat-label">Active</p>
            </div>
            <div className="stat-card">
              <p className="stat-value">{responseRate}%</p>
              <p className="stat-label">Response rate</p>
            </div>
            <div className="stat-card">
              <p className="stat-value">{byStatus['Offer'] || 0}</p>
              <p className="stat-label">Offers</p>
            </div>
          </div>

          {/* ---- funnel chart ---- */}
          <div className="chart-card">
            <p className="chart-title">Application funnel</p>
            {submitted.length === 0 ? (
              <p className="status-msg">No applications yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <FunnelChart>
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Funnel dataKey="value" data={funnelData} isAnimationActive>
                    {funnelData.map((entry, i) => (
                      <Cell key={entry.name} fill={FUNNEL_COLORS[i]} />
                    ))}
                    <LabelList
                      dataKey="name"
                      position="right"
                      style={{ fill: 'hsl(38, 20%, 88%)', fontSize: 13, fontWeight: 500 }}
                    />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            )}
            {rejectionsByStage.length > 0 && (
              <p className="rejection-breakdown">
                Rejections — {rejectionsByStage.map(r => `post-${r.stage} (${r.count})`).join(' · ')}
              </p>
            )}
          </div>

          {/* ---- area chart (daily or weekly depending on period) ---- */}
          <div className="chart-card">
            <p className="chart-title">{chartTitle}</p>
            {chartData.length === 0 ? (
              <p className="status-msg">No applications yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(37, 48%, 68%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(37, 48%, 68%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(38, 4%, 22%)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'hsl(38, 6%, 58%)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: 'hsl(38, 6%, 58%)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value) => [value, 'Applications']}
                    labelFormatter={(label) => isDaily ? label : `Week of ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(37, 48%, 68%)"
                    fill="url(#areaGrad)"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ---- change log ---- */}
          <div className="collapsible-section">
            <button className="collapsible-toggle" onClick={() => setShowChangelog(v => !v)}>
              <span>Change log</span>
              <span className="collapsible-chevron">{showChangelog ? '▲' : '▼'}</span>
            </button>

            {showChangelog && (
              <div className="changelog-body">
                {experiments.length > 0 && (
                  <table className="changelog-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Notes</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {experiments.map(exp => (
                        <tr key={exp.id}>
                          <td>{exp.name}</td>
                          <td>{formatDate(exp.start_date)}</td>
                          <td>{formatDate(exp.end_date)}</td>
                          <td className="changelog-notes">{exp.notes || '—'}</td>
                          <td className="changelog-actions">
                            <button
                              className={`btn-set-period${periodA.from === (exp.start_date || '') && periodA.to === (exp.end_date || '') ? ' selected' : ''}`}
                              title="Set as Period A"
                              onClick={() => {
                                setPeriodA({ from: exp.start_date || '', to: exp.end_date || '' })
                                setShowAB(true)
                              }}
                            >A</button>
                            <button
                              className={`btn-set-period${periodB.from === (exp.start_date || '') && periodB.to === (exp.end_date || '') ? ' selected' : ''}`}
                              title="Set as Period B"
                              onClick={() => {
                                setPeriodB({ from: exp.start_date || '', to: exp.end_date || '' })
                                setShowAB(true)
                              }}
                            >B</button>
                            <button
                              className={`btn-set-period${editingExp?.id === exp.id ? ' selected' : ''}`}
                              title="Edit entry"
                              onClick={() => editingExp?.id === exp.id ? setEditingExp(null) : handleEditStart(exp)}
                            >✎</button>
                            <button
                              className="btn-delete-exp"
                              onClick={() => handleDeleteExp(exp.id)}
                              aria-label="Delete entry"
                            >✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {editingExp ? (
                  <form className="add-exp-form" onSubmit={handleSaveEdit}>
                    <div className="add-exp-fields">
                      <div className="form-group">
                        <label>Name *</label>
                        <input
                          value={editForm.name}
                          onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                          placeholder="e.g. Switched to CV v2"
                        />
                      </div>
                      <div className="form-group">
                        <label>From</label>
                        <input
                          type="date"
                          value={editForm.start_date}
                          onChange={e => setEditForm(p => ({ ...p, start_date: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>To</label>
                        <input
                          type="date"
                          value={editForm.end_date}
                          onChange={e => setEditForm(p => ({ ...p, end_date: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Notes</label>
                      <textarea
                        rows={2}
                        value={editForm.notes}
                        onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                        placeholder="What changed?"
                      />
                    </div>
                    {editError && <p className="error-msg">{editError}</p>}
                    <div className="add-exp-btns">
                      <button type="submit" className="btn-primary" style={{ width: 'auto' }}>Save changes</button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => { setEditingExp(null); setEditError('') }}
                      >Cancel</button>
                    </div>
                  </form>
                ) : !showAddExp ? (
                  <button className="btn-add-exp" onClick={() => setShowAddExp(true)}>+ Add entry</button>
                ) : (
                  <form className="add-exp-form" onSubmit={handleAddExp}>
                    <div className="add-exp-fields">
                      <div className="form-group">
                        <label>Name *</label>
                        <input
                          value={newExp.name}
                          onChange={e => setNewExp(p => ({ ...p, name: e.target.value }))}
                          placeholder="e.g. Switched to CV v2"
                        />
                      </div>
                      <div className="form-group">
                        <label>From</label>
                        <input
                          type="date"
                          value={newExp.start_date}
                          onChange={e => setNewExp(p => ({ ...p, start_date: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>To</label>
                        <input
                          type="date"
                          value={newExp.end_date}
                          onChange={e => setNewExp(p => ({ ...p, end_date: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Notes</label>
                      <textarea
                        rows={2}
                        value={newExp.notes}
                        onChange={e => setNewExp(p => ({ ...p, notes: e.target.value }))}
                        placeholder="What changed?"
                      />
                    </div>
                    {expError && <p className="error-msg">{expError}</p>}
                    <div className="add-exp-btns">
                      <button type="submit" className="btn-primary" style={{ width: 'auto' }}>Save</button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => { setShowAddExp(false); setExpError('') }}
                      >Cancel</button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* ---- A/B compare ---- */}
          <div className="collapsible-section">
            <button className="collapsible-toggle" onClick={() => setShowAB(v => !v)}>
              <span>A/B compare</span>
              <span className="collapsible-chevron">{showAB ? '▲' : '▼'}</span>
            </button>

            {showAB && (
              <div className="ab-body">
                <div className="ab-pickers">
                  <div className="ab-period">
                    <p className="ab-period-label">Period A</p>
                    <div className="ab-dates">
                      <div className="form-group">
                        <label>From</label>
                        <input
                          type="date"
                          value={periodA.from}
                          onChange={e => setPeriodA(p => ({ ...p, from: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>To</label>
                        <input
                          type="date"
                          value={periodA.to}
                          onChange={e => setPeriodA(p => ({ ...p, to: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="ab-period">
                    <p className="ab-period-label">Period B</p>
                    <div className="ab-dates">
                      <div className="form-group">
                        <label>From</label>
                        <input
                          type="date"
                          value={periodB.from}
                          onChange={e => setPeriodB(p => ({ ...p, from: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>To</label>
                        <input
                          type="date"
                          value={periodB.to}
                          onChange={e => setPeriodB(p => ({ ...p, to: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {statsA && statsB ? (
                  <table className="ab-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Period A</th>
                        <th>Period B</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {AB_ROWS.map(row => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>{statsA[row.key] !== null ? (row.isRate ? `${statsA[row.key]}%` : statsA[row.key]) : '—'}</td>
                          <td>{statsB[row.key] !== null ? (row.isRate ? `${statsB[row.key]}%` : statsB[row.key]) : '—'}</td>
                          <td><Delta a={statsA[row.key]} b={statsB[row.key]} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="status-msg">Set a start date for both periods to see the comparison.</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
