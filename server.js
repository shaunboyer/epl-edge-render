'use strict';

const express = require('express');
const axios   = require('axios');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const ODDS_API_KEY     = process.env.ODDS_API_KEY     || '';
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '';

// ─── Serve static files ───────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── The Odds API proxy ───────────────────────────────────────
app.get('/api/odds', async (req, res) => {
  if (!ODDS_API_KEY) {
    return res.status(500).json({ message: 'ODDS_API_KEY environment variable not set.' });
  }

  const { regions = 'us,uk,eu,au', markets = 'h2h', oddsFormat = 'decimal' } = req.query;

  try {
    const response = await axios.get(
      'https://api.the-odds-api.com/v4/sports/soccer_epl/odds/',
      { params: { apiKey: ODDS_API_KEY, regions, markets, oddsFormat } }
    );

    // Forward rate-limit headers to the client
    const remaining = response.headers['x-requests-remaining'];
    const used      = response.headers['x-requests-used'];
    if (remaining) res.set('x-requests-remaining', remaining);
    if (used)      res.set('x-requests-used', used);

    res.json(response.data);
  } catch (err) {
    const status = err.response?.status || 500;
    const msg    = err.response?.data?.message || err.message;
    console.error('[odds] error:', status, msg);
    res.status(status).json({ message: msg });
  }
});

// ─── API-Football: Team season statistics ────────────────────
app.get('/api/form/:teamId', async (req, res) => {
  if (!FOOTBALL_API_KEY) {
    return res.status(501).json({ message: 'FOOTBALL_API_KEY not set — form data unavailable.' });
  }

  const { teamId } = req.params;
  const now    = new Date();
  const season = req.query.season || (now.getMonth() < 6 ? now.getFullYear() - 1 : now.getFullYear());

  try {
    const response = await axios.get(
      'https://v3.football.api-sports.io/teams/statistics',
      {
        params:  { league: 39, season, team: teamId },
        headers: { 'x-apisports-key': FOOTBALL_API_KEY }
      }
    );
    res.json(response.data);
  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[form] error:', status, err.message);
    res.status(status).json({ message: err.message });
  }
});

// ─── API-Football: Head-to-head ───────────────────────────────
app.get('/api/h2h/:homeId/:awayId', async (req, res) => {
  if (!FOOTBALL_API_KEY) {
    return res.status(501).json({ message: 'FOOTBALL_API_KEY not set — H2H data unavailable.' });
  }

  const { homeId, awayId } = req.params;

  try {
    const response = await axios.get(
      'https://v3.football.api-sports.io/fixtures/headtohead',
      {
        params:  { h2h: `${homeId}-${awayId}`, last: 10 },
        headers: { 'x-apisports-key': FOOTBALL_API_KEY }
      }
    );
    res.json(response.data);
  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[h2h] error:', status, err.message);
    res.status(status).json({ message: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`EPL Edge Finder running on port ${PORT}`);
  console.log(`Odds API key: ${ODDS_API_KEY ? '✓ set' : '✗ MISSING'}`);
  console.log(`Football API key: ${FOOTBALL_API_KEY ? '✓ set' : '— not set (optional)'}`);
});
