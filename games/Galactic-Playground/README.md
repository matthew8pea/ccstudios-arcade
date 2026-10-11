# GALACTIC PLAYGROUND

A 2D physics sandbox set in a galaxy of Jedi, Sith, troopers, droids and starships. Everything is built from scratch: the physics engine, ragdoll characters, AI, weapons, vehicles, vector art, and all audio (synthesized live with the Web Audio API — no sound files).

## Play

- **Easiest:** double-click `index.html` (Chrome, Edge or Firefox). No install or build step.
- **Local server** (recommended while the game is being developed, since it always serves the newest code):
  ```
  python dev/serve.py
  ```
  then open http://localhost:8765

## Controls (defaults — rebind them in Settings → Controls)

| Action | Key / mouse |
|---|---|
| Tools: Grab · Move · Rotate · Freeze · Delete · Weld · Rope · Force · Clone · Properties · Explosion · Control | `1`–`9`, `0`, `-`, `=` |
| Wire tool (click a source, then a target; right-click removes wires) | `L` |
| Liquid tool: hold left to pour water, lava, oil, acid or blood; hold right to soak it up | `P` |
| Spawn: pick something in the spawn browser (nothing else changes: your tool keeps working and nothing follows the mouse), point, then **hold** `Q` / `E` to see a hologram facing left / right and **let go** to spawn it. `Esc` forgets the pick. On touch screens: tap the spot, then hold ◀ / ▶ | `Q` · `E` |
| Use tool / secondary | Left / right mouse |
| Zoom · pan | Wheel or trackpad (scroll / pinch) · middle-drag (or Alt+drag, WASD, arrow keys) |
| Pause · slow motion · fast-forward · step · reset | `Space` · `T` · `Y` · `.` · `Shift+R` |
| Hovered object: activate · freeze · duplicate · delete | `F` · `Z` · `C` · `Del` |
| Arm a person: put a weapon near them, point at it (or them) and press `F`. The weapon stops colliding with its wielder only | `F` |
| Spawn browser · search · inspector · debug view | `Tab` · `/` · `I` · `F3` |
| Save · load · detonate remotes | `Ctrl+S` · `Ctrl+O` · `K` |
| Undo · redo (spawns, deletes, moves, freezes, welds and ropes, *Clear everything*) | `Ctrl+Z` · `Ctrl+Y` or `Ctrl+Shift+Z` |
| Screenshot (the scene without the interface, saved as a PNG) | `F2` |
| Star a spawn-browser item as a favorite (the ★ category lists them) | Click its ☆ or right-click it |
| Object menu (actions, freeze, copy, layer, delete…) | Right-click an object |
| Box-select · add/remove one · select all · clear | `Ctrl+drag` · `Ctrl+click` · `Ctrl+A` · `Esc` |
| Copy · paste at cursor · spawn more of hovered (eyedrop) | `Ctrl+C` · `Ctrl+V` · `B` |
| Snap while moving/rotating · grid size · angle step | `Shift` · `[` `]` · `Shift+[` `Shift+]` |
| Step-rotate (Rotate tool) · bring to front / send to back | `Q` `R` · `PgUp` `PgDn` |
| Detail view (limb health) · thermal vision · zoom | `H` · `J` · `Num +` `Num −` |
| Save selection as a reusable contraption | Right-click → *Save as contraption…* (spawn it from **Contraptions**) |
| Share a contraption as a code or file | Right-click → *Share as code…* |
| Share the whole scene / import someone's code | Save or Load scene → *Share code* / *Paste code…* |
| Scene darkness (for lamps & spotlights) | World panel → *Darkness* |
| Sit on furniture (stools, benches, crates, bunks) or a Pilot Seat | `F` while controlling a character |
| **Home-built machines** (from a Pilot Seat): motor wheels & sideways thrusters · upward thrusters / hover higher · hover lower · turret aim · fire | `A` `D` · `W` · `S` · mouse · LMB |
| **Controlling a character:** move · jump · run · crouch | `A` `D` · `W` · `Shift` · `S` |
| attack · block / Force power · cycle power · Force key | LMB · RMB · `Q` · `E` |
| pick up / enter vehicle · throw · reload · saber on/off · release | `F` · `G` · `R` · `V` · `Esc` |
| **Flying:** pitch · thrust · brake · boost · fire · secondary | `A` `D` · `W` · `S` · `Shift` · LMB · RMB |

## Maps and characters

- Every map is fully enclosed and nothing can fall out of the world. Zoomed in, the camera stops at the map's edges. Zoom out as far as the whole map (big screens included) and the walls, floor and ceiling carry on as solid material around it, so you never see empty space. The facility's reactor shaft has a floor.
- Characters don't fight or wander on their own until you turn **AI** on (World panel or Settings → Gameplay). With AI off they still react like people: they stumble and fall, swim and struggle in water, flail when on fire, pass out and go limp. The main-menu battle always fights.
- People spawn empty-handed (Settings → Gameplay → *Spawn characters armed* brings their usual weapons back). The dead float.
- Lightsabers spawn switched off, on their own or in someone's hand. Activate one (`F`), or press `V` while controlling its wielder, to ignite it; fighters with AI on light theirs when they need them.
- **Drowning:** people hold their breath with their head under any liquid, swim for the surface and tread water until they tire, then go under. When their air runs out they pass out and go limp, and left under they drown. Pull them out in time and they recover. Gungans breathe underwater; droids don't breathe and just sink. The inspector shows their air.
- Tick *Start empty* in the map picker to start without the map's props. The choice is remembered, and resetting the map (`Shift+R`) keeps it.

## Autosave and remembered choices

- Once you've done something in a sandbox it's autosaved every minute and whenever you switch away or close the tab. The main menu then shows **Continue** to carry on where you left off.
- Resetting (`Shift+R`), changing map, loading a scene or going back to the main menu keeps the scene you left as *Before reset or map change*, so a slip doesn't lose your work. Both autosaves are at the top of **Load scene**.
- Autosaves never crowd out your own saves: they give up their room if the browser runs out of storage. Turn them off in Settings → Gameplay → *Autosave*.
- *Clear everything* and *Remove dead* (World panel) can be undone with `Ctrl+Z`, liquid included.
- The game remembers each tool's options (liquid type and flow, weld strength, rope type, explosion size…), your favorites and the spawn-browser category you last had open.

## Touch screens

On phones and tablets: tap to use the current tool, pinch to zoom, drag with two fingers to pan, and long-press an object for its menu. Buttons on the right cover the keyboard shortcuts (tap an object first, then Use / Freeze / Duplicate / Delete), plus Undo, pause, slow motion and **2nd** (taps act as the right mouse button). While you control a character, a movement pad and action buttons appear. Settings → Controls → *Touch controls* sets them to Auto, On or Off.

## Building machines and circuits

- **Machines** (Structures → Machines): wheels, motor wheels, thrusters, repulsor pads, turret mounts and a Pilot Seat. Join parts with Weld or with the Rope tool set to *Pivot pin* (for wheels). Everything connected to a Pilot Seat is driven by whoever sits in it. See the *Scrap Buggy* and *Hover Skiff* under Contraptions → Vehicles.
- **Electronics** (Structures → Electronics): button, pressure plate, timer, motion sensor, signal light and holo display. Use the Wire tool to connect a source to targets. Activating the source (E, or the part's own trigger) activates every target, whether that's a lamp, a detonator or another wired part. A machine part that receives a signal switches on and runs by itself.

## Injuries

- Bodies are fragile: hard falls and blows break bones (a broken leg won't hold a character up, a broken arm drops what it holds), wounds bleed, and heavy blood loss knocks people out and then kills them.
- With *Detailed injuries* on (Settings → Gameplay), hurt bodies also get worse over time:
  - **Internal bleeding** from hard blows to the torso or head drains blood with no visible wound, and makes people cough up blood.
  - **Pain** builds with each injury; a burst of **adrenaline** masks it for a while.
  - **Shock** from blood loss, pain and internal bleeding causes trembling and weakness, then collapse and unconsciousness.
  - **Consciousness** fades after head trauma and in deep shock.
  - **Limbs fail bit by bit**: nerve damage from cuts, blaster burns and acid, and numbness from heavy bleeding, weaken a limb on top of the damage itself.
- Select a character to see their condition and blood level in the inspector. Bacta cures all of it.

## Liquids

- **Six liquids**, simulated as particles that pour, flow downhill, pool, splash and fill containers. Liquid never stands in heaps: it keeps running until it reaches the lowest place it can get to.
  - **Water** puts out fires and cools things. On lava it hisses into steam and turns the lava to rock.
  - **Lava** burns characters, ignites flammables and melts props (wood fast, metal and stone slowly).
  - **Oil** is lighter than water, so it floats on top. Lava, fire and explosions set it burning.
  - **Acid** eats into people and props and is used up doing it. Water slowly dilutes it.
  - **Blood** comes from bleeding (droids leak oil). Turn this off with *Blood pools* in Settings → Gameplay.
- **Water freezes** in the cold: still water on the Frozen Planet ices over from the edges in, water touching anything below freezing freezes onto it, and a cryo grenade freezes it on the spot. Ice resting on solid ground is solid: people and props stand on it (it's slippery), and anything frozen into it is held fast. Ice with nothing under it falls as a stiff lump. It melts again in warm air, next to hot things, lava and fire, and wherever a lightsaber blade cuts through it; a close explosion shatters it. (Needs *Temperature simulation* on in Settings → Gameplay.)
- Pour any of them with the Liquid tool (`P`). Structures → Liquids has taps and spouts (activate with `F` or a wire) and tanks, drums and vats that burst, plus:
  - **Bucket**: scoop liquid up, carry it, tip it out.
  - **Glass Tank**: an open-topped tank.
  - **Pipe** and **Funnel**: channels liquid runs through. Rotate and scale them to lay out plumbing.
  - **Liquid Pump**: pushes liquid along its arrow, even uphill.
  - **Drain**: swallows liquid that reaches its grate.
  - Pumps and drains switch on and off with `F` or a wire.
- Pours and taps come out as one smooth, even stream as wide as the spout (drops leave in evenly spaced rows), and water is thin and free-flowing, so it splashes and spreads instead of clumping. Liquid is drawn close around its drops, so streams and splashes look slim instead of swelling into rounded blobs.
- Liquids are see-through, so you can watch whatever is underneath. Liquid pushes and carries objects: light things float and heavy things sink. People and droids don't part the liquid: it flows right around and over them, so they end up fully submerged in any liquid and slowly sink (fast in lava). Lone drops dry up after a while.
- The simulation runs on a separate thread (Settings → Physics → *Liquid on a separate thread*), so big lakes don't slow everything else down.
- Liquid is saved with scenes. The particle limit is in Settings → Physics. The red **Danger zone** there lets you set it anywhere up to 500,000; expect a crawl and heavy memory use long before that.

## Mods

Main menu or pause menu → **Mods** installs your own content from a file or pasted text. Mods are kept in the browser and load every time the game starts. Their items show up in their category under *Mods*.

**JSON mods** are data. An item either copies an existing object (`base`) and changes some fields, or defines a simple new prop from shapes and a colour:

```json
{
  "name": "My pack",
  "items": [
    { "id": "crimson_trooper", "base": "stormtrooper", "name": "Crimson Trooper",
      "look": { "helmet": "#8a1414", "torso": { "color": "#a01818" }, "arms": { "armor": "#a01818" } },
      "stats": { "health": 1.5, "speed": 1.2 } },
    { "id": "heavy_crate", "base": "crate_wood", "name": "Heavy Crate", "hp": 400, "density": 240 },
    { "id": "gold_bar", "kind": "prop", "name": "Gold Bar", "category": "Props",
      "material": "metal", "density": 400, "shapes": [{ "box": [0.4, 0.15] }], "color": "#e8b830" }
  ]
}
```

- `id`: 2–48 lowercase letters, digits or `_`. It can't reuse a built-in id.
- `base`: any spawnable object id. Nested objects such as `look` and `stats` are merged, so list only what changes.
- Shapes are `{ "box": [w, h, x, y, angle] }`, `{ "circle": [r, x, y] }` or `{ "poly": [x1, y1, x2, y2, …] }`, in metres.

**JS mods** are scripts that run with full access to the game (`GP`). They get `mod.register(definition)` and `mod.log(...)`, and a first line of `// name: My mod` names them. Only install scripts you trust.

## Tests

`dev/tests/run.mjs` plays the real game in headless Chromium and checks that it behaves. It covers:

- every map loading and every object spawning
- fall damage
- liquid levelling, draining, layering and reactions, and smooth pouring
- water freezing, ice you can stand on, cryo blasts and melting
- lightsabers spawning switched off
- the liquid worker
- injuries
- camera limits, zoom and panning
- share codes and mods
- slow-motion and pause audio
- touch controls
- undo and redo, autosave and Continue, favorites and remembered tool options
- the loading screen

```
cd dev/tests
npm install
npx playwright install chromium
npm test                      # or: node run.mjs liquids touch   (only some suites)
```

GitHub Actions runs it on every push and pull request (`.github/workflows/tests.yml`).

## Project layout

```
js/core        namespace, math, events, settings, input + key bindings
js/physics     rigid bodies, shapes, SAT collision, joints, sub-stepped solver, sleeping, slicing
js/render      camera, vector-art helpers, layered renderer with dynamic lighting
js/effects     particles, electric arcs, lights, weather
js/audio       procedural sound synthesis + ambience
js/entities    entity base, content registry, materials, props / fragments / debris
js/damage      damage types, impact damage, explosions, decals
js/characters  ragdoll humanoids, parametric painter, AI brain
js/weapons     holdable items, lightsabers, blasters, explosives, projectiles
js/force       Force powers (push, pull, lift, suspend, lightning, repulse, saber throw)
js/droids      non-humanoid droids (astromechs, probes, droidekas...)
js/vehicles    hover / walker / flyer / turret vehicles
js/maps        ten sandbox environments
js/tools       sandbox tools and player control
js/save        scene save/load, export/import, cloning, share codes
js/systems     heat, gore, injuries, machines, liquids (+ worker kernel), contraptions, mods
js/ui          interface, menus, spawn browser thumbnails, touch controls
js/content     all game content as configuration
```

## Adding content

Content is data. To add a character, copy an entry in `js/content/characters.js` and change its `look` (head/torso/limb styles and colors), `build` (proportions), `stats`, `team` and `loadout`. Weapons, props, droids and vehicles work the same way in their content files; new behavior is added by registering a new kind with `GP.Registry.registerKind`.
