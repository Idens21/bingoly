import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { getValidToken, refreshAccessToken } from '@/lib/spotify'

export async function GET(req: Request) {
  const db = getSupabaseClient()
  const { searchParams } = new URL(req.url)
  const gameCode = searchParams.get('gameCode')
  if (!gameCode) return NextResponse.json({ error: 'gameCode vereist' }, { status: 400 })

  const { data: session } = await db.from('game_sessions').select('*').eq('code', gameCode.toUpperCase()).single()
  if (!session) return NextResponse.json({ error: 'Spel niet gevonden' }, { status: 404 })

  const token = await getValidToken(session)
  if (!token) return NextResponse.json({ playing: false, reason: 'not_connected' })

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

  const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 204 || !res.ok) return NextResponse.json({ playing: false })

  const data = await res.json()
  if (!data?.item || !data.is_playing) return NextResponse.json({ playing: false })

  const trackName = `${data.item.name} - ${data.item.artists[0]?.name}`
  const trackId = data.item.id
  const progressMs = data.progress_ms

  return NextResponse.json({ playing: true, trackName, trackId, progressMs })
}
