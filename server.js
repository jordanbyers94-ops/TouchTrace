// Server for Railway (persistent process — as opposed to Vercel's on-demand
// functions in /api). Serves the static app, the /api/scan proxy, and a
// Postgres-backed inspection log so entries survive browser resets and sync
// across every device using the same access token.

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '20mb' })); // photos are base64 in the request body

// ---- database (Railway's Postgres plugin sets DATABASE_URL automatically) ----
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });
}

async function ensureSchema() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      date_time TIMESTAMPTZ NOT NULL,
      job_ref TEXT,
      board_id TEXT,
      inspector TEXT,
      photos JSONB,
      risk_level TEXT,
      summary TEXT,
      findings JSONB,
      image_quality_note TEXT,
      test_results JSONB,
      resolved BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}
ensureSchema().catch(err => console.error('Schema setup failed:', err.message));

function checkToken(req, res) {
  const token = req.headers['x-app-token'];
  if (!process.env.APP_ACCESS_TOKEN || token !== process.env.APP_ACCESS_TOKEN) {
    res.status(401).json({ error: { message: 'Invalid or missing access token' } });
    return false;
  }
  return true;
}

// ---- entries API ----
app.get('/api/entries', async (req, res) => {
  if (!checkToken(req, res)) return;
  if (!pool) return res.status(503).json({ error: { message: 'No database configured on this server (DATABASE_URL not set)' } });
  try {
    const { rows } = await pool.query('SELECT * FROM entries ORDER BY date_time DESC');
    const entries = rows.map(r => ({
      id: r.id,
      dateTime: r.date_time,
      jobRef: r.job_ref,
      boardId: r.board_id,
      inspector: r.inspector,
      photos: r.photos,
      riskLevel: r.risk_level,
      summary: r.summary,
      findings: r.findings,
      imageQualityNote: r.image_quality_note,
      testResults: r.test_results,
      resolved: r.resolved
    }));
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: { message: 'DB read failed: ' + err.message } });
  }
});

app.post('/api/entries', async (req, res) => {
  if (!checkToken(req, res)) return;
  if (!pool) return res.status(503).json({ error: { message: 'No database configured on this server (DATABASE_URL not set)' } });
  const e = req.body || {};
  if (!e.id || !e.dateTime) return res.status(400).json({ error: { message: 'Missing id or dateTime' } });
  try {
    await pool.query(
      `INSERT INTO entries (id, date_time, job_ref, board_id, inspector, photos, risk_level, summary, findings, image_quality_note, test_results, resolved)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         job_ref=$3, board_id=$4, inspector=$5, photos=$6, risk_level=$7, summary=$8,
         findings=$9, image_quality_note=$10, test_results=$11, resolved=$12`,
      [e.id, e.dateTime, e.jobRef || null, e.boardId || null, e.inspector || null,
       JSON.stringify(e.photos || []), e.riskLevel || null, e.summary || null,
       JSON.stringify(e.findings || []), e.imageQualityNote || null,
       JSON.stringify(e.testResults || null), !!e.resolved]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: { message: 'DB write failed: ' + err.message } });
  }
});

app.delete('/api/entries/:id', async (req, res) => {
  if (!checkToken(req, res)) return;
  if (!pool) return res.status(503).json({ error: { message: 'No database configured on this server (DATABASE_URL not set)' } });
  try {
    await pool.query('DELETE FROM entries WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: { message: 'DB delete failed: ' + err.message } });
  }
});

// ---- proxy endpoint for the Anthropic API (scan + text generation) ----
app.post('/api/scan', async (req, res) => {
  if (!checkToken(req, res)) return;
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: { message: 'Server misconfigured: ANTHROPIC_API_KEY not set' } });
  }

  const { system, messages, max_tokens, model } = req.body || {};
  if (!messages) {
    return res.status(400).json({ error: { message: 'Missing messages in request body' } });
  }

  const cappedMaxTokens = Math.min(max_tokens || 1000, 1500);

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-5',
        max_tokens: cappedMaxTokens,
        system,
        messages
      })
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: { message: 'Upstream request failed: ' + err.message } });
  }
});

// ---- static app (after API routes so they take priority) ----
app.use(express.static(path.join(__dirname)));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`TouchTrace server running on port ${port}${pool ? ' (database connected)' : ' (no database — set DATABASE_URL)'}`));
