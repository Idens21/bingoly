# Bingoly

Multiplayer muziekbingo + pubquiz + Kahoot in één. 10–50 spelers, realtime via Supabase.

## Setup

### 1. Supabase project aanmaken

1. Ga naar [supabase.com](https://supabase.com) en maak een nieuw project
2. Ga naar **SQL Editor** en voer [`supabase/schema.sql`](supabase/schema.sql) uit
3. Ga naar **Project Settings → API** en kopieer de **Project URL** en **anon key**

### 2. Environment variabelen

Kopieer `.env.example` naar `.env.local` en vul in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://jouw-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=jouw-anon-key
```

### 3. Installeren en starten

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Hoe werkt het?

### Host
1. Ga naar `/` → **Spel hosten** → Nieuw spel aanmaken
2. Deel de 6-letterige code met spelers
3. Wacht tot iedereen ingelogd is → klik **Start spel**
4. Speel nummers af via het zoekvenster
5. Bevestig of wijs BINGO-claims af
6. Lanceer bonusvragen tussen de nummers door

### Speler
1. Ga naar `/` → **Meedoen** → vul code + naam in
2. Wacht in de lobby
3. Vink nummers handmatig aan op de bingokaart
4. Druk op **BINGO CLAIMEN** als je een rij hebt

## Spelverloop

| Ronde | Doel | Punten (eerste BINGO) |
|-------|------|----------------------|
| 1 | 1 rij | 30 pt |
| 2 | 2 rijen | 50 pt |
| 3 | Volle kaart | 100 pt |

## Project structuur

```
app/
  page.tsx              # Landing page (join / host)
  host/[code]/page.tsx  # Host dashboard
  play/[code]/page.tsx  # Speler bingokaart
  api/
    games/create/       # POST: nieuw spel aanmaken
    games/[code]/       # GET/PATCH: spel ophalen/updaten
    players/            # GET/POST/PATCH: spelers beheren
lib/
  game-logic.ts         # Nummers, bingo-detectie, kaartgeneratie
  supabase.ts           # Supabase client
  types.ts              # TypeScript types
supabase/
  schema.sql            # Database schema (run in Supabase SQL editor)
```

## Deployen op Vercel

```bash
vercel deploy
```

Voeg de environment variabelen toe in het Vercel dashboard.
