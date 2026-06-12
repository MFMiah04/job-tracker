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

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// Custom hook — so components write useAuth() instead of useContext(AuthContext)
export function useAuth() {
  return useContext(AuthContext)
}
