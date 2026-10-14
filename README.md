# CCStudios Arcade

Your games site on GitHub Pages: https://matthew8pea.github.io/ccstudios-arcade/

## Add or update a game

1. Drop the game folder into `games/` (replace the old folder for an update). It needs an `index.html` inside.
2. Double-click **publish.bat**.

The site rebuilds its game list and is live in about a minute. New games get a NEW badge and recently changed ones get UPDATED.

**preview.bat** runs the site on your PC (http://localhost:8080) so you can test it before publishing.

## One-time setup

1. Create an **empty public** repo named `ccstudios-arcade` at https://github.com/new. Don't add a README.
2. Double-click `publish.bat`. The first time, a GitHub sign-in window may pop up.
3. On GitHub, open the repo, go to **Settings → Pages**, set **Source: Deploy from a branch**, then **main** and **/ (root)**, and save.

Using a different repo name? Edit the SETTINGS lines at the top of `publish.bat`.

## Make a game look nice (optional)

The title comes from the game's `<title>` tag. To change it, or to add a description, cover art or tags, edit `arcade.json`:

```json
"games": {
  "My Game Folder": {
    "title": "My Game",
    "description": "One or two sentences.",
    "cover": "covers/my-game.jpg",
    "tags": ["Racing"],
    "order": 1,
    "hidden": false
  }
}
```

- **cover**: a wide image, about 960×540, put in `covers/`. You can also skip arcade.json and drop a `cover.png` or `thumbnail.png` straight into the game folder.
- **order**: pins games to the front. The lowest number goes first and becomes the featured game.
- **hidden**: set to `true` to keep a game off the site without deleting the folder.

## Play counts

Every game card shows how many times it's been played, and **Popular** sorts by it. The totals are shared by everyone who visits, and they're stored by [Abacus](https://abacus.jasoncameron.dev), a free counter service that needs no account or setup.

- A play counts when someone opens a game from the arcade. Opening the same game again within 30 minutes doesn't count twice.
- Plays on your PC through preview.bat don't count, so testing won't inflate the numbers.
- Totals refresh when someone loads the page, comes back from a game, or returns to the tab.
- Anyone determined could inflate a counter, so treat the numbers as a fun stat, not exact analytics.
- A counter is tied to the game's slug (its folder name, lowercased with dashes). Renaming a game's folder starts its count from zero.

## Accounts, likes and messages

The **Sign up / Log in** button in the top bar lets players make an account with a username and password. Accounts work on any device and stay logged in. A logged-in player can:

- **Like games** with the heart on each game. Every game shows its like count, and **Liked** lists the games you've liked.
- **Message the creators** from the account menu or the footer link. Messages are emailed to cousincrewstudios@protonmail.com.

Accounts run on Firebase (Google's free app backend). Until `firebase-config.js` is filled in, the account button, hearts and messages stay hidden and everything else works as normal.

### One-time Firebase setup

1. Go to https://console.firebase.google.com, click **Create a project**, name it (for example `ccstudios-arcade`), and turn Google Analytics off.
2. Open **Build > Authentication**, click **Get started**, choose **Email/Password**, switch on the first toggle, and save.
3. On the same page, open **Settings > Authorized domains** and add `matthew8pea.github.io`.
4. Open **Build > Firestore Database**, click **Create database**, pick a location near you, and choose **production mode**.
5. Open the **Rules** tab, replace everything with the contents of `tools/firestore.rules`, and click **Publish**.
6. Click the gear icon > **Project settings**. Under **Your apps**, click the web icon (`</>`), name it `arcade`, and click **Register app** (leave Firebase Hosting off).
7. Copy the values Firebase shows (`apiKey`, `authDomain`, `projectId` and the rest) into the matching quotes in `firebase-config.js`.
8. Double-click **publish.bat**.

### Switch on messages

Messages are sent through FormSubmit (https://formsubmit.co), which needs no account. After publishing, log in on the site and send yourself a test message. FormSubmit emails cousincrewstudios@protonmail.com an **Activate Form** link. Click it, and every message after that is delivered. Check the spam folder if it doesn't show up.

### Good to know

- Usernames are 3 to 20 letters, numbers or underscores. Firebase only sees them as logins like `name@your-project.firebaseapp.com`; no email is ever sent there.
- There's no "forgot password". To reset someone, delete their account in Firebase under **Authentication > Users** so they can sign up again.
- Each account can like a game once, so like counts are real. Play counts stay on Abacus and work without an account.

## Unreleased games (early access)

A game can be on the site before it's out, playable only by early-access accounts. Atlas works this way right now,
for the account **cousincrewstudios**. Everyone else doesn't see its card, and opening its link just shows a
"not out yet" screen.

How it works: the real game stays in `games/Atlas (dont load)/` (kept off the site by `publish-exclude.txt`).
publish.bat runs `tools/lock-unreleased.mjs`, which writes a locked copy to `games/atlas/`: the game's code is
encrypted, so even someone browsing the public GitHub repo can't run it. When an early-access player opens it,
the page fetches the key from Firestore (only their account is allowed to read it) and unlocks the game in their
browser. The textures, music and cover picture are not encrypted, only the code.

It's set in `arcade.json`:

```json
"atlas": {
  "title": "Atlas",
  "unreleased": { "source": "Atlas (dont load)", "access": ["cousincrewstudios"] }
}
```

### One-time setup for each unreleased game

1. Firebase console > **Firestore Database > Rules**: paste in `tools/firestore.rules` again and click **Publish**.
   The early-access account list is near the bottom of that file.
2. **Firestore Database > Data**: click **Start collection** (or **Add document** in `unreleased` if it exists),
   collection ID `unreleased`, document ID `atlas`, add a field `key` (type string) and paste the text from
   `tools/keys/atlas.key`. Save.
3. Make sure the account exists: sign up as **cousincrewstudios** on the site if you haven't. (Until it exists,
   anyone could sign up with that name and get in.)

Keep `tools/keys/atlas.key` safe and never share it: it's the only thing that unlocks the game. publish.bat
never uploads `.key` files. If you lose it, delete it, run publish.bat (a new key is made) and paste the new one
into Firestore.

**To give someone else early access**, add their username to `"access"` in arcade.json and their
`<username>@ccstudios-arcade.firebaseapp.com` to the list in `tools/firestore.rules` (then publish the rules).

**To release the game**, rename `games/Atlas (dont load)` to `games/atlas` (delete the locked one first), remove
the `"unreleased"` part and the `"Atlas (dont load)"` entry from arcade.json, and run publish.bat.

## What never gets uploaded

publish.bat copies `CCStudios Arcade` into a separate repo folder (`%USERPROFILE%\CCStudios-Arcade-site`) and leaves these out:
`.git` folders (so games that are their own repos still upload), `certs`, `*.pem`, `*.key`, `node_modules`, `blender`, `*.blend`, `.claude`, `.vscode`, `*.bat`.
To leave out anything else, add it to `publish-exclude.txt`.

## Game rules for GitHub Pages

- Use relative paths (`js/game.js`, not `/js/game.js`). The build warns you if it finds root paths.
- Filenames are case-sensitive online. `Music.mp3` and `music.mp3` count as different files.
- Keep each file under 100 MB, which is GitHub's limit.
