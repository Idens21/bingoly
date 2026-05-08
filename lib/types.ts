export type GamePhase = 'lobby' | 'playing' | 'question' | 'break' | 'ended'

export interface BingoClaim {
  player_id: string
  player_name: string
}

export interface GameSession {
  id: string
  code: string
  host_id: string
  round: 1 | 2 | 3
  phase: GamePhase
  called_songs: string[]
  active_question: number | null
  bingo_claim: BingoClaim | null
  created_at: string
}

export interface Player {
  id: string
  session_id: string
  name: string
  card: string[]
  marked_indices: number[]
  points: number
}

export type RealtimeEvent =
  | { type: 'song_called'; song: string }
  | { type: 'question_launched'; question_index: number }
  | { type: 'question_closed' }
  | { type: 'bingo_claimed'; player_id: string; player_name: string }
  | { type: 'bingo_confirmed'; player_id: string; points: number }
  | { type: 'bingo_rejected' }
  | { type: 'round_started'; round: number }
  | { type: 'points_updated'; player_id: string; new_points: number }
