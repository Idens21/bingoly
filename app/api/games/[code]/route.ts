import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const db = getSupabaseClient()
  const { code } = await params
  const { data, error } = await db
    .from('game_sessions')
    .select('*')
    .eq('code', code.toUpperCase())
    .single()

  if (error || !data) return NextResponse.json({ error: 'Spel niet gevonden' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const db = getSupabaseClient()
  const { code } = await params
  const body = await req.json()

  const { data, error } = await db
    .from('game_sessions')
    .update(body)
    .eq('code', code.toUpperCase())
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
