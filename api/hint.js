import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { game_id, clue_index, wrong_guesses = [] } = req.body;
  if (!game_id) return res.status(400).json({ error: 'Missing game_id' });

  try {
    // Validate session
    const { data: session } = await supabase
      .from('game_sessions')
      .select('song_id, expires_at')
      .eq('id', game_id)
      .single();

    if (!session || new Date(session.expires_at) < new Date())
      return res.status(410).json({ error: 'Session expired' });

    // Get song for context (film name stays here, never in response)
    const { data: song } = await supabase
      .from('songs')
      .select('film, year, music_director, singer1, singer2')
      .eq('id', session.song_id)
      .single();

    // Call Anthropic — key is a server env variable
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content:
            `You are hosting a Bollywood movie guessing game. The answer is "${song.film}" (${song.year}). ` +
            `The player has seen clue ${clue_index + 1} of 3. ` +
            `Wrong guesses so far: [${wrong_guesses.join(', ')}]. ` +
            `Give ONE warm, playful hint in 1-2 sentences. Mention the decade, genre, director or setting. ` +
            `Do NOT reveal the movie title or song name.`
        }]
      })
    });

    const data = await anthropicRes.json();
    const hint = data.content?.[0]?.text || 'Think of a classic Bollywood blockbuster! 🎬';

    res.json({ hint });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not generate hint' });
  }
}
