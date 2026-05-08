'use client'

import { useEffect, useState, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { QUESTIONS, hasGoal } from '@/lib/game-logic'
import type { GameSession, Player } from '@/lib/types'

const ROUND_NAMES = ['', '1 rij', '2 rijen', 'Volle kaart']

export default function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const [game, setGame] = useState<GameSession | null>(null)
  const [player, setPlayer] = useState<Player | null>(null)
  const [marked, setMarked] = useState<Set<number>>(new Set([12]))
  const [showBingo, setShowBingo] = useState(false)
  const [timer, setTimer] = useState(10)
  const [qSel, setQSel] = useState<number | null>(null)
  const [qDone, setQDone] = useState<'ok' | 'fail' | null>(null)
  const [claimed, setClaimed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevSongsRef = useRef<string[]>([])
  const prevRoundRef = useRef<number>(1)

  useEffect(() => {
    const playerId = sessionStorage.getItem(`bingoly_player_${code}`)
    if (!playerId) { router.push('/'); return }

    async function load() {
      const gRes = await fetch(`/api/games/${code}`)
      if (!gRes.ok) { router.push('/'); return }
      const g = await gRes.json()
      setGame(g)
      prevSongsRef.current = g.called_songs
      prevRoundRef.current = g.round

      const pRes = await fetch(`/api/players?sessionId=${g.id}`)
      if (pRes.ok) {
        const players: Player[] = await pRes.json()
        const me = players.find(p => p.id === playerId)
        if (me) {
          setPlayer(me)
          setMarked(new Set(me.marked_indices))
        }
      }
    }
    load()

    const db = getSupabaseClient()

    // Realtime: game state
    db.channel(`play-game-${code}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions', filter: `code=eq.${code}` },
        payload => {
          const newGame = payload.new as GameSession

          const fresh = newGame.called_songs.filter(s => !prevSongsRef.current.includes(s))
          if (fresh.length > 0) {
            setPlayer(prev => {
              if (!prev) return prev
              const newMarkedArr = [...new Set([...prev.marked_indices])]
              fresh.forEach(s => {
                const i = prev.card.indexOf(s)
                if (i >= 0) newMarkedArr.push(i)
              })
              const uniqueMarked = [...new Set(newMarkedArr)]
              const markedSet = new Set(uniqueMarked)
              setMarked(markedSet)

              if (!newGame.bingo_claim && hasGoal(markedSet, prev.card, newGame.round)) {
                setShowBingo(true)
                setClaimed(false)
              }
              return { ...prev, marked_indices: uniqueMarked }
            })
          }
          prevSongsRef.current = newGame.called_songs

          if (newGame.round !== prevRoundRef.current) {
            prevRoundRef.current = newGame.round
            setShowBingo(false)
            setClaimed(false)
            setQSel(null)
            setQDone(null)
          }

          setGame(newGame)
        })
      .subscribe()

    // Realtime: my player row (card changes on round start)
    db.from('game_sessions').select('id').eq('code', code).single().then(({ data }) => {
      if (!data) return
      db.channel(`play-player-${code}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${playerId}` },
          payload => {
            const updated = payload.new as Player
            setPlayer(updated)
            setMarked(new Set(updated.marked_indices))
          })
        .subscribe()
    })

    return () => { db.removeAllChannels() }
  }, [code, router])

  // Bingo countdown timer
  useEffect(() => {
    if (showBingo && !claimed) {
      setTimer(10)
      timerRef.current = setInterval(() => {
        setTimer(t => {
          if (t <= 1) { clearInterval(timerRef.current!); setShowBingo(false); return 0 }
          return t - 1
        })
      }, 1000)
      return () => { if (timerRef.current) clearInterval(timerRef.current) }
    }
  }, [showBingo, claimed])

  // Reset question state when new question launched
  useEffect(() => { setQSel(null); setQDone(null) }, [game?.active_question])

  const handleManualMark = (i: number) => {
    if (!player || player.card[i] === 'FREE') return
    setMarked(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const handleClaimBingo = async () => {
    if (!player || !game) return
    clearInterval(timerRef.current!)
    setShowBingo(false)
    setClaimed(true)

    await fetch(`/api/games/${code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bingo_claim: { player_id: player.id, player_name: player.name } }),
    })
  }

  const handleAnswer = async (optIdx: number) => {
    if (qDone !== null || !player || game?.active_question === null || game?.active_question === undefined) return
    const q = QUESTIONS[game.active_question]
    const correct = optIdx === q.ans
    setQSel(optIdx)
    setQDone(correct ? 'ok' : 'fail')

    const delta = correct ? q.pts : -5
    await fetch('/api/players', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: player.id, points: Math.max(0, (player.points || 0) + delta) }),
    })
    setPlayer(prev => prev ? { ...prev, points: Math.max(0, (prev.points || 0) + delta) } : prev)
  }

  if (!game || !player) {
    return (
      <div className="min-h-screen bg-[#f8f4ff] flex items-center justify-center">
        <p className="text-gray-400">Laden...</p>
      </div>
    )
  }

  const lastSong = game.called_songs[game.called_songs.length - 1]
  const currentQ = game.active_question !== null && game.active_question !== undefined
    ? QUESTIONS[game.active_question]
    : null

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8f4ff] to-[#fff5f8] flex flex-col font-sans">

      {/* Question overlay */}
      {currentQ && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="inline-flex bg-[#FF6B6B] text-white rounded-full px-3 py-1 text-xs font-bold mb-3">
              Bonusvraag — {currentQ.pts} pt
            </div>
            <p className="text-gray-800 font-bold text-sm leading-relaxed mb-4">{currentQ.q}</p>
            <div className="grid grid-cols-2 gap-2">
              {currentQ.opts.map((opt, i) => {
                let cls = 'border-2 border-gray-100 bg-white text-gray-800'
                if (qSel === i) cls = qDone === 'ok' ? 'border-2 border-green-400 bg-green-50 text-green-800' : 'border-2 border-red-400 bg-red-50 text-red-800'
                return (
                  <button
                    key={i}
                    onClick={() => handleAnswer(i)}
                    disabled={qDone !== null}
                    className={`${cls} rounded-xl p-3 text-left text-xs font-semibold transition-colors flex items-center gap-2`}
                  >
                    <span className="bg-gray-100 rounded-lg w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {['A','B','C','D'][i]}
                    </span>
                    {opt}
                  </button>
                )
              })}
            </div>
            {qDone && (
              <p className={`text-center font-bold text-sm mt-4 ${qDone === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                {qDone === 'ok' ? `Goed! +${currentQ.pts} pt` : 'Fout! −5 pt'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Bingo overlay */}
      {showBingo && !claimed && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-7 text-center max-w-xs w-full shadow-2xl">
            <div className="text-5xl mb-2">🎉</div>
            <h2 className="text-[#FF6B6B] font-bold text-4xl mb-1">BINGO!</h2>
            <p className="text-gray-400 text-sm mb-5">Laat je horen!</p>
            <button
              onClick={handleClaimBingo}
              className="w-full bg-gradient-to-r from-[#FF6B6B] to-[#FF6B9D] text-white font-bold py-4 rounded-xl text-base hover:opacity-90 transition-opacity"
            >
              BINGO CLAIMEN!
            </button>
            <div className="mt-4 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border-3 border-[#FF6B6B] flex items-center justify-center">
                <span className="text-[#FF6B6B] font-bold text-lg">{timer}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lobby waiting screen */}
      {game.phase === 'lobby' && (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div>
            <div className="text-4xl mb-4">⏳</div>
            <h2 className="text-gray-700 font-bold text-xl mb-1">Wachten op de host...</h2>
            <p className="text-gray-400 text-sm">Het spel start zo meteen</p>
            <div className="mt-6 bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-gray-400 text-xs mb-1">Ingeschreven als</p>
              <p className="text-gray-800 font-bold text-lg">{player.name}</p>
            </div>
          </div>
        </div>
      )}

      {/* Game screen */}
      {game.phase !== 'lobby' && (
        <>
          {/* Header */}
          <div className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
            <div>
              <p className="font-bold text-[#FF6B6B] text-base">{player.name}</p>
              <p className="text-gray-400 text-xs">Ronde {game.round} — {ROUND_NAMES[game.round]}</p>
            </div>
            <div className="bg-gradient-to-r from-[#FF6B6B] to-[#FF6B9D] rounded-full px-4 py-1 text-center">
              <span className="text-white font-bold text-xl block leading-tight">{player.points}</span>
              <span className="text-white/70 text-xs">pt</span>
            </div>
          </div>

          {/* Now playing */}
          {lastSong && (
            <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center gap-2">
              <span className="text-[#FF6B6B] text-xs font-semibold">Nu:</span>
              <span className="text-gray-700 text-sm font-medium">{lastSong}</span>
            </div>
          )}

          {/* Bingo card */}
          <div className="flex-1 p-3">
            <div className="grid grid-cols-5 mb-1">
              {['B','I','N','G','O'].map(l => (
                <div key={l} className="text-center font-bold text-[#FF6B6B] text-base py-1">{l}</div>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {player.card.map((song, i) => {
                const isMarked = marked.has(i) || song === 'FREE'
                const isFree = song === 'FREE'
                return (
                  <button
                    key={i}
                    onClick={() => handleManualMark(i)}
                    disabled={isFree}
                    className={`
                      aspect-square rounded-lg flex items-center justify-center p-1 transition-all
                      ${isFree
                        ? 'bg-gradient-to-br from-[#FFE66D] to-[#FF6B9D] cursor-default'
                        : isMarked
                          ? 'bg-gradient-to-br from-[#4ECDC4] to-[#44B89C] scale-95 shadow-md shadow-teal-200'
                          : 'bg-white shadow-sm hover:shadow-md active:scale-95'
                      }
                    `}
                  >
                    <span className={`text-center leading-tight font-semibold ${
                      isFree ? 'text-white text-lg' : isMarked ? 'text-white text-[9px]' : 'text-gray-700 text-[9px]'
                    }`}>
                      {isFree ? '★' : song.split(' - ')[0].substring(0, 12)}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-center text-gray-300 text-xs mt-2">Tik aan om af te vinken</p>
          </div>
        </>
      )}

      {/* Ended screen */}
      {game.phase === 'ended' && (
        <div className="fixed inset-0 bg-white flex items-center justify-center p-8 text-center z-40">
          <div>
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-gray-800 font-bold text-2xl mb-2">Spel afgelopen!</h2>
            <p className="text-gray-400 mb-6">Jouw score</p>
            <div className="bg-gradient-to-r from-[#FF6B6B] to-[#FF6B9D] text-white rounded-2xl p-6 mb-6">
              <span className="font-bold text-5xl">{player.points}</span>
              <span className="text-white/70 ml-2 text-lg">pt</span>
            </div>
            <button onClick={() => router.push('/')} className="text-[#FF6B6B] font-semibold text-sm underline">
              Nieuw spel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
