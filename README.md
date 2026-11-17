# Whack-a-Micro

A whack-a-mole game on the keys of a Work Louder Creator Micro V2 or Codex Micro, played
from a web page.

A green mole lights up on a random key. Press it before it goes dark. Each level has 30
rounds. It starts slow, with moles up for about 3 seconds and a pause of 1 to 2 seconds
before the next, and reaches full speed by round 30: moles up for 0.9 seconds and no pause.
Each mole's time varies a bit, and the pause before the next one is random.

After each level all keys flash green once per mole of the next level (twice before level
2, three times before level 3) and the next level starts slow again with one more mole at
once: two in level 2, three in level 3, up to six in level 6. Hit them all before they go
dark; each counts as a point, and each extra mole adds a little time to the round. Level 6
keeps going at full speed until you make a mistake.

The game ends at the first mistake: a mole that goes dark before you hit it, or a press on
any key that isn't a mole while one is up. Presses between rounds, and a second press on a
mole you already hit, don't count.

When the game ends the keys flash red, then one key lights yellow per point (all 13 at 13
or more). Your best score is kept between games.

## Play

Open **https://cristian-duciuc.github.io/whack-a-micro/** with Work Louder Input open and a
Creator Micro V2 or Codex Micro connected, and click **Connect to Input**.

The first time:

1. Input asks you to approve "Whack-a-Micro" and shows the page's address. Approve it within
   30 seconds.
2. The page asks for the game layer. Install it from the page, or, if the device already
   has it, pick its layer number. A profile holds at most 6 layers. To remove the game,
   delete the layer in Input.

The keys breathe blue while the game waits. Press any key on the device to start. The page
shows the rules before each game, and while you play it shows the score, your best, the
level, the round, a bar for the time left, and a picture of the keys. It tells you when a
new level adds a mole. The knob still controls volume.

The page keeps Input's approval, the layer, and your best score in your browser's storage.
Nothing leaves your computer: the page talks only to Input, at `ws://127.0.0.1:19147`.

### Browsers

The page is served over HTTPS but talks to Input over an unencrypted local connection.

- **Chrome** allows this. Recent versions ask once whether the site may reach devices on
  your computer; allow it.
- **Firefox** allows this.
- **Safari** is expected to block it as mixed content, so the page may not reach Input
  there. Use Chrome or Firefox.

## Run it locally

```sh
npm start
```

Then open http://localhost:5174. This serves `web/` from your computer, which is handy for
trying changes. Input ties its approval to the page's address, so the local page and the
GitHub Pages one are approved separately, and changing the port (`PORT=8080 npm start`)
asks again.

```sh
npm test
```

Every push to `main` runs the tests and, if they pass, publishes `web/` to GitHub Pages
(`.github/workflows/pages.yml`).

## Known limits

- **Speed.** Input accepts 30 requests per 10 seconds, and InputKit spaces requests
  400 ms apart. A mole takes one request to appear and one to hide, so moles never stay
  up for less than 0.9 seconds, and there is always at least 400 ms between one mole
  going dark and the next lighting, even with no pause.
- **Late lights.** A mole's time starts once Input confirms it is lit, so a slow
  answer doesn't cost you the mole.

## Files

- `web/game.mjs`: the rules and timing, with no device code.
- `web/play.mjs`: plays a game on the device through
  [InputKit](https://www.npmjs.com/package/@worklouder/input-kit), loaded from jsDelivr.
- `web/app.mjs`, `index.html`, `style.css`, `icon.svg`: the page.
- `web/whack-layer.json`: the game layer.
- `serve.mjs`: serves `web/` locally.

## License

MIT. See [LICENSE](LICENSE).
