import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        {/* style prop overrides the full-width default for this one button */}
        <button className="btn-primary" style={{ width: 'auto' }} onClick={handleLogout}>
          Log out
        </button>
      </div>
      <p>Logged in as <strong>{user?.email}</strong></p>
      <p style={{ marginTop: '12px', color: 'var(--text)' }}>Job list coming soon.</p>
    </div>
  )
}
