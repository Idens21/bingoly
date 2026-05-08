export const SONGS = [
  "Bohemian Rhapsody - Queen", "Blinding Lights - The Weeknd", "Numb - Linkin Park",
  "Uptown Funk - Bruno Mars", "Rolling in the Deep - Adele", "Smells Like Teen Spirit - Nirvana",
  "Leven in je Hoofd - Nielson", "Billie Jean - Michael Jackson", "Watermelon Sugar - Harry Styles",
  "Despacito - Luis Fonsi", "Alles Wat Je Wil - Anouk", "Levitating - Dua Lipa",
  "Mr Brightside - The Killers", "Shallow - Lady Gaga", "Lose Yourself - Eminem",
  "Stikje bij Stikje - Dio", "Good 4 U - Olivia Rodrigo", "Dans met mij - Kraantje Pappie",
  "Circles - Post Malone", "Peaches - Justin Bieber", "Sunflower - Post Malone",
  "Stay - The Kid LAROI", "Gewoon Zijn - Do", "Butter - BTS",
  "Amsterdam - Marco Borsato", "drivers license - Olivia Rodrigo", "Montero - Lil Nas X",
  "Samen in de Zon - Wolter Kroes", "Leave the Door Open - Silk Sonic", "Ze Gelooft in Mij - Andre Hazes",
  "Shape of You - Ed Sheeran", "Flowers - Miley Cyrus", "Anti-Hero - Taylor Swift",
  "Zoutelande - Blof", "As It Was - Harry Styles", "Vrijheid - De Dijk",
  "Unholy - Sam Smith", "Cruel Summer - Taylor Swift", "Escapism - RAYE",
  "Mooi Weer - Nielson", "Vampire - Olivia Rodrigo", "Suzanne - Blof",
  "Tosti - Broederliefde", "Kill Bill - SZA", "Golden Hour - JVKE",
  "Waterval - Maan", "Rich Flex - Drake", "Hou Me Vast - Andre Hazes Jr",
  "Kijk Omhoog - Snelle", "Sterren - Davina Michelle",
]

export const QUESTIONS = [
  { q: "In welk jaar werd Bohemian Rhapsody uitgebracht?", opts: ["1973","1975","1977","1979"], ans: 1, pts: 10 },
  { q: "Welke artiest staat bekend als The King of Pop?", opts: ["Prince","Michael Jackson","Elvis","David Bowie"], ans: 1, pts: 10 },
  { q: "Uit welk land komt de band U2?", opts: ["Engeland","Schotland","Ierland","Wales"], ans: 2, pts: 10 },
  { q: "Hoeveel Grammys won Adele voor haar album 21?", opts: ["4","5","6","7"], ans: 2, pts: 15 },
  { q: "Welke artiest scoorde een hit met Leven in je Hoofd?", opts: ["Snelle","Bizzey","Nielson","Davina Michelle"], ans: 2, pts: 10 },
  { q: "In welk jaar brak Ed Sheeran door met Shape of You?", opts: ["2015","2016","2017","2018"], ans: 2, pts: 10 },
]

export const LINES = [
  [0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19],[20,21,22,23,24],
  [0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],[3,8,13,18,23],[4,9,14,19,24],
  [0,6,12,18,24],[4,8,12,16,20],
]

export const ROUND_POINTS = [0, 30, 50, 100] as const

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function makeCard(): string[] {
  const picked = shuffle(SONGS).slice(0, 24)
  picked.splice(12, 0, "FREE")
  return picked
}

export function countLines(marked: Set<number>, card: string[]): number {
  return LINES.filter(l => l.every(i => marked.has(i) || card[i] === "FREE")).length
}

export function hasGoal(marked: Set<number>, card: string[], round: number): boolean {
  if (round === 1) return countLines(marked, card) >= 1
  if (round === 2) return countLines(marked, card) >= 2
  return card.every((c, i) => c === "FREE" || marked.has(i))
}

export function isCloseToLine(marked: Set<number>, card: string[]): boolean {
  return LINES.some(l => l.filter(i => !marked.has(i) && card[i] !== "FREE").length === 1)
}

export function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}
