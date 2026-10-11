/*  ═══════════════════════════════════════════════════════════════════════
    THE FORTNITE PACK  —  a content pack for Galactic Legends
    ═══════════════════════════════════════════════════════════════════════

    NOT PART OF THE GAME. index.html does not load this file, so nothing in
    it runs and nothing in it ships. It is here so the layer is kept whole
    and can be put back in one line.

    ── TO PUT IT BACK ──
      Add this line to index.html, ABOVE the game.js tag:

          <script src="fortnite-pack.js?v=1"></script>

      That is the whole of it. game.js picks up window.GL_CONTENT_PACK in
      applyContentPack() and merges every table below — roster, weapons,
      shop, arenas, hazards, forge patterns, sprite, achievement and unlock
      flags — then calls install() for the buttons that need to exist in the
      page. Saves are untouched either way: a player who bought one of these
      fighters still has the flag in their save, and gets them back with the
      pack.

    ── TO TAKE IT OUT AGAIN ──
      Delete that one script tag.

    ── WHAT STAYED BEHIND IN game.js, AND WHY ──
      A few rules are keyed on this pack’s weapon keys and ids and were left
      in place deliberately, so the pack behaves correctly the moment it is
      added rather than needing a second edit:

        · playWeaponFireSfx()      which gun makes which noise
        · tacticalProfileFor()     the shotgun/sniper profile rules
        · fireProjectile()         the sniper accuracy rule
        · ELITE_BASE_IDS           prophecy->rivalhope, innovation->slone
        · ZERO_POINT_ENCOUNTER     the Geno encounter and unlockGeno()
        · the creator sub-tabs     Wrixel colours and Guardian customisation
        · the Shapeless Man effect  entityHasSprite(e, 'shapelessSprite')

      All of it is inert without this file: the ids and weapon keys it tests
      against simply do not exist, so every one of those branches is dead.

    ── ONE THING THAT WAS DROPPED ──
      isArenaRetired() used to take Cluster Coast out once the Zero Event was
      cleared (`gameUnlocks.zeroEventCleared`). The Zero Event itself is gone,
      so that check went with the arena. Put it back in isArenaRetired() if
      you want that behaviour again.

      isArenaRetired() also used to retire The Zero Point arena once the Snap
      had played. The Snap is history now — the Zero Point splash tile is
      scenery for the cutscene and nothing else — so that check came out too.
      Add it back the same way if the arena should stay retired.
                                                                          */
window.GL_CONTENT_PACK = {
    id: 'fortnite',

    /*  The season the faction toggle shows. One pack, one season. */
    season: {
            id: 'seven',
            label: 'The New Seven',
            // Rival Hope and The Prophecy are one fighter in two forms, and
            // both forms answer to the same side — the elite pair stays
            // together here the way Fox and Fox (Elite) do in the Galactic
            // rosters. The 'rival' in her name is what she is to the enemy,
            // not to the people she stands with.
            //
            // The Guardian is not one of The Seven and never claims to be —
            // it is a machine, and it is here for the same reason Cluster is
            // on the other side: the season places it. It walks with them
            // because the sprite in its cockpit is the player's, and the
            // player's machine fights on the player's side.
            //
            // Phantom is NOT here. He was placed with The Seven on the
            // reading that a Global Frontier soldier answers to nobody, but
            // he takes Geno's contracts — so he stands with the side that
            // pays him, on the other column. See his roster entry.
            //
            // Doctor Slone and The Innovation are the second elite pair here
            // and they stay together for the same reason the first one does,
            // even though Slone is the one fighter on this side whose
            // allegiance argues against it: she runs the Imagined Order, and
            // Vengeance Jones's own bio has him betraying her. But The
            // Innovation is one of The Seven and is Slone in a later form, so
            // splitting them would put one fighter in two columns. Rival Hope
            // is already the precedent — her bio reads as an enemy's and she
            // stands here anyway, because what her elite becomes is what the
            // pair answers to.
            heroes: {
                title: 'The New Seven',
                ids: ['visitor', 'vengeancejones', 'order', 'rivalhope', 'prophecy', 'slone', 'innovation', 'singularity', 'bastian', 'sonic', 'poseidon', 'guardian', 'wrixel']
            },
            // Cluster's bio gives him no allegiance either way, so he is
            // placed rather than deduced: he is on this side because the
            // season puts him here, and a duck with a pistol is a menace
            // whichever direction he is facing.
            //
            // Phantom is here by employer rather than by temperament, which
            // puts him with Geno and Hush rather than with the freelancers:
            // Global Frontier is the contract, and the contract is the
            // Imagined Order's.
            villains: {
                title: 'Imagined Order & Last Reality',
                ids: ['voidblade', 'dylan', 'cluster', 'geno', 'hush', 'phantom', 'big_chuggus']
            }
        },
    /*  ── THE ROSTER ──────────────────────────────────────────────────
     *  Merged into characters.secret. Each record is stamped with
     *  packId on the way in, which is what marks it as pack content. */
    characters: [
            // --- FORTNITE (each fighter shop-unlocked on its own flag) ---
            // Colour is his rubber-duck yellow; he wears black shades, a teal
            // jacket and gold chains. Bio is his in-game description verbatim.
            { id: 'cluster', name: 'Cluster', color: '#ffc93c', hp: 170, weapon: 'lancehead', secretUnlock: 'cluster', fortnite: true, retiredBy: 'zeroEventCleared', bio: 'He\'s one lucky duck.' },
            // Colour is the void purple of her outfit (Epic, from The Void
            // Unknown set). The extra HP over Cluster is her being a Rift
            // Encounter boss rather than a rank-and-file skin.
            //
            // She carries two weapons in Fortnite — the Burst Rifle at range
            // and a Kinetic Blade up close — but a character here has exactly
            // one weapon, so she brings the rifle. Bio is her in-game
            // description verbatim.
            { id: 'voidblade', name: 'The Voidblade', color: '#a45cff', hp: 180, weapon: 'burstrifle', secretUnlock: 'voidblade', fortnite: true, retiredBy: 'zeroEventCleared', bio: 'Voyage through the void.' },
            // Colour is the hot pink of her outfit (Epic, from the Mercenary
            // Heartbreaker set). A mercenary rather than a boss, so she sits
            // just under The Voidblade on HP — but she has to walk into
            // shotgun range to do her job, which is worth some of it back.
            // Bio is her in-game description verbatim.
            { id: 'dylan', name: 'Dylan', color: '#ff4d94', hp: 175, weapon: 'focusshotgun', secretUnlock: 'dylan', fortnite: true, retiredBy: 'zeroEventCleared', bio: 'Real queens take what they want.' },
            // Legendary outfit, and the first revealed member of The Seven —
            // the Season 4 Blockbuster reward, the one who flew the rocket.
            // Colour is the amber glow of his visor.
            //
            // Story standing would put him at the top of the Fortnite roster on HP,
            // but he is the only one of the four who never has to be in the
            // fight: he carries the heaviest single round in the game and a
            // profile that keeps him at sniping range all match. He gives that
            // back in health and lands level with Cluster. Bio is his in-game
            // description verbatim.
            //
            // He is also the only character on the roster with an ending. Win
            // as him against Vengeance Jones at the Zero Point and `retiredBy`
            // takes him off every list in the game — see isCharacterRetired().
            { id: 'visitor', name: 'The Visitor', color: '#ff9d2e', hp: 170, weapon: 'boomsniper', secretUnlock: 'visitor', fortnite: true, retiredBy: ['geno', 'zeroEventCleared'], bio: 'From beyond the unknown. One of The Seven.' },
            // Epic outfit from the Jones's Revenge Set, Chapter 5 Season 1.
            // John "Jonesy" Jones — once a high-ranking Imagined Order agent
            // under Doctor Slone, who betrayed the IO during the Zero Crisis
            // to save Reality Zero, was jailed for it, and was broken out by
            // The Foundation during The End. He is a member of The Seven, so
            // he stands beside The Visitor on this roster rather than
            // opposite him.
            //
            // Colour is the beige of the coat he wears in this style, over a
            // black sweater and red scarf. It is the only earth tone among
            // the Fortnite five — Cluster's yellow, The Voidblade's purple,
            // Dylan's pink and The Visitor's amber are all saturated — so he
            // is never mistaken for any of them at a glance.
            //
            // The lowest HP of the Fortnite five, and that is the trade. Every
            // other Fortnite weapon asks something of its owner: Dylan has to
            // walk into shotgun range, The Visitor has to hold a sniper's
            // distance, Cluster's pistol is one shot per trigger pull, The
            // Voidblade fires in fixed bursts. The Assault Rifle asks
            // nothing — it is accurate, automatic, and good at every range
            // in the game. That versatility is paid for in health.
            //
            // Bio is his in-game description verbatim.
            { id: 'vengeancejones', name: 'Vengeance Jones', color: '#d8b48a', hp: 168, weapon: 'assaultrifle', secretUnlock: 'vengeancejones', fortnite: true, retiredBy: 'zeroEventCleared', bio: 'Iconic renegade on a mission for retribution.' },
            // Rare outfit, first released in Chapter 3 Season 2, from The
            // Seven Set — the third member of The Seven on this roster,
            // alongside The Visitor and Vengeance Jones. Per the Fortnite
            // Wiki she is loyal, serious and honourable, deeply protective
            // of her sister, and a major protagonist of Chapter 3 and
            // Chapter 7 Season 1.
            //
            // Colour is the crimson of her armour plating, worn over a dark
            // charcoal undersuit with steel edging and a black bob. It is
            // deliberately a cooler, deeper red than the flat #ff0000 the
            // Sith and the Coruscant Guard wear, so she does not read as one
            // of them at a glance, and it is clear of the other Fortnite five —
            // Cluster's yellow, The Voidblade's purple, Dylan's hot pink,
            // The Visitor's amber and Vengeance Jones's beige.
            //
            // She carries the Assault Rifle, the same weapon as Vengeance
            // Jones. That is deliberate and it is how the base roster
            // already works — fourteen clone battalions share the blaster
            // and are separated by health alone. Here the split is the same:
            // Jones is a renegade running alone on whatever he has, and
            // sits at the bottom of the Fortnite range; The Order is armoured and
            // fighting for her faction, so she sits mid-pack. Same gun,
            // different constitution.
            //
            // Bio is her in-game description verbatim.
            { id: 'order', name: 'The Order', color: '#dd2b3e', hp: 174, weapon: 'assaultrifle', secretUnlock: 'order', fortnite: true, bio: 'Her honor will lead us to victory. One of The Seven.' },
            // The fourth Assault Rifle carrier on this roster, and the base
            // half of the only elite pair in the Fortnite roster. She is the rival to
            // what The Prophecy becomes, so she is the same fighter without
            // the ascension: same silhouette, same gun, plainer everything.
            //
            // Colour is a deep sea-green, the one hue the Fortnite six left
            // unclaimed — Cluster's yellow, The Voidblade's purple, Dylan's
            // pink, The Visitor's amber, Vengeance Jones's beige and The
            // Order's crimson are all warm or violet, so nothing already on
            // this roster reads as green at a glance.
            //
            // HP sits between Jones and The Order for the same reason those
            // two are split at all: one rifle, different constitutions.
            // Jones runs alone on whatever he has (168), The Order fights
            // behind armour plate (174), and Rival Hope is in between at 171
            // — no plating, but not scavenging either.
            { id: 'rivalhope', name: 'Rival Hope', color: '#2fbfa0', hp: 171, weapon: 'assaultrifle', secretUnlock: 'rivalhope', fortnite: true, retiredBy: 'zeroEventCleared', bio: 'You have no hope against her.' },
            // Rival Hope ascended, and like her a member of The New Seven —
            // the side The Visitor, Vengeance Jones and The Order are on when
            // the Fortnite faction toggle splits the roster. Registered
            // in ELITE_BASE_IDS against 'rivalhope' so that anything she
            // does counts for the character she is a form of, the same way
            // Commander Fox (Elite) counts as Fox.
            //
            // The roster's elite convention is +15 HP and a better weapon
            // (Fox 150 to 165, Finn 155 to 170, Mando 190 to 205), and she
            // keeps to it: 171 to 186, the highest health in the Fortnite roster. The
            // weapon half of that promotion is deliberately restrained — see
            // the Enhanced AR's entry, which is a harder round rather than a
            // bigger gun — because +15 HP on top of a straight damage
            // upgrade would put her clear of the entire Fortnite roster at once
            // rather than a step above the one character she is a version of.
            //
            // Colour is her own sea-green lit up: the same hue read as the
            // burning version of it, so the two are recognisable as a pair
            // on the roster grid and never confusable in a fight.
            { id: 'prophecy', name: 'The Prophecy', color: '#6ff2d4', hp: 186, weapon: 'enhancedar', secretUnlock: 'prophecy', fortnite: true, retiredBy: 'zeroEventCleared', bio: 'Hope, for a better world. One of the Seven.' },
            // The woman who runs the Imagined Order, and the base half of the
            // roster's second elite pair. Vengeance Jones's entry above
            // already names her — he was her agent before the Zero Crisis and
            // he betrayed her for it — so she arrives on this roster with a
            // history against someone already standing on it.
            //
            // The fifth Assault Rifle carrier, and the lightest of them after
            // Jones. The ladder is a question of what each one has behind
            // them: Jones runs alone on what he can find (168), Rival Hope
            // has no plating but is not scavenging either (171), The Order
            // fights behind armour (174). Slone has the whole IO behind her
            // and almost none of it on her — she sends the people who do the
            // fighting, and 169 is what that is worth when she has to do it
            // herself.
            //
            // Colour is the deep copper of her hair, which is the thing about
            // her that reads at a glance. It sits between two colours already
            // on this roster and is deliberately clear of both: much darker
            // and redder than The Visitor's amber, much more orange than The
            // Order's crimson. Bio is her in-game description verbatim.
            { id: 'slone', name: 'Doctor Slone', color: '#a8482a', hp: 169, weapon: 'assaultrifle', secretUnlock: 'slone', fortnite: true, retiredBy: 'zeroEventCleared', bio: 'Do whatever it takes to secure Reality.' },
            // Slone elevated, and registered in ELITE_BASE_IDS against
            // 'slone' so anything she does counts for the character she is a
            // form of — the same wiring The Prophecy has to Rival Hope.
            //
            // The roster's elite convention is +15 and a better weapon, and
            // she keeps to it exactly: 169 to 184, Assault Rifle to Enhanced
            // AR. Where she lands matters more than the step itself. 184 puts
            // her one rung under The Prophecy at 186 and two under Geno at
            // 188, and that ordering is the point — her bio calls her a new
            // addition to The Seven, so she should not open above the member
            // who was already in it. She is the newest of them, not the
            // strongest.
            //
            // Colour is her own copper lit up, the same relationship The
            // Prophecy's sea-green has to Rival Hope's: recognisable as a
            // pair on the roster grid, never confusable in a fight.
            { id: 'innovation', name: 'The Innovation', color: '#e2723f', hp: 184, weapon: 'enhancedar', secretUnlock: 'innovation', fortnite: true, retiredBy: 'zeroEventCleared', bio: 'A brilliant, dangerous new addition. One of The Seven.' },
            // Season 9's Mystery Outfit, and the first female one the game
            // ever had. Earned through the Utopia Challenges rather than
            // bought, which is the closest thing Fortnite has to the secret
            // row this roster keeps.
            //
            // The one thing the wiki is emphatic about is that she does not
            // have a colour: her styles were a set, and the mech head built
            // at Pressure Plant was finished in whichever of them you had
            // unlocked. So this is a choice rather than a sample — an
            // electric indigo, picked because it is the slot the Fortnite
            // roster leaves open. The Voidblade's purple is lighter and
            // pinker, The Guardian's blue is a cold cobalt, and nothing sits
            // between them.
            //
            // 176 puts her one rung above The Order among the five Assault
            // Rifle carriers. The Order fights behind armour plate; the
            // Singularity fights inside a sealed suit and a full helmet,
            // which is worth the two points and no more. She stays under The
            // Guardian, who is a mech rather than someone wearing one.
            //
            // Deliberately NOT retired by the Zero Event. The event ends the
            // Fortnite roster as it stood when the event was written; she was
            // added afterwards and is not one of the fighters that story
            // kills. Giving her `retiredBy` would also mean any save that has
            // already cleared the event could never see her at all.
            { id: 'singularity', name: 'The Singularity', color: '#6d5cf0', hp: 176, weapon: 'assaultrifle', secretUnlock: 'singularity', fortnite: true, bio: 'The first and the last.' },
            // Epic outfit from the Valor Strike: Global Frontier set — a
            // modern-military line, alongside Valor, Tactician, Warfare and
            // the Striker Specialists. He is a soldier, not a cosmic figure,
            // and everything about him is scaled to that.
            //
            // Colour is the dark gunmetal of the armour itself: near-black
            // heavy plate and a visored helmet, with one warm rust accent at
            // the shoulder.
            //
            // The accent is deliberately NOT what he is coloured by, which is
            // the opposite call to Void Voyager — he takes his orange lining
            // precisely because a black suit in a black arena cannot be seen.
            // That works there because Voyager fights once, in one place,
            // against a cast that is known in advance. Here it would put a
            // third copper on a roster that already has Doctor Slone at
            // #a8482a and The Innovation at #e2723f, and three warm coppers
            // are three fighters nobody can tell apart at a glance.
            //
            // So he takes the plate — but not the plate's true value. This
            // field is not "what colour is the armour", it is "what colour
            // identifies this fighter on screen", and it drives the HUD name,
            // the health bar and the portrait ring as well as the body.
            //
            // Taken to an accurate near-black it passed the arena and failed
            // the HUD: the name became unreadable against a panel that is
            // itself nearly black. This is the darkest steel that survives
            // that panel, which is the constraint the number actually has to
            // satisfy. Hush at #4a1620 is the one entry that goes deeper, and
            // he is not a good precedent to follow twice.
            //
            // 178 sits him above all five Assault Rifle carriers and below the
            // two Enhanced AR elites. He carries the better gun, so he should
            // outrank the rifles; he is not an ascended anything, so he should
            // not reach The Innovation at 184 or The Prophecy at 186. A good
            // soldier with a hard round, between the two groups.
            //
            // Placed with the Imagined Order and the Last Reality. He was
            // read as unaligned at first — a Global Frontier soldier is not
            // one of The Seven any more than The Guardian is — but he works
            // for Geno, and an employer is a firmer answer than a
            // temperament. He stands with Geno and Hush.
            //
            // Not retired by the event, for the same reason as The Singularity
            // and Bastian: he arrives after the story that ends the others.
            { id: 'phantom', name: 'Phantom', color: '#5a6875', hp: 178, weapon: 'enhancedar', secretUnlock: 'phantom', fortnite: true, bio: 'A new frontier of warfare.' },
            // White hair under a teal hood, a teal cape, tan leather and a
            // blade at the hip — a storybook adventurer among a roster of
            // soldiers and machines, and the only Fortnite fighter here who
            // carries a sword.
            //
            // Colour is the hood, which is the thing anyone would describe him
            // by. Deliberately a deeper, bluer teal than Rival Hope's #2fbfa0:
            // hers is a bright mint, his is closer to sea-water, and the two
            // have to be told apart on a roster grid. They are also rarely
            // both on one — Rival Hope is among the fighters the Zero Event
            // ends, and Bastian arrives after it.
            //
            // 180 is what a melee fighter is owed here. Everyone else in this
            // column shoots from wherever they please; he has to cross the
            // floor to do anything at all, and Dylan's shotgun already
            // establishes that walking into range is worth health back. Still
            // under The Guardian, who is a mech rather than someone in a cape.
            { id: 'bastian', name: 'Bastian', color: '#1f8f85', hp: 180, weapon: 'seekerssword', secretUnlock: 'bastian', fortnite: true, bio: 'A hero of myth and magic.' },
            // The second character in the game with an ability on Interact,
            // after Vader — press E for a five-second Spin Dash that more
            // than doubles his speed and hurts anything he runs through.
            //
            // He carries a rifle because the dash is not how he fights. It is
            // how he closes, escapes, or draws a line through a crowd, and
            // giving him a melee weapon on top would make the eleven-second
            // cooldown the only interesting thing about the other ten.
            //
            // 172 is deliberately unremarkable. A character with a button
            // nobody else has should not also be near the top of the health
            // ladder; the ability is the thing he has.
            //
            // Colour is Sonic's blue, kept a shade brighter and cleaner than
            // Twisted Sonic's #1273d4 in the event cast. That the two are
            // close is the point — one is what the other used to be — and
            // they can never appear together, since the twisted one is
            // event-only and this one is not in the event at all.
            { id: 'sonic', name: 'Sonic', color: '#2a8fef', hp: 172, weapon: 'assaultrifle', secretUnlock: 'sonic', fortnite: true, bio: "This android's gotta go fast." },
            // Slurp Squad, and the Slurp Series is the one part of Fortnite
            // with a colour of its own: the luminous blue-green of the juice
            // itself. Taken from the set rather than sampled from him, since
            // that is what the set means — everything in it is that colour.
            //
            // It is also the only slurp note on this roster. Rival Hope's
            // mint and Bastian's sea-water are both greener and both duller;
            // this is the bright, faintly toxic cyan of something you drink.
            //
            // 196 is the highest health of any Fortnite fighter, above Geno
            // at 188 and The Prophecy at 186, and it is the only stat he
            // wins. He is enormous and he carries the weakest round in the
            // set — nine damage a shot — so what he actually is on this
            // roster is a wall with a fast trigger, which has to walk into
            // range to matter and can afford the walk.
            { id: 'big_chuggus', name: 'Big Chuggus', color: '#3fe0d0', hp: 196, weapon: 'submachine', secretUnlock: 'big_chuggus', fortnite: true, bio: 'Small chugguses need not apply.' },
            // Tidal King Set, and Slurp Series like Big Chuggus — a god who
            // is, per the wiki, made of the stuff. The two of them are the
            // only slurp on the roster and they stand on opposite sides of
            // it, which is the sort of thing a season is for.
            //
            // Colour separates them the way the sea separates from the juice:
            // Chuggus is the bright cyan of a full jug, and this is the same
            // family taken deep and blue, an ocean rather than a drink. It
            // also has to hold against Sonic's #2a8fef and The Guardian's
            // #4d8bf0, and it does — both of those are true blues where this
            // stays firmly cyan.
            //
            // 190 is second only to Chuggus among the Fortnite fighters, and
            // a god eons old should not be beaten on durability by much. What
            // he pays for it is the Warforged AR's reload: nearly five
            // seconds of fire and then over three with nothing, which is the
            // longest gap in the game. He is enormously strong right up until
            // the magazine runs out, and then he is a target.
            { id: 'poseidon', name: 'Poseidon', color: '#1aa5c9', hp: 190, weapon: 'warforgedar', secretUnlock: 'poseidon', fortnite: true, bio: 'Slurp-god of the sea. King of the beach.' },
            // What walks out of the Zero Point when The Visitor walks in. He
            // is not bought and he is not found: the only way onto this roster
            // is the one fight, and it costs the character who wins it.
            //
            // Colour is a cold platinum-white, and the Ex-Caliber's rounds are
            // set to the same value in the weapon library, so the long bolts he
            // puts down the arena read as coming from him. No saberColor field:
            // it would put a 'Saber' row on the stat card of a man with a rifle.
            //
            // 188 HP is the highest in the Fortnite roster, one clear of The Prophecy. He
            // is the end of a line rather than a purchase, and the weapon he
            // carries is a heavy six-round rifle rather than a magazine that
            // forgives — so the health is what makes the reload survivable
            // instead of fatal.
            { id: 'geno', name: 'Geno', color: '#e8f0ff', hp: 188, weapon: 'excaliber', secretUnlock: 'geno', fortnite: true, retiredBy: 'zeroEventCleared', bio: 'Perfection, embodied.' },
            // Geno's lieutenant, and the only other Imagined Order fighter on
            // this roster who is there by rank rather than by temperament —
            // The Voidblade, Dylan and Cluster are all freelancers by
            // comparison. Unlike him she is simply bought: the Zero Point
            // encounter is his alone, and gating a shop character behind it
            // would make her unreachable for anyone who has not found it.
            //
            // Colour is her armour: near-black, lit from inside by the red
            // running through the suit. Deliberately the dark one of the Fortnite
            // set — Cluster's yellow, The Voidblade's purple, Dylan's pink,
            // Vengeance Jones's beige, Rival Hope's green, The Prophecy's aqua
            // and Geno's platinum are all light, so nothing else here reads as
            // black at a glance.
            //
            // Taking the red as her body colour instead was the obvious call
            // and the wrong one: The Order is already #dd2b3e, and the Fortnite
            // faction toggle puts the two of them in opposite columns, so they
            // can be pointed at each other. Two reds in that fight is one red
            // too many. The red lives in her rifle instead — see the Deadeye's
            // entry, whose rounds are the only bright thing she puts on screen.
            //
            // 176 HP puts her a shade above The Order and well under Geno's
            // 188. A lieutenant should be harder to put down than the
            // freelancers and softer than the man she reports to.
            { id: 'hush', name: 'Hush', color: '#4a1620', hp: 176, weapon: 'deadeyear', secretUnlock: 'hush', fortnite: true, retiredBy: 'zeroEventCleared', bio: 'A lieutenant of perfection.' },
            // The only fighter on this roster that is piloted rather than
            // worn: a mech with a sprite in the cockpit, which is what its
            // bio is about and what Guardian Customization at the Zero Point
            // dresses — see GUARDIAN_SKINS.
            //
            // Deliberately NOT isDroid, though it is plainly a machine. That
            // flag is a rules package, not a description — stun and knockdown
            // immunity, an Anzellan repair crew under 35% health, and double
            // damage from a wrench — and the Guardian is meant to be a
            // fighter you buy for its health and its rifle, not one that
            // rewrites the matchup against zaps, wrenches and Babu Frik. It
            // is a mech in fiction and an ordinary body in the rules.
            //
            // The fourth carrier of the base Assault Rifle, and the heaviest
            // of them: Vengeance Jones runs alone on scavenged gear (168),
            // Rival Hope is unarmoured but supplied (171), The Order fights
            // behind plate (174), and the Guardian *is* the plate (182). It
            // stops short of The Prophecy (186) and Geno (188) — those two
            // are the end of a story, and this one is a purchase. What it
            // pays for those eight points over The Order is the price tag:
            // 750 credits against her 600, the second dearest thing in the
            // Fortnite.
            //
            // Colour is cobalt, the one hue the Fortnite roster left unclaimed: Cluster's
            // yellow, The Voidblade's violet, Dylan's pink, The Visitor's
            // amber, Vengeance Jones's beige, The Order's crimson, Rival
            // Hope's sea-green, The Prophecy's aqua, Geno's platinum and
            // Hush's near-black are none of them blue. A fitted sprite
            // repaints it (applyGuardianSkin), so the eye needs a factory
            // colour it can tell from every skin as well as every fighter.
            { id: 'guardian', name: 'The Guardian', color: '#4d8bf0', hp: 182, weapon: 'assaultrifle', secretUnlock: 'guardian', fortnite: true, bio: 'One small Sprite. One big mech.' },
    
            // The only fighter in the game that costs nothing and cannot be
            // bought. He is not sold anywhere: clearing the Zero Event puts
            // him on the roster, and that is the whole of his price. It is
            // also why he has no `retiredBy` — he arrives on the far side of
            // the story that ends the others, in the wreckage they left.
            //
            // Sixth carrier of the base Assault Rifle and the lightest of
            // them: Vengeance Jones runs alone on scavenged gear (168), Sonic
            // is an android built for speed (172), Rival Hope is unarmoured
            // but supplied (171), The Order fights behind plate (174) and the
            // Guardian is the plate (182). Wrixel is a builder holding a
            // rifle, which is worth less than any of them, and 170 says so
            // without making him a liability.
            //
            // Colour is a block-green nothing else on the Fortnite roster
            // claims — Cluster is yellow, Rival Hope's #2fbfa0 is sea-green
            // and The Prophecy's #6ff2d4 is aqua, both of them blue-side.
            // This one is grass. It is only where he starts: the player can
            // repaint him to anything (applyWrixelColor), so this needs to be
            // as distinct from those as it is from them.
            { id: 'wrixel', name: 'Wrixel', color: '#63c74d', hp: 170, weapon: 'assaultrifle', secretUnlock: 'wrixel', fortnite: true, bio: 'Be the blocks you wish to see in the world.' }
    ],

    /*  ── WEAPONS ─────────────────────────────────────────────────── */
    weapons: {
            // A hero's blade rather than an energy one, so it swings at flesh and
            // does not carry `deflects` — the same line the wrench and the Pickaxe
            // sit on. `returnable` it does get: throwing the sword and
            // having it come back is the fantasy, and the melee weapons that read
            // as heirlooms all have it.
            //
            // Sits between the Pickaxe and the Darksaber. Steve's pickaxe hits
            // harder (28) because it is a lump of tool on a slow swing; this is a
            // lighter, faster blade with more reach, which is what a duellist's
            // weapon should be against a tool.
            seekerssword: { key: 'seekerssword', label: "Seeker's Sword", damage: 24, variance: 0.10, speed: 8, cooldown: 440, spin: true, draw: 'blade', color: '#b9ddd6', length: 32, returnable: true, melee: true, reach: 36, vaulted: true },
            // ── FORTNITE WEAPON DAMAGE ─────────────────────────────────────
            // Every Fortnite weapon in this library takes its magazine, reload
            // and rate of fire from the Fortnite Wiki, and its damage from this
            // game. That split is deliberate, and it is a correction.
            //
            // The first pass took the wiki's damage too, reasoning about each
            // weapon against the other Fortnite weapons. Against the roster they
            // actually have to fight, the result was not close: a wiki-accurate
            // Assault Rifle killed Obi-Wan in 1.2 seconds while he needed 4.5 to
            // kill its owner, and Cluster's pistol did it in 0.8. Fortnite's
            // numbers are calibrated against Fortnite's health pools and against
            // a target who can throw up a wall mid-burst. Here the baseline is a
            // 25-damage blaster every 400ms, a lightsaber that deals 36 a second,
            // and nowhere to hide.
            //
            // So the rates of fire stay authentic — they are what makes these
            // feel like Fortnite weapons — and the damage is scaled to this
            // roster. The Fortnite guns now sit between the blaster's 63 dps and the
            // Minigun's 150, which is where a good gun belongs in this game.
            //
            // Three Fortnite weapons were never part of the problem and keep their
            // numbers untouched: the Boom Sniper, the Extending Focus Shotgun and
            // the Ex-Caliber all already pay for their damage with a slow trigger.
            //
            // Lancehead Pistol — the first semi-automatic weapon in the game,
            // and one of two: the Glock below is the other, and the two are
            // deliberately opposite readings of the same trigger.
            //
            // Magazine, reload and fire rate track the Fortnite Wiki's Rare
            // tier: 7.7 rounds/sec (= 130ms cooldown), 21-round magazine, 2.7s
            // reload. In-game description there: "Semi-automatic pistol featuring
            // a high fire rate, large magazine, moderate damage" — which is what
            // 10 a round at that rate is here. The wiki's 30 made it a 231 dps
            // pistol, the highest figure in the game by half again; see the note
            // above. It reads like the Minigun now, which is the right company:
            // 15 a round every 100ms there, 10 every 130ms here.
            //
            // semiAuto means one shot per trigger pull — holding fire does
            // nothing after the first round, so the cooldown is only a ceiling
            // and real DPS is however fast the player can click (the source
            // weapon is likewise described as rewarding a good trigger finger).
            // See the triggerReleased latch in the player fire block.
            //
            // Not modelled, because this game has no equivalent: the mag-throw
            // on reload, tactical reloads, hitscan, and the headshot multiplier.
            lancehead:  { key: 'lancehead',  label: 'Lancehead Pistol', damage: 10, variance: 0.10, speed: 11,  cooldown: 130, spin: false, draw: 'bolt',   color: '#ffe9a8', length: 18, magSize: 21, reloadMs: 2700, semiAuto: true, vaulted: true },
            // Burst Rifle — The Voidblade's weapon, and the only burst weapon in
            // the game. Stats track the Fortnite Wiki's figures for the rifle she
            // drops — three-round burst, 30-round magazine, 2.38s reload — with
            // damage set for this game rather than taken from it: 11 a round, so
            // a burst puts 33 into a target for every trigger pull. The wiki's 31
            // would be 93 a pull, and even the 26 an earlier pass settled on was
            // 78 — three blaster shots arriving at once, which is how this became
            // the highest sustained damage in the game. See the note above the
            // Lancehead.
            //
            // The wiki lists two rates: 14/sec for the rounds inside a burst
            // (= burstDelay 71ms) and 5.69/sec overall. `cooldown` is the gap
            // after the third round, so a full cycle is 390 + 2×71 ≈ 530ms —
            // three rounds every 530ms, which is that 5.69/sec. See
            // burstAwareCooldown() for how the two gaps are alternated.
            //
            // Not modelled, because this game has no equivalent: hitscan, the
            // 1.5× headshot multiplier, first-shot accuracy, and the reduced
            // damage falloff that makes it a ranged weapon in the first place
            // (nothing here falls off with distance).
            burstrifle: { key: 'burstrifle', label: 'Burst Rifle', damage: 11, variance: 0.08, speed: 13, cooldown: 390, spin: false, draw: 'bolt', color: '#c08cff', length: 20, magSize: 30, reloadMs: 2380, burst: 3, burstDelay: 71, vaulted: true },
            // Extending Focus Shotgun — Dylan's weapon. Per the Fortnite Wiki: a
            // fast-firing triple-barrel shotgun, 3-shell magazine, every shell
            // reloaded at once (2.2s at the Rare tier).
            //
            // The wiki's 9-pellet spread is *not* reproduced: this fires a tight
            // group of four. Nine travelling projectiles a shot read as a wall of
            // bullets on this canvas rather than as a shotgun, and each pellet
            // costs a collision test. Per-pellet damage is set so that a clean
            // hit — all four connecting — is worth about a sniper round, earned
            // at shotgun range off three shells.
            //
            // Its namesake trick is modelled: firing continuously tightens the
            // group (focusStep/focusMinArc, see focusedArc()), and stopping lets
            // it relax back open. The 3-shell magazine means a full mag walks the
            // spread from widest to tightest exactly once before the reload
            // resets it.
            //
            // maxRange stands in for the wiki's damage falloff, which this game
            // has no notion of — the pellets simply die at shotgun range.
            focusshotgun: { key: 'focusshotgun', label: 'Extending Focus Shotgun', damage: 12, variance: 0.12, speed: 10, cooldown: 500, spin: false, draw: 'bolt', color: '#ff7ab8', length: 12, magSize: 3, reloadMs: 2200, multishot: 4, multishotArc: 0.14, focusStep: 0.5, focusMinArc: 0.04, maxRange: 260, vaulted: true },
            // Boom Sniper — The Visitor's weapon. Per the Fortnite Wiki it is the
            // Exotic version of the Heavy Sniper Rifle: 5 rounds in the magazine
            // (the Heavy carries 1), a very slow reload like the Heavy's, first
            // shot accuracy, and no damage falloff at any range.
            //
            // It is deliberately *just a sniper* here. The wiki's headline trick —
            // it fires small Clingers that stick, then explode a moment after
            // landing — is not modelled: nothing in this game sticks to anything,
            // and a delayed area blast is a whole damage system rather than a
            // weapon stat. The round simply hits. The amber bolt colour is the
            // only nod to the "boom" left.
            //
            // The magazine and reload are the wiki's; the fire rate is not. The
            // Heavy Sniper fires 0.33 rounds/sec — a 3-second gap between shots,
            // which on this canvas is a character standing still watching. This
            // game's own Sniper Rifle sits at 950ms, so the Boom Sniper takes
            // 1000ms and pays for its heavier round with the magazine instead:
            // five shots, then four seconds of nothing.
            //
            // Also not modelled, because this game has no equivalent: hitscan,
            // the 2× headshot multiplier, and the damage falloff it is exempt
            // from (nothing here falls off with distance anyway).
            boomsniper: { key: 'boomsniper', label: 'Boom Sniper', damage: 60, variance: 0.03, speed: 18, cooldown: 1000, spin: false, draw: 'bolt', color: '#ffb347', length: 30, magSize: 5, reloadMs: 4050, vaulted: true },
            // Assault Rifle — Vengeance Jones's weapon. Per the Fortnite Wiki it
            // dates to the Pre-Season and is "arguably the best all-around
            // weapon in the game": accurate, fully automatic, well rounded, good
            // at short and long range and excelling at medium.
            //
            // Two figures come straight off the wiki and one is derived from
            // them: the 30-round magazine, and the note that it holds "5.28
            // seconds of pumping lead down range" — 30 rounds in 5.28s is
            // 5.68 rounds/sec, which is this 176ms cooldown. (The wiki also
            // notes more recent versions carry 25; the 30 is the classic.)
            //
            // Damage does NOT track the wiki's 30/31/33 Common/Uncommon/Rare
            // ladder. In Fortnite an Assault Rifle pays for its uptime with
            // damage falloff past 50m and with the fact that a target can build
            // cover mid-burst. Neither exists here: nothing falls off with
            // distance, no one builds, and these arenas are small enough that a
            // full magazine at that fire rate lands nearly every round. Five and
            // a half rounds a second is a lot of rounds to be paid for at
            // Fortnite rates — at the wiki's numbers this was a 148 dps rifle
            // against a roster whose standard sidearm does 63. At 14 it is a
            // strong all-rounder at 80, clear of the blaster and well under the
            // Minigun, which is exactly what "best all-around weapon" should mean
            // in a game it was added to rather than the one it came from.
            //
            // The magazine is what actually balances it, and that part IS
            // authentic: 5.3 seconds of fire followed by a reload during which
            // he has no answer at all.
            //
            // Not modelled, because the game has no equivalent: hitscan, first
            // shot accuracy, the 1.5x–1.75x headshot multiplier, and the
            // distance falloff described above.
            assaultrifle:{ key: 'assaultrifle', label: 'Assault Rifle', damage: 14, variance: 0.08, speed: 12, cooldown: 176, spin: false, draw: 'bolt', color: '#ffcf7a', length: 20, magSize: 30, reloadMs: 2300, vaulted: true },
            // Warforged AR — Poseidon's. The wiki calls it a fully automatic
            // rifle with slightly higher than average DPS, a larger than average
            // magazine and a notably long reload, good up close and poor at
            // distance.
            //
            // All three of those are authentic here: 7.3 rounds a second becomes
            // the 137ms trigger, the magazine is 35 against the standard rifle's
            // 30, and the reload is 3.2 seconds against its 2.3. Damage is scaled
            // to this roster as usual, and at 12 it lands on 88 dps — a little
            // over the Assault Rifle's 80, which is exactly the "slightly higher
            // than average" the wiki describes.
            //
            // The reload is what pays for all of it, and it is the most expensive
            // in the game: 4.8 seconds of fire followed by 3.2 seconds of
            // nothing. Two fifths of any sustained fight, spent empty.
            //
            // Not modelled, because the game has no equivalent: hitscan, first
            // shot accuracy, the vertical foregrip, recoil, and the range falloff
            // that is the whole reason it is a close-range weapon in Fortnite.
            warforgedar: { key: 'warforgedar', label: 'Warforged AR', damage: 12, variance: 0.08, speed: 12, cooldown: 137, spin: false, draw: 'bolt', color: '#9fe6d8', length: 20, magSize: 35, reloadMs: 3200, vaulted: true },
            // The Assault Rifle after a trip to the mod bench: the same gun,
            // rebuilt to hit harder per round rather than to fire more of them.
            //
            // It is deliberately NOT a strict upgrade, because the roster has no
            // room for one. Over a full magazine plus its reload the two land
            // within a percent of each other — 30 x 14 in 5.3s then 2.3s down,
            // against 25 x 17 in 5.1s then 2.5s down, so 55 dps against 56 — and
            // the Enhanced AR does not out-grind the base rifle in a long fight.
            // What it buys is the shape of the damage: a 17-point round instead
            // of a 14-point one, which is fewer shots needed on any given target
            // and matters against something that is dodging between them. What it
            // costs is five rounds of magazine and an extra fifth of a second
            // reloading, so every miss is worth more and every empty magazine
            // hurts longer.
            //
            // Slightly faster in the air and slightly tighter in variance than
            // the base rifle, both for the same reason: a heavier round from a
            // rebuilt barrel should land where it was pointed.
            enhancedar: { key: 'enhancedar', label: 'Enhanced AR', damage: 17, variance: 0.07, speed: 13, cooldown: 205, spin: false, draw: 'bolt', color: '#8ff0dd', length: 21, magSize: 25, reloadMs: 2500, vaulted: true },
            // The marksman of the three Assault Rifles, and the third point on a
            // line the other two already draw. Base AR: 14 a round every 176ms
            // from thirty. Enhanced: 17 every 205ms from twenty-five. Deadeye: 22
            // every 300ms from twenty. Each step up the ladder is a heavier round,
            // a slower trigger and a shorter magazine, and each one gives up
            // sustained damage for it — 55 dps over a full magazine and reload
            // for the base rifle, 56 for the Enhanced, 52 here.
            //
            // So the Deadeye never wins a straight exchange with either of them.
            // What it wins is exchanges that are not straight: 22 a round is the
            // heaviest automatic hit in the game, which is what matters against
            // something dodging between shots rather than standing in them.
            //
            // Round colour is Hush's red rather than anything gun-metal, because
            // she is near-black head to foot and this is the one part of her the
            // eye can actually track across an arena.
            //
            // Named for its accuracy, which is not modelled as a stat because the
            // rifles have nothing to model it against — no weapon in this family
            // has any angle spread to tighten. It shows up in the AI profile
            // instead: 'calculated' rather than the disciplined default the other
            // two get, so Hush picks her shots and moves between them.
            deadeyear:  { key: 'deadeyear',  label: 'Deadeye Assault Rifle', damage: 22, variance: 0.04, speed: 13, cooldown: 300, spin: false, draw: 'bolt', color: '#ff2a3c', length: 22, magSize: 20, reloadMs: 2400, vaulted: true },
            // The round is the tell: a 56-long bolt, nearly twice the Boom
            // Sniper's 30 and the longest thing in the air in this game. It reads
            // as a streak rather than a shot, which is the only warning anything
            // gets that 52 points are on the way.
            //
            // Drawn as a bolt like every other gun, not with the 'saber' style an
            // earlier pass used. That style renders an actual blade and takes its
            // colour from the owner rather than the weapon, and it shares the
            // lightsaber's icon — between them they made a rifle with no reach, no
            // clash and no deflect look like a melee weapon everywhere it appeared.
            //
            // Placed between the heavy single-shot weapons and the automatics,
            // because that is the gap it fills. Inside a magazine it lands at
            // 81 dps against the Boom Sniper's 60 and the Assault Rifle's 80;
            // counting the reload it is 46 against 33 and 55. So it out-hits the
            // scoped weapons while the magazine lasts and loses to every
            // automatic once the reload is counted — a 52-point round that does
            // not need range to work for it, from six rounds that punish a miss
            // harder than any other magazine in the game.
            //
            // Its damage is untouched by the Fortnite rescaling above: 52 every 640ms
            // was already inside this roster's band, because the slow trigger was
            // paying for the heavy round from the start.
            //
            excaliber:  { key: 'excaliber',  label: 'Ex-Caliber Rifle', damage: 52, variance: 0.05, speed: 14, cooldown: 640, spin: false, draw: 'bolt', color: '#e8f0ff', length: 56, magSize: 6, reloadMs: 2900, vaulted: true },
    },

    weaponEmoji: { lancehead:'🔫', burstrifle:'🔫', focusshotgun:'🔫', boomsniper:'🎯', assaultrifle:'🔫', enhancedar:'🔫', deadeyear:'🔫', excaliber:'🔫', warforgedar:'🔫', seekerssword:'⚜' },

    /*  ── THE SHOP ────────────────────────────────────────────────── */
    shopItems: [
        { id: 'cluster', name: 'Cluster', cost: 400, description: 'Unlocks Cluster with the semi-automatic Lancehead Pistol', fortnite: true },
        { id: 'voidblade', name: 'The Voidblade', cost: 600, description: 'Unlocks The Voidblade with the three-round-burst Burst Rifle', fortnite: true },
        { id: 'dylan', name: 'Dylan', cost: 500, description: 'Unlocks Dylan with the Extending Focus Shotgun, whose paired shot tightens as she keeps firing', fortnite: true },
        { id: 'visitor', name: 'The Visitor', cost: 700, description: 'Unlocks The Visitor with the Boom Sniper, the heaviest single shot in the game', fortnite: true },
        { id: 'vengeancejones', name: 'Vengeance Jones', cost: 550, description: 'Unlocks Vengeance Jones with the fully automatic Assault Rifle, thirty rounds of the best all-round weapon in the game', fortnite: true },
        { id: 'order', name: 'The Order', cost: 600, description: 'Unlocks The Order of The Seven, carrying the Assault Rifle behind the heaviest guard of its two wielders', fortnite: true },
        { id: 'rivalhope', name: 'Rival Hope', cost: 575, description: 'Unlocks Rival Hope with the fully automatic Assault Rifle', fortnite: true },
        { id: 'prophecy', name: 'The Prophecy', cost: 800, description: 'Unlocks The Prophecy, Rival Hope ascended, with the Enhanced AR — a heavier round from a shorter magazine', fortnite: true },
        { id: 'slone', name: 'Doctor Slone', cost: 560, description: 'Unlocks Doctor Slone, who runs the Imagined Order, with the fully automatic Assault Rifle', fortnite: true },
        { id: 'innovation', name: 'The Innovation', cost: 780, description: 'Unlocks The Innovation, Slone elevated, carrying the Enhanced AR', fortnite: true },
        // The six below are the post-event arrivals, and the Shop holds
        // them back until the Zero Event has actually been cleared.
        //
        // Every one of them was written as arriving *after* that story --
        // which is exactly why none of them carries `retiredBy` while the
        // rest of the Fortnite roster does. Selling them beforehand put
        // them on the field beside the fighters the event is about to
        // kill, in the one arrangement the roster was never meant to
        // hold. They stay listed and priced while locked, so the gate
        // reads as something to work towards rather than as content that
        // does not exist.
        { id: 'singularity', name: 'The Singularity', cost: 620, description: 'Unlocks The Singularity with the fully automatic Assault Rifle, carried behind a sealed suit and a full helmet', fortnite: true, requiresZeroEvent: true },
        { id: 'phantom', name: 'Phantom', cost: 700, description: 'Unlocks Phantom with the Enhanced AR, a soldier carrying the harder round without the rank that usually comes with it', fortnite: true, requiresZeroEvent: true },
        { id: 'bastian', name: 'Bastian', cost: 720, description: 'Unlocks Bastian and the Seekers Sword, a thrown blade that comes back to the hand that sent it', fortnite: true, requiresZeroEvent: true },
        { id: 'poseidon', name: 'Poseidon', cost: 780, description: 'Unlocks Poseidon with the Warforged AR, the biggest magazine on the roster behind the longest reload', fortnite: true, requiresZeroEvent: true },
        { id: 'big_chuggus', name: 'Big Chuggus', cost: 680, description: 'Unlocks Big Chuggus with the Submachine Gun, the fastest trigger and the lightest round on the roster', fortnite: true, requiresZeroEvent: true },
        { id: 'sonic', name: 'Sonic', cost: 760, description: 'Unlocks Sonic with the Assault Rifle, and Spin Dash on Interact - five seconds of speed that hurts whatever it touches', fortnite: true, requiresZeroEvent: true },
        { id: 'hush', name: 'Hush', cost: 650, description: 'Unlocks Hush with the Deadeye Assault Rifle, the heaviest automatic round in the game from the shortest automatic magazine', fortnite: true },
        { id: 'guardian', name: 'The Guardian', cost: 750, description: 'Unlocks The Guardian, a sprite-piloted mech carrying the fully automatic Assault Rifle, and opens Guardian Customization at the Zero Point', fortnite: true },
    
    ],

    /*  ── ARENAS ──────────────────────────────────────────────────── */
    arenas: {
        zeropoint: {
            // Larger than any other arena — 1.5x across, so about 2.25x the
            // play area. The view pulls back to show all of it (see
            // arenaWorldScale()), which is what makes the fighters read as
            // small figures in a very large dark place.
            //
            // This was 2x, and 2x cost more than it bought. Characters are a
            // fixed 18 world units, so the scale divides their on-screen
            // size directly: at 2x they were 9px across and manual aiming
            // became genuinely difficult — you were trying to click a dot.
            // 1.5x puts them back to 12px while keeping the map decisively
            // bigger than everything else. The anomaly is unaffected either
            // way: its radius is a fraction of the world, so it covers the
            // same share of the screen at any scale.
            worldScale: 1.5,
            bg: (w, h, _tickScale) => {
                // The unstable anomaly drags another world's ground through
                // the floor rather than moving the fight to it. The Zero
                // Point is where you are and stays where you are; what
                // changes underfoot is which reality is currently bleeding
                // in. Everything below this paints on top of the borrowed
                // terrain, so the violet, the cracks and the singularity all
                // survive the swap and the place is still recognisable.
                // When another world has bled through, it reads as that world
                // and nothing else — this returns before the void, the bloom
                // and the cracks below.
                //
                // Those three used to paint over the borrowed ground: a 62%
                // black-violet wash, a violet bloom and violet fractures. The
                // result was not "the Death Star", it was a purple smear that
                // happened to have trenches in it, and the same for every
                // other arena. Whatever the anomaly drags up should look like
                // the place it came from.
                //
                // The Zero Point is still plainly there without any of it:
                // the singularity is drawn by the hazard layer on top of
                // whatever this paints, at its own size and its own colour.
                if (zeroPointTerrain && ARENAS[zeroPointTerrain]) {
                    ARENAS[zeroPointTerrain].bg(w, h, _tickScale);
                    return;
                }
    
                // Almost black. The purple is something showing THROUGH the
                // dark rather than a colour laid on top of it, so the base
                // is nearly neutral and every violet note is additive.
                ctx.fillStyle = '#050208';
                ctx.fillRect(0, 0, w, h);
    
                // A faint violet bloom bleeding out of the centre, where the
                // singularity sits. Keeps the middle of a very big, very
                // dark field from reading as empty canvas.
                const bloom = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h) * 0.55);
                bloom.addColorStop(0,   'rgba(76,29,149,0.30)');
                bloom.addColorStop(0.45,'rgba(46,16,101,0.13)');
                bloom.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = bloom;
                ctx.fillRect(0, 0, w, h);
    
                // Cracks running across the void, all pointing back at the
                // centre. Built once and cached on the arena object: they
                // are scenery, and regenerating them per frame would make
                // the whole floor crawl. Invalidated on resize alongside
                // the other cached arena particles.
                const A = ARENAS.zeropoint;
                if (!A._cracks || A._cracksW !== w || A._cracksH !== h) {
                    A._cracksW = w; A._cracksH = h;
                    A._cracks = [];
                    const rings = 26;
                    for (let i = 0; i < rings; i++) {
                        // Deterministic angles so the pattern is stable
                        // between rounds rather than reshuffling each time.
                        const a = (i / rings) * Math.PI * 2 + (i % 3) * 0.21;
                        const startR = Math.min(w, h) * (0.17 + (i % 5) * 0.035);
                        const endR   = Math.min(w, h) * (0.30 + (i % 7) * 0.075);
                        const pts = [];
                        const segs = 5 + (i % 4);
                        for (let s = 0; s <= segs; s++) {
                            const t = s / segs;
                            const r = startR + (endR - startR) * t;
                            // Jitter the angle per segment so the line
                            // forks and wanders like a fracture instead of
                            // being a clean radial spoke.
                            const wobble = Math.sin(i * 3.7 + s * 2.3) * 0.055 * (1 - t * 0.4);
                            pts.push({ x: w/2 + Math.cos(a + wobble) * r,
                                       y: h/2 + Math.sin(a + wobble) * r });
                        }
                        A._cracks.push({ pts, seed: i });
                    }
                }
    
                const t = Date.now() / 1000;
                ctx.save();
                ctx.lineCap = 'round';
                for (const crack of A._cracks) {
                    // Each crack breathes on its own offset, so the field
                    // glimmers unevenly rather than pulsing as one sheet.
                    const glow = 0.34 + 0.3 * Math.sin(t * 1.25 + crack.seed * 0.9);
                    ctx.globalAlpha = glow;
                    ctx.strokeStyle = '#7c3aed';
                    ctx.lineWidth = 2.2;
                    if (effectsEnabled()) { ctx.shadowBlur = 12; ctx.shadowColor = '#a855f7'; }
                    ctx.beginPath();
                    ctx.moveTo(crack.pts[0].x, crack.pts[0].y);
                    for (let s = 1; s < crack.pts.length; s++) ctx.lineTo(crack.pts[s].x, crack.pts[s].y);
                    ctx.stroke();
                    // Hot filament down the middle of the fracture
                    ctx.globalAlpha = glow * 0.75;
                    ctx.strokeStyle = '#d8b4fe';
                    ctx.lineWidth = 0.8;
                    ctx.shadowBlur = 0;
                    ctx.stroke();
                }
                ctx.restore();
            },
            grid: 'rgba(124,58,237,0.05)',
            coverColor: '#1a0b2e', coverBorder: '#4c1d95'
        },
        clustercoast: {
            bg: (w, h, tickScale = 1) => {
                // Cluster Coast — Fortnite's own POI. Golden sand and
                // teal shallows, keyed to Cluster's #ffc93c so he reads as
                // being on home turf.
                const horizon = h * 0.40;
                const shore   = h * 0.66;
    
                const sky = ctx.createLinearGradient(0, 0, 0, horizon);
                sky.addColorStop(0, '#2f9fc4'); sky.addColorStop(1, '#9fe3d8');
                ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);
    
                // Low sun off to one side, glinting down the water
                const sun = ctx.createRadialGradient(w * 0.74, horizon * 0.42, 0, w * 0.74, horizon * 0.42, h * 0.34);
                sun.addColorStop(0, 'rgba(255,201,60,0.35)');
                sun.addColorStop(0.45, 'rgba(255,201,60,0.10)');
                sun.addColorStop(1, 'rgba(255,201,60,0)');
                ctx.fillStyle = sun; ctx.fillRect(0, 0, w, shore);
    
                const sea = ctx.createLinearGradient(0, horizon, 0, shore);
                sea.addColorStop(0, '#12718f'); sea.addColorStop(1, '#3fc4b4');
                ctx.fillStyle = sea; ctx.fillRect(0, horizon, w, shore - horizon);
    
                const sand = ctx.createLinearGradient(0, shore, 0, h);
                sand.addColorStop(0, '#f0d59b'); sand.addColorStop(1, '#d4ae68');
                ctx.fillStyle = sand; ctx.fillRect(0, shore, w, h - shore);
    
                // Wet sand right at the waterline
                ctx.fillStyle = 'rgba(120,90,50,0.18)';
                ctx.fillRect(0, shore, w, 14);
    
                // Surf: three crests running up the beach at different speeds.
                // Each is tiled across twice its own span so it wraps seamlessly.
                if (!ARENAS.clustercoast._surf) {
                    ARENAS.clustercoast._surf = [
                        { y: 0.475, speed: 0.45, x: 0,   alpha: 0.14, len: 0.30 },
                        { y: 0.560, speed: 0.75, x: 180, alpha: 0.20, len: 0.26 },
                        { y: 0.640, speed: 1.05, x: 420, alpha: 0.30, len: 0.22 }
                    ];
                }
                const span = w * 0.5;
                ARENAS.clustercoast._surf.forEach(s => {
                    s.x = (s.x + s.speed * tickScale) % span;
                    ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
                    for (let i = -1; i < 3; i++) {
                        ctx.fillRect(s.x + i * span, s.y * h - 2, w * s.len, 4);
                    }
                });
            },
            grid: 'rgba(255,201,60,0.05)',
            coverColor: '#c9954e', coverBorder: '#ffc93c'
        },
    },

    arenaHazards: {
        clustercoast: { kind: 'zone', label: 'Rising Tide', color: '#4ac9ff',
            damage: 3, slow: 0.7, intervalMs: 520,
            circles: [ { x:0.08, y:0.50, r:100 }, { x:0.92, y:0.50, r:100 } ] },
        // A barrier, because Wakanda's defining piece of technology is a
        // shield that switches on — there is no other primitive that is
        // already the thing the place is famous for.
        //
        // Geometrically it is the third distinct barrier in the game rather
        // than a third set of walls. The Death Star's two and Naboo's three
        // are vertical, splitting the arena left from right across the line
        // the fighters spawn on. These four panels are the four sides of a
        // box around the middle, so what the hazard denies is an area rather
        // than a crossing: the challenge ground at the centre closes, and
        // whatever is standing in it is shut in with whatever else is.
        //
        // offsetMs staggers each panel by index, so they run out of phase and
        // the box is usually missing a side. It does seal completely on part
        // of the cycle, which is the point and is not a trap — offMs is 2200,
        // and updateHazards() already shoves anyone caught in a closing panel
        // clear along the shortest axis.
        zeropoint: { kind: 'singularity', label: 'The Zero Point', color: '#7c3aed',
            x: 0.5, y: 0.5, radiusPct: 0.115,
            damage: 20, cooldownMs: 1400 }
    },

    /*  ── FORGE PATTERNS ──────────────────────────────────────────────
     *  `vaulted` is dropped: with the pack loaded the base weapons exist
     *  again, so there is nothing to hold the commissions back.       */
    forgePatterns: [
    { baseKey: 'lancehead',    cost: 280, requires: 'cluster',   vaulted: true },
    { baseKey: 'burstrifle',   cost: 300, requires: 'voidblade' },
    { baseKey: 'focusshotgun', cost: 290, requires: 'dylan',     vaulted: true },
    { baseKey: 'boomsniper',   cost: 340, requires: 'visitor',   vaulted: true },
    ],

    /*  ── THE SHAPELESS SPRITE ────────────────────────────────────── */
    sprites: [
        {
            vaulted: true,
            id: 'shapelessSprite',
            name: 'Shapeless Sprite',
            icon: '🫥',
            rarity: 'mythic',
            cost: 3000,
            description: 'Below thirty percent health you stop holding your shape. What stands up is faster, steadier, hits harder, and is in better condition than what went down. It is not you.',
            effect: 'Become the Shapeless Man when badly hurt',
            eligible: () => false
        },
    ],

    /*  ── ACHIEVEMENT ─────────────────────────────────────────────── */
    achievements: {
        poiRoi:         { id:'poiRoi',          label:'My POI get ROI',   desc:'Win as Cluster on Cluster Coast', done: false },
    },

    /*  ── COVER LAYOUTS ───────────────────────────────────────────────
     *  Merged into ARENA_LAYOUTS, which is keyed by arena and lives apart
     *  from ARENAS itself. */
    arenaLayouts: {
            // The Zero Point: shattered slabs orbiting the singularity, pushed
            // out to the edges. The middle is deliberately bare — the centre of
            // this map belongs to the anomaly, and cover there would let a
            // player camp the one thing they are supposed to be afraid of.
            zeropoint: [
                { x:0.16, y:0.18, w:70, h:20 }, { x:0.84, y:0.18, w:70, h:20 },
                { x:0.16, y:0.82, w:70, h:20 }, { x:0.84, y:0.82, w:70, h:20 },
                { x:0.10, y:0.50, w:20, h:110 }, { x:0.90, y:0.50, w:20, h:110 },
                { x:0.50, y:0.13, w:110, h:20 }, { x:0.50, y:0.87, w:110, h:20 },
                { x:0.30, y:0.32, w:20, h:64 }, { x:0.70, y:0.68, w:20, h:64 }
            ],
            // Death Star: Trench corridors — two long side walls + a center blockade
            deathstar: [
                { x:0.15, y:0.25, w:18, h:120 }, { x:0.85, y:0.25, w:18, h:120 },
                { x:0.15, y:0.75, w:18, h:100 }, { x:0.85, y:0.75, w:18, h:100 },
                { x:0.50, y:0.35, w:90, h:18 },
                { x:0.50, y:0.65, w:90, h:18 }
            ],
            // Mustafar: Lava crossing — three bridge segments
            mustafar: [
                { x:0.25, y:0.40, w:80, h:18 }, { x:0.75, y:0.60, w:80, h:18 },
                { x:0.50, y:0.50, w:18, h:70 },
                { x:0.20, y:0.70, w:18, h:50 }, { x:0.80, y:0.30, w:18, h:50 }
            ],
            // Hoth: Bunker fortifications — asymmetric trenches on both sides
            hoth: [
                { x:0.22, y:0.30, w:100, h:18 }, { x:0.22, y:0.55, w:18, h:80 },
                { x:0.78, y:0.70, w:100, h:18 }, { x:0.78, y:0.45, w:18, h:80 },
                { x:0.50, y:0.50, w:55, h:18 }
            ],
            // Coruscant: City blocks — staggered urban cover
            coruscant: [
                { x:0.20, y:0.35, w:22, h:60 }, { x:0.80, y:0.65, w:22, h:60 },
                { x:0.40, y:0.25, w:60, h:18 }, { x:0.60, y:0.75, w:60, h:18 },
                { x:0.40, y:0.55, w:18, h:45 }, { x:0.60, y:0.45, w:18, h:45 }
            ],
            // Mos Eisley: Cantina interior — round pillars and bar counter
            moseisley: [
                { x:0.25, y:0.30, w:24, h:24 }, { x:0.50, y:0.25, w:24, h:24 },
                { x:0.75, y:0.30, w:24, h:24 },
                { x:0.25, y:0.70, w:24, h:24 }, { x:0.75, y:0.70, w:24, h:24 },
                { x:0.50, y:0.50, w:18, h:80 }
            ],
            // Naboo: Reactor core — radial catwalks
            naboo: [
                { x:0.35, y:0.30, w:18, h:55 }, { x:0.65, y:0.30, w:18, h:55 },
                { x:0.35, y:0.70, w:18, h:55 }, { x:0.65, y:0.70, w:18, h:55 },
                { x:0.50, y:0.50, w:60, h:18 }
            ],
            // Kashyyyk: Forest — tree cover
            kashyyyk: [
                { x:0.20, y:0.25, w:22, h:70 }, { x:0.80, y:0.25, w:22, h:70 },
                { x:0.40, y:0.40, w:18, h:55 }, { x:0.60, y:0.40, w:18, h:55 },
                { x:0.50, y:0.70, w:70, h:18 }
            ],
            // Mandalore: Ruined durasteel — broken city walls amid the wasteland
            mandalore: [
                { x:0.22, y:0.30, w:70, h:18 }, { x:0.78, y:0.70, w:70, h:18 },
                { x:0.30, y:0.60, w:18, h:60 }, { x:0.70, y:0.35, w:18, h:60 },
                { x:0.50, y:0.50, w:24, h:24 }
            ],
            // Cluster Coast: pier posts standing in the shallows up top, supply
            // crates scattered along the sand below — cover thins out at the
            // waterline so the middle of the beach stays a real crossing.
            clustercoast: [
                { x:0.22, y:0.26, w:20, h:20 }, { x:0.50, y:0.22, w:20, h:20 }, { x:0.78, y:0.26, w:20, h:20 },
                { x:0.35, y:0.48, w:70, h:18 }, { x:0.65, y:0.48, w:70, h:18 },
                { x:0.20, y:0.74, w:26, h:26 }, { x:0.80, y:0.74, w:26, h:26 },
                { x:0.50, y:0.80, w:18, h:60 }
            ]
    },

    /*  ── SCENERY CACHES ──────────────────────────────────────────────
     *  The Zero Point generates its cracks once and caches them against the
     *  size they were built for, so a resize has to drop them. Merged into
     *  ARENA_SCENERY_CACHES, which invalidateArenaCaches() walks. */
    arenaCaches: { zeropoint: ['_cracks'] },

    /*  ── ELITE PAIRS ─────────────────────────────────────────────────
     *  Merged into ELITE_BASE_IDS, which is how an elite form is credited
     *  to the fighter it is an elite OF for achievements. */
    eliteBaseIds: { prophecy: 'rivalhope', innovation: 'slone' },

    /*  ── UNLOCK FLAGS ────────────────────────────────────────────────
     *  Only seeded when absent, so a save that already owns one of these
     *  keeps it. */
    unlocks: { cluster: false, voidblade: false, dylan: false, visitor: false, vengeancejones: false, order: false, rivalhope: false, prophecy: false, slone: false, innovation: false, singularity: false, phantom: false, bastian: false, sonic: false, big_chuggus: false, poseidon: false, geno: false, hush: false, guardian: false, wrixel: false },

    /*  ── THE BITS OF PAGE THIS PACK NEEDS ───────────────────────────
     *  index.html has no markup for any of it, which is the point: with
     *  the pack absent there is no season toggle and no pack arenas in
     *  the picker. install() runs at the end of applyContentPack(), which
     *  is early enough that the click handlers further down game.js pick
     *  these up exactly as if they had been in the page all along.    */
    install: function () {
        // The season toggle, once per faction heading, sitting just before
        // the Marvel one so the two read in the order they were added.
        document.querySelectorAll('.marvel-faction-toggle').forEach(function (m) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'pack-faction-toggle';
            b.setAttribute('aria-pressed', 'false');
            b.textContent = '\u26a1 Fortnite';
            m.parentNode.insertBefore(b, m);
        });

        // The two arenas, added to the picker in the order they shipped in.
        var row = document.querySelector('.arena-btn');
        if (row && row.parentNode) {
            [['zeropoint', '#a855f7', '\ud83c\udf00 The Zero Point'],
             ['clustercoast', '#ffc93c', '\ud83c\udfdd\ufe0f Cluster Coast']].forEach(function (a) {
                var btn = document.createElement('button');
                btn.className = 'arena-btn';
                btn.dataset.arena = a[0];
                btn.style.color = a[1];
                btn.textContent = a[2];
                row.parentNode.appendChild(btn);
            });
        }
    }
};