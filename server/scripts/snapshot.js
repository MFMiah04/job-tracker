// Writes a read-only snapshot of one account's job tracker data to ../snapshot/,
// as a readable summary (jobs.md) and structured data (jobs.json), so Claude can read it any time.
//
//   cd server && npm run snapshot
//
// Uses DATABASE_URL and SNAPSHOT_EMAIL (the account to export) from server/.env.
// Everything runs inside a READ ONLY transaction, so it can't change the database.
// The snapshot folder is git-ignored: it holds personal data and must never be committed.

const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { PIPELINE, ACTIVE_STAGES } = require('../statuses');
const { statusOrderSQL } = require('../routes/jobs');

// SNAPSHOT_DIR overrides the output folder (used when testing against sample data)
const OUT_DIR = process.env.SNAPSHOT_DIR || path.join(__dirname, '..', '..', 'snapshot');
const DAY_MS = 86400000;

const isoDay = d => (d ? new Date(d).toISOString().slice(0, 10) : null);
const daysSince = d => (d ? Math.floor((Date.now() - new Date(d)) / DAY_MS) : null);

// Whole days from today until a YYYY-MM-DD date (negative = in the past)
function daysUntil(day) {
  const today = new Date(new Date().toISOString().slice(0, 10));
  return Math.round((new Date(day) - today) / DAY_MS);
}

function salary(min, max) {
  const fmt = n => `£${Number(n).toLocaleString('en-GB')}`;
  if (min && max) return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
  if (min) return `≥ ${fmt(min)}`;
  if (max) return `≤ ${fmt(max)}`;
  return '';
}

// Same rule as the dashboard tag (client/src/nextStep.js)
function nextStep(job) {
  if (job.open_tasks > 0) return `${job.open_tasks} task${job.open_tasks === 1 ? '' : 's'} to do`;
  if (ACTIVE_STAGES.includes(job.status)) {
    return job.todo_rounds > 0 ? `${job.status} round to do (no task added)` : 'Waiting on them';
  }
  return '';
}

function dueText(task) {
  if (task.done_at) return `done ${isoDay(task.done_at)}`;
  if (!task.due_at) return 'no due date';
  const days = daysUntil(task.due_at);
  if (days < 0) return `OVERDUE by ${-days}d (due ${task.due_at})`;
  if (days === 0) return `due TODAY (${task.due_at})`;
  return `due ${task.due_at} (in ${days}d)`;
}

// Table cells can't hold | or line breaks; elsewhere only line breaks are flattened
const cell = v => String(v ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ');
const oneLine = v => String(v ?? '').replace(/\r?\n/g, ' ');

async function main() {
  const email = (process.env.SNAPSHOT_EMAIL || '').trim();
  if (!email) {
    console.error('Set SNAPSHOT_EMAIL in server/.env to the email you log in with, then run this again.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');

    const { rows: [user] } = await client.query(
      'SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) ORDER BY id LIMIT 1', [email]
    );
    if (!user) throw new Error(`No account found for SNAPSHOT_EMAIL (${email})`);

    const stages = ACTIVE_STAGES.map(s => `'${s}'`).join(', ');
    const { rows: jobs } = await client.query(
      `SELECT j.id, j.company, j.job_title, j.source, j.status, j.furthest_status,
              j.salary_min, j.salary_max, j.notes, j.applied_at, j.created_at,
              (SELECT MAX(e.created_at) FROM job_status_events e WHERE e.job_id = j.id) AS last_event_at,
              (SELECT COUNT(*)::int FROM tasks t WHERE t.job_id = j.id AND t.done_at IS NULL) AS open_tasks,
              (SELECT COUNT(*)::int FROM job_status_events e
               WHERE e.job_id = j.id AND e.status IN (${stages}) AND NOT e.waiting) AS todo_rounds
       FROM jobs j WHERE j.user_id = $1
       ORDER BY j.applied_at DESC NULLS LAST, j.created_at DESC`,
      [user.id]
    );
    const { rows: events } = await client.query(
      `SELECT e.id, e.job_id, e.status, e.waiting, e.notes, e.created_at
       FROM job_status_events e JOIN jobs j ON j.id = e.job_id
       WHERE j.user_id = $1
       ORDER BY e.job_id, e.created_at::date, ${statusOrderSQL('e.status')}, e.created_at`,
      [user.id]
    );
    const { rows: tasks } = await client.query(
      `SELECT t.id, t.job_id, t.title, t.link,
              to_char(t.given_at, 'YYYY-MM-DD') AS given_at, to_char(t.due_at, 'YYYY-MM-DD') AS due_at,
              t.done_at, j.company, j.job_title
       FROM tasks t JOIN jobs j ON j.id = t.job_id
       WHERE t.user_id = $1
       ORDER BY (t.done_at IS NOT NULL), t.due_at ASC NULLS LAST, t.given_at, t.id`,
      [user.id]
    );
    const { rows: experiments } = await client.query(
      `SELECT name, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date, notes
       FROM experiments WHERE user_id = $1 ORDER BY start_date DESC NULLS LAST, created_at DESC`,
      [user.id]
    );
    await client.query('ROLLBACK');

    const eventsByJob = {};
    for (const ev of events) (eventsByJob[ev.job_id] = eventsByJob[ev.job_id] || []).push(ev);
    const tasksByJob = {};
    for (const t of tasks) (tasksByJob[t.job_id] = tasksByJob[t.job_id] || []).push(t);

    const generatedAt = new Date();
    const data = {
      generated_at: generatedAt.toISOString(),
      account: user.email,
      jobs: jobs.map(j => ({
        ...j,
        applied_at: isoDay(j.applied_at),
        last_event_at: isoDay(j.last_event_at),
        next_step: nextStep(j),
        history: (eventsByJob[j.id] || []).map(e => ({
          status: e.status, date: isoDay(e.created_at), notes: e.notes || null,
          ...(ACTIVE_STAGES.includes(e.status) && { round: e.waiting ? 'waiting' : 'to do' }),
        })),
        tasks: (tasksByJob[j.id] || []).map(t => ({
          title: t.title, link: t.link, given_at: t.given_at, due_at: t.due_at, done_at: isoDay(t.done_at),
        })),
      })),
      open_tasks: tasks.filter(t => !t.done_at),
      change_log: experiments,
    };

    // ---- readable summary ----
    const L = [];
    const byStatus = {};
    for (const j of jobs) byStatus[j.status] = (byStatus[j.status] || 0) + 1;
    const reached = stage => jobs.filter(j => PIPELINE.indexOf(j.furthest_status) >= PIPELINE.indexOf(stage)).length;
    const replied = jobs.filter(j => j.status === 'Rejected' || PIPELINE.indexOf(j.furthest_status) >= 1).length;
    const pct = n => (jobs.length ? `${Math.round((n / jobs.length) * 100)}%` : '—');
    const openTasks = tasks.filter(t => !t.done_at);
    const roundsToDo = jobs.filter(j => j.todo_rounds > 0 && ACTIVE_STAGES.includes(j.status));
    const waiting = jobs.filter(j => nextStep(j) === 'Waiting on them');

    L.push('# Job applications snapshot', '');
    L.push(`Generated ${generatedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC for ${user.email}.`);
    L.push('Read-only export of the job tracker. Refresh with `cd server && npm run snapshot`.', '');

    L.push('## Summary', '');
    L.push(`- Applications: ${jobs.length}`);
    L.push(`- Current status: ${Object.entries(byStatus).map(([s, n]) => `${s} ${n}`).join(', ') || 'none'}`);
    L.push(`- Reply rate (reached OA or later, or rejected): ${pct(replied)}`);
    L.push(`- Reached OA: ${reached('OA')} · Interview: ${reached('Interview')} · Offer: ${reached('Offer')}`);
    L.push(`- Open tasks: ${openTasks.length} · Rounds to do without a task: ${roundsToDo.filter(j => !j.open_tasks).length} · Waiting on them: ${waiting.length}`);
    L.push('');

    L.push('## Open tasks', '');
    if (openTasks.length === 0) L.push('None.');
    for (const t of openTasks) {
      L.push(`- **${t.title}** — ${t.company} · ${t.job_title} — ${dueText(t)}, given ${t.given_at}${t.link ? ` — ${t.link}` : ''}`);
    }
    L.push('');

    L.push('## Waiting on them', '');
    if (waiting.length === 0) L.push('None.');
    for (const j of waiting) {
      L.push(`- ${j.company} · ${j.job_title} — ${j.status} since ${isoDay(j.last_event_at)} (${daysSince(j.last_event_at)}d ago)`);
    }
    L.push('');

    L.push('## All applications', '');
    L.push('| Company | Role | Status | Next step | Applied | Last update | Source | Salary |');
    L.push('|---|---|---|---|---|---|---|---|');
    for (const j of jobs) {
      L.push(`| ${cell(j.company)} | ${cell(j.job_title)} | ${j.status} | ${cell(nextStep(j))} | ${isoDay(j.applied_at) || ''} | ${isoDay(j.last_event_at) || ''} (${daysSince(j.last_event_at) ?? '?'}d) | ${cell(j.source)} | ${salary(j.salary_min, j.salary_max)} |`);
    }
    L.push('');

    L.push('## Details by application', '');
    for (const j of jobs) {
      L.push(`### ${j.company} · ${j.job_title}`, '');
      L.push(`Status: ${j.status}${j.furthest_status && j.furthest_status !== j.status ? ` (furthest: ${j.furthest_status})` : ''}${nextStep(j) ? ` · ${nextStep(j)}` : ''}`);
      if (j.source) L.push(`Source: ${j.source}`);
      if (salary(j.salary_min, j.salary_max)) L.push(`Salary: ${salary(j.salary_min, j.salary_max)}`);
      if (j.notes) L.push(`Notes: ${oneLine(j.notes)}`);
      L.push('', 'History:');
      for (const e of eventsByJob[j.id] || []) {
        const round = ACTIVE_STAGES.includes(e.status) ? ` [${e.waiting ? 'waiting' : 'to do'}]` : '';
        L.push(`- ${isoDay(e.created_at)} ${e.status}${round}${e.notes ? ` — ${oneLine(e.notes)}` : ''}`);
      }
      const jt = tasksByJob[j.id] || [];
      if (jt.length) {
        L.push('', 'Tasks:');
        for (const t of jt) L.push(`- [${t.done_at ? 'x' : ' '}] ${t.title} — ${dueText(t)}${t.link ? ` — ${t.link}` : ''}`);
      }
      L.push('');
    }

    if (experiments.length) {
      L.push('## Change log (things tried, for comparing periods)', '');
      for (const x of experiments) {
        L.push(`- ${x.name} (${x.start_date || '?'} → ${x.end_date || 'ongoing'})${x.notes ? ` — ${oneLine(x.notes)}` : ''}`);
      }
      L.push('');
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'jobs.md'), L.join('\n'));
    fs.writeFileSync(path.join(OUT_DIR, 'jobs.json'), JSON.stringify(data, null, 2));
    console.log(`Snapshot written: ${jobs.length} applications, ${openTasks.length} open tasks → ${OUT_DIR}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Snapshot failed:', err.message);
  process.exit(1);
});
