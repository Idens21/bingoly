import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { getValidToken, formatTrack, refreshAccessToken } from '@/lib/spotify'

export async function POST(req: Request) {
  const db = getSupabaseClient()
  const { gameCode, playlistUrl } = await req.json()

  const playlistId = playlistUrl.includes('spotify.com')
    ? playlistUrl.split('/playlist/')[1]?.split('?')[0]
    : playlistUrl.trim()

  if (!playlistId) return NextResponse.json({ error: 'Ongeldige playlist URL' }, { status: 400 })

  const { data: session } = await db.from('game_sessions').select('*').eq('code', gameCode.toUpperCase()).single()
  if (!session) return NextResponse.json({ error: 'Spel niet gevonden' }, { status: 404 })

  const token = await getValidToken(session)
  if (!token) return NextResponse.json({ error: 'Spotify niet gekoppeld' }, { status: 401 })

  if (token !== session.spotify_access_token) {
    const refreshed = await refreshAccessToken(session.spotify_refresh_token)
    if (refreshed) {
      await db.from('game_sessions').update({
        spotify_access_token: refreshed.access_token,
        spotify_token_expires_at: Date.now() + refreshed.expires_in * 1000,
      }).eq('code', gameCode.toUpperCase())
    }
  }

  // Use GET /v1/playlists/{id} with embedded tracks (avoids /tracks endpoint restriction)
  const songs: string[] = []
  let offset = 0
  const limit = 100

  while (true) {
    const fetchRes = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}?offset=${offset}&limit=${limit}&fields=tracks.items(track(name,artists(name))),tracks.next,tracks.total`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!fetchRes.ok) {
      const errBody = await fetchRes.text()
      return NextResponse.json({ error: `Spotify ${fetchRes.status}: ${errBody}` }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await fetchRes.json()
    const items = data?.tracks?.items ?? []

    for (const item of items) {
      if (item?.track?.name) songs.push(formatTrack(item.track))
    }

    if (!data?.tracks?.next || items.length < limit) break
    offset += limit
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
