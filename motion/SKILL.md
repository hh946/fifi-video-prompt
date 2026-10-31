---
name: fifi-video-motion
description: Make 1920x1080 motion-graphics videos in pure code (HTML / Canvas / three.js rendered frame by frame in Chrome, sound effects synthesized with numpy, no image / video / music generation models). Use for explainer shots, intros, title cards, promo videos, keyword quick cuts, big type, card walls, transitions, and any "make an animated video / motion graphics" request. Ships 29 hand-picked components; the agent fills in text, images and timing.
---

# fifi-video · motion

One pure function `render(t)` draws any moment. One `timeline.js` drives picture, sound effects and music. Chrome screenshots every frame, numpy synthesizes the sound effects, ffmpeg muxes the MP4. `frames/`, `build/`, `qa/` and `.mp4` are build output and can always be rebuilt from code.

`<motion>` below = the folder this file is in.

## How the work is split

| Layer | Where | How to treat it |
|---|---|---|
| Rendering, audio, checks | this file, `scripts/` | follow exactly |
| Look and motion of each component | `components/explainer/`, `docs/components/` | use as is; change content through parameters, don't restyle |
| What this video says, its times and shot order | the project's `timeline.js` + `scene.js` | design fresh for every video |

Every component was reviewed frame by frame by a human before it shipped. The taste lives in the components, so your job is choosing the right component for each moment and timing it well, not inventing new visuals.

## Steps

1. **New project:** `bash <motion>/scripts/new_project.sh <dir>`. You get an empty skeleton (`index.html`, `timeline.js`, `scene.js`, `render.js`), all components and fonts. First run also installs `playwright-core` in `<motion>/`.
2. **Times first.** In `timeline.js`, set `VIDEO.duration` and put every moment in the `T` table (seconds). Nothing else in the project contains a raw time. For a video cut to music, put cuts on beats.
3. **Signature.** The skeleton draws "made with fifi-video" at the start and end (`WATERMARK` in `timeline.js`). Change the text, set `end.tone: 'light'` if the last shot is on a light background, or delete the block to drop it.
4. **Shots.** In `scene.js`: `XK.theme(...)` once, build each shot once (`SH.x = XM.something({...})`), then order them with `XK.seq([{ shot, t0, tin }, ...])`. Pick components with the table below, copy the snippet from `docs/components/<name>.md`, change the content. Push each shot's suggested sounds: `window.SFX_CUES.push(...SH.x.cues)`.
5. **Look at stills before rendering everything:** `node <motion>/scripts/render_frames.js <dir> --stills 1 3.5 7` writes `qa/t_*.png`. Open them and check. Preview motion in a browser: `index.html?play`; one frame: `index.html?t=3.2`.
6. **Build:** `bash <motion>/scripts/build.sh <dir> [--music song.mp3] [--out name.mp4]` = frames → sound effects → music mix → MP4 + checks. Speed depends on the shots: plain canvas shots render dozens of frames per second, while texture post (`XM.tex`) and GPU shaders drop to ~2–4 frames/s, so a 30 s video takes 1–5 min. Run it in the foreground or poll it.
7. **Check** (below). Fix the code, go back to step 5.

## Spec

| | |
|---|---|
| Picture | 1920x1080, 30 fps, `frames/frame_0000.png` … |
| Audio | 48 kHz stereo, exactly as long as the video. Sound effects always; music only if given (`--music` or `window.MUSIC = { file }`) |
| Output | H.264 High, yuv420p, AAC, +faststart |
| `VIDEO.energy` | `'explain'` (skeleton default) for explainers, promos and title-led videos; `'high'` only for a hook made of very fast cuts. It picks the thresholds of the energy check below |
| `VIDEO.blockColor` | `'any'`: the energy check wants some large black or saturated areas, in any colour |

## render(t) rules

- **Pure function of t.** No `Math.random`, `Date`, CSS animations / transitions or `requestAnimationFrame` inside render. Random = `hash(n)`; per-frame jitter = `hash(Math.floor(f / 2))`.
- **Build once.** Create nodes in `scene.js`; render only changes attributes. Layer order = creation order.
- **Fonts** only from `fonts/` or `explainer/xm-assets/fonts/`, declared with `@font-face`. The renderer reports missing glyphs.
- **Shared WebGL.** Components share one offscreen renderer (`XM.gl()`); don't create another `WebGLRenderer`.
- **Data as .js.** Map masks and glyphs are `.js` files injected on demand; renders run from `file://`, so no `fetch`.

## Design rules (keep these, they are what makes it look like one piece)

- **One theme per video:** background `night` / `paper` / `lab` plus one accent color, `XK.theme('night', { accent, accent2 })`. Every component reads colors from the design system (`xm-ds.js`); don't invent colors in `scene.js`.
- **Keywords are highlighted in fluorescent yellow.** No boxes, brackets or circles around words. Something highlighted stays highlighted until the shot changes.
- **Text people must read is ≥ 56 px; key numbers ≥ 100 px.** Decorative micro-text (margin notes, grid labels) may be smaller but never carries information.
- **One focus per shot**, at most one text group. Don't stack many elements to look busy.
- **Screenshots never scale up more than 1.1×** on screen (including push-ins). Capture larger instead: `node scripts/capture.js <url> out.png --scale 3`.
- **Photosensitivity:** no more than 3 big full-frame brightness jumps per second. `xk.js` measures every transition and logs an error if a second has more.
- **No shake, no bounce** by default. Big moments get weight from cuts, type size and sound, not from camera shake. Components accept `hit: true` for a punchier version in intros.
- **Use the heavy components sparingly:** the same component at most twice per video; don't put two full-screen showcase shots next to each other.
- **Only images, fonts and audio you own or that are licensed for it.** Note sources and licenses in the project.

## Which component for which moment

| The video says / needs… | Use | Doc |
|---|---|---|
| A key phrase or claim, poster-size | `XM.bigType`, `XM.bigName`, `XM.bigQuote` | bigtype |
| A concept name appears for the first time | `XM.titleCard`, `XM.trackTitle` | title |
| A short comment / label on a person, object or screenshot | `XM.tag` | tag |
| "This word is everywhere" / a run of versions landing on one | `XM.wordCuts` | cuts |
| A few phrases around a subject, in perspective | `XM.tiltWords` | tilt |
| A year counting back, a number rolling to a value | `XM.numberRoll` | roll |
| A subject slowly appears, related words drift in depth | `XM.emerge` | emerge |
| "Piles of reports all say one thing" | `XM.paperPile` | pile |
| An English term introduced like a type specimen | `XM.typeSpecimen` | type |
| A real screenshot as evidence, highlighted / a quoted line | `XS.evidence`, `XS.doc` | xs-text |
| "I screen-captured this", on-site evidence feel | `XS.screen` | xs-screen |
| Climbing a leaderboard | `XS.rank` | xs-rank |
| Many different things are really the same | `XM.wall` | wall |
| Days / versions / releases passing, one card each | `XM.dayStrip` | strip |
| Only one region of a busy screenshot matters | `XM.thirds` | thirds |
| A reaction beat: hand-drawn marks around a subject | `XM.doodle` | doodle |
| Paper / grid / gradient texture, light and slow push on any shot | `XM.tex.use` | tex |
| Going round in circles, a loop you're stuck in (English only) | `XM.textCorridor` | corridor |
| An English keyword lands with force (English only) | `XM.lens` | lens |
| From one to many, ending in a shape | `XM.notify` | notify |
| Window barrage, loading, "stuck at 99%" | `XM.popups`, `XM.loading` | popups |
| A product / idea with 3–4 specs; four-way comparison | `XM.specimen`, `XM.specimenGrid` | specimen |
| "X is not Y", one splits in two | `XM.bubble` | bubble |
| A slogan repeated; loops, flywheels | `XM.ribbons` | ribbons |
| Global, where, how many people | `XM.globe` | globe |
| Recognition, accuracy, being watched | `XM.scanEye` | scan |
| More and more crowd in, one hero gets squeezed | `XM.squeeze` | squeeze |
| Transitions: slash, defocus, whip | `tin: 'slash' / 'defocus' / 'whip'` | trans |
| Transitions: warm light leak, recede to a corner | `tin: 'leak' / 'recede'` | trans2 |

Seq entries: `{ shot, t0, tin, drift }`. `tin` is the transition into the shot. `drift` is an automatic slow push / pan over the shot's time on screen: `false` turns it off, `{ s0: 0, s1: .06, x: 0, y: 0 }` sets start / end zoom (0.06 = 6%) and pan in px. Shots built on screenshots or hard-cut type usually want `drift: false`; full-screen showcase shots look good with a small drift.

Built-in transitions in `XK.seq` also include `cut`, `push`, `slide`, `zoom`, `rise`, `flip`, `iris`, `wipe`. Use 2–3 kinds per video; don't repeat the same one twice in a row.

Each doc page says when to use the component, the best way to use it (a working snippet), its options and its style. Read the page before using a component.

## Sound

- List effects: `python3 <motion>/scripts/sfx_kit.py --list`. Which picture gets which sound: `sfx-kit/README.md`.
- `window.SFX_KIT = { pitch, bright, len, seed }` gives the whole set one tint per video.
- No heavy, muddy hits. The same kind of event always gets the same sound. Most effects are quiet.
- Music: `build.sh <dir> --music song.mp3`, or `window.MUSIC = { file, gain, sfxGain, sfxHP, offset }` in `timeline.js`. The song plays as is; effects are high-passed and laid on top.
- True silence before a reveal: `window.MUTE = [[from, to]]`.

## Checks

`render_frames.js` and `mux.py` fail with a non-zero exit code when:
- a font isn't loaded, a glyph is missing, or the page logs an error;
- frame count, size, fps, codec or duration (±1.5 frames) are off;
- text stays off-screen for ≥ 0.5 s;
- the energy check for `VIDEO.energy` fails (`explain` is the default: no more than 50% dead frames, longest still ≤ 2.5 s). A frame counts as "dead" when the whole picture barely changes from the last one: hard cuts, new elements, slides, pushes and component animations count; a thin line drawing in or a small sway does not. Hard-cut text that just sits there (big type, tags with `enter: 'cut'`) is mostly dead frames, so a video made only of those fails on purpose. In this order:
  1. Let the next beat land sooner: a new line, tag or highlight in the flattest second the report names.
  2. Mix in components that keep working on their own (ribbons, globe, popups, corridor, notify, wall slide-in).
  3. On full-screen type shots, add a slow push with the texture layer: `XM.tex.use(shot, { post: 'dark', push: { to: 1.1 } })` (1.08–1.12 is the useful range).
  4. A pause that is the point (a reveal, a line to read) goes in `VIDEO.holds = [[from, to, 'reason']]` and keep all holds together under about 8% of the video.
  Don't add shake, wobble or decoration just to pass.

Then look at `qa_final/contact.png` and single QA frames: no overflowing or overlapping text, no rendering artifacts, numbers correct.

## Common problems

| Symptom | Cause → fix |
|---|---|
| Text falls back to a system font | glyph missing in the font → read the missing-glyph report, change the text or font |
| All fonts reported missing | `font-family` named like a generic keyword (Serif, Monospace) → use a specific name |
| Picture and sound out of sync | a time written in two places → take every time from `T` |
| Edge text pushed off-screen | automatic drift (up to 9% zoom) → `drift: { s0: 0, s1: .04, x: 0, y: 0 }` or `drift: false` in the seq entry |
| Wrong frame count after re-render | don't put files into `frames/` by hand; it's cleared on every render |
| Chrome not found | set `CHROME_PATH`, or `npx playwright-core install chromium` |
| Blurry or huge file | noise / grain eats bitrate → lower grain opacity, don't lower crf |
