import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

const PERIODS = ['all', 'week', 'month', 'year']

// Colour map for Sankey nodes
const SANKEY_COLORS = {
  Applied:   'hsl(215, 60%, 55%)',
  OA:        'hsl(38,  60%, 55%)',
  Offer:     'hsl(150, 45%, 50%)',
  Accepted:  'hsl(150, 65%, 58%)',
  Rejected:  'hsl(0,   55%, 55%)',
  Withdrawn: 'hsl(30,  50%, 52%)',
  Active:    'hsl(185, 40%, 48%)',
}

function getSankeyColor(id) {
  if (id.startsWith('Interview')) return 'hsl(270, 50%, 60%)'
  if (id.startsWith('Rejected'))  return SANKEY_COLORS.Rejected
  if (id.startsWith('Withdrawn')) return SANKEY_COLORS.Withdrawn
  return SANKEY_COLORS[id] || 'hsl(38, 20%, 45%)'
}

function SankeyChart({ data }) {
  if (!data || data.nodes.length === 0) return <p className="status-msg">No data yet.</p>

  const W = 560, H = 230
  const NODE_W = 4
  const PIPE_Y = 55
  const TERM_Y = 145
  const WITHDRAW_Y = 180
  const MAX_BAR_H = 100
  const OA_Y = PIPE_Y + 45   // OA sits below the main pipeline row

  const inflow = {}, outflow = {}
  for (const l of data.links) {
    outflow[l.source] = (outflow[l.source] || 0) + l.value
    inflow[l.target]  = (inflow[l.target]  || 0) + l.value
  }
  const origCount = Object.fromEntries(
    data.nodes.map(n => [n.id, Math.max(outflow[n.id] || 0, inflow[n.id] || 0)])
  )

  const maxCount = Math.max(...Object.values(origCount).filter(v => v > 0), 1)
  const nodeH = id => Math.max(3, (origCount[id] || 0) / maxCount * MAX_BAR_H)

  const interviewStages = data.nodes
    .map(n => n.id)
    .filter(id => /^Interview \d+$/.test(id))
    .sort((a, b) => parseInt(a.split(' ')[1]) - parseInt(b.split(' ')[1]))

  const pipelineIds = ['Applied', 'OA', ...interviewStages, 'Offer', 'Accepted']
    .filter(id => data.nodes.some(n => n.id === id))

  const span = W - 220   // extra right margin keeps last node at ~61% of width
  const colW = pipelineIds.length > 1 ? span / (pipelineIds.length - 1) : 0
  const pipeX = Object.fromEntries(pipelineIds.map((id, i) => [id, 40 + i * colW]))

  const TERM_X_OFFSET = colW > 0 ? colW * 0.3 : 40
  const termX = {}      // Rejected nodes → TERM_Y
  const withdrawX = {}  // Withdrawn nodes → WITHDRAW_Y

  for (const { id } of data.nodes) {
    const isRej = id.startsWith('Rejected')
    const isWth = id.startsWith('Withdrawn')
    if (!isRej && !isWth) continue
    const m = id.match(/\((.+)\)$/)
    if (!m) continue
    const stage = m[1]
    const srcId = stage === 'Interview'
      ? (interviewStages[interviewStages.length - 1] ?? 'Applied')
      : stage
    const x = Math.min((pipeX[srcId] ?? (W / 2)) + TERM_X_OFFSET, W - 30)
    if (isRej) termX[id] = x
    else withdrawX[id] = x
  }

  function pos(id) {
    if (id === 'OA')         return [pipeX['OA'],    OA_Y]
    if (id in pipeX)         return [pipeX[id],      PIPE_Y]
    if (id in termX)         return [termX[id],       TERM_Y]
    if (id in withdrawX)     return [withdrawX[id],   WITHDRAW_Y]
    return null
  }

  // Center-line bezier — stroke is always perpendicular to path so apparent thickness is constant
  function cBezier(sx, sCY, tx, tCY) {
    const mx = (sx + tx) / 2
    return `M${sx} ${sCY} C${mx} ${sCY},${mx} ${tCY},${tx} ${tCY}`
  }

  // Sort key for outgoing links: Active at top, pipeline by rank desc, Rejected/Withdrawn at bottom
  const srcSortKey = target => {
    if (target === 'Active') return 10000
    if (target.startsWith('Withdrawn')) return -2
    if (target.startsWith('Rejected'))  return -1
    return pipelineIds.indexOf(target)  // OA=1, Interview1=2, Interview2=3…
  }

  const srcBands = {}
  const tgtBands = {}

  const bySource = {}
  for (const l of data.links) {
    ;(bySource[l.source] = bySource[l.source] || []).push(l)
  }
  for (const [srcId, links] of Object.entries(bySource)) {
    const p = pos(srcId); if (!p) continue
    const h = nodeH(srcId)
    links.sort((a, b) => srcSortKey(b.target) - srcSortKey(a.target))
    let y = p[1] - h / 2
    for (const l of links) {
      const bh = (l.value / (outflow[srcId] || 1)) * h
      srcBands[`${l.source}::${l.target}`] = { y0: y, y1: y + bh }
      y += bh
    }
  }

  const byTarget = {}
  for (const l of data.links) {
    ;(byTarget[l.target] = byTarget[l.target] || []).push(l)
  }
  for (const [tgtId, links] of Object.entries(byTarget)) {
    if (tgtId === 'Active') continue
    const p = pos(tgtId); if (!p) continue
    const h = nodeH(tgtId)
    links.sort((a, b) => {
      const pa = pos(a.source), pb = pos(b.source)
      if (!pa || !pb) return 0
      return pa[0] - pb[0]
    })
    let y = p[1] - h / 2
    for (const l of links) {
      const bh = (l.value / (inflow[tgtId] || 1)) * h
      tgtBands[`${l.source}::${l.target}`] = { y0: y, y1: y + bh }
      y += bh
    }
  }

  const activeLinks = data.links.filter(l => l.target === 'Active')

  return (
    <div style={{ overflowX: 'hidden' }}>
    <svg viewBox={`0 -25 ${W} ${H}`} style={{ width: '100%', overflow: 'visible' }}>
      <defs>
        {activeLinks.map((link, i) => {
          const p = pos(link.source)
          if (!p) return null
          const [sx] = p
          const endX = Math.min(sx + 90, W - 10)
          return (
            <linearGradient key={i} id={`ag-${i}`}
              x1={sx} y1={0} x2={endX} y2={0}
              gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor={getSankeyColor(link.source)} stopOpacity={0.3} />
              <stop offset="100%" stopColor={getSankeyColor(link.source)} stopOpacity={0} />
            </linearGradient>
          )
        })}
      </defs>

      {/* Pipeline and rejection links — stroked center-line bezier (constant perpendicular thickness) */}
      {data.links.filter(l => l.target !== 'Active').map((link, i) => {
        const s = pos(link.source), t = pos(link.target)
        if (!s || !t) return null
        const key = `${link.source}::${link.target}`
        const sb = srcBands[key], tb = tgtBands[key]
        if (!sb || !tb) return null
        const [sx] = s, [tx] = t
        const sCY = (sb.y0 + sb.y1) / 2
        const tCY = (tb.y0 + tb.y1) / 2
        const sw = sb.y1 - sb.y0
        const opacity = link.target.startsWith('Withdrawn') ? 0.35 : 0.45
        return (
          <path key={i}
            d={cBezier(sx, sCY, tx, tCY)}
            fill="none"
            stroke={getSankeyColor(link.target)}
            strokeWidth={sw}
            strokeOpacity={opacity} />
        )
      })}

      {/* Active fade-out bands — stroked center-line, gradient stroke, arcs upward */}
      {activeLinks.map((link, i) => {
        const p = pos(link.source); if (!p) return null
        const key = `${link.source}::Active`
        const sb = srcBands[key]; if (!sb) return null
        const [sx, srcY] = p
        const endX = Math.min(sx + 90, W - 10)
        const sCY = (sb.y0 + sb.y1) / 2
        const sw = sb.y1 - sb.y0
        const endCY = srcY - 30
        return (
          <path key={i}
            d={cBezier(sx, sCY, endX, endCY)}
            fill="none"
            stroke={`url(#ag-${i})`}
            strokeWidth={sw} />
        )
      })}

      {/* Node bars and labels */}
      {data.nodes.map((node, i) => {
        if (node.id === 'Active') return null
        const p = pos(node.id)
        if (!p) return null
        const [cx, cy] = p
        const labelAbove = (node.id in pipeX) && node.id !== 'OA'
        const h = nodeH(node.id)
        return (
          <g key={i}>
            <rect
              x={cx - NODE_W / 2} y={cy - h / 2}
              width={NODE_W} height={h}
              fill={getSankeyColor(node.id)} rx={2}
            />
            <text
              x={cx}
              y={labelAbove ? cy - h / 2 - 6 : cy + h / 2 + 6}
              textAnchor={!labelAbove && cx > W / 2 ? 'end' : 'middle'}
              dominantBaseline={labelAbove ? 'auto' : 'hanging'}
              fill="hsl(38, 20%, 85%)"
              fontSize={10}
            >
              {node.id} ({origCount[node.id]})
            </text>
          </g>
        )
      })}
    </svg>
    </div>
  )
}

// Returns the Monday of the week that contains dateStr
function weekStart(dateStr) {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return localDateStr(d)
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

  if (weeks.length === 1) {
    return [{ label: new Date(weeks[0]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), count: counts[weeks[0]] }]
  }

  const result = []
  const current = new Date(weeks[0])
  const end = new Date(weeks[weeks.length - 1])
  while (current <= end) {
    const key = localDateStr(current)
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
    const key = localDateStr(new Date(job.applied_at))
    counts[key] = (counts[key] || 0) + 1
  }
  const result = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = localDateStr(d)
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

// Returns the ISO date string for the start of the period (null = all time)
function periodCutoff(period) {
  if (period === 'all') return null
  const d = new Date()
  if (period === 'week')  d.setDate(d.getDate() - 7)
  if (period === 'month') d.setMonth(d.getMonth() - 1)
  if (period === 'year')  d.setFullYear(d.getFullYear() - 1)
  return localDateStr(d)
}

// furthest_status rank — same order as server PIPELINE
const FS_RANK = { Applied: 0, OA: 1, Interview: 2, Offer: 3, Accepted: 4 }
const fsRank = j => FS_RANK[j.furthest_status] ?? -1

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
  const submitted = inRange
  const n = submitted.length
  // responded = company sent any reply (reached OA+ OR was directly rejected)
  const responded = submitted.filter(j => j.status === 'Rejected' || fsRank(j) >= FS_RANK.OA).length
  const oa        = submitted.filter(j => fsRank(j) >= FS_RANK.OA).length
  const interview = submitted.filter(j => fsRank(j) >= FS_RANK.Interview).length
  const offers    = submitted.filter(j => fsRank(j) >= FS_RANK.Offer).length
  const pct = (num) => n === 0 ? null : Math.round((num / n) * 100)
  return { applied: n, responseRate: pct(responded), oaRate: pct(oa), interviewRate: pct(interview), offers }
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  const [period, setPeriod]   = useState('week')

  const [sankeyData, setSankeyData] = useState(null)
  const [sankeyLoading, setSankeyLoading] = useState(true)

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
    async function fetchSankey() {
      setSankeyLoading(true)
      const from = periodCutoff(period)
      const params = from ? `?from=${from}` : ''
      try {
        const res = await fetch(`/api/stats/sankey${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) setSankeyData(await res.json())
        else console.error('Sankey fetch failed:', res.status, await res.text())
      } catch (err) {
        console.error('Sankey fetch error:', err)
      } finally {
        setSankeyLoading(false)
      }
    }
    fetchSankey()
  }, [period]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setExperiments(prev => prev.map(exp => exp.id === editingExp.id ? data : exp))
    setEditingExp(null)
  }

  async function handleDeleteExp(id) {
    const res = await fetch(`/api/experiments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) setExperiments(prev => prev.filter(exp => exp.id !== id))
  }

  // --- computed stats ---
  const filteredJobs = filterByPeriod(jobs, period)

  const byStatus = filteredJobs.reduce((acc, j) => {
    acc[j.status] = (acc[j.status] || 0) + 1
    return acc
  }, {})

  const submitted = filteredJobs
  const active    = filteredJobs.filter(j => ['Applied', 'OA', 'Interview'].includes(j.status))
  const responded = submitted.filter(j => j.status === 'Rejected' || fsRank(j) >= FS_RANK.OA)
  const responseRate = submitted.length
    ? Math.round((responded.length / submitted.length) * 100)
    : 0

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
              <p className="stat-value">{(byStatus['Offer'] || 0) + (byStatus['Accepted'] || 0)}</p>
              <p className="stat-label">Offers</p>
            </div>
          </div>

          {/* ---- Sankey flow diagram ---- */}
          <div className="chart-card">
            <p className="chart-title">Application pipeline</p>
            {sankeyLoading
              ? <p className="status-msg">Loading…</p>
              : <SankeyChart data={sankeyData} />
            }
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
