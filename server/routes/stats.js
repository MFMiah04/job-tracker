const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

const TERMINAL = ['Rejected', 'Withdrawn'];
const PIPELINE_STATUSES = new Set(['Applied', 'OA', 'Interview', 'Offer', 'Accepted']);

// Builds the Sankey path for one job's ordered event statuses.
// Returns an array like ['Applied', 'OA', 'Interview 1', 'Interview 2', 'Rejected']
// or ['Applied', 'Active'] if no terminal event.
function buildPath(statuses) {
  const path = [];
  const seen = new Set();
  let interviewCount = 0;
  let terminal = null;

  for (const status of statuses) {
    if (TERMINAL.includes(status)) {
      terminal = terminal || status; // first terminal wins
      continue;
    }
    if (status === 'Interview') {
      interviewCount++;
      path.push(`Interview ${interviewCount}`);
    } else if (PIPELINE_STATUSES.has(status) && !seen.has(status)) {
      seen.add(status);
      path.push(status);
    }
  }

  if (path.length === 0) return [];

  if (terminal) {
    const lastStage = path[path.length - 1];
    // All rejections/withdrawals from any Interview round share one node name
    const stageKey = lastStage.match(/^Interview \d+$/) ? 'Interview' : lastStage;
    path.push(`${terminal} (${stageKey})`);
  } else {
    path.push('Active'); // hidden in UI but keeps node sizes correct
  }

  return path;
}

// GET /api/stats/sankey?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/sankey', async (req, res, next) => {
  try {
    const { from, to } = req.query;

    const { rows: events } = await pool.query(
      `SELECT e.job_id, e.status, e.created_at
       FROM job_status_events e
       JOIN jobs j ON j.id = e.job_id
       WHERE j.user_id = $1
         AND ($2::date IS NULL OR j.applied_at::date >= $2::date)
         AND ($3::date IS NULL OR j.applied_at::date <= $3::date)
       ORDER BY e.job_id, e.created_at ASC`,
      [req.user.id, from || null, to || null]
    );

    // Group events by job
    const byJob = {};
    for (const ev of events) {
      if (!byJob[ev.job_id]) byJob[ev.job_id] = [];
      byJob[ev.job_id].push(ev.status);
    }

    const flowCounts = {};
    const nodeSet = new Set();
    const nodeCounts = {};

    function addLink(source, target) {
      nodeSet.add(source);
      nodeSet.add(target);
      const key = `${source}::${target}`;
      flowCounts[key] = (flowCounts[key] || 0) + 1;
    }

    for (const statuses of Object.values(byJob)) {
      const path = buildPath(statuses);
      for (const nodeId of path) {
        nodeCounts[nodeId] = (nodeCounts[nodeId] || 0) + 1;
      }
      for (let i = 0; i < path.length - 1; i++) {
        addLink(path[i], path[i + 1]);
      }
    }

    res.json({
      nodes: Array.from(nodeSet).map(id => ({ id, value: nodeCounts[id] || 0 })),
      links: Object.entries(flowCounts).map(([key, value]) => {
        const [source, target] = key.split('::');
        return { source, target, value };
      }),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
