'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()
  const [joinCode, setJoinCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [tab, setTab] = useState<'join' | 'host'>('join')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!joinCode.trim() || !playerName.trim()) {
      setError('Vul een code en naam in')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/games/${joinCode.trim().toUpperCase()}`)
      if (!res.ok) { setError('Spel niet gevonden. Controleer de code.'); setLoading(false); return }
      const game = await res.json()

      if (game.phase !== 'lobby') { setError('Dit spel is al begonnen'); setLoading(false); return }

      const pRes = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: game.id, name: playerName.trim() }),
      })
      if (!pRes.ok) { setError('Fout bij aanmelden'); setLoading(false); return }
      const player = await pRes.json()

      sessionStorage.setItem(`bingoly_player_${game.code}`, player.id)
      router.push(`/play/${game.code}`)
    } catch {
      setError('Verbindingsfout. Probeer opnieuw.')
      setLoading(false)
    }
  }

  const handleCreateGame = async () => {
    setError('')
    setLoading(true)
    try {
      const hostId = crypto.randomUUID()
      const res = await fetch('/api/games/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId }),
      })
      if (!res.ok) { setError('Fout bij aanmaken'); setLoading(false); return }
      const game = await res.json()

      sessionStorage.setItem(`bingoly_host_${game.code}`, hostId)
      router.push(`/host/${game.code}`)
    } catch {
      setError('Verbindingsfout. Probeer opnieuw.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-[#FFE66D] tracking-tight">BINGOLY</h1>
          <p className="text-[#4ECDC4] text-sm mt-1">Muziekbingo + Pubquiz + Kahoot — in één</p>
        </div>

        <div className="flex rounded-xl overflow-hidden mb-6 bg-white/5">
          <button
            onClick={() => setTab('join')}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              tab === 'join' ? 'bg-[#FF6B6B] text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            Meedoen
          </button>
          <button
            onClick={() => setTab('host')}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              tab === 'host' ? 'bg-[#FF6B6B] text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            Spel hosten
          </button>
        </div>

        {tab === 'join' ? (
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-white/60 text-xs font-semibold mb-1.5 uppercase tracking-wide">
                Spelcode
              </label>
              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="bv. BINGO7"
                maxLength={8}
                className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-xl px-4 py-3 text-lg font-mono tracking-widest text-center focus:outline-none focus:border-[#FFE66D] transition-colors"
              />
            </div>
            <div>
              <label className="block text-white/60 text-xs font-semibold mb-1.5 uppercase tracking-wide">
                Jouw naam
              </label>
              <input
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                placeholder="Naam"
                maxLength={20}
                className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-[#FFE66D] transition-colors"
              />
            </div>
            {error && <p className="text-[#FF6B6B] text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#FF6B6B] to-[#FF6B9D] text-white font-bold py-4 rounded-xl text-base hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? 'Aanmelden...' : 'Meedoen →'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="bg-white/5 rounded-xl p-4 text-white/70 text-sm space-y-2">
              <p className="font-semibold text-white/80">Als host:</p>
              <ul className="space-y-1 text-white/50">
                <li>• Jij deelt de spelcode met spelers</li>
                <li>• Jij speelt de nummers af</li>
                <li>• Jij bevestigt BINGO-claims</li>
              </ul>
            </div>
            {error && <p className="text-[#FF6B6B] text-sm text-center">{error}</p>}
            <button
              onClick={handleCreateGame}
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#FFE66D] to-[#FF6B6B] text-[#1a1a2e] font-bold py-4 rounded-xl text-base hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? 'Aanmaken...' : 'Nieuw spel aanmaken →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
