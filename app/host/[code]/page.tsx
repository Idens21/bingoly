'use client'

import { useEffect, useState, useRef, use, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { QUESTIONS, LINES, ROUND_POINTS, isCloseToLine } from '@/lib/game-logic'
import type { GameSession, Player } from '@/lib/types'

const ROUND_NAMES = ['', '1 rij', '2 rijen', 'Volle kaart']

export default function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()

  const [game, setGame] = useState<GameSession & {
    spotify_access_token?: string | null
    spotify_playlist_id?: string | null
    songs?: string[]
  } | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [search, setSearch] = useState('')
  const [qIdx, setQIdx] = useState(0)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  // Spotify state
  const [spotifyConnected, setSpotifyConnected] = useState(false)
  const [playlistUrl, setPlaylistUrl] = useState('')
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [playlistError, setPlaylistError] = useState('')
  const [nowPlaying, setNowPlaying] = useState<string | null>(null)
  const [lastCalledTrackId, setLastCalledTrackId] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const gameRef = useRef(game)
  gameRef.current = game

  useEffect(() => {
    if (searchParams.get('spotify_connected') === 'true') setSpotifyConnected(true)
    if (searchParams.get('spotify_error') === 'true') setError('Spotify koppelen mislukt. Probeer opnieuw.')
  }, [searchParams])

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/games/${code}`)
      if (!res.ok) { router.push('/'); return }
      const g = await res.json()
      setGame(g)
      if (g.spotify_access_token) setSpotifyConnected(true)

      const pRes = await fetch(`/api/players?sessionId=${g.id}`)
      if (pRes.ok) setPlayers(await pRes.json())
    }
    load()

    const db = getSupabaseClient()

    db.channel(`host-game-${code}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions', filter: `code=eq.${code}` },
        payload => setGame(payload.new as typeof game))
      .subscribe()

    db.from('game_sessions').select('id').eq('code', code).single().then(({ data }) => {
      if (!data) return
      db.channel(`host-players-${code}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `session_id=eq.${data.id}` },
          () => fetch(`/api/players?sessionId=${data.id}`).then(r => r.json()).then(setPlayers))
        .subscribe()
    })

    return () => { db.removeAllChannels() }
  }, [code, router])

  // Spotify polling — auto-call songs
  const pollNowPlaying = useCallback(async () => {
    const g = gameRef.current
    if (!g || g.phase === 'lobby' || g.phase === 'ended') return

    const res = await fetch(`/api/spotify/now-playing?gameCode=${code}`)
    if (!res.ok) return
    const data = await res.json()

    if (!data.playing || !data.trackName) return

    setNowPlaying(data.trackName)

    // Only call if it's a new track, on the playlist, and not already called
    if (
      data.trackId !== lastCalledTrackId &&
      g.songs?.includes(data.trackName) &&
      !g.called_songs.includes(data.trackName)
    ) {
      setLastCalledTrackId(data.trackId)
      await handleCallSong(data.trackName, g)
    }
  }, [code, lastCalledTrackId])

  useEffect(() => {
    if (!spotifyConnected || !game || game.phase === 'lobby' || game.phase === 'ended') {
      if (pollingRef.current) clearInterval(pollingRef.current)
      return
    }
    pollingRef.current = setInterval(pollNowPlaying, 2500)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [spotifyConnected, game?.phase, pollNowPlaying])

  const updateGame = async (updates: object) => {
    const res = await fetch(`/api/games/${code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) setError('Fout bij opslaan')
    else return res.json()
  }

  const updatePlayer = async (playerId: string, updates: Partial<Player>) => {
    await fetch('/api/players', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, ...updates }),
    })
  }

  const hasGoalCheck = (marked: Set<number>, card: string[], round: number): boolean => {
    const lines = LINES.filter(l => l.every(i => marked.has(i) || card[i] === 'FREE')).length
    if (round === 1) return lines >= 1
    if (round === 2) return lines >= 2
    return card.every((c, i) => c === 'FREE' || marked.has(i))
  }

  const handleCallSong = async (song: string, currentGame = game) => {
    if (!currentGame) return
    const newCalled = [...currentGame.called_songs, song]
    setSearch('')

    let claim = currentGame.bingo_claim
    for (const p of players) {
      if (claim) break
      const marked = new Set(p.marked_indices)
      const idx = p.card.indexOf(song)
      if (idx >= 0) marked.add(idx)
      if (hasGoalCheck(marked, p.card, currentGame.round)) {
        claim = { player_id: p.id, player_name: p.name }
        break
      }
    }

    await updateGame({ called_songs: newCalled, bingo_claim: claim })

    for (const p of players) {
      const idx = p.card.indexOf(song)
      if (idx >= 0) {
        const newMarked = [...new Set([...p.marked_indices, idx])]
        await updatePlayer(p.id, { marked_indices: newMarked })
      }
    }
  }

  const handleUndo = async () => {
    if (!game || game.called_songs.length === 0) return
    const last = game.called_songs[game.called_songs.length - 1]
    await updateGame({ called_songs: game.called_songs.slice(0, -1), bingo_claim: null })
    for (const p of players) {
      const idx = p.card.indexOf(last)
      if (idx >= 0 && idx !== 12) await updatePlayer(p.id, { marked_indices: p.marked_indices.filter(i => i !== idx) })
    }
  }

  const handleConfirmBingo = async () => {
    if (!game?.bingo_claim) return
    const player = players.find(p => p.id === game.bingo_claim!.player_id)
    if (player) await updatePlayer(player.id, { points: player.points + ROUND_POINTS[game.round] })
    await updateGame({ bingo_claim: null })
  }

  const handleNextRound = async () => {
    if (!game) return
    const nextRound = (game.round + 1) as 1 | 2 | 3
    await updateGame({ round: nextRound, called_songs: [], bingo_claim: null, active_question: null, phase: 'playing' })
    const { makeCard } = await import('@/lib/game-logic')
    for (const p of players) await updatePlayer(p.id, { card: makeCard(), marked_indices: [12] })
  }

  const handleLoadPlaylist = async () => {
    if (!playlistUrl.trim()) return
    setPlaylistLoading(true)
    setPlaylistError('')
    const res = await fetch('/api/spotify/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode: code, playlistUrl }),
    })
    const data = await res.json()
    if (!res.ok) setPlaylistError(data.error ?? 'Fout bij laden')
    else setPlaylistError('')
    setPlaylistLoading(false)
  }

  const handlePoints = async (playerId: string, delta: number) => {
    const p = players.find(p => p.id === playerId)
    if (!p) return
    await updatePlayer(playerId, { points: Math.max(0, p.points + delta) })
    setPlayers(prev => prev.map(pl => pl.id === playerId ? { ...pl, points: Math.max(0, pl.points + delta) } : pl))
  }

  if (!game) {
    return <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center"><p className="text-white/50">Laden...</p></div>
  }

  const songs = game.songs ?? []
  const remaining = songs.length > 0
    ? songs.filter(s => !game.called_songs.includes(s))
    : []
  const filtered = remaining.filter(s => s.toLowerCase().includes(search.toLowerCase()))
  const lastSong = game.called_songs[game.called_songs.length - 1]
  const closeCount = players.filter(p => isCloseToLine(new Set(p.marked_indices), p.card)).length
  const currentQ = game.active_question !== null ? QUESTIONS[game.active_question] : null

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white font-sans">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#1a1a2e] border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div>
          <span className="text-[#FFE66D] font-bold text-base">Bingoly</span>
          <span className="text-white/40 text-xs ml-2">Host</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            className="bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-[#FFE66D] transition-colors">
            {copied ? 'Gekopieerd!' : code}
          </button>
          {game.phase === 'lobby' && songs.length >= 25 && (
            <button onClick={() => updateGame({ phase: 'playing' })}
              className="bg-[#FF6B6B] hover:bg-[#e05a5a] text-white font-bold px-4 py-1.5 rounded-lg text-sm transition-colors">
              Start spel
            </button>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        {/* Lobby */}
        {game.phase === 'lobby' && (
          <div className="bg-white/5 rounded-2xl p-5 text-center">
            <p className="text-white/50 text-sm mb-2">Spelcode</p>
            <div className="text-5xl font-bold font-mono text-[#FFE66D] my-3">{code}</div>
            <p className="text-white/30 text-xs mb-4">Deel deze code met de spelers</p>
            {players.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center mt-3">
                {players.map(p => (
                  <span key={p.id} className="bg-white/10 rounded-full px-3 py-1 text-sm text-white/80">{p.name}</span>
                ))}
              </div>
            )}
            {players.length === 0 && <p className="text-white/40 text-sm">Nog geen spelers</p>}
          </div>
        )}

        {/* Spotify koppelen */}
        <div className="bg-white/5 rounded-xl p-4">
          <div className="text-[#FFE66D] text-xs font-bold uppercase tracking-wide mb-3">Spotify</div>
          {!spotifyConnected ? (
            <a href={`/api/auth/spotify?code=${code}`}
              className="flex items-center justify-center gap-2 w-full bg-[#1DB954] hover:bg-[#1aa34a] text-white font-bold py-3 rounded-xl transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 11-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.779.779 0 01-.973-.519.779.779 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.779.779 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.532-1.072 9.404-.865 13.115 1.337a.935.935 0 01-.955 1.61z"/>
              </svg>
              Verbind met Spotify
            </a>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
                <div className="w-2 h-2 bg-green-400 rounded-full" />
                Spotify gekoppeld
              </div>
              {songs.length === 0 ? (
                <div className="space-y-2">
                  <input
                    value={playlistUrl}
                    onChange={e => setPlaylistUrl(e.target.value)}
                    placeholder="Spotify playlist URL of ID"
                    className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1DB954] transition-colors"
                  />
                  {playlistError && <p className="text-[#FF6B6B] text-xs">{playlistError}</p>}
                  <button onClick={handleLoadPlaylist} disabled={playlistLoading}
                    className="w-full bg-[#1DB954] hover:bg-[#1aa34a] disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
                    {playlistLoading ? 'Laden...' : 'Playlist laden'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-white/60 text-sm">{songs.length} nummers geladen</span>
                    <button onClick={() => updateGame({ songs: [], spotify_playlist_id: null })}
                      className="text-white/30 hover:text-white/60 text-xs transition-colors">
                      Wijzigen
                    </button>
                  </div>
                  {nowPlaying && (
                    <div className="bg-[#1DB954]/10 border border-[#1DB954]/30 rounded-lg px-3 py-2 flex items-center gap-2">
                      <div className="w-2 h-2 bg-[#1DB954] rounded-full animate-pulse flex-shrink-0" />
                      <span className="text-[#1DB954] text-xs font-medium truncate">{nowPlaying}</span>
                    </div>
                  )}
                  {songs.length >= 25 && game.phase === 'lobby' && (
                    <p className="text-white/40 text-xs">Start het spel zodra alle spelers aangemeld zijn</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bingo claim */}
        {game.bingo_claim && (
          <div className="bg-[#FFE66D]/10 border-2 border-[#FFE66D] rounded-2xl p-4">
            <p className="text-[#FFE66D] font-bold text-base mb-3">🎉 BINGO! — {game.bingo_claim.player_name}</p>
            <div className="flex gap-3">
              <button onClick={handleConfirmBingo} className="flex-1 bg-green-500 hover:bg-green-400 text-white font-bold py-2.5 rounded-xl transition-colors">
                ✓ Bevestigen (+{ROUND_POINTS[game.round]} pt)
              </button>
              <button onClick={() => updateGame({ bingo_claim: null })} className="flex-1 bg-[#FF6B6B] hover:bg-red-500 text-white font-bold py-2.5 rounded-xl transition-colors">
                ✗ Afwijzen
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        {game.phase !== 'lobby' && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold">{game.called_songs.length}</div>
              <div className="text-white/40 text-xs mt-0.5">Gespeeld</div>
            </div>
            <div className={`rounded-xl p-3 text-center ${closeCount > 0 ? 'bg-[#FF6B6B]/20' : 'bg-white/5'}`}>
              <div className={`text-2xl font-bold ${closeCount > 0 ? 'text-[#FF6B6B]' : ''}`}>{closeCount}</div>
              <div className="text-white/40 text-xs mt-0.5">Bijna bingo</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold">{remaining.length}</div>
              <div className="text-white/40 text-xs mt-0.5">Resterend</div>
            </div>
          </div>
        )}

        {/* Now playing */}
        {lastSong && (
          <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
            <div className="w-2 h-2 bg-[#1DB954] rounded-full animate-pulse flex-shrink-0" />
            <div>
              <div className="text-white/40 text-xs uppercase tracking-wide">Nu gespeeld</div>
              <div className="text-white font-semibold text-sm mt-0.5">{lastSong}</div>
            </div>
          </div>
        )}

        {/* Round controls */}
        {game.phase !== 'lobby' && (
          <div className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-white/40 text-xs uppercase tracking-wide">Ronde {game.round}</div>
              <div className="text-white font-semibold">{ROUND_NAMES[game.round]}</div>
            </div>
            {game.round < 3 ? (
              <button onClick={handleNextRound} className="bg-[#FF6B9D] hover:bg-pink-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors">
                Ronde {game.round + 1} →
              </button>
            ) : (
              <button onClick={() => updateGame({ phase: 'ended' })} className="bg-white/20 text-white font-bold px-4 py-2 rounded-lg text-sm">
                Eindstand
              </button>
            )}
          </div>
        )}

        {/* Manual song picker (fallback) */}
        {game.phase !== 'lobby' && game.phase !== 'ended' && songs.length > 0 && (
          <div className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[#FFE66D] text-xs font-bold uppercase tracking-wide">Handmatig spelen</div>
              <span className="text-white/30 text-xs">Spotify speelt automatisch</span>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek nummer..."
              className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFE66D] transition-colors mb-2" />
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {filtered.slice(0, 6).map(s => (
                <button key={s} onClick={() => handleCallSong(s)}
                  className="w-full bg-white/5 hover:bg-white/15 border border-white/10 rounded-lg px-3 py-2 text-left text-sm text-white transition-colors">
                  {s}
                </button>
              ))}
            </div>
            {game.called_songs.length > 0 && (
              <button onClick={handleUndo} className="mt-2 text-white/40 hover:text-white/70 text-xs border border-white/10 rounded-lg px-3 py-1.5 transition-colors">
                ↩ Ongedaan
              </button>
            )}
          </div>
        )}

        {/* Bonus questions */}
        {game.phase !== 'lobby' && game.phase !== 'ended' && (
          <div className="bg-white/5 rounded-xl p-4">
            <div className="text-[#FFE66D] text-xs font-bold uppercase tracking-wide mb-3">Bonusvraag</div>
            {currentQ ? (
              <div className="space-y-3">
                <div className="bg-[#FF6B6B]/10 border border-[#FF6B6B]/30 rounded-lg p-3">
                  <p className="text-white text-sm font-medium">{currentQ.q}</p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {currentQ.opts.map((opt, i) => (
                      <div key={i} className={`rounded-lg px-2 py-1.5 text-xs font-medium ${i === currentQ.ans ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/5 text-white/60'}`}>
                        <span className="font-bold mr-1">{['A','B','C','D'][i]}:</span>{opt}
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={() => updateGame({ active_question: null, phase: 'playing' })}
                  className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-2 rounded-lg text-sm transition-colors">
                  Vraag sluiten
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-white/70 text-sm">{QUESTIONS[qIdx].q}</p>
                <div className="flex gap-2">
                  <button onClick={() => updateGame({ active_question: qIdx, phase: 'question' })}
                    className="flex-1 bg-[#FF6B6B] hover:bg-red-500 text-white font-bold py-2 rounded-lg text-sm transition-colors">
                    Lanceer
                  </button>
                  <button onClick={() => setQIdx(i => (i + 1) % QUESTIONS.length)}
                    className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm transition-colors">
                    Volgende
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scoreboard */}
        <div className="bg-white/5 rounded-xl p-4">
          <div className="text-[#FFE66D] text-xs font-bold uppercase tracking-wide mb-3">Punten</div>
          {players.length === 0 ? <p className="text-white/30 text-sm">Nog geen spelers</p> : (
            <div className="space-y-2">
              {[...players].sort((a, b) => b.points - a.points).map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="text-white/30 text-xs w-4">{i + 1}</span>
                  <span className="flex-1 text-white text-sm font-medium">{p.name}</span>
                  <button onClick={() => handlePoints(p.id, -5)} className="bg-white/10 hover:bg-white/20 text-white rounded-lg px-2 py-1 text-xs transition-colors">−5</button>
                  <span className="text-[#FFE66D] font-bold text-base min-w-[2.5rem] text-center">{p.points}</span>
                  <button onClick={() => handlePoints(p.id, 5)} className="bg-white/10 hover:bg-white/20 text-white rounded-lg px-2 py-1 text-xs transition-colors">+5</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ended */}
        {game.phase === 'ended' && (
          <div className="bg-[#FFE66D]/10 border border-[#FFE66D]/30 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-2">🏆</div>
            <h2 className="text-[#FFE66D] font-bold text-xl mb-4">Eindstand</h2>
            <div className="space-y-2">
              {[...players].sort((a, b) => b.points - a.points).map((p, i) => (
                <div key={p.id} className={`flex items-center gap-3 rounded-xl p-2 ${i === 0 ? 'bg-[#FFE66D]/10' : ''}`}>
                  <span className="text-white/40 text-sm w-5">{i + 1}</span>
                  <span className="flex-1 text-white font-medium">{p.name}</span>
                  <span className={`font-bold text-lg ${i === 0 ? 'text-[#FFE66D]' : 'text-white/60'}`}>{p.points} pt</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-[#FF6B6B] text-sm text-center">{error}</p>}
      </div>
    </div>
  )
}
