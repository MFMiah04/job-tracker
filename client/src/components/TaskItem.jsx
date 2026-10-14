import { Link } from 'react-router-dom'

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Task dates are plain YYYY-MM-DD strings; read them as local midnight so they never shift a day
function parseDay(dateStr) {
  return new Date(`${dateStr}T00:00:00`)
}

function formatDay(dateStr) {
  return parseDay(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Whole days from today until dateStr (negative = in the past)
function daysUntil(dateStr) {
  return Math.round((parseDay(dateStr) - parseDay(localDateStr(new Date()))) / 86400000)
}

function dueLabel(dueAt) {
  const days = daysUntil(dueAt)
  if (days < 0) return { text: `Overdue by ${-days}d`, tone: 'overdue' }
  if (days === 0) return { text: 'Due today', tone: 'soon' }
  if (days === 1) return { text: 'Due tomorrow', tone: 'soon' }
  return { text: `Due ${formatDay(dueAt)} · in ${days}d`, tone: days <= 3 ? 'soon' : '' }
}

// One task row: tick box, what to do, optional link, which job, and its dates.
// showJob is false on a job's own edit page, where the job is obvious.
export default function TaskItem({ task, showJob = true, onToggle, onEdit, onDelete }) {
  const done = Boolean(task.done_at)
  const due = !done && task.due_at ? dueLabel(task.due_at) : null

  return (
    <li className={`task-item${done ? ' done' : ''}`}>
      <input
        type="checkbox"
        className="task-check"
        checked={done}
        onChange={() => onToggle(task)}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      />
      <div className="task-body">
        <p className="task-title">
          {task.title}
          {task.link && /^https?:\/\//i.test(task.link) && (
            <a className="task-link" href={task.link} target="_blank" rel="noopener noreferrer">
              Open ↗
            </a>
          )}
        </p>
        <p className="task-meta">
          {showJob && (
            <>
              <Link to={`/jobs/${task.job_id}/edit`} className="task-job">
                {task.company} · {task.job_title}
              </Link>
              {' · '}
            </>
          )}
          {done
            ? `Done ${new Date(task.done_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
            : `Given ${formatDay(task.given_at)}`}
          {due && <span className={`task-due ${due.tone}`}>{due.text}</span>}
        </p>
      </div>
      <div className="task-actions">
        <button type="button" className="btn-edit-card" onClick={() => onEdit(task)}>Edit</button>
        <button type="button" className="btn-delete-card" onClick={() => onDelete(task)} aria-label="Delete task">✕</button>
      </div>
    </li>
  )
}
