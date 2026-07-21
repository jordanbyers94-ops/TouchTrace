// Server for Railway (or any Node host that runs a persistent process,
// as opposed to Vercel's on-demand functions in /api).
// Serves the static app AND the /api/scan proxy from one process.

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '15mb' })); // photos are base64 in the request body

// ---- static app ----
app.use(express.static(path.join(__dirname)));

// ---- proxy endpoint (same logic as api/scan.js, as an Express route) ----
app.post('/api/scan', async (req, res) => {
  const token = req.headers['x-app-token'];
  if (!process.env.APP_ACCESS_TOKEN || token !== process.env.APP_ACCESS_TOKEN) {
    return res.status(401).json({ error: { message: 'Invalid or missing access token' } });
  }
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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`TouchTrace server running on port ${port}`));
