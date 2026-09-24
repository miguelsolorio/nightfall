# Nightfall

A first-person horror game set in a foggy forest at night. Find five glowing foxfire stones to escape before the tall one reaches you. It runs in the browser, and everything is built from simple geometry with synthesized audio. There's no build step and no asset files.

**[Play it in your browser →](https://miguelsolorio.github.io/nightfall/)** Headphones recommended.

![The title Nightfall beside a moonlit pine forest in fog, where a green foxfire stone glows among the trees](public/media/og.jpg)

## Demo

**[Watch the 30-second demo (MP4)](docs/demo.mp4)**. It was recorded in the game, with the encounters staged for the camera.

## How to play

Your car died at the trailhead. Somewhere in the woods, five **foxfire stones** still glow. Collect all five and the way out opens. Look for their glow through the fog, and listen for the hum when you're close.

| Keyboard and mouse | Touch | Action |
| --- | --- | --- |
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Drag on the left side | Walk |
| Mouse (click to capture it) | Drag on the right side | Look around |
| <kbd>Shift</kbd> | Push the stick past its ring | Run |
| <kbd>F</kbd> | Flashlight button | Flashlight on / off |
| <kbd>Esc</kbd> | Pause button | Pause |

On phones and tablets the game goes fullscreen where the browser allows it. It's best played sideways.

- **Stamina.** Running drains your breath (the bar at the bottom of the screen). Run it dry and you're stuck walking until you recover.
- **Flashlight.** It's your main light, and it flickers sometimes, more often when something is near. Many things in the forest react to it.
- **Dread.** A low drone, a heartbeat, a slow two-note pulse and a red edge creep in when something dangerous is close. The rest of the time there's a score, all synthesized: a pad that never resolves, a music box somewhere out in the dark, and a far-off choir.

## What's in the woods

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/foxfire.jpg" alt="A foxfire stone glowing on an altar inside a ring of standing stones"></td>
    <td width="50%"><img src="docs/screenshots/wolves.jpg" alt="Three wolves at the treeline, caught in the flashlight"></td>
  </tr>
  <tr>
    <td><b>Foxfire stones</b>: five of them, hidden near the forest's landmarks.</td>
    <td><b>Wolves</b> circle you at a distance and growl. Charge one or hold your light on it and it backs off.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/ghost.jpg" alt="A translucent ghost drifting out of the fog"></td>
    <td><img src="docs/screenshots/wanderer.jpg" alt="A man in a coat and hat speaking a single line"></td>
  </tr>
  <tr>
    <td><b>Ghosts</b> come at you in lurches, whispering and moaning, their heads snapping to wrong angles. Catch one in your beam and it dissolves. If one reaches you, it's in your face, and it takes your breath.</td>
    <td><b>The wanderer</b> is lost too. He has one thing to say to you.</td>
  </tr>
</table>

**Deer and owls** are harmless. They bolt or take flight when you get close or shine a light on them.

**The forest** has spruce thickets, old dying stands, pale birch groves and blighted ground around the cabin and the stone circle. Between them are three open fields where the fog sits low over tall grass:

- **The Hollow Field** has a scarecrow on a post. Every time you look away and back, it's facing you. Don't look away too often.
- **The old pasture** lies past the broken fence. Someone has been stacking stones there, and there are things hanging in the trees around it.
- **The graveyard** is where the ghosts come more often, and where the music box plays.

**Eyes** watch you from beside the trunks, just outside your beam. Put the light on them, or walk toward them, and they're gone.

Keep your ears open, too. Something knocks on wood out there, and sometimes the footsteps behind you aren't your own.

**The tall one** follows a few rules:

![The tall one standing at the edge of the flashlight beam, beside an abandoned cabin](docs/screenshots/monster.jpg)

- It only moves while you aren't watching it: behind you, behind the trees, or whenever your light is off or flickering.
- You only ever glimpse it at the edge of your beam. Point the beam straight at it and it's gone, for a while.
- It gets faster with every stone you find.
- If it reaches you, the game is over.

## Run it locally

The game uses ES modules, so it needs to be served over HTTP. Opening `index.html` directly won't work.

```bash
python3 -m http.server 8000 -d public
```

Then open <http://localhost:8000>. Add `?debug` to the URL (or press <kbd>`</kbd>) for an FPS and draw-call readout.

## Deploying

Every push to `main` deploys `public/` to GitHub Pages through [`.github/workflows/pages.yml`](.github/workflows/pages.yml). Before the first deploy, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.

## Project layout

```
public/
  index.html          markup, and the import map that loads Three.js from cdnjs
  styles.css          HUD, menus, and overlay effects
  src/
    main.js           frame loop and wiring
    world.js          terrain, fields, biomes, landmarks, collision, per-chunk baking
    flora.js          tree, undergrowth and grass variants
    player.js         movement, stamina, footsteps
    touch.js          on-screen stick and buttons for phones and tablets
    flashlight.js     beam, flicker, and "is this lit?" checks
    audio.js          all sound and the score, synthesized with the Web Audio API
    relics.js         the foxfire stones
    game.js           start / pause / restart, win and lose
    creatures/        deer, owls, wolves, ghosts, the wanderer, the scarecrow, the eyes, the tall one
```

Built with [Three.js](https://threejs.org/) r186.
