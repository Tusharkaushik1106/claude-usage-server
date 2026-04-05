const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const db = new Database('tracker.db');

// Init DB
db.exec(`
  CREATE TABLE IF NOT EXISTS usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    model TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    session_id TEXT
  );
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Receive usage log from hook scripts
app.post('/log', (req, res) => {
  const { username, model, timestamp, session_id } = req.body;
  if (!username || !model) return res.status(400).json({ error: 'missing fields' });

  db.prepare(`
    INSERT INTO usage (username, model, timestamp, session_id)
    VALUES (?, ?, ?, ?)
  `).run(username, model.toLowerCase(), timestamp || new Date().toISOString(), session_id || null);

  res.json({ ok: true });
});

// Stats for dashboard
app.get('/api/stats', (req, res) => {
  const users  = db.prepare('SELECT DISTINCT username FROM usage ORDER BY username').all().map(r => r.username);
  const models = db.prepare('SELECT DISTINCT model FROM usage ORDER BY model').all().map(r => r.model);

  const stats = {};
  for (const user of users) {
    stats[user] = { total: 0 };
    for (const model of models) {
      const total = db.prepare(
        'SELECT COUNT(*) as c FROM usage WHERE username=? AND model=?'
      ).get(user, model).c;

      const today = db.prepare(
        "SELECT COUNT(*) as c FROM usage WHERE username=? AND model=? AND date(timestamp)=date('now')"
      ).get(user, model).c;

      const week = db.prepare(
        "SELECT COUNT(*) as c FROM usage WHERE username=? AND model=? AND timestamp >= datetime('now', '-7 days')"
      ).get(user, model).c;

      stats[user][model] = { total, today, week };
      stats[user].total += total;
    }
  }

  const recent = db.prepare(
    'SELECT * FROM usage ORDER BY timestamp DESC LIMIT 30'
  ).all();

  // Per-model totals
  const modelTotals = {};
  for (const model of models) {
    modelTotals[model] = db.prepare(
      'SELECT COUNT(*) as c FROM usage WHERE model=?'
    ).get(model).c;
  }

  res.json({ stats, models, users, recent, modelTotals });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Claude Tracker running on http://localhost:${PORT}`));
