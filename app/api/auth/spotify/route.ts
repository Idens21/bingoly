import { NextResponse } from 'next/server'
import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI, SPOTIFY_SCOPES } from '@/lib/spotify'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const gameCode = searchParams.get('code')

  const state = gameCode ?? ''
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES,
    state,
    show_dialog: 'true',
  })

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`)
}
