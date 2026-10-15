import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import TaskItem from './TaskItem'
import TaskForm from './TaskForm'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Same order as the server: open first, then soonest due (no due date last), then oldest given
function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (Boolean(a.done_at) !== Boolean(b.done_at)) return a.done_at ? 1 : -1
    if (a.due_at !== b.due_at) {
      if (!a.due_at) return 1
      if (!b.due_at) return -1
      return a.due_at < b.due_at ? -1 : 1
    }
    if (a.given_at !== b.given_at) return a.given_at < b.given_at ? -1 : 1
    return a.id - b.id
  })
}

// List of tasks with add, edit, tick-off and delete.
// On the To do page pass `jobs` (for the job picker); on a job's edit page pass its `jobId` instead.
// onTasksChange receives the current task list; addFor = { jobId } opens the add form for that job;
// `extra` is rendered between the open tasks and the Done list.
export default function TaskPanel({ jobId, jobs, onTasksChange, addFor, extra }) {
  const { apiFetch } = useAuth()

  const emptyValues = () => ({ job_id: jobId ?? '', title: '', link: '', given_at: todayStr(), due_at: '' })

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(null) // null | { id: null } when adding | { id } when editing
  const [values, setValues] = useState(emptyValues)
  const [formError, setFormError] = useState('')
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    async function fetchTasks() {
      try {
        const res = await apiFetch(jobId ? `/api/tasks?job_id=${jobId}` : '/api/tasks')
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Failed to load tasks')
          return
        }
        setTasks(data)
      } catch {
        setError('Network error — is the server running?')
      } finally {
        setLoading(false)
      }
    }
    fetchTasks()
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  const openTasks = tasks.filter(t => !t.done_at)
  const doneTasks = tasks.filter(t => t.done_at)

  useEffect(() => {
    if (!loading) onTasksChange?.(tasks)
  }, [loading, tasks]) // eslint-disable-line react-hooks/exhaustive-deps

  function startAdd(presetJobId) {
    setValues({ ...emptyValues(), ...(presetJobId && { job_id: presetJobId }) })
    setFormError('')
    setForm({ id: null })
  }

  // "Add task" pressed on a job elsewhere on the page — open the form for that job.
  // Done during render when addFor changes (React's pattern for reacting to a new prop).
  const [lastAddFor, setLastAddFor] = useState(addFor)
  if (addFor !== lastAddFor) {
    setLastAddFor(addFor)
    if (addFor) startAdd(addFor.jobId)
  }

  function startEdit(task) {
    setValues({
      job_id: task.job_id,
      title: task.title,
      link: task.link || '',
      given_at: task.given_at || '',
      due_at: task.due_at || '',
    })
    setFormError('')
    setForm({ id: task.id })
  }

  // Replaces (or adds) a task with the server's copy and keeps the list in order
  function putTask(saved) {
    setTasks(prev => sortTasks([...prev.filter(t => t.id !== saved.id), saved]))
  }

  async function handleSubmit() {
    if (!values.title.trim()) { setFormError('Task is required'); return }
    if (!values.job_id) { setFormError('Choose a job for this task'); return }

    const editing = form.id !== null
    const existing = editing ? tasks.find(t => t.id === form.id) : null
    setFormError('')
    try {
      const res = await apiFetch(editing ? `/api/tasks/${form.id}` : '/api/tasks', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...values,
          due_at: values.due_at || null,
          done: Boolean(existing?.done_at),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error || 'Could not save the task'); return }
      putTask(data)
      setForm(null)
    } catch {
      setFormError('Network error — the task was not saved')
    }
  }

  async function handleToggle(task) {
    setError('')
    try {
      const res = await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...task, done: !task.done_at }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not update the task'); return }
      putTask(data)
    } catch {
      setError('Network error — the task was not updated')
    }
  }

  async function handleDelete(task) {
    if (!window.confirm(`Delete the task "${task.title}"?`)) return
    setError('')
    try {
      const res = await apiFetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
      if (!res.ok) { setError('Could not delete the task'); return }
      setTasks(prev => prev.filter(t => t.id !== task.id))
      if (form?.id === task.id) setForm(null)
    } catch {
      setError('Network error — the task was not deleted')
    }
  }

  function renderTask(task) {
    if (form?.id === task.id) {
      return (
        <li key={task.id} className="task-item editing">
          <TaskForm
            jobs={jobs}
            values={values}
            setValues={setValues}
            onSubmit={handleSubmit}
            onCancel={() => setForm(null)}
            error={formError}
            submitLabel="Save changes"
          />
        </li>
      )
    }
    return (
      <TaskItem
        key={task.id}
        task={task}
        showJob={!jobId}
        onToggle={handleToggle}
        onEdit={startEdit}
        onDelete={handleDelete}
      />
    )
  }

  if (loading) return <p className="status-msg">Loading…</p>

  return (
    <div className="task-panel">
      {error && <p className="error-msg">{error}</p>}

      {openTasks.length > 0 ? (
        <ul className="task-list">{openTasks.map(renderTask)}</ul>
      ) : (
        <p className="event-empty">
          {jobId ? 'Nothing to do for this job.' : 'Nothing to do. Add a task when you get an assessment or interview.'}
        </p>
      )}

      {form?.id === null ? (
        <TaskForm
          jobs={jobs}
          values={values}
          setValues={setValues}
          onSubmit={handleSubmit}
          onCancel={() => setForm(null)}
          error={formError}
          submitLabel="Add task"
        />
      ) : (
        <button type="button" className="btn-add-exp" onClick={() => startAdd()}>+ Add task</button>
      )}

      {extra}

      {doneTasks.length > 0 && (
        <div className="task-done-section">
          <button type="button" className="task-done-toggle" onClick={() => setShowDone(v => !v)}>
            Done ({doneTasks.length}) {showDone ? '▲' : '▼'}
          </button>
          {showDone && <ul className="task-list">{doneTasks.map(renderTask)}</ul>}
        </div>
      )}
    </div>
  )
}
