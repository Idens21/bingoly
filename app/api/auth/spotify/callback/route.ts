import { NextResponse } from 'next/server'
import { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI } from '@/lib/spotify'
import { getSupabaseClient } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const gameCode = searchParams.get('state')
  const error = searchParams.get('error')

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!

  if (error || !code || !gameCode) {
    return NextResponse.redirect(`${baseUrl}/host/${gameCode}?spotify_error=true`)
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${baseUrl}/host/${gameCode}?spotify_error=true`)
  }

  const tokens = await tokenRes.json()
  const expiresAt = Date.now() + tokens.expires_in * 1000

  const db = getSupabaseClient()
  await db.from('game_sessions').update({
    spotify_access_token: tokens.access_token,
    spotify_refresh_token: tokens.refresh_token,
    spotify_token_expires_at: expiresAt,
  }).eq('code', gameCode.toUpperCase())

  return NextResponse.redirect(`${baseUrl}/host/${gameCode}?spotify_connected=true`)
}
