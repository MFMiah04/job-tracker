import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { token } = useAuth()

  if (!token) {
    // replace: swaps the history entry so the back button doesn't loop to this page
    return <Navigate to="/login" replace />
  }

  return children
}
