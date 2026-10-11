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

## What never gets uploaded

publish.bat copies `CCStudios Arcade` into a separate repo folder (`%USERPROFILE%\CCStudios-Arcade-site`) and leaves these out:
`.git` folders (so games that are their own repos still upload), `certs`, `*.pem`, `*.key`, `node_modules`, `blender`, `*.blend`, `.claude`, `.vscode`, `*.bat`.
To leave out anything else, add it to `publish-exclude.txt`.

## Game rules for GitHub Pages

- Use relative paths (`js/game.js`, not `/js/game.js`). The build warns you if it finds root paths.
- Filenames are case-sensitive online. `Music.mp3` and `music.mp3` count as different files.
- Keep each file under 100 MB, which is GitHub's limit.
