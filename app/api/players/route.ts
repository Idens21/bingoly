import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { makeCard, shuffle } from '@/lib/game-logic'

function makeCardFromSongs(songs: string[]): string[] {
  if (songs.length < 24) return makeCard()
  const picked = shuffle(songs).slice(0, 24)
  picked.splice(12, 0, 'FREE')
  return picked
}

export async function POST(req: Request) {
  const db = getSupabaseClient()
  const { sessionId, name } = await req.json()

  if (!sessionId || !name?.trim()) {
    return NextResponse.json({ error: 'Vul een naam in' }, { status: 400 })
  }

  // Use Spotify songs if available for this session
  const { data: session } = await db.from('game_sessions').select('songs').eq('id', sessionId).single()
  const songs: string[] = session?.songs ?? []
  const card = makeCardFromSongs(songs)

  const { data, error } = await db
    .from('players')
    .insert({ session_id: sessionId, name: name.trim(), card, marked_indices: [12] })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function GET(req: Request) {
  const db = getSupabaseClient()
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')

  if (!sessionId) return NextResponse.json({ error: 'sessionId vereist' }, { status: 400 })

  const { data, error } = await db
    .from('players')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request) {
  const db = getSupabaseClient()
  const { playerId, ...updates } = await req.json()

  const { data, error } = await db
    .from('players')
    .update(updates)
    .eq('id', playerId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
