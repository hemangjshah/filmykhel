import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  try {
    // Pick a random active song
    const { data: songs, error } = await supabase
      .from('songs')
      .select('id, line1, line2, line3, line4, singer1, singer2, music_director, actor1, actor2, actor3, actor4')
      .eq('active', true);

    if (error) throw error;
    if (!songs.length) return res.status(404).json({ error: 'No songs found' });

    const song = songs[Math.floor(Math.random() * songs.length)];

    // Create a game session — stores song_id server-side, never sent to client
    const { data: session, error: sessionError } = await supabase
      .from('game_sessions')
      .insert({ song_id: song.id })
      .select('id')
      .single();

    if (sessionError) throw sessionError;

    // Return ONLY what the client needs — film name never leaves this function
    res.json({
      game_id: session.id,
      clues: {
        lyrics: [song.line1, song.line2, song.line3, song.line4],
        music: {
          singers: [song.singer1, song.singer2].filter(Boolean),
          director: song.music_director
        },
        cast: [song.actor1, song.actor2, song.actor3, song.actor4].filter(Boolean)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
