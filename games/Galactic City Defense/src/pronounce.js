// How the dialogue voice should say things. The browser's text-to-speech reads Star Wars names like ordinary
// English ("Ta-too-INE", "Dook-you") and droid model numbers as letter salad, so every line is respelled just
// before it is spoken. Subtitles keep the proper spelling. To fix a word, add or change an entry here:
// [pattern, how to say it]. Patterns are whole words, any case; a trailing s (plural) and 's carry over.
// Respellings are single words, no hyphens: a hyphen makes the voice stop between the halves ("Tus. ken"). And
// avoid "Jah", which the voice reads as "Yah".
const WORDS = [
  // people
  ['Dooku', 'Dookoo'],
  // places
  ['Coruscant', 'Corrasahnt'],
  ['Tatooine', 'Tattooeen'],
  ['Kamino', 'Kameeno'],
  // peoples and things
  ['Jawas?', (m) => 'Jawwa' + (/s$/i.test(m) ? 's' : '')], // JAW-wuh
  ['Tuskens?', (m) => 'Tuskin' + (/s$/i.test(m) ? 's' : '')], // TUSK-in, one word
  ['Utinni', 'Uteeny'], // the Jawa cheer, "ew-TEEN-ee" (reads like utopia; "Oo..." comes out as "O, o")
  ['Ooteenee', 'Uteeny'],
  ['gaffi', 'gaffy'],
  ['gaderffii', 'gadderfee'],
  ['Seppie', 'Seppy'],
  ['skylanes?', (m) => 'sky lane' + (/s$/i.test(m) ? 's' : '')],
  ['holonet', 'holo net'],
  ['sandcrawler', 'sand crawler'],
  ['krayt', 'krate'],
  ['Makashi', 'Makahshee'],
  // units: say the numbers the way the troopers do
  ['212th', 'two-twelfth'],
  ['41st', 'forty-first'],
  ['501st', 'five-oh-first'],
  // droids, gunships, blasters
  ['B2-RP', 'B two R P'],
  ['B1s?', (m) => 'B one' + (/s$/i.test(m) ? 's' : '')],
  ['B2s?', (m) => 'B two' + (/s$/i.test(m) ? 's' : '')],
  ['BX', 'B X'],
  ['LAAT(?:/i)?', 'L A A T'],
  ['DC-15A', 'D C fifteen A'],
  ['DC-15S', 'D C fifteen S'],
  ['DC-17s?', (m) => 'D C seventeen' + (/s$/i.test(m) ? 's' : '')],
  ['BP', 'B P'],
  // noises
  ['Hmm+', 'Hmmm'],
  ['Hmph', 'Hmf'],
  ["'em", 'em'],
  // "uplink A" would come out as "uplink uh"
  ['uplink A', 'uplink Ay'],
];
// all-caps words that really are spelled out (anything else in capitals is a shout, read as a word)
const SPELLED = new Set(['HP', 'OK']);

const RULES = WORDS.map(([pat, say]) => [new RegExp(`(?<![\\w-])${pat}(?![\\w-])`, 'gi'), say]);

/** The line as the voice should read it. */
export function speakable(text) {
  let s = String(text);
  // a shout in capitals ("CODY, GET DOWN!") is read as words, not spelled out letter by letter
  s = s.replace(/\b[A-Z][A-Z']{2,}\b/g, (w) => (SPELLED.has(w) ? w : w[0] + w.slice(1).toLowerCase()));
  for (const [re, say] of RULES) s = s.replace(re, typeof say === 'function' ? say : () => say);
  return s;
}

/** Lines for trying the voice (dev menu): every awkward word in the game. */
export const VOICE_TEST = [
  ['fox', 'Jawas and Tusken Raiders, side by side. A Jawa. A Tusken.'],
  ['cody', 'Count Dooku. Coruscant. Tatooine. The Outer Rim.'],
  ['jawa', 'Utinni! Utinni!'],
  ['gree', 'The 41st holds. The 212th is on its way. Seppie dropship, inbound!'],
  ['yoda', 'Hmm. Strong with the Force, I am. To Tatooine we go.'],
  ['fox', 'B1s on the bridge, a B2 behind them, and a BX on the skylanes. CODY, GET DOWN!'],
];
