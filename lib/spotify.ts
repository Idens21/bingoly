export const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!
export const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!
export const SPOTIFY_REDIRECT_URI = 'https://bingoly.vercel.app/api/auth/spotify/callback'

export const SPOTIFY_SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ')

export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!res.ok) return null
  return res.json()
}

export async function getValidToken(session: { spotify_access_token: string | null; spotify_refresh_token: string | null; spotify_token_expires_at: number | null }): Promise<string | null> {
  if (!session.spotify_access_token) return null
  const now = Date.now()
  if (session.spotify_token_expires_at && now < session.spotify_token_expires_at - 60_000) {
    return session.spotify_access_token
  }
  if (!session.spotify_refresh_token) return null
  const refreshed = await refreshAccessToken(session.spotify_refresh_token)
  if (!refreshed) return null
  return refreshed.access_token
}

export interface SpotifyTrack {
  id: string
  name: string
  artists: { name: string }[]
  label: string // "Artiest - Nummer" format
}

export function formatTrack(track: { name: string; artists: { name: string }[] }): string {
  return `${track.name} - ${track.artists[0]?.name ?? 'Onbekend'}`
}
