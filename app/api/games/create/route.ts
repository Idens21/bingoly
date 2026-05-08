import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { generateCode } from '@/lib/game-logic'

export async function POST(req: Request) {
  const db = getSupabaseClient()
  const { hostId } = await req.json()

  let code = generateCode()
  for (let i = 0; i < 5; i++) {
    const { data } = await db.from('game_sessions').select('id').eq('code', code).single()
    if (!data) break
    code = generateCode()
  }

  const { data, error } = await db
    .from('game_sessions')
    .insert({ code, host_id: hostId, round: 1, phase: 'lobby' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
