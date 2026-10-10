import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

// AuthProvider wraps the whole app and makes auth state available everywhere
export function AuthProvider({ children }) {
  // Lazy initialisers (() => ...) mean these only run once on mount, not every render
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user')
    return saved ? JSON.parse(saved) : null
  })

  function login(token, user) {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user)) // localStorage only stores strings
    setToken(token)
    setUser(user)
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
  }

  // Authenticated fetch — adds the Bearer token, and logs out if the server rejects it
  // (expired or invalid token) so ProtectedRoute sends the user back to /login
  async function apiFetch(path, options = {}) {
    const headers = { Authorization: `Bearer ${token}`, ...options.headers }
    if (options.body) headers['Content-Type'] = 'application/json'
    const res = await fetch(path, { ...options, headers })
    if (res.status === 401) logout()
    return res
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  )
}

// Custom hook — so components write useAuth() instead of useContext(AuthContext)
export function useAuth() {
  return useContext(AuthContext)
}
