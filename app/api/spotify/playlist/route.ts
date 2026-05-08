import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { getValidToken, formatTrack, refreshAccessToken } from '@/lib/spotify'

export async function POST(req: Request) {
  const db = getSupabaseClient()
  const { gameCode, playlistUrl } = await req.json()

  // Extract playlist ID from URL or raw ID
  const playlistId = playlistUrl.includes('spotify.com')
    ? playlistUrl.split('/playlist/')[1]?.split('?')[0]
    : playlistUrl.trim()

  if (!playlistId) return NextResponse.json({ error: 'Ongeldige playlist URL' }, { status: 400 })

  const { data: session } = await db.from('game_sessions').select('*').eq('code', gameCode.toUpperCase()).single()
  if (!session) return NextResponse.json({ error: 'Spel niet gevonden' }, { status: 404 })

  const token = await getValidToken(session)
  if (!token) return NextResponse.json({ error: 'Spotify niet gekoppeld' }, { status: 401 })

  // Refresh token in DB if needed
  if (token !== session.spotify_access_token) {
    const refreshed = await refreshAccessToken(session.spotify_refresh_token)
    if (refreshed) {
      await db.from('game_sessions').update({
        spotify_access_token: refreshed.access_token,
        spotify_token_expires_at: Date.now() + refreshed.expires_in * 1000,
      }).eq('code', gameCode.toUpperCase())
    }
  }

  // Fetch all tracks from playlist (handle pagination)
  const songs: string[] = []
  let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(name,artists(name)))`

  while (url) {
    const fetchRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!fetchRes.ok) {
      const errBody = await fetchRes.text()
      return NextResponse.json({ error: `Spotify ${fetchRes.status}: ${errBody}` }, { status: 400 })
    }
    const data: { next: string | null; items: { track: { name: string; artists: { name: string }[] } }[] } = await fetchRes.json()
    for (const item of data.items) {
      if (item.track?.name) songs.push(formatTrack(item.track))
    }
    url = data.next ?? null
  }

  if (songs.length < 25) {
    return NextResponse.json({ error: `Playlist heeft maar ${songs.length} nummers — minimaal 25 nodig` }, { status: 400 })
  }

  await db.from('game_sessions').update({
    spotify_playlist_id: playlistId,
    songs,
  }).eq('code', gameCode.toUpperCase())

  return NextResponse.json({ songs, count: songs.length })
}
