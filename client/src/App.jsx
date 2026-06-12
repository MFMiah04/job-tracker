import { Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import JobForm from './pages/JobForm'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs/new"
        element={
          <ProtectedRoute>
            <JobForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs/:id/edit"
        element={
          <ProtectedRoute>
            <JobForm />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App
