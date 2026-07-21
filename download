// Deploy this on Vercel (or adapt for Netlify Functions / Cloudflare Workers).
// It holds your real Anthropic API key server-side and never sends it to the browser.
//
// Setup:
//   1. Set environment variables in your hosting dashboard:
//        ANTHROPIC_API_KEY   - your real key from console.anthropic.com
//        APP_ACCESS_TOKEN    - a token YOU make up and share with your team
//                              (this is NOT your Anthropic key — it just gates
//                              who can call this endpoint at all)
//   2. Deploy. Your endpoint will be at: https://<your-project>.vercel.app/api/scan
//   3. In TouchTrace's setup banner, enter that URL as the Proxy URL, and the
//      APP_ACCESS_TOKEN value as the access token.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

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

  // basic guardrails so a single caller can't send an oversized/expensive request
  const bodySize = JSON.stringify(req.body).length;
  if (bodySize > 15_000_000) {
    return res.status(413).json({ error: { message: 'Request too large' } });
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
}
