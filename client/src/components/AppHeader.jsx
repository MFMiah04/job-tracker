import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Warn the admin once this share of the account limit is used
const NEARLY_FULL = 0.8

// The header is rebuilt on every page, so it remembers its last To do count and admin status
// on this device and shows them straight away while checking the server in the background.
// Keyed by user so a different account never sees someone else's; cleared on log out.
const HEADER_CACHE_PREFIX = 'header:'

function readCache(userId) {
  try {
    return JSON.parse(localStorage.getItem(HEADER_CACHE_PREFIX + userId)) || {}
  } catch {
    return {} // storage blocked or unreadable — start empty
  }
}

function writeCache(userId, patch) {
  try {
    localStorage.setItem(HEADER_CACHE_PREFIX + userId, JSON.stringify({ ...readCache(userId), ...patch }))
  } catch {
    // Storage blocked — the header still works, it just won't be remembered
  }
}

// Title bar and the page tabs, shared by the main pages.
// The admin account also gets an Admin tab and a notice when sign-ups are nearly or completely full.
// The To do page passes `todoCount` so the tab count updates as tasks are ticked off.
export default function AppHeader({ todoCount }) {
  const { user, logout, apiFetch } = useAuth()
  const navigate = useNavigate()
  const [admin, setAdmin] = useState(() => readCache(user?.id).admin ?? null) // { isAdmin, userCount, maxUsers }
  const [fetchedTodoCount, setFetchedTodoCount] = useState(() => readCache(user?.id).todoCount ?? null)

  // Remember the live count the To do page supplies, so other pages start with it
  useEffect(() => {
    if (todoCount !== undefined) writeCache(user?.id, { todoCount })
  }, [todoCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // To do count = open tasks only (rounds still to do are listed on the page but not counted)
  useEffect(() => {
    if (todoCount !== undefined) return // the page is supplying a live count
    async function fetchTodoCount() {
      try {
        const res = await apiFetch('/api/jobs')
        if (!res.ok) return
        const jobs = await res.json()
        const count = jobs.reduce((n, job) => n + (job.open_tasks || 0), 0)
        setFetchedTodoCount(count)
        writeCache(user?.id, { todoCount: count })
      } catch {
        // Not critical — the tab just shows no count
      }
    }
    fetchTodoCount()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function fetchAdminStatus() {
      try {
        const res = await apiFetch('/api/admin/status')
        if (res.ok) {
          const status = await res.json()
          setAdmin(status)
          writeCache(user?.id, { admin: status })
        }
      } catch {
        // Not critical — the header works without the admin extras
      }
    }
    fetchAdminStatus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const openCount = todoCount ?? fetchedTodoCount
  const isAdmin = Boolean(admin?.isAdmin)
  const isFull = isAdmin && admin.userCount >= admin.maxUsers
  const isNearlyFull = isAdmin && !isFull && admin.userCount >= admin.maxUsers * NEARLY_FULL

  return (
    <>
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

      {(isFull || isNearlyFull) && (
        <p className={`admin-banner${isFull ? ' full' : ''}`}>
          {isFull
            ? `Sign-ups are full: ${admin.userCount} of ${admin.maxUsers} accounts. Nobody new can register.`
            : `Sign-ups are nearly full: ${admin.userCount} of ${admin.maxUsers} accounts.`}
          {' '}
          <Link to="/admin">Manage accounts</Link>
        </p>
      )}

      <nav className="page-tabs">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          Applications
        </NavLink>
        <NavLink to="/tasks" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          To do
          {openCount > 0 && <span className="tab-count">{openCount}</span>}
        </NavLink>
        <NavLink to="/stats" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          Stats
        </NavLink>
        <NavLink to="/account" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          Account
        </NavLink>
        {isAdmin && (
          <NavLink to="/admin" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
            Admin
          </NavLink>
        )}
      </nav>
    </>
  )
}
