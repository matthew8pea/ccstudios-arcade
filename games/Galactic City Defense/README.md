# Galactic City Defense

A 3D third-person shooter in four acts: the rooftops of a Coruscant-style city-planet, the Jedi Temple, a moisture farm on Tatooine, and Order 66 back at the Temple. Play as **Commander Cody** (DC-15A blaster rifle) or **Commander Fox** (twin DC-17 hand blasters). Hold a skyscraper against endless waves of Separatist droids and the occasional rebel clone.

## Play

Either way works:

- **Double-click `index.html`.** The game runs straight from the folder with no server. Browsers block ES modules and 3D model loading on `file://`, so in that case the page loads `dist/game.pack.js`, a self-contained copy of the code and models built by `tools/pack.js`.
- **Double-click `Play.bat`.** It starts a tiny local web server (Node.js) and opens the game at http://localhost:8123/. Every launch also rebuilds `dist/game.pack.js`, so the double-click version stays current after you edit the code. You can also rebuild it by hand with `node tools/pack.js`.

### Performance

**Graphics** (in Options and the pause menu) is **Auto** by default: it watches the frame rate and steps through five tiers. It turns off 4x MSAA (replaced by a cheap FXAA-style edge filter), halves the bloom and shadow resolution, then lowers the render resolution to 85%, 75% and 60%. When there is headroom again it steps back up. It also remembers where it settled on your graphics chip. **High**, **Medium** and **Low** pin a tier. Low also cuts the dynamic lights from 6 to 2.

The biggest factor is which graphics chip the browser uses. On a laptop with an NVIDIA or AMD card, Chrome and Edge often draw web pages on the slow built-in chip. On the development laptop that was 15–20 fps on Intel UHD against ~130 fps on the RTX 4060 with the same build. **Show FPS** names the chip in use. When it is a built-in one, the title screen shows how to switch: Windows Settings › System › Display › Graphics › your browser › **High performance**, then restart the browser.

### Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Shift | Sprint (you lean into it, with head bob and a wider field of view) |
| C | Combat roll (a quick tucked roll with a moment of invulnerability) |
| Ctrl | Crouch (tap to toggle: slower, steadier, a smaller target) |
| Tab or X | Swap the camera to your other shoulder |
| E | Spot the droid under your crosshair (marked for your squad and on the minimap; bonus BP if someone else finishes it), or with nothing targeted, a radar scan that reveals droids within 35 m (10 s cooldown) |
| Space | Jump (skips the intro too) |
| Mouse | Aim |
| Left mouse | Fire |
| Right mouse | Aim down sights |
| Q | Hero ability: Battle Command (Cody) / Riot Charge (Fox) |
| G | Thermal detonator (Cody) / Stun grenade (Fox) |
| F | Commander special (when the meter is full) |
| R | Vent heat. When overheated, press R while the marker is in the blue zone to cool instantly and get a damage boost |
| Esc / P | Pause |
| Ctrl+X | Dev menu: skip to the next cutscene, one droid before the next cutscene, invincibility, destroy all droids, skip a wave, **Take to the skies** (fly a LAAT/i gunship, see below), voice test (reads the hard words aloud, one line per press, and shows how the voice spells them) |

### Take to the skies (dev menu)

The dev menu's **Take to the skies** button puts you at the controls of a LAAT/i gunship. Your commander rides in the open bay, your partner and squad fight on the ground below, and the droids (or clones, or Sand People) shoot back at you. Pressed during a fight, you take off on the spot and keep the gunship for the rest of that phase and all of the next one. Pressed anywhere else (title screen, victory screen, a cutscene), it lasts the whole of the next phase you play. Press it again to land for good and go back on foot.

| Key (controller) | In the gunship |
| --- | --- |
| Mouse (right stick) | Look; the gunship turns to follow |
| WASD (left stick) | Fly forward and back, strafe |
| Space (A) | Climb |
| Ctrl or C (B) | Descend. Near the ground the gunship flares to a gentle landing; hold Shift to power-dive through it |
| Shift (click left stick) | Fly faster |
| Left mouse (RT) | Chin cannons. They heat up; R vents them |
| Right mouse (LT) | Zoom |
| Q (LB) | Afterburner |
| G (Y) | Drop a bomb |
| F (RB) | **Rocket salvo**, the special: ten homing rockets from the wing pods. They lock onto the enemies round your crosshair (through windows too), and a rocket whose target is already down goes for the next one |

- **Landing:** come down gently onto anything flat and the gunship settles on its skids. While landed it repairs its hull, reloads the rocket meter faster, and can pick up dropped items. Climb to take off again.
- **Crashing:** hit a building at speed, hit the ground too hard, or run out of hull, and the gunship goes down. Out of hull, it spins down trailing smoke and fire; either way it ends in a fireball and a burning wreck. Then you respawn from the checkpoint as usual, in a fresh gunship.
- **Where you fly:** there is no room to fly indoors, so Act I stays on the rooftop (no fall to the street), and Act II is fought over the Temple's processional plaza instead of in the great hall. In Act IV you fly round the **outside of the Council tower** for waves 1 to 5 and shoot the clones in the chamber through its windows (you can't fly into the room, and hitting the tower at speed is a crash; you can land on the tower's roof or its landing pad). After wave 5 the fight moves out over the processional plaza for the rest of the act. The cutscenes play as normal, with you back on foot in them. Yoda rides with his lightsaber put away.

### Controller

Xbox and PlayStation controllers work as they are. Nintendo controllers (Switch or Switch 2 Pro Controller, Joy-Con) work through an app that presents them to Windows as a standard pad, such as Switch 2 Connect, Steam or BetterJoy. Press a button on the controller once the page is open so the browser can see it. You can swap between controller and keyboard/mouse at any time, and on-screen prompts follow whichever you used last. Buttons are read by position, so jump is always the bottom face button (A on Xbox, ✕ on PlayStation, B on Nintendo).

| Button (Xbox / Nintendo) | Action |
| --- | --- |
| Left stick | Move (push gently to walk) |
| Right stick | Look |
| RT / ZR | Fire (Yoda: swing) |
| LT / ZL | Aim down sights (Yoda: block) |
| A / B (bottom) | Jump, skip cutscenes |
| B / A (right) | Combat roll |
| X / Y (left) | Vent heat |
| Y / X (top) | Grenade / second ability |
| LB / L | Hero ability |
| RB / R | Commander special |
| Click left stick | Sprint (lasts until you stop, aim or fire) |
| Click right stick, or d-pad down | Crouch |
| D-pad up | Spot / scan |
| View / − , or d-pad left/right | Swap shoulder |
| Menu / + | Pause, skip cutscenes |
| Hold View / −, then press Menu / + | Dev menu (the same as Ctrl+X); do it again, or press B, to close it |

In menus, the d-pad or left stick moves between buttons, A presses, B goes back (it closes the options and resumes from pause), Start presses the main button, and left/right change sliders and drop-downs. Unplugging the controller mid-fight pauses the game. Options (on the title screen and in the pause menu):

- **Controller look:** stick look speed.
- **Invert look.**
- **Aim assist:** turning slows while your crosshair is on or near a target, and pulling the aim trigger swings onto the nearest one.
- **Vibration:** rumble on hits, nearby blasts and every shot, where the browser supports it.
- **Button icons:** Auto (from the controller's name), Xbox, PlayStation or Nintendo.
- **Swap A/B and X/Y:** turn this on if your app remaps a Nintendo controller by label (A on the right reported as Xbox A), so jump goes back to the bottom button.

### VR

The game runs in a VR headset through WebXR: press **ENTER VR** (bottom right of the page).

- **Standalone Quest (no cable):** double-click **`Play VR.bat`**. It prints an `https://` address on your network (for example `https://192.168.1.20:8443/`). Put the headset on the same Wi-Fi, open that address in the headset's browser, accept the warning (**Advanced › Proceed**: the certificate in `certs/` is self-made), then press **ENTER VR**. The first time, Windows Firewall asks about Node.js: allow it on private networks. A standalone headset runs the game on its own phone-class chip, so VR mode drops the shadows and the heavier effects there.
- **PC VR (Quest Link / Air Link / Steam Link / SteamVR):** start Link so the headset shows its PC desktop view, double-click `Play VR.bat` (or `node server.js`), open http://localhost:8123/ in Chrome or Edge on the PC and press **ENTER VR**. The PC's graphics card draws it, so this is the best-looking way to play.

In VR you play in **first person**: the right controller is your blaster (Fox holds a pistol in each hand, Yoda a lightsaber), and you aim by pointing it. A reticle and a faint laser show where shots will land. Switch to **third person** (the over-the-shoulder camera, aimed with the right stick) in the pause menu. Cutscenes, the gunship and the killcam carry you along with the game camera (heading only, so the view never rolls). The HUD rides in front of you, and the menus appear on a panel: point at a row and pull the trigger, or use the left stick and A.

| VR controller | Action |
| --- | --- |
| Left stick | Move (where you look) |
| Right stick left/right | Turn (snap 30°, or smooth: pause menu) |
| Right stick up / down | Spot / scan · crouch |
| Right trigger | Fire (Yoda: swing) |
| Left trigger | Aim down sights (Yoda: block) |
| A · B | Jump · combat roll |
| X · Y | Vent heat · grenade / second ability |
| Left grip · right grip | Hero ability · commander special |
| Click left stick · right stick | Sprint · crouch |
| Click both sticks | Pause |

The pause menu also has **Recenter view**, **Dev menu** and **Exit VR**.

### Menus

The deploy screen shows both commanders as large cards with their weapon and their three abilities; options and the full control list sit in a collapsible panel. While the game loads you get a painted Coruscant skyline and rotating gameplay tips, and winning the battle ends on a match summary (Battle Points, eliminations, headshots, waves, squad eliminations, objectives, reinforcements left, best score, match time).

### Commanders

- **Cody (212th Attack Battalion):** a hard-hitting, accurate DC-15A. **Special: Gunship Barrage** calls in two LAAT/i gunships that make a strafing run over wherever your crosshair points, raking it with their chin cannons.
- **Fox (Coruscant Guard):** two rapid-fire DC-17s that alternate shots. **Special: Guard Overdrive** gives 7 seconds of faster fire, extra damage and no overheating.

Hero abilities: Cody's **Battle Command** gives him and nearby allies +25% damage and faster cooling for 10 seconds. Fox's **Riot Charge** is a shoulder-charge dash that bowls droids over, and his **Stun Grenade** locks up every droid in the blast. Health regenerates quickly after 5 seconds without taking damage. Kills earn Battle Points (BP).

Whichever commander you don't pick fights beside you as an AI ally, along with a **clone squad** of four troopers: the 212th Attack Battalion (orange) when you play Cody, the Coruscant Guard (red) when you play Fox. They fight on their own anywhere on the map, not tied to you: with nothing in sight they patrol the arena; when they see droids each one runs to its own spot behind a crate or barricade that blocks the droids' line of fire (or pushes up toward them if there is no cover), pops up to fire in bursts and ducks back down. Troopers near you call out droids as they spot them, and the whole squad shows as blue dots on the minimap. Droids shoot back at them, and each fallen trooper is replaced 14 seconds later by a reinforcement who arrives at the deployment point.

**Republic reinforcements:** you start each deployment with 30 reinforcement tickets (shown under your BP). Each squad reinforcement costs 1 and a checkpoint respawn costs 3; clearing a wave earns 4 back. Republic Command warns you on the radio as they run low, and with fewer than 3 left you can only redeploy from the start.

**Spending Battle Points:** when you go down, the respawn screen lets you spend BP (from the score the checkpoint restores) on your next life: your commander special fully charged (1,000 BP), a veteran squad with double health and harder-hitting blasters (1,200 BP), or heavy plating for +50% health (1,500 BP).

### Enemies

| Enemy | Notes |
| --- | --- |
| B1 battle droid | Most common. Marches in squads across the skybridges. |
| B2 super battle droid | Slow and tanky, with wrist blasters. |
| B2-RP rocket droid | Flies up from below the tower's edge and circles you. |
| BX commando droid | Fast, drops in from above, and hits hard up close. |
| Rebel clone | Rare. Accurate burst fire, green blaster bolts. |

On Tatooine (Act III) there are no droids or clones. The enemy is the desert peoples, turned by Count Dooku's mind tricks:

| Enemy | Notes |
| --- | --- |
| Jawa | Small and quick, comes in packs (many scurry down the sandcrawler's ramp). Its ion scatter blaster fires a spread of pellets: deadly up close, weak at range. |
| Tusken Raider (sniper) | Climbs a rock pillar at the edge of the arena and picks you off with a cycler rifle. Its scope glints for about a second before every shot, so break line of sight or roll. |
| Tusken Raider (warrior) | Charges with a gaderffii stick. Stops to let out the Tusken war cry first, then rushes in for heavy overhead blows. Yoda can block them. |
| Count Dooku | Waves 7 and 8 only. A boss with his own health bar (see Act III). |

### The war in the sky

The battle for Coruscant goes on all around you. LAAT/i gunships cross the sky in formation, ARC-170 starfighters dogfight vulture droids between the towers (with tracer fire and shoot-downs that tumble away in flames), Separatist landing craft sink into the city with vulture escorts, flak bursts and anti-air fire light up the horizon, and B2-RP rocket droids ram the sky traffic. Distant explosions are heard a moment after you see them.

Some waves arrive by **Separatist dropship** (waves 2, 3, 4, 6, 7 and 8, and every wave in endless mode): it flies in over the roof edge or across the canyon, hovers over the battlefield and drops its battle droids down a glowing drop beam before climbing away. Its droids count toward the wave, so shoot them as they land.

### Phase objectives

- **Waves 3 and 4 (roof): Defend the uplinks.** Two uplink consoles (A and B, with holo beacons) stand on the roof. Battle droids break off to slice them: an uncontested slice takes about 16 seconds, and a sliced uplink costs 4 reinforcements. Stand in the ring to stop it (it flickers while contested), and hold a sliced ring clear of droids to retake it (+250 BP). Their state shows under the objective and on the minimap.
- **Wave 7 (street, and every third wave after it in endless mode): Destroy the shield generator.** A Separatist generator inside a red energy dome sits at the south end of the street. The wave can't end while it stands, and it keeps calling in droids. Bolts that hit the dome wear it down, and grenades and Gunship Barrage strikes hit it hard (+600 BP when it goes down).

When you die, a killcam swings round to whoever got you, with an **ELIMINATED BY** caption and their remaining health.

Every wave is a checkpoint. If you die, **Respawn** puts you back at the start of the wave you were on, or at its halfway point (with your score from that moment) if you had destroyed at least half of it. Dying between waves respawns you at the start of the next one.

Blaster weapons overheat instead of using ammo. Defeated enemies sometimes drop a pickup on the ground where they fell: a glowing cyan bacta canister (+35 health) or a grenade (a thermal detonator, or a recharge for your grenade ability). Walk over one to take it. Bacta only works when you are hurt and grenades only when you are short of them; standing on one you cannot use yet tells you why, and it stays there for later.

Every map has a hard edge: you, your partner and your squad cannot walk out through the droids' entry gates or jump off the edge. Droids that come in through a gate push into the arena (shooting as they come) instead of holding in the gateway. A droid knocked off a ledge, by a Force Push for instance, falls, and if it drops off the map it is destroyed and counts as your kill. Fall far yourself and your commander flails on the way down.

## The fall to the lower levels

In wave 5, once its fourth droid goes down, two B2-RP rocket droids streak in at Cody and Fox. The commanders open fire on them, and the shots spark off their armour, but the droids keep coming, ram them and blast them off the tower. They tumble down past the tower face, arms and legs flailing, to the lower-level streets 160 m below, crash through a night-market stall, and the battle carries on down there. The street has a speeder road with parked speeders and a Republic checkpoint, a shopping arcade of storefronts (cantina, noodle bar, repair shop) under neon signs and awnings, a night market along the railing over the canyon, a turbolift lobby in the tower base, skybridges and strings of lights overhead, low traffic flying out of a tunnel, and civilians who stroll around until the droids arrive (then they run for the exits). Press **Space** to skip it.

## The final wave and the extraction

Wave 8 is the last one (the objective changes to **FINAL WAVE · HOLD FOR EXTRACTION**). Clear it and a LAAT/i gunship drops into the street canyon carrying Master Yoda, Commander Gree and a squad of the 41st Elite Corps. Yoda and Gree talk with the commanders (voiced with text-to-speech), Cody and Fox climb aboard, and the gunship flies off into the sunset: **Republic Victory**. Press **Continue** to go on to Act II, or play again / return to the title.

## Act II: The Jedi Temple

The gunship carries Yoda, Gree, the 41st, Cody and Fox across the city to the Jedi Temple and sets down on its processional plaza as Jedi Masters cross it. Yoda warns that droids have infiltrated the Temple and its surroundings, and you choose who leads:

- **Master Yoda:** a lightsaber. Left mouse swings a three-hit combo (the third is a spinning slash); right mouse blocks and bats blaster bolts back at whoever fired them. **Q** Force Push, **G** Saber Rush, **F** Force Wave.
- **Commander Gree** (41st Elite Corps): DC-15A rifle. **Q** Battle Command, **G** thermal detonators, **F** Elite Fusillade.
- **Commander Fox** and **Commander Cody** with their usual kits.

A partner fights beside you (Fox with Cody, Cody with Fox or Gree, Gree with Yoda), plus a clone squad (the 41st for Yoda and Gree).

- **Waves 1 to 5, the processional plaza** in front of the Temple entrance: a carved sandstone facade, banners, giant Jedi statues, lamps, a fountain, a downed vulture droid and barricades. Droids pour out of the Temple's side doors, march up from the landing ramps, and arrive by dropship.
- **Waves 6 to 8, the great hall** inside the Temple: two rows of columns, sunlight through the skylights, banners, and the archives and a great statue at the far end. The rebel clones are in here with the droids, and four Jedi younglings who had been holding the hall against them join you, running in with their lightsabers (when they are beaten down they are knocked out for a while, then get back up).
- **The ending:** with the Temple cleared, a priority transmission comes in from Tatooine. A flickering hologram of Captain Hask of the Anchorhead garrison reports that the Jawas and the Tusken Raiders are raiding the moisture farms together, led by a tall man in a cape with a red lightsaber, before the signal drops. The clones know the blade: Count Dooku. Yoda explains that Dooku has bent the desert peoples' minds with a Jedi mind trick turned to darkness, and that holding them gives him the Outer Rim trade routes along Hutt space with an army that costs him nothing. Everyone boards the gunship on the processional plaza, and it climbs to a Republic assault ship waiting over the city. **On to Tatooine** goes on to Act III.

Checkpoints, reinforcements, BP purchases and the dev menu all work in Act II. In the dev menu (Ctrl+X), skipping to the next cutscene moves the story on (into the hall, then the ending), and from the Act I victory screen it starts Act II.

## Act III: Tatooine

Count Dooku has used his mind tricks on the Jawas and the Tusken Raiders of the Jundland Wastes, and they are fighting for him.

- **The arrival:** the assault ship drops out of hyperspace over Tatooine. The gunship falls out of its hangar, dives through the atmosphere with its hull glowing, and flies in low over the dunes under the twin suns to set down at a moisture farm. On a dune crest to the north, Jawas and Sand People stand side by side, just as the garrison reported. Yoda feels Dooku's hold on them, and senses that Dooku is close and watching. Anchorhead's garrison is cut off, so the farm is all that stands between the war party and the town: hold it, draw Dooku out and break his grip. Then you pick who leads (Yoda, Gree, Fox or Cody), with the same partners and squads as Act II.
- **The arena** (about 150 m across, at the hour of the binary sunset):
  - **South:** the Republic landing zone and the homestead. It has an entrance dome, a sunken courtyard you can drop into (stairs, arched doorways, a parapet round the rim), a vaulted garage, an old landspeeder, vaporators and barricades.
  - **West:** an outpost village. An adobe street runs between flat-roofed houses with stairs up to the roofs, past a domed cantina, market stalls, archways and cloth strung overhead.
  - **Middle:** open sand and low dunes, a half-buried krayt dragon skeleton and a crashed freighter.
  - **East:** a rock shelf up a broad ramp, with sniper pillars.
  - **North:** the Jawa sandcrawler with its ramp down into the arena, and the Tusken camp with its banthas.

  Sandstone buttes and dunes rise all round, with blowing sand, dust devils and the odd far-off krayt dragon roar.
- **Waves 1 to 6:** Jawas and Tuskens only. Every wave opens with Jawas scurrying out of the sandcrawler. Warriors pour out of the canyons, and snipers take the rock pillars around the edge.
- **Wave 7: Count Dooku arrives.** He is spotted on the sandcrawler's roof, Force-leaps down in front of you and salutes with his blade (Yoda gets his own exchange with his old apprentice). Then the duel starts, with his health bar under the objective:
  - Makashi saber combos up close
  - Force lightning at range (Yoda blocking catches it on his blade)
  - a Force push when he is crowded or hurt
  - leaps across the sand to whoever is hiding far away
  - he bats frontal blaster fire back at the shooter, so flank him or use grenades
  - he parries most of Yoda's blows, but three parried strokes in a row stagger him

  At half health he throws everyone back and leaps away over the sandcrawler; clear the rest of his war party to end the wave.
- **Wave 8:** Dooku leaps back in, wounded, to finish it. Beat him to his knees and his hold breaks: the Jawas and Tuskens snap out of it and scatter into the desert.
- **The ending:** Dooku vanishes in a storm of sand he raises with the Force. Yoda tells the others that his hold on the desert peoples is broken. The Jawas troop back up the sandcrawler's ramp, the Tuskens walk off into the dunes, and Yoda decides it is time to warn the Council. Everyone boards the gunship and climbs out of the atmosphere. Clear of Tatooine's storms, a two-day-old recording finally reaches them on the bay's holoprojector: **Order 66** is in effect, and every Jedi is to be executed. The troopers turn to look at Yoda. Cody, Fox and Gree refuse the order, and the 41st stands with them. Yoda thanks them, warns that they will be hunted for it, and still means to go to the Council. The gunship docks with the assault ship, which jumps to hyperspace. **On to Coruscant** goes on to Act IV.

## Act IV: Order 66

- **The arrival:** the assault ship drops out of hyperspace over Coruscant, a planet that is one city from pole to pole. The gunship flies in over the skylanes, and the Jedi Temple is on fire. It sets down on a landing pad at the top of the Council tower. Inside, the Jedi Council chamber is empty, with scorch marks on the floor. Then the lift doors open all round the room, and clones of every unit pour in after Master Yoda. Pick who leads (Yoda, Gree, Fox or Cody), with the same partners as before. Your squad are troopers who were on Tatooine with you and never received the order either.
- **Waves 1 to 5, the Jedi Council chamber:** a round room crowning one of the Temple's spires. Tall windows look out over the real city 270 m below. The twelve Council seats are cover, plus a holoprojector in the middle and planters by the walls. The clones come in through four turbolift doors. The windows are glass: they stop blaster bolts, both ways, until enough hits shatter a pane (with a burst of shards), and after that shots go straight through that window. Rockets smash through at once. Every pane is whole again when Act IV starts.
- **Wave 6, the great hall:** down the lifts, and fight your way through the Temple.
- **Waves 7 and 8, the processional way:** out onto the terrace to get Master Yoda to a gunship.
- **The enemy:** the Grand Army itself, as 212th troopers, Coruscant Guard and 41st Elite, each with their own weapon handling. Their visors glow red, so you can tell them from your own loyal troopers. There are no droids and no dropships, and the sky over the city holds only Republic gunships on patrol. The Temple burns for the whole act; you can see its smoke from the chamber windows.
- **The ending:** a gunship drops onto the terrace. Everyone gets aboard and it climbs away under fire. Yoda says he must go into exile, and the commanders go with him. **Master Yoda escapes**; **Continue** plays on in endless waves of clones on the terrace.

In the dev menu, skipping to the next cutscene moves Act IV on (out of the Council chamber, out of the Temple, then the ending), and from the Act III victory screen it starts Act IV.

While you are on Tatooine the city is hidden. The sky, sunlight, haze, colour grade and ambience all change: wind instead of city hum, far-off Tusken howls and rifle cracks instead of distant battle. In the dev menu, skipping to the next cutscene jumps to Dooku's entrance (or, once he is on the field, to his defeat), and "one droid before the next cutscene" puts you in wave 8 with Dooku at 60 HP.

## The opening cutscene

The camera dives through the city down to the top of the skyscraper. Cody and Fox talk about the Separatist infestation. A B2 rocket droid flies up from behind Cody; Fox, facing him, sees it and shoots it down with his DC-17s. Dialogue is shot in over-the-shoulder close-ups on a longer lens, with a warm key light and a cool rim light on whoever is speaking.

Every cutscene frames its close-ups from where the characters actually stand and which way they face (`face`, `ots` and `two` in src/beats.js), so a close-up lands on the face from the front, also for characters riding in a gunship bay. Whoever is listening turns their head to the speaker (`Character.lookTarget`, a neck-and-head turn layered on the animation), and heads straighten again when the scene ends. Press **Space** to skip, or pick **Deploy without the intro**. Dialogue is subtitled and voiced with your system's text-to-speech; turn this off with the **Voiced dialogue** checkbox. Before a line is spoken, Star Wars words are respelled so the voice says them properly: Dookoo, Corrasahnt, Tattooeen, Jawwas, Tuskin, Uteeny (Utinni), two-twelfth (212th), B one (B1), and so on (single words without hyphens, which make the voice pause). The subtitles keep the real spelling. To change how a word is said, edit the table at the top of src/pronounce.js.

## The Blender rigs

All characters are real Blender rigs, built by `blender/build_characters.py`:

- **Armatures:** a full skeleton (root, hips, spine, chest, neck, head, arms, legs) plus weapon bones and a muzzle bone at each barrel.
- **IK arms:** forearm IK constraints with pole targets keep both hands on the rifle or pistols.
- **Animations:** each one is an Action on its own NLA track:
  - Cody: Idle, Run, Talk, Crouch, Death
  - Fox: Idle, Run, Talk, Crouch, Death
  - Rebel clone and BX commando: Idle, Run, Death
  - B1 and B2: Idle, Walk, Death
  - B2-RP: Fly, Death
  - Civilian: Idle, Walk, Run (recoloured per person in the game)
  - Commander Gree: Idle, Run, Death, Talk, Crouch, CrouchWalk; 41st clone trooper: Idle, Run, Death
  - 212th clone trooper and Coruscant Guard trooper: Idle, Run, Death, Crouch (for the upcoming squad AI)
  - Yoda: Idle, Talk; Yoda with lightsaber (playable): Idle, Run, Swing1-3, Block, Death, Crouch, Talk
  - Jedi Master: Idle, Walk, Talk; Jedi youngling: the lightsaber set
  - Jawa: Idle, Run, Death (hooded robe, glowing eyes, ion scatter blaster)
  - Tusken Raider sniper: Idle, Run, Death, Crouch (cycler rifle); Tusken warrior: Idle, Run, Swing, Cry, Death (gaderffii stick)
  - Count Dooku: Idle, Run, Swing1-3, Block, Lightning, Push, Talk, Kneel, Salute, Death (cape, curved-hilt red lightsaber)

**Clone armour (Phase II):** the helmets are lofted from Phase II cross-sections, with a rounded dome, the waist at the ears and the jaw flaring out with the notch under each ear. The T-visor and vocoder are recessed into the faceplate, the brow ridge and the cheek plates either side of the frown are raised, and the ear caps are rounded plates with recessed centres. The body has sculpted chest plates (pectorals and a sternum groove), a back plate and ab plate, domed pauldrons, bicep plates, tapered gauntlets, gloved hands, thigh plates, knee caps, calf-shaped shin plates and lofted boots with soles. Markings are cut into the mesh along their edges, so they stay crisp in close-ups.

- **Commander Cody** (Battlefront II): battle-worn white armour with the 212th's tan-orange on the top stripe and cheeks, layered orange pauldrons and knees, diagonal thigh stripes and orange cuffs. Macrobinoculars flipped up on the dome and a rangefinder.
- **Commander Fox** (The Clone Wars): Coruscant Guard red armour and helmet, a white left pauldron with the red Guard emblem, white bands on the arms, a white belt with a white flap pouch, a black kama trimmed in red, white boots and a comlink antenna.
- **Commander Gree** (41st Elite Corps): green camouflage armour (a camo texture laid over it in the game), a grey helmet with a green visor, black greaves and boots, webbing straps over the shoulders, a rangefinder, and a short DC-15S carbine.
- **Yoda:** a sculpted head with a broad cranium, a heavy wrinkled brow over deep-set eyes with heavy lids, a broad nose, a wide down-turned mouth and jowls. Big cupped ears, pink inside; wisps of white hair. A crossed-over tunic with a sash, an open outer cloak with its hood bunched at the neck, wide sleeves, long three-fingered hands, toes peeking out from the robe, and a gnarled gimer stick.

**Weathering:** every character mesh gets box-projected UVs and baked vertex-colour dirt (grimy boots, blotchy wear, blaster scorch marks), and the game lays a tiling grime texture (smudges, drips, chipped paint) over the armour.

Open **`blender/GalacticCityDefense_Characters.blend`** to see all twenty rigs side by side. Each sits in its own collection, and you can switch animations in the NLA editor. Preview renders are in `blender/previews/`.

The detailed set pieces (the turbolift tower, barricades, supply crates, vent units and airspeeders) come from `blender/build_props.py`, which exports `assets/models/props.glb`:

```
"C:Program Files (x86)SteamsteamappscommonBlenderlender.exe" --background --factory-startup --python blenderuild_props.py
```

To rebuild the rigs and re-export the game models (`assets/models/*.glb`):

```
"C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe" --background --factory-startup --python blender\build_characters.py
```

Add `-- --no-render` to the end to skip the preview renders.

## Project layout

```
index.html              game page
Play.bat / server.js    launcher + zero-dependency local web server
Play VR.bat             the same, plus an https:// address for a standalone headset (server.js --vr)
certs/                  self-signed certificate for that address
src/
  main.js               boot, game states, render loop
  post.js               BattlefrontGradePass: filmic grade, vignette, grain, chromatic aberration,
                        lens dirt, low-health and ADS looks (tune everything in GRADE)
  city.js               procedural Coruscant skyline, sky, traffic, the rooftop arena
  cutscene.js           the opening cutscene
  commanders.js         Cody/Fox player controller, camera, AI ally
  enemies.js            droid / rebel clone types and AI
  combat.js             blaster bolts, explosions, grenades, barrage, pickups
  waves.js              wave spawner
  atmosphere.js         smoke columns, fires, god-ray light shafts, arena fires and sparks
  ships.js              procedural ships: LAAT/i (flying, crashed, open bay), ARC-170, vulture droid,
                        Separatist landing craft, droid dropship, Republic assault ship
  skywar.js             background war: rocket droids ramming the sky traffic, LAAT formations,
                        ARC-170 vs vulture dogfights, landing craft, flak, the barrage gunship run
  dropship.js           the Separatist dropship that brings in part of some waves
  squad.js              the clone trooper squad (212th / Coruscant Guard) that fights beside you
  objectives.js         phase objectives: uplinks to defend, the Separatist shield generator
  temple.js             Act II arenas: the Jedi Temple plaza and the great hall
  act2.js               Act II: the arrival cutscene, hero line-up (partner and squad per hero), the ending
                        (the hologram transmission from Tatooine, the climb to the assault ship)
  tatooine.js           Act III world: dunes, twin-sun sky, the homestead and its sunken courtyard, the
                        outpost village, the rock shelf, the sandcrawler, the Tusken camp, perches; swaps
                        the sky, light, haze and grade while you are there
  act3.js               Act III cutscenes: the arrival (from orbit), Dooku's entrance, the ending (and the Order 66
                        recording on the way home)
  act4.js               Act IV cutscenes: the arrival over Coruscant and the empty Council chamber, the escape
  council.js            Act IV arena: the Jedi Council chamber on top of a Temple spire, its landing pad, breakable windows
  beats.js              the shared beat runner for cutscenes (shots, subtitled lines, voices)
  space.js              orbit over Tatooine: stars, the planet, its suns, the assault ship, hyperspace
  dooku.js              Count Dooku: the boss AI (saber, Force lightning, push, leaps, deflection)
  street.js             the lower-level street arena (shops, stalls, speeders, civilian paths)
  civilians.js          civilian NPCs: strolling, window-shopping, fleeing
  fall.js               the wave-5 cutscene: blasted off the tower into the lower levels
  ending.js             the wave-8 extraction cutscene (LAAT/i, Yoda, Gree, the 41st)
  fx.js                 particles, instanced blaster bolts, scorch decals, dynamic light pool,
                        muzzle flashes, explosions
  pronounce.js          how the dialogue voice says Star Wars names and model numbers (respellings)
  audio.js              synthesized sample bank (blasters, explosions, whiz-bys), city echo,
                        battle ambience, low-health layer, layered orchestral score, speech
  hud.js, style.css     HUD and menus
  input.js              keyboard + mouse, merged with the controller
  gunship.js            Take to the skies: the LAAT/i you can fly (cannons, bomb, rocket salvo, landing, crashing)
  gamepad.js            controller reading (Gamepad API): buttons, sticks, sprint latch, rumble, button icons
  padui.js              controller menu navigation, on-screen prompts, connect/disconnect notices
  character.js          animated skinned characters (+ aim layering)
  vr.js                 WebXR: headset camera rig, controllers as a pad, hand-held blasters, reticle,
                        the menu panel and the head-up HUD
assets/models/          GLB characters exported from Blender
blender/                Blender build script, .blend file, preview renders
vendor/three/           three.js (bundled so the game runs offline)
tools/pack.js           builds dist/game.pack.js so index.html runs from file://
dist/game.pack.js       generated; do not edit
```

This is a non-commercial fan project. Star Wars characters and names belong to Lucasfilm. All models, code, sounds and artwork in this folder are original.
