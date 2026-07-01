import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Fuzzy matching (same logic as client, runs server-side) ──
function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}
function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = a[i-1] === b[j-1] ? d[i-1][j-1] : 1 + Math.min(d[i-1][j], d[i][j-1], d[i-1][j-1]);
  return d[m][n];
}
function stemHindi(s) {
  return s
    .replace(/(ein|ain|oon|on|en|an|wala|waali|wale|waale)$/, '')
    .replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u')
    .trim();
}
function isMatch(guess, film, aliases) {
  const g = norm(guess);
  if (g.length < 2) return false;
  const targets = [norm(film), ...aliases.split(',').map(a => norm(a.trim()))];
  return targets.some(t => {
    if (t === g) return true;
    const gs = stemHindi(g), ts = stemHindi(t);
    if (gs === ts) return true;
    if (g.length >= 4 && t.includes(g) && g.length >= t.length * 0.4) return true;
    if (gs.length >= 4 && ts.includes(gs) && gs.length >= ts.length * 0.4) return true;
    if (g.length >= 4) {
      const maxE = Math.min(4, Math.floor(g.length / 4));
      if (lev(g, t) <= maxE || lev(gs, ts) <= maxE) return true;
    }
    return false;
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { game_id, guess } = req.body;
  if (!game_id || !guess) return res.status(400).json({ error: 'Missing game_id or guess' });

  try {
    // Load session — check not expired
    const { data: session, error: sErr } = await supabase
      .from('game_sessions')
      .select('song_id, solved, expires_at')
      .eq('id', game_id)
      .single();

    if (sErr || !session) return res.status(404).json({ error: 'Session not found' });
    if (session.solved) return res.json({ correct: false, already_solved: true });
    if (new Date(session.expires_at) < new Date())
      return res.status(410).json({ error: 'Session expired' });

    // Load song answer (never sent to client)
    const { data: song, error: songErr } = await supabase
      .from('songs')
      .select('film, aliases, year, song')
      .eq('id', session.song_id)
      .single();

    if (songErr || !song) return res.status(500).json({ error: 'Song not found' });

    const correct = isMatch(guess, song.film, song.aliases || '');

    if (correct) {
      // Mark session solved
      await supabase.from('game_sessions').update({ solved: true }).eq('id', game_id);
    }

    res.json({
      correct,
      // Only reveal film details on correct answer
      ...(correct && {
        film: song.film,
        year: song.year,
        song: song.song
      })
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
