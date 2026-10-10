import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Title bar and the Applications / Stats tabs, shared by the two main pages
export default function AppHeader() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

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

      <nav className="page-tabs">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          Applications
        </NavLink>
        <NavLink to="/stats" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          Stats
        </NavLink>
      </nav>
    </>
  )
}
