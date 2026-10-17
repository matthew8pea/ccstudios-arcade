# Galactic Legends

A browser fighting game. Plain HTML/CSS/JS, no build step, no dependencies, no
package manager. It ships as a folder of static files uploaded to itch.io.

To run it: open `index.html`, or serve the folder over HTTP. There is nothing to
install and nothing to compile.

---

## The files

| file | what it is |
|---|---|
| `game.js` | **~19,500 lines.** Everything: data tables, combat, AI, menus, shop, save system. |
| `index.html` | All markup — menus, overlays, HUD, dev menu. |
| `styles.css` | All styling. |
| `sprite-kit.js` | Draws fighters. Weapon "families" decide how a weapon is held. |
| `snap-intro.js` | The Thanos Snap cutscene on the splash screen. Vaulted (`SNAP_INTRO_VAULTED` in `game.js`): it no longer plays by itself, and the `THANOS` redeem code plays it. |
| `validate.js` | Data-integrity checker. Run it after any data change. |
| `smoke.js` | Runtime smoke test: boots the page headless and plays a first match. `--duo` plays it as a 2v2. |
| `fortnite-pack.js` | A content pack. **Not loaded by index.html** — see Content packs. |
| `devlog.md` | Release notes drafted for itch.io. 2000-character limit per post. |
| `make-zip.bat` / `make-zip.ps1` | Builds `GalacticLegends.zip` in Downloads for the itch.io upload. Allow-list of shipped files: **a new file the game loads must be added to it.** |
| `cursors/` | The custom cursor images, five states at 1x and @2x, referenced only from `styles.css` (see CUSTOM CURSORS at its top). |
| `fonts/` | `Creepster-Regular.ttf` (SIL OFL, licence beside it) for the Halloween cards' titles (the splash tile uses Orbitron like the others), loaded by `@font-face` in `styles.css`. |

`sounds/`, `music/`, `aurebesh/`, `fonts/`, `cursors/` are assets. `node` is **not on PATH** — use
`"/c/Program Files/nodejs/node.exe"`.

---

## Rules that bite if you miss them

**Bump the cache-bust.** Editing `game.js`, `styles.css` or `sprite-kit.js`
means bumping its `?v=N` in `index.html`, or browsers serve the old file.

**Vault, don't delete. (unless stated otherwise)** Content that leaves the game is flagged out of
rotation, never deleted. `vaulted: true` on a record, or a `*_VAULTED` const for
a feature, filtered at one point of use. The ledger is `THE VAULT — INDEX` near
the top of `game.js`. Add a row there when you vault something.

**Cursors go through the `--cur-*` variables.** Never write `cursor: pointer`
(or `not-allowed`, `help`, `text`, `default`) as a keyword, in `styles.css`, inline
in `index.html` or from `game.js`: write `cursor: var(--cur-hand)` (`--cur-no`,
`--cur-help`, `--cur-text`, `--cur-arrow`). A keyword shows the OS cursor in the
middle of the custom set. The variables and the images are explained under
CUSTOM CURSORS at the top of `styles.css`.
**Sound effects play through Web Audio** (SOUND EFFECTS block in `game.js`, since
v94): `sfxSources` is the name -> URL table, `SfxVoice` decodes each file once and
plays a BufferSourceNode per shot through `sfxMaster` (the SFX slider), and
`sfxSounds` holds those voices. They mimic the few `<audio>` members the SFX code
uses, so `playSound`/`stopSound`/the fades read as before. Opened from disk
(`file://`) Chromium refuses `fetch()`, so `SFX_WEB_AUDIO` is false there and
`sfxSounds` holds real `<audio>` elements again; test sound changes over http
(smoke.js serves one) AND from disk. Music stays on `<audio>`. Add a sound by
adding a row to `sfxSources` and `sfxBaseVolumes` (and `SFX_LOOP_NAMES` if it loops).

**Letter and digit keys are physical.** `normalizeKey()` reads `e.code` for
`KeyA`-`KeyZ` and `Digit0`-`Digit9` and names them `'w'`, `'4'`, so the W A S D
defaults sit under the same fingers on AZERTY/QWERTZ/Cyrillic layouts. Labels come
from `keyFaces` (navigator.keyboard layout map, else learnt from key events), so a
French player's controls list reads Z Q S D. Everything else still goes by `e.key`.

The five shapes are traces of the Windows Aero cursors (aero_arrow, aero_link,
aero_unavail, aero_helpsel, beam_r) recoloured navy/cyan and scaled 1.2x around
the Windows hotspot, so the tip sits where the OS tip sits; the hotspot numbers
in `styles.css` belong to those images. Regenerate with
`/mnt/project-files/tools/cursor-trace/trace.py` (`python3 -I trace.py 1.2 out 1.0 1`,
Windows frames in its `win/` folder) rather than redrawing by hand.

**Run `validate.js`.** It cross-checks characters, weapons, arenas, shop items,
unlock flags and seasons, and prints the vault ledger. It never opens the page,
so it cannot catch anything at runtime.

**`validate.js` passing is not the same as the game working.** All of `game.js`
runs inside one `DOMContentLoaded` handler, so any throw during it aborts
everything after that line and leaves a blank or empty-looking page. `node
--check` and `validate.js` both pass while that is true. Load the page before
reporting a change as working — `smoke.js` does that in about 15 seconds.

**A throw inside `update()`/`draw()` behaves differently by build.** Locally it
kills the loop and the game freezes; on itch.io the shipped build catches it per
frame, so it becomes console spam and something missing rather than a freeze.
`debugStrictErrors` near the top of `game.js` decides which; `?debug=0` forces
the shipped behaviour locally.

**Never use GitHub for this project.** The owner's standing rule, permanently:
no `git push`, no pull requests, no `gh` commands, no remotes, and never suggest
them. Changes are made to the files in this folder directly. A change is
finished once `validate.js` and `smoke.js` pass; then report what changed. If a
check fails, report that instead.

---

## Where things live in `game.js`

Line numbers drift — search for the declaration if one is off.

### Data tables
| what | declaration | line |
|---|---|---|
| Weapon emoji | `const weaponEmoji` | 981 |
| Marvel season columns | `const MARVEL_SEASON` | 1012 |
| Halloween season columns | `const HALLOWEEN_SEASON` | 1148 |
| Arenas | `const ARENAS` | 1194 |
| Arena cover layouts | `const ARENA_LAYOUTS` | 1596 |
| Arena hazards | `const ARENA_HAZARDS` | 1876 |
| Achievements | `const achievements` | 2494 |
| Unlock flags | `let gameUnlocks` | 2532 |
| Halloween fallen fighters (save key `galacticDuelHalloween`) | `let halloweenFallen` / `HALLOWEEN_WORTH` | 2924 |
| Halloween event rounds and reward | `const HALLOWEEN_EVENT` | 18548 |
| Sprites | `const SPRITE_CATALOG` | 3389 |
| Shop | `const shopItems` | 3718 |
| Contract boards | `CONTRACT_POOL` / `STARK_POOL` / `GROOT_POOL` | 4470 / 4537 / 4775 |
| **Weapons** | `const WEAPON_LIBRARY` | 7437 |
| Forge patterns | `const FORGE_PATTERNS` | 8022 |
| AI profiles | `const TACTICAL_PROFILES` | 9794 |
| **Characters** | `const characters` | 10021 |
| Transform forms | `const TRANSFORM_FORMS` | 15853 |

`characters` has four groups: `heroes`, `villains`, `secret`, `unplayable`.
Every season fighter lives in `secret` and is pulled into the two main columns
by the season toggle.

### Key functions
| what | function | line |
|---|---|---|
| Start a match | `setupGame` | 14107 |
| The frame loop | `gameLoop` | 19032 |
| Per-frame logic / paint | `update` / `draw` | 16887 / 18183 |
| **All damage and status** | `applyStatusAndDamage` | 15313 |
| Fire one / several shots | `fireProjectile` / `fireSpreadProjectiles` | 14433 / 14463 |
| Melee swing | `beginMeleeSwing` / `resolveMeleeSwing` | 14647 / 14681 |
| Deflect a bolt | `tryDeflect` | 15015 |
| Explosions | `detonateBoomBoom` | 15528 |
| Transform into another fighter | `ironMongerTransform` | 15968 |
| Loki's disguise | `startShapeshift` | 16244 |
| Weapon fire sounds | `playWeaponFireSfx` | 6004 |
| Banner messages | `showAnnouncement` | 2986 |
| Is this fighter out of rotation | `isCharacterRetired` | 2737 |
| Merge a content pack | `applyContentPack` | 2712 |
| Halloween shield / summons / lord unlocks | `HALLOWEEN_SHIELD_IDS` / `HALLOWEEN_SUMMONS` / `HALLOWEEN_LORD_UNLOCKS` | 18228 / 18411 / 18507 |
| Halloween event: start a run / build a round / end a round | `startHalloweenRun` / `setupHalloweenRound` / `endHalloweenRound` | 18767 / 18822 / 19025 |
| Halloween event: waves, deaths, take-over | `updateHalloweenWave` / `onHalloweenTeamDeath` / `halloweenTakeOver` | 18934 / 18974 / 18996 |
| Duo fights: the picks, the partners, the hand-overs | `THE DUO` block: `takeDuoPick` / `surpriseDuo` / `spawnDuoPartner` / `duoTakeOver` / `updateDuoEnemyLead` | 15220 (state `duoMode` at 1167) |
| Shop: buy back a fallen fighter | `renderHalloweenReviveItems` / `reviveHalloweenFighter` | 4411 |
| Roster columns | `renderRosterColumn` / `rebuildAllRosters` | 10991 / 11032 |
| HUD cards | `syncPlayerHudCard` / `refreshHudIdentity` / `setEnemyHud` | 13649 / 13686 / 18494 |

---

## Systems worth knowing before you touch them

**Announcements defer during a battle.** `setupGame` sets
`deferAnnouncements = true` so end-of-match rewards do not pile up over the
fight. **Anything announced mid-fight must pass `forceShow: true`** (the last
argument) or the player sees it on the results screen instead. Every mid-battle
callout does this.

**Weapon sound is decided by two lists.** `playWeaponFireSfx` picks the firing
sound by weapon key. `BLUNT_WEAPON_KEYS` decides whether a melee weapon whistles
like a lightsaber (absent) or is silent through the air and speaks on impact
(present). **Every melee weapon that is not a lightsaber, darksaber or
electrostaff belongs in that list.**

**A new melee weapon also needs a sprite-kit family.** `FAMILY_MEMBERS` in
`sprite-kit.js` decides how it is held. Miss it and the weapon renders and swings
as a lightsaber. `validate.js` does not check this.

**Seasons are a view, not a state.** A season toggle swaps what the two faction
columns show. Fighters stay in the rosters they were declared in. `activeSeason()`
returns the current one or null; the secret row hides while one is active.
The base game has two, Marvel (`marvel: true`) and Halloween (`halloween: true`),
each with its own toggle beside the search field; turning one on turns the
other off.

**Content packs.** An optional file that adds a season's worth of characters,
weapons, arenas, shop entries and flags, merged by `applyContentPack()`. The
base game ships with none. `fortnite-pack.js` is one, and `index.html` does not
load it — adding one `<script>` tag above `game.js` puts it back. The pack file's
own header documents what stayed behind in `game.js` and why.

**A duo is a duel with a partner on each side.** The Duo switch on the opponent
screen (`duoMode`, saved with the settings) turns the one pick into three through
the same two columns: your partner, the opponent, their partner. The title and
the VS banner say which step is live; Back takes back the last pick; Surprise Me
fills what is left. `setupGame` reads `matchOpts.duo`, stores it in `seriesDuo`
and stands a `spawnDuoPartner()` beside each principal; Next Round and Rematch
hand `seriesDuo` back so the pair lasts the series. The four picked fighters
carry `duoMember` (a backup trooper or a summon does not). When the player's
fighter dies `duoTakeOver()` hands them the partner, as the event does; when the
opponent dies `updateDuoEnemyLead()` makes their partner `mainEnemy`, with the
principal flag. The round is won when no enemy is alive, which is the existing
check, and on the clock the sides are compared as pairs (`duoSidePct`).
Everything else — series, history, mastery, achievements, credits — is a duel's.
Partners use their weapon, not their Interact special, until they take the lead.

**The Halloween event is a run, not a match.** `halloweenRun` is non-null from
`startHalloweenRun()` until the run ends or the player leaves; `setupGame` still
builds each round, then `setupHalloweenRound()` rebuilds `entities` (the team,
the boss, the first wave). `gameLoop`, `startTimer`, `spawnHazards`, `endGame`
and `Character.updateHealth` each have one `halloweenRun` guard; the round end
is `endHalloweenRound()`, which reuses the result screen and relabels its
buttons (`resetBorrowedButtonLabels()` puts them back). A named team fighter
killed by an enemy goes into `halloweenFallen` and is saved at once; from then
on `isCharacterRetired()` keeps them out of every pick until the Shop's revive
row is bought. They still show in every roster column, greyed under a skull
with the revive price (`makeFallenButton`, the one retired case
`renderRosterColumn` draws); clicking one opens the Shop at the revive rows. Skeleton Warriors (`HALLOWEEN_EXPENDABLE_IDS`) die for the run only.
Nothing about a run itself is saved. The splash tile opens only once
`hasWonSeries` is true. Event rounds play `music/ThisIsHalloween.mp3`
(`halloweenBattleMusic`, checked first in `playBattleMusic`) and nothing else does.

**A roster entry can be bigger and slower.** `sizeMult` and `speedMult` on a
character (the Halloween Giant and the Twisted Giant: 2 and 0.6) are read by the
`Character` constructor off its id, so every way onto the field gets them.
`bodyScale()`/`bodyRadius()` turn the size into the sprite, the bolt hit test,
melee reach, the name plate height and the arena-edge margin; cover and walls
stay on `CHARACTER_SIZE`. Their Pumpkin Launcher is a one-round magazine
(`magSize: 1`, `reloadMs`), so the HUD shows the reload; sprite-kit draws the
pumpkin in its mouth while `loaded` (passed from `Character.draw`).

**The dev menu** is hidden on itch.io (`isDevMenuHost`). It carries grant
buttons, a Groot level slider, a strict-errors toggle and a Snap replay.

---

## Testing

`validate.js` covers the data. `smoke.js` covers the runtime, and both should
pass before an upload:

```
"/c/Program Files/nodejs/node.exe" validate.js
"/c/Program Files/nodejs/node.exe" smoke.js             # add --shipped for ?debug=0
"/c/Program Files/nodejs/node.exe" smoke.js --duo       # the same fight as a 2v2 (Rex and Dooku as partners)
```

`smoke.js` needs only Node and Edge or Chrome (`SMOKE_BROWSER` points it at one it
cannot find). On a fresh profile it plays the new-player path: checks the menu
opens already settled (the Snap is vaulted), enters the THANOS code to play the
Snap, checks no season card follows (also vaulted), then Freeplay, Anakin vs
Darth Maul on Mustafar, and 20 seconds of fighting.
It fails on any uncaught error or `console.error`, a menu button that never
shows up, or a clock that stops mid-round. It exits 0/1, prints the steps, and
saves the last arena frame as a PNG in the temp folder. **If a menu's buttons,
ids or `data-*` attributes change, update the probe in `smoke.js` to match.**
It is not loaded by `index.html`, so it needs no cache-bust.

For anything it does not cover, drive the real page the same way:
serve the folder over local HTTP, inject a probe script, and use headless Edge
with `--dump-dom`. `requestAnimationFrame` does **not** advance under
`--virtual-time-budget`, so shim it onto `setTimeout` or the game loop never
ticks.

The arena canvas is `#gameCanvas` — there is a second, blank canvas on the page
from the Snap intro. The canvas is not tainted, so a probe can export a real
frame with `toDataURL` and it can be viewed as an image.

Two traps worth repeating: seed a save to reach a feature and you may steer
around the branch that actual players hit, so also boot with no seed at all; and
a scripted player that holds the trigger is not skilled play, so damage readings
need a control fighter to compare against.

---

## House style

The code is heavily commented, and the comments explain **why** — what was tried,
what broke, what the number is paying for. Match that. When you change a tuning
value or a design decision, update the comment that justifies it; a stale
rationale is worse than none.
