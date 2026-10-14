import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'
import TaskPanel from '../components/TaskPanel'

// To do page: every open task across all jobs, soonest due first
export default function Tasks() {
  const { apiFetch } = useAuth()
  const [jobs, setJobs] = useState([])
  const [openCount, setOpenCount] = useState(null)

  // Jobs for the "which job?" picker, A–Z by company
  useEffect(() => {
    async function fetchJobs() {
      try {
        const res = await apiFetch('/api/jobs')
        if (!res.ok) return
        const data = await res.json()
        setJobs([...data].sort((a, b) => a.company.localeCompare(b.company, 'en', { sensitivity: 'base' })))
      } catch {
        // The task list still works; only the picker is empty
      }
    }
    fetchJobs()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="dashboard">
      <AppHeader openTasks={openCount} />
      <TaskPanel jobs={jobs} onOpenCountChange={setOpenCount} />
    </div>
  )
}
