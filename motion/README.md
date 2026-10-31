# motion

29 motion-graphics components and the pipeline that renders them. Every frame is HTML / Canvas / three.js, rendered in Chrome; sound effects are synthesized in code.

Each component was reviewed frame by frame by a human before it shipped. Content (text, images, colors, timing) is all parameters, so the same component works for any topic.

- Agents: read [SKILL.md](SKILL.md) first.
- Humans: [Quick start](../README.md#quick-start), then click a component below for its demo, when to use it, a working snippet, options and style.

## Type and titles

| | | |
|---|---|---|
| <a href="docs/components/bigtype.md"><img src="docs/media/bigtype.png" width="280"></a><br>**[Big Type](docs/components/bigtype.md)**<br><sub>Huge condensed headline type that hard-cuts in on the keyword and holds still; also name cards, quotes and equal-width poster blocks.</sub> | <a href="docs/components/title.md"><img src="docs/media/title.png" width="280"></a><br>**[Concept Title](docs/components/title.md)**<br><sub>Dark title card: one subject, an italic concept name resolving letter by letter, a heavy second line and an optional arc.</sub> | <a href="docs/components/type.md"><img src="docs/media/type.png" width="280"></a><br>**[Type Specimen](docs/components/type.md)**<br><sub>One word as a type specimen sheet: outline letters fill in, tags highlight one by one, optional crosshair lock-on.</sub> |
| <a href="docs/components/tag.md"><img src="docs/media/tag.png" width="280"></a><br>**[Highlight Tags](docs/components/tag.md)**<br><sub>Short paper-strip or slanted-bar labels over any shot, with yellow keyword highlight, staircase stacks and either/or pairs.</sub> | <a href="docs/components/tilt.md"><img src="docs/media/tilt.png" width="280"></a><br>**[Tilted Type](docs/components/tilt.md)**<br><sub>Short phrases on tilted perspective planes around one subject, sliding in as spoken, with depth blur and a slow pull back.</sub> | <a href="docs/components/roll.md"><img src="docs/media/roll.png" width="280"></a><br>**[Number Roll](docs/components/roll.md)**<br><sub>A big number flips through values, slows down and lands, optionally from a tilted close-up that pulls back.</sub> |
| <a href="docs/components/cuts.md"><img src="docs/media/cuts.png" width="280"></a><br>**[Keyword Match Cuts](docs/components/cuts.md)**<br><sub>Fast full-screen screenshot cuts with the same word landing on the same spot, then a yellow sweep and pull back.</sub> |  |  |

## Evidence and data

| | | |
|---|---|---|
| <a href="docs/components/xs-text.md"><img src="docs/media/xs-text.png" width="280"></a><br>**[Evidence & Quote](docs/components/xs-text.md)**<br><sub>A real screenshot in a browser frame with push-in and yellow sweep, or a quote reset in big serif with one phrase highlighted.</sub> | <a href="docs/components/xs-screen.md"><img src="docs/media/xs-screen.png" width="280"></a><br>**[Screen shot](docs/components/xs-screen.md)**<br><sub>Your screenshot filmed like a phone pointed at a monitor: fisheye, moire and vignette, pushing in to one line with a yellow highlight sweep.</sub> | <a href="docs/components/xs-rank.md"><img src="docs/media/xs-rank.png" width="280"></a><br>**[Ranking climb](docs/components/xs-rank.md)**<br><sub>A tilted 3D leaderboard where the target row climbs past the others, lands, and the camera pulls back to the whole board (optionally cut to the real screenshot).</sub> |
| <a href="docs/components/thirds.md"><img src="docs/media/thirds.png" width="280"></a><br>**[Grid focus](docs/components/thirds.md)**<br><sub>Thirds lines split a busy picture into nine cells; one cell stays sharp, the rest blurs, and the focus moves with the voiceover.</sub> | <a href="docs/components/pile.md"><img src="docs/media/pile.png" width="280"></a><br>**[Paper Pile](docs/components/pile.md)**<br><sub>Printed sheets scatter into a pile, the pile dims, and a small number and a huge translucent word are stamped on top.</sub> | <a href="docs/components/wall.md"><img src="docs/media/wall.png" width="280"></a><br>**[Whole-wall swap](docs/components/wall.md)**<br><sub>Two tilted strips of different screenshots slide in, then every cell hard-cuts to the same picture on one word.</sub> |
| <a href="docs/components/strip.md"><img src="docs/media/strip.png" width="280"></a><br>**[Calendar card strip](docs/components/strip.md)**<br><sub>A row of dated glass cards with real screenshots that stops on the days you name and motion-blurs past the rest.</sub> |  |  |

## Showcase shots

| | | |
|---|---|---|
| <a href="docs/components/popups.md"><img src="docs/media/popups.png" width="280"></a><br>**[Window barrage](docs/components/popups.md)**<br><sub>Retro system windows pop up one after another on a tilted dotted desk; XM.loading follows with a big progress window that counts to 99 and flips to done.</sub> | <a href="docs/components/specimen.md"><img src="docs/media/specimen.png" width="280"></a><br>**[Specimen card](docs/components/specimen.md)**<br><sub>A 3D glass prism (or bolt, planet, mind) floats over a scrolling word wall with a label tag and a spec sheet whose rows type in; XM.specimenGrid shows four.</sub> | <a href="docs/components/bubble.md"><img src="docs/media/bubble.png" width="280"></a><br>**[Liquid glass bubble](docs/components/bubble.md)**<br><sub>A breathing iridescent glass bubble beside a short statement rising letter by letter; it can swing sides, split into two cells and merge back.</sub> |
| <a href="docs/components/globe.md"><img src="docs/media/globe.png" width="280"></a><br>**[Halftone globe](docs/components/globe.md)**<br><sub>A spinning halftone-dot globe with orbiting satellite labels, hard-cutting to a close-up where a crosshair locks onto a latitude/longitude.</sub> | <a href="docs/components/ribbons.md"><img src="docs/media/ribbons.png" width="280"></a><br>**[Text ribbons](docs/components/ribbons.md)**<br><sub>A full-screen wall of wavy text ribbons that swap colors, roll up into a spinning cylinder and land one word in its center.</sub> | <a href="docs/components/scan.md"><img src="docs/media/scan.png" width="280"></a><br>**[Iris scan](docs/components/scan.md)**<br><sub>A huge halftone eye opens, two labels point at iris and pupil, then it pushes in while a readout counts up and locks.</sub> |
| <a href="docs/components/squeeze.md"><img src="docs/media/squeeze.png" width="280"></a><br>**[Flower squeeze](docs/components/squeeze.md)**<br><sub>A white hero flower lights up, dark flowers flood in and pack into glowing cells, and the hero is squeezed small (GPU render).</sub> | <a href="docs/components/lens.md"><img src="docs/media/lens.png" width="280"></a><br>**[Diamond lens](docs/components/lens.md)**<br><sub>A diamond window wipes open, an icon trail dashes through, and one English word slams in letter by letter.</sub> | <a href="docs/components/corridor.md"><img src="docs/media/corridor.png" width="280"></a><br>**[Text corridor](docs/components/corridor.md)**<br><sub>Four walls of repeating words stream toward the vanishing point while a short phrase stacks up in front.</sub> |
| <a href="docs/components/notify.md"><img src="docs/media/notify.png" width="280"></a><br>**[Dot-matrix notify](docs/components/notify.md)**<br><sub>One tile with a counting badge pulls back into a grid, then pushes into an LED wall whose dots spell a word.</sub> | <a href="docs/components/emerge.md"><img src="docs/media/emerge.png" width="280"></a><br>**[Emerge](docs/components/emerge.md)**<br><sub>A subject emerges from the dark while words drift past in real depth of field, with focus pulls between them.</sub> | <a href="docs/components/doodle.md"><img src="docs/media/doodle.png" width="280"></a><br>**[Hand-drawn doodles](docs/components/doodle.md)**<br><sub>Brush and marker marks (rays, arrows, underlines, sparks, bolts) drawn stroke by stroke around a subject, never on text.</sub> |

## Transitions and texture

| | | |
|---|---|---|
| <a href="docs/components/trans.md"><img src="docs/media/trans.png" width="280"></a><br>**[Transitions: whip, slash, defocus](docs/components/trans.md)**<br><sub>Full-frame canvas transitions for XK.seq: motion-blurred whip pan, diagonal slash out of an inverted frame, blur-out swap.</sub> | <a href="docs/components/trans2.md"><img src="docs/media/trans2.png" width="280"></a><br>**[Transitions: recede, leak](docs/components/trans2.md)**<br><sub>Canvas transitions for XK.seq: the previous shot shrinks into a corner as context while the next falls in; a warm light leak to one white frame that closes a chapter.</sub> | <a href="docs/components/tex.md"><img src="docs/media/tex.png" width="280"></a><br>**[Texture layer](docs/components/tex.md)**<br><sub>Paper, dark grid or colour-wash stage plus window light, vignette, grain and a slow push for any full-screen shot.</sub> |

## Pipeline

| Script | What it does |
|---|---|
| `scripts/new_project.sh <dir>` | new project: skeleton, components, fonts |
| `scripts/render_frames.js <dir> [--stills t ...]` | render every frame (or a few stills to `qa/`), check fonts and page errors |
| `scripts/build.sh <dir> [--music song.mp3] [--out x.mp4]` | frames → sound effects → music mix → MP4 → checks |
| `scripts/sfx_kit.py --list` | the sound-effect kit ([sfx-kit/README.md](sfx-kit/README.md)) |
| `scripts/capture.js <url> out.png --scale 3` | capture a web page as a sharp screenshot |
| `scripts/clip_frames.py`, `scripts/srt_times.py` | cut a video into frames; read keyword times from an SRT |

Fonts bundled with components and their licenses: [components/explainer/xm-assets/fonts/](components/explainer/xm-assets/fonts/README.md).
