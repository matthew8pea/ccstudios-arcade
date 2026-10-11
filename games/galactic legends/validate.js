#!/usr/bin/env node
/*
 * Galactic Legends — static data validation
 * =========================================
 *
 *   node validate.js          # human-readable report
 *   node validate.js --quiet  # errors only
 *
 * Exits 1 if any error is found, 0 otherwise, so it can be wired into a
 * pre-upload check or CI step.
 *
 * WHY THIS EXISTS
 * ---------------
 * The game's data tables (roster, weapons, arenas, shop, achievements, unlock
 * flags) are cross-referenced by string key in five or six different places.
 * Adding a character means registering it in several of them, and missing one
 * fails silently: the character simply never appears, or appears and can never
 * be unlocked. The in-game dev-menu validator catches some of this, but it only
 * runs if you open the dev menu and click the button, and it cannot see
 * index.html at all. This runs without a browser.
 *
 * HOW IT READS THE DATA
 * ---------------------
 * game.js is one ~7,700-line IIFE, so nothing can be imported from it. Instead
 * the data literals are located by their declaration text, sliced out by
 * matching delimiters, and evaluated in a throwaway `vm` context. Function
 * values inside those literals (the arena `bg` painters, for instance) are
 * never called, so their references to browser globals do not matter.
 *
 * The trade-off: this depends on the declarations keeping their current names
 * and staying plain literals. If one is renamed or becomes computed, the
 * extraction fails loudly with a clear message rather than silently skipping
 * checks — see EXTRACTION FAILED in the output.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const QUIET = process.argv.includes('--quiet');

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

// ── SOURCE SLICING ─────────────────────────────────────────────────────────

/**
 * Walks forward from `start` (the index of an opening { or [) and returns the
 * index just past its matching close. Skips over comments, all three string
 * forms, and regex literals so delimiters inside them are not counted.
 */
function matchDelimiter(src, start) {
    const open = src[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;

    for (let i = start; i < src.length; i++) {
        const c = src[i];
        const next = src[i + 1];

        // Comments
        if (c === '/' && next === '/') {
            i = src.indexOf('\n', i);
            if (i === -1) break;
            continue;
        }
        if (c === '/' && next === '*') {
            i = src.indexOf('*/', i + 2);
            if (i === -1) break;
            i++;
            continue;
        }

        // Strings and template literals
        if (c === '"' || c === "'" || c === '`') {
            const quote = c;
            i++;
            while (i < src.length) {
                if (src[i] === '\\') { i += 2; continue; }
                if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
                    // Template placeholder — recurse so nested braces balance.
                    i = matchDelimiter(src, i + 1);
                    continue;
                }
                if (src[i] === quote) break;
                i++;
            }
            continue;
        }

        // Regex literal. Distinguished from division by what precedes it: a
        // regex can only follow an operator or an opening delimiter.
        if (c === '/') {
            let k = i - 1;
            while (k >= 0 && /\s/.test(src[k])) k--;
            const prev = k >= 0 ? src[k] : '';
            if (prev === '' || '=(,:[!&|?{};+-*%<>~^'.includes(prev)) {
                i++;
                let inClass = false;
                while (i < src.length) {
                    if (src[i] === '\\') { i += 2; continue; }
                    if (src[i] === '[') inClass = true;
                    else if (src[i] === ']') inClass = false;
                    else if (src[i] === '/' && !inClass) break;
                    else if (src[i] === '\n') break;
                    i++;
                }
                continue;
            }
        }

        if (c === open) depth++;
        else if (c === close) {
            depth--;
            if (depth === 0) return i + 1;
        }
    }
    throw new Error(`unbalanced ${open} starting at index ${start}`);
}

/** Slices out `<declaration><literal>` and evaluates the literal. */
function extractLiteral(src, declaration, label) {
    const at = src.indexOf(declaration);
    if (at === -1) throw new Error(`could not find \`${declaration}\``);
    if (src.indexOf(declaration, at + 1) !== -1) {
        throw new Error(`\`${declaration}\` appears more than once — cannot tell which is the real ${label}`);
    }
    const open = at + declaration.length - 1; // declaration ends with { or [
    const end = matchDelimiter(src, open);
    const literal = src.slice(open, end);

    const sandbox = {};
    vm.createContext(sandbox);
    try {
        return vm.runInContext(`(${literal})`, sandbox, { timeout: 5000 });
    } catch (e) {
        throw new Error(`${label} did not evaluate as a plain literal: ${e.message}`);
    }
}

// ── LOAD ───────────────────────────────────────────────────────────────────

const gameJsPath = path.join(ROOT, 'game.js');
const indexPath = path.join(ROOT, 'index.html');

if (!fs.existsSync(gameJsPath)) {
    console.error(`Cannot find game.js next to this script (looked in ${ROOT}).`);
    process.exit(1);
}

const src = fs.readFileSync(gameJsPath, 'utf8');
const html = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : null;

const TABLES = [
    ['characters',     'const characters = {'],
    ['WEAPON_LIBRARY', 'const WEAPON_LIBRARY = {'],
    ['ARENAS',         'const ARENAS = {'],
    ['shopItems',      'const shopItems = ['],
    ['achievements',   'const achievements = {'],
    ['gameUnlocks',    'let gameUnlocks = {'],
    ['ELITE_BASE_IDS', 'const ELITE_BASE_IDS = {'],
    ['weaponEmoji',    'const weaponEmoji = {'],
    ['ARENA_HAZARDS',  'const ARENA_HAZARDS = {'],
    ['cloneBackupArmy',       'const cloneBackupArmy = {'],
    ['cloneTrooperBattalion', 'const cloneTrooperBattalion = {'],
    ['MARVEL_SEASON',         'const MARVEL_SEASON = {'],
    // Read for the vault report below — see THE VAULT — INDEX in game.js.
    ['SPRITE_CATALOG',        'const SPRITE_CATALOG = ['],
    ['FORGE_PATTERNS',        'const FORGE_PATTERNS = ['],
];

/*  The feature-level vault switches are plain consts rather than table rows, so
 *  they are read off the source text. A rename shows up as `?` in the report
 *  rather than as a silent `false`, which would claim the layer is live. */
function readVaultSwitch(src, name) {
    const m = new RegExp('const\\s+' + name + '\\s*=\\s*(true|false)\\s*;').exec(src);
    return m ? m[1] === 'true' : null;
}

const data = {};
for (const [name, decl] of TABLES) {
    try {
        data[name] = extractLiteral(src, decl, name);
    } catch (e) {
        err(`EXTRACTION FAILED — ${name}: ${e.message}`);
    }
}

if (errors.length) {
    console.error('\nCould not read the data tables out of game.js:\n');
    errors.forEach(e => console.error('  ✗ ' + e));
    console.error('\nThe declarations this script looks for may have been renamed or reshaped.');
    process.exit(1);
}

const { characters, WEAPON_LIBRARY, ARENAS, shopItems, achievements, gameUnlocks, ELITE_BASE_IDS,
        weaponEmoji, ARENA_HAZARDS, cloneBackupArmy, cloneTrooperBattalion,
        MARVEL_SEASON, SPRITE_CATALOG, FORGE_PATTERNS } = data;

// Every character across every faction, tagged with the faction it came from.
const allChars = [];
for (const faction of Object.keys(characters)) {
    const roster = characters[faction];
    if (!Array.isArray(roster)) continue;
    roster.forEach((char, idx) => allChars.push({ char, faction, idx }));
}
const label = ({ char, faction, idx }) =>
    `[${faction}] ${char && char.name ? `"${char.name}"` : `entry #${idx + 1}`} (${char && char.id ? char.id : 'no id'})`;

const charIds = new Set(allChars.map(e => e.char && e.char.id).filter(Boolean));

// ── CHECKS ─────────────────────────────────────────────────────────────────

// 1. Required fields, field types, unique ids.
const REQUIRED = ['id', 'name', 'color', 'hp', 'weapon'];
const seenIds = new Map();
for (const entry of allChars) {
    const { char } = entry;
    if (!char || typeof char !== 'object') {
        err(`${label(entry)} — not an object`);
        continue;
    }
    for (const field of REQUIRED) {
        const v = char[field];
        if (v === undefined || v === null || v === '') {
            err(`${label(entry)} — missing required field "${field}"`);
        }
    }
    if (char.hp !== undefined && (typeof char.hp !== 'number' || !(char.hp > 0))) {
        err(`${label(entry)} — "hp" must be a positive number, got ${JSON.stringify(char.hp)}`);
    }
    if (char.weaponDamage !== undefined && (typeof char.weaponDamage !== 'number' || !(char.weaponDamage > 0))) {
        err(`${label(entry)} — "weaponDamage" must be a positive number, got ${JSON.stringify(char.weaponDamage)}`);
    }
    if (char.id) {
        if (seenIds.has(char.id)) err(`Duplicate character id "${char.id}" — already used by ${seenIds.get(char.id)}`);
        else seenIds.set(char.id, label(entry));
    }
}

// 2. Weapons resolve, and every weapon has a HUD emoji.
for (const entry of allChars) {
    const w = entry.char && entry.char.weapon;
    if (w && !WEAPON_LIBRARY[w]) err(`${label(entry)} — unknown weapon "${w}" (not in WEAPON_LIBRARY)`);
}
for (const key of Object.keys(WEAPON_LIBRARY)) {
    if (!weaponEmoji[key]) warn(`Weapon "${key}" has no entry in weaponEmoji — the HUD will fall back to a default icon`);
    if (WEAPON_LIBRARY[key].key !== key) {
        err(`WEAPON_LIBRARY.${key} has key: "${WEAPON_LIBRARY[key].key}" — the self-reference must match its own table key`);
    }
}

// 3. Achievement cross-references.
for (const entry of allChars) {
    const a = entry.char && entry.char.unlockAchievement;
    if (a && !achievements[a]) err(`${label(entry)} — unlockAchievement "${a}" matches no achievement id`);
}
for (const key of Object.keys(achievements)) {
    if (achievements[key].id !== key) {
        err(`achievements.${key} has id: "${achievements[key].id}" — the self-reference must match its own table key`);
    }
}

// 4. Elite aliases must point at characters that exist.
for (const [eliteId, baseId] of Object.entries(ELITE_BASE_IDS)) {
    if (!charIds.has(eliteId)) err(`ELITE_BASE_IDS maps "${eliteId}", which is not a character id`);
    if (!charIds.has(baseId)) err(`ELITE_BASE_IDS maps "${eliteId}" to base "${baseId}", which is not a character id`);
}

// 5. Secret-unlock registration. A secretUnlock key is only fully wired when it
//    appears at all four sites; missing any one fails silently in-game.
const unlockKeys = new Set(Object.keys(gameUnlocks));
const secretUnlockUsers = new Map(); // key -> [labels]
for (const entry of allChars) {
    const k = entry.char && entry.char.secretUnlock;
    if (!k) continue;
    if (!secretUnlockUsers.has(k)) secretUnlockUsers.set(k, []);
    secretUnlockUsers.get(k).push(label(entry));
}

// Site 1: declared on a character. Site 2: present in gameUnlocks.
for (const [key, users] of secretUnlockUsers) {
    if (!unlockKeys.has(key)) {
        err(`secretUnlock "${key}" (used by ${users.join(', ')}) is not a key in gameUnlocks — it can never be set or persisted`);
    }
}
// Every flag named by a `retiredBy`, flattened — the field takes one key or an
// array of them (The Visitor is ended by either 'geno' or the Zero Event, and
// whichever happens first is the one that retires him).
const retiredByKeys = (char) => {
    const v = char && char.retiredBy;
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
};
const retirementFlags = new Set();
for (const entry of allChars) {
    for (const k of retiredByKeys(entry.char)) retirementFlags.add(k);
}

// Flags the game reads but no longer writes. A deleted feature can leave one
// behind: the save field stays so a player who earned something keeps it, and
// every reference to it is deliberately one-way from then on. Listed here rather
// than silenced case by case, so the list is the record of which ones those are.
//
// Declared up here rather than beside the retirement check that also reads it:
// the orphan-flag loop below needs it first, and a `const` read before its own
// declaration throws even through `typeof`.
const LEGACY_FLAGS = new Set([
    // Set only by the Zero Event, which was removed. A save that cleared the run
    // keeps what it earned — Wrixel, the Unstable Zero Point, and the pack
    // retirements below — and no new save can ever set it.
    'zeroEventCleared',
]);

// Orphan flags: a gameUnlocks key nothing actually gates on. Retiring a
// character is a real use of a flag, so a key that only ever appears in a
// `retiredBy` is doing its job and is not dead.
for (const key of unlockKeys) {
    if (!secretUnlockUsers.has(key) && !retirementFlags.has(key)) {
        if (LEGACY_FLAGS.has(key)) continue;
        warn(`gameUnlocks.${key} is never referenced by any character's secretUnlock or retiredBy — dead flag, or the character is missing`);
    }
}

// Site 3: something grants it. Either a shop item whose id is the key (bought
// through gameUnlocks[item.id] = true), or an explicit assignment in source.
const explicitGrants = new Set(
    [...src.matchAll(/gameUnlocks\.(\w+)\s*=\s*true/g)].map(m => m[1])
);
const shopIds = new Set(shopItems.map(i => i.id));
for (const [key, users] of secretUnlockUsers) {
    if (!explicitGrants.has(key) && !shopIds.has(key)) {
        err(`secretUnlock "${key}" (${users.join(', ')}) has no way to be granted — no shop item with that id and no \`gameUnlocks.${key} = true\` anywhere in game.js`);
    }
}

// Site 4: the dev menu's Unlock All Secrets. Shop-purchased unlocks are
// deliberately excluded from it, so only non-shop keys are required.
const devBlockMatch = src.match(/devUnlockAllSecrets\.addEventListener\([\s\S]*?\}\);/);
if (!devBlockMatch) {
    warn('Could not locate the devUnlockAllSecrets handler — skipping its coverage check');
} else {
    const devGrants = new Set([...devBlockMatch[0].matchAll(/gameUnlocks\.(\w+)\s*=\s*true/g)].map(m => m[1]));
    for (const key of secretUnlockUsers.keys()) {
        if (shopIds.has(key)) continue; // bought, not a secret to unlock
        if (!devGrants.has(key)) {
            warn(`"Unlock All Secrets" does not set gameUnlocks.${key} — that character stays hidden when testing`);
        }
    }
}

// 6. Shop items must name real, unlockable characters.
const shopSeen = new Set();
for (const item of shopItems) {
    if (!item || !item.id) { err('Shop item with no id'); continue; }
    if (shopSeen.has(item.id)) err(`Duplicate shop item id "${item.id}"`);
    shopSeen.add(item.id);

    if (typeof item.cost !== 'number' || !(item.cost > 0)) {
        err(`Shop item "${item.id}" — cost must be a positive number, got ${JSON.stringify(item.cost)}`);
    }
    if (!unlockKeys.has(item.id)) {
        err(`Shop item "${item.id}" is not a key in gameUnlocks — buying it sets a flag nothing reads`);
    }
    if (!secretUnlockUsers.has(item.id)) {
        err(`Shop item "${item.id}" unlocks nothing — no character has secretUnlock: "${item.id}"`);
    }
}

// 7. Arenas: index.html and ARENAS must agree.
if (html) {
    const htmlArenas = new Set(
        [...html.matchAll(/data-arena="([^"]*)"/g)].map(m => m[1]).filter(Boolean)
    );
    for (const key of htmlArenas) {
        if (!ARENAS[key]) err(`index.html has an arena button for "${key}" but ARENAS has no such entry — picking it will break the match`);
    }
    for (const key of Object.keys(ARENAS)) {
        if (!htmlArenas.has(key)) warn(`ARENAS.${key} has no button in index.html — the arena is unreachable`);
    }
} else {
    warn('index.html not found next to game.js — skipping the arena button cross-check');
}

// 8. Cosmetic completeness.
for (const entry of allChars) {
    const { char, faction } = entry;
    if (!char) continue;
    if (char.weapon === 'lightsaber' && !char.saberColor) warn(`${label(entry)} — lightsaber user with no saberColor`);
    if (!char.bio && faction !== 'unplayable') warn(`${label(entry)} — no bio`);
}

// 9. Clone backup coverage. Every clone calls in reinforcements on its own at
//    low health, and the unit that answers is resolved through cloneBackupArmy
//    (commanders and captains), cloneTrooperBattalion (named troopers), or the
//    clone's own id (rank-and-file). A clone matching none of the three calls
//    nobody at all — quiet, and impossible to notice without playing him down
//    to half health, which is exactly the kind of silent gap this file exists
//    to catch.
const backupUnitIds = new Set(Object.values(cloneBackupArmy).map(i => i.unitId));

for (const [unitId, info] of Object.entries(cloneBackupArmy)) {
    if (!charIds.has(unitId)) err(`cloneBackupArmy has an entry for "${unitId}", which is not a character id`);
    if (!charIds.has(info.unitId)) err(`cloneBackupArmy.${unitId} calls in "${info.unitId}", which is not a character id`);
}

for (const [named, unit] of Object.entries(cloneTrooperBattalion)) {
    if (!charIds.has(named)) err(`cloneTrooperBattalion maps "${named}", which is not a character id`);
    if (!backupUnitIds.has(unit)) err(`cloneTrooperBattalion maps "${named}" to battalion "${unit}", which no commander in cloneBackupArmy calls in`);
}

for (const entry of allChars) {
    const { char } = entry;
    if (!char || !char.isClone) continue;
    const baseId = ELITE_BASE_IDS[char.id] || char.id;
    if (cloneBackupArmy[baseId]) continue;                       // a commander or captain
    if (backupUnitIds.has(cloneTrooperBattalion[baseId] || baseId)) continue;  // named trooper, or a battalion himself
    err(`${label(entry)} — clone with no reinforcements: "${baseId}" is not a commander in cloneBackupArmy, is not mapped in cloneTrooperBattalion, and is not itself a battalion unit. He will call no one at low health.`);
}

// 10. The content pack, if one is present. It is not loaded by the game, so
//     nothing else here can see it — but a pack whose season lists an id it
//     does not ship is a column with a hole in it the moment it IS loaded.
const packPath = path.join(ROOT, 'fortnite-pack.js');
if (fs.existsSync(packPath)) {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    try {
        vm.runInContext(fs.readFileSync(packPath, 'utf8'), sandbox, { timeout: 5000 });
    } catch (e) {
        err(`fortnite-pack.js did not evaluate: ${e.message}`);
    }
    const pack = sandbox.window.GL_CONTENT_PACK;
    if (!pack) {
        err('fortnite-pack.js does not set window.GL_CONTENT_PACK');
    } else {
        const packIds = new Set((pack.characters || []).map(c => c.id));
        const placed = new Map();
        for (const side of ['heroes', 'villains']) {
            const col = pack.season && pack.season[side];
            if (!col || !col.title || !Array.isArray(col.ids)) {
                err(`pack season.${side} — needs a title and an ids array`);
                continue;
            }
            for (const id of col.ids) {
                if (!packIds.has(id)) err(`pack season.${side} lists "${id}", which the pack does not ship`);
                if (placed.has(id)) err(`pack season lists "${id}" on both sides`);
                else placed.set(id, side);
            }
        }
        for (const c of pack.characters || []) {
            if (!placed.has(c.id)) err(`pack character "${c.id}" is on neither side of the season — the toggle would hide them`);
            if (c.weapon && !(pack.weapons || {})[c.weapon] && !WEAPON_LIBRARY[c.weapon])
                err(`pack character "${c.id}" carries "${c.weapon}", which neither the pack nor the base game defines`);
            if (c.secretUnlock && !(c.secretUnlock in (pack.unlocks || {})))
                err(`pack character "${c.id}" needs unlock flag "${c.secretUnlock}", which the pack does not seed`);
        }
        for (const i of pack.shopItems || []) {
            if (!packIds.has(i.id) ) err(`pack shop item "${i.id}" unlocks nothing the pack ships`);
        }
        for (const k of Object.keys(pack.arenaHazards || {})) {
            if (!(pack.arenas || {})[k]) err(`pack hazard "${k}" has no matching arena in the pack`);
        }
    }
}

// 10b. The Marvel season, on exactly the same rule. It gets its own block because
//      it is a single object rather than a table of them, but the failure is
//      identical and it is not hypothetical: the Hulk was added to
//      characters.secret with `marvel: true` and every other field correct, and
//      was invisible on the grid until he was listed here too. A `marvel: true`
//      record is the fighter; MARVEL_SEASON is whether anyone can pick him.
if (!MARVEL_SEASON || typeof MARVEL_SEASON !== 'object') {
    err('MARVEL_SEASON is missing — the Marvel toggle has no columns to build');
} else {
    const marvelCharIds = new Set(allChars.filter(e => e.char && e.char.marvel).map(e => e.char.id));
    if (!MARVEL_SEASON.label) err('MARVEL_SEASON — no label, which the toggle names the season with');

    const placed = new Map();
    for (const side of ['heroes', 'villains']) {
        const col = MARVEL_SEASON[side];
        if (!col || !col.title || !Array.isArray(col.ids)) {
            err(`MARVEL_SEASON.${side} — needs a title and an ids array`);
            continue;
        }
        for (const id of col.ids) {
            if (!charIds.has(id)) err(`MARVEL_SEASON.${side} lists "${id}", which is not a character id`);
            else if (!marvelCharIds.has(id)) err(`MARVEL_SEASON.${side} lists "${id}", who has no \`marvel: true\` — the column only ever shows with the season on`);
            if (placed.has(id)) err(`MARVEL_SEASON lists "${id}" on both sides (${placed.get(id)} and ${side})`);
            else placed.set(id, side);
        }
    }

    for (const id of marvelCharIds) {
        if (!placed.has(id)) err(`MARVEL_SEASON does not place "${id}" on either side — the Marvel faction view will not show them at all`);
    }
}


// 11. Retirement. A character with `retiredBy` leaves every roster the moment
//     that flag is set, so a typo in it is a character who never leaves — or,
//     worse, one who leaves on a flag that means something else.
for (const entry of allChars) {
    for (const key of retiredByKeys(entry.char)) {
        if (!unlockKeys.has(key)) {
            err(`${label(entry)} — retiredBy "${key}" is not a key in gameUnlocks, so they can never be retired`);
        } else if (LEGACY_FLAGS.has(key)) {
            // Not an error and not a warning: this is the documented end state.
        } else if (!explicitGrants.has(key) && !shopIds.has(key)) {
            err(`${label(entry)} — retiredBy "${key}" is a flag nothing ever sets`);
        }
    }
}

// ── ARENA HAZARDS ──────────────────────────────────────────────────────────
// A hazard keyed to an arena that does not exist is silently dead: spawnHazards
// looks it up by currentArena and finds nothing, so the arena just plays flat
// and nothing ever reports it.
const HAZARD_KINDS = new Set(['zone', 'sweeper', 'barrier', 'wind', 'singularity']);
const arenaKeys = new Set(Object.keys(ARENAS));

for (const [arena, cfg] of Object.entries(ARENA_HAZARDS || {})) {
    const at = `ARENA_HAZARDS.${arena}`;
    if (!arenaKeys.has(arena)) {
        err(`${at} — no such arena in ARENAS`);
        continue;
    }
    if (!cfg || !HAZARD_KINDS.has(cfg.kind)) {
        err(`${at} — unknown hazard kind ${cfg ? JSON.stringify(cfg.kind) : '(none)'}`);
        continue;
    }
    if (cfg.kind === 'zone') {
        if (!Array.isArray(cfg.circles) || !cfg.circles.length) err(`${at} — zone with no circles`);
        else cfg.circles.forEach((c, i) => {
            if (!(c.x >= 0 && c.x <= 1) || !(c.y >= 0 && c.y <= 1)) err(`${at} circle #${i + 1} — x/y must be 0-1 fractions`);
            if (!(c.r > 0)) err(`${at} circle #${i + 1} — radius must be positive`);
        });
        if (!cfg.damage && !cfg.slow) warn(`${at} — zone neither damages nor slows, so it does nothing`);
        if (cfg.damage && !(cfg.intervalMs > 0)) err(`${at} — damaging zone needs a positive intervalMs`);
        if (cfg.slow != null && !(cfg.slow > 0 && cfg.slow <= 1)) err(`${at} — slow must be in (0, 1]`);
    } else if (cfg.kind === 'barrier') {
        if (!Array.isArray(cfg.rects) || !cfg.rects.length) err(`${at} — barrier with no rects`);
        if (!(cfg.onMs > 0) || !(cfg.offMs > 0)) err(`${at} — barrier needs positive onMs and offMs`);
        // A barrier that is never down walls the arena in permanently.
        if (cfg.offMs != null && cfg.offMs < 400) warn(`${at} — offMs under 400ms leaves almost no gap to pass through`);
    } else if (cfg.kind === 'sweeper') {
        if (!(cfg.speed > 0)) err(`${at} — sweeper needs a positive speed`);
        if (!(cfg.radius > 0)) err(`${at} — sweeper needs a positive radius`);
        if (!(cfg.spawnMs > 0)) err(`${at} — sweeper needs a positive spawnMs`);
        if (!['h', 'v', 'any'].includes(cfg.axis)) err(`${at} — axis must be 'h', 'v' or 'any'`);
    } else if (cfg.kind === 'wind') {
        if (!(cfg.strength > 0)) err(`${at} — wind needs a positive strength`);
        if (!(cfg.shiftMs > 0)) err(`${at} — wind needs a positive shiftMs`);
    } else if (cfg.kind === 'singularity') {
        if (!(cfg.x >= 0 && cfg.x <= 1) || !(cfg.y >= 0 && cfg.y <= 1)) err(`${at} — x/y must be 0-1 fractions`);
        if (!(cfg.radiusPct > 0)) err(`${at} — needs a positive radiusPct`);
        // Over about a third of the short side and there is no room left to fight
        // around it; banishToRandomSpot would also start failing to find anywhere
        // legal to land and fall back to a corner every time.
        if (cfg.radiusPct > 0.33) err(`${at} — radiusPct ${cfg.radiusPct} swallows the arena`);
        if (!(cfg.damage > 0)) err(`${at} — needs positive damage`);
        if (!(cfg.cooldownMs > 0)) err(`${at} — needs a positive cooldownMs, or it would re-trigger every frame`);
    }
}

// An oversized arena needs cover placed in fractions (which ARENA_LAYOUTS always
// is) and a sane scale — past about 3x the fighters are specks.
for (const [arena, cfg] of Object.entries(ARENAS)) {
    if (cfg.worldScale == null) continue;
    if (!(cfg.worldScale >= 1)) err(`ARENAS.${arena} — worldScale must be at least 1`);
    if (cfg.worldScale > 3) warn(`ARENAS.${arena} — worldScale ${cfg.worldScale} zooms out far enough that characters become specks`);
}

const arenasWithoutHazards = [...arenaKeys].filter(a => !(ARENA_HAZARDS || {})[a]);
if (arenasWithoutHazards.length) {
    warn(`arenas with no hazard (they play flat): ${arenasWithoutHazards.join(', ')}`);
}

// ── REPORT ─────────────────────────────────────────────────────────────────

const factionCounts = Object.keys(characters)
    .filter(f => Array.isArray(characters[f]))
    .map(f => `${f} ${characters[f].length}`)
    .join(', ');

if (!QUIET) {
    console.log('');
    console.log('Galactic Legends — data validation');
    console.log('──────────────────────────────────');
    console.log(`  characters   ${allChars.length}  (${factionCounts})`);
    console.log(`  weapons      ${Object.keys(WEAPON_LIBRARY).length}`);
    console.log(`  arenas       ${Object.keys(ARENAS).length}`);
    console.log(`  achievements ${Object.keys(achievements).length}`);
    console.log(`  shop items   ${shopItems.length}`);
    console.log(`  unlock flags ${unlockKeys.size}`);
    console.log(`  hazards      ${Object.keys(ARENA_HAZARDS || {}).length} of ${arenaKeys.size} arenas`);
    console.log('');

    /*  ── THE VAULT ──────────────────────────────────────────────────────
     *  What is out of rotation right now, and what puts it back. Vaulted data
     *  is never deleted, so it is invisible in every count above — this is the
     *  only place the totals and the live game are reconciled. The authoritative
     *  list of vaults is THE VAULT — INDEX at the top of game.js; this prints
     *  what those flags are actually set to. */
    const poisonSpitVaulted = readVaultSwitch(src, 'POISON_SPIT_VAULTED');
    const state = (v) => v === null ? '? (switch not found — renamed?)' : (v ? 'VAULTED' : 'live');

    // Characters carrying a flat `vaulted: true` — out unconditionally, as
    // opposed to `retiredBy`, which retires on an unlock flag.
    const vaultedChars = allChars.filter(e => e.char && e.char.vaulted);
    const vaultedSprites = (SPRITE_CATALOG || []).filter(s => s && s.vaulted);
    const vaultedPatterns = (FORGE_PATTERNS || []).filter(p => p && p.vaulted);
    const vaultedWeapons = Object.keys(WEAPON_LIBRARY || {})
        .filter(k => WEAPON_LIBRARY[k] && WEAPON_LIBRARY[k].vaulted);

    console.log('The vault  (out of rotation, data retained)');
    console.log('──────────────────────────────────');
    const packLoaded = html && html.indexOf('fortnite-pack.js') >= 0;
    console.log(`  Content pack        ${fs.existsSync(packPath) ? (packLoaded ? 'LOADED by index.html' : 'present, NOT loaded') : 'no pack file'}`);
    console.log(`  Poison Spit         ${state(poisonSpitVaulted)}  — POISON_SPIT_VAULTED`);
    console.log(`  Characters          ${vaultedChars.length} vaulted outright` +
                (vaultedChars.length ? `  — ${vaultedChars.map(e => e.char.id).join(', ')}` : ''));
    console.log(`  Sprites             ${vaultedSprites.length} of ${(SPRITE_CATALOG || []).length} vaulted` +
                (vaultedSprites.length ? `  — ${vaultedSprites.map(s => s.id).join(', ')}` : ''));
    console.log(`  Weapons             ${vaultedWeapons.length} of ${Object.keys(WEAPON_LIBRARY || {}).length} vaulted` +
                (vaultedWeapons.length ? `  — ${vaultedWeapons.join(', ')}` : ''));
    console.log(`  Forge patterns      ${vaultedPatterns.length} of ${(FORGE_PATTERNS || []).length} vaulted` +
                (vaultedPatterns.length ? `  — ${vaultedPatterns.map(p => p.baseKey).join(', ')}` : ''));

    console.log(`  → in rotation       ${allChars.length - vaultedChars.length} of ${allChars.length} characters` +
                `  (${vaultedChars.length} vaulted)`);
    console.log('');
}

if (errors.length) {
    console.log(`Errors (${errors.length})`);
    errors.forEach(e => console.log('  ✗ ' + e));
    console.log('');
}

if (warnings.length && !QUIET) {
    console.log(`Warnings (${warnings.length})`);
    warnings.forEach(w => console.log('  ! ' + w));
    console.log('');
}

if (!errors.length && !warnings.length) {
    console.log('✓ No issues found.');
} else if (!errors.length) {
    console.log(`✓ No errors. ${warnings.length} warning(s).`);
}

process.exit(errors.length ? 1 : 0);
