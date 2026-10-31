# Sound-effect kit

A small set of sound effects for voiceover animation, all synthesised in code. Each sound is a parameter table in [`../scripts/sfx_kit.py`](../scripts/sfx_kit.py) (`PRESETS`, catalogued in `KIT`); change a number and the sound changes. Four knobs shift the whole kit a little per video, so videos don't all sound the same.

```bash
python3 scripts/sfx_kit.py --list                 # list the kit (name, band, usable under speech, default gain, when to use)
python3 scripts/sfx_kit.py --audition out.wav     # every sound in one file
python3 scripts/sfx_kit.py --export <dir>         # render every sound as wav (default + two variants)
```

## Using it

In `timeline.js`:

```js
window.SFX_KIT = { pitch: 1.06, bright: 0.2, len: 0.9, seed: 3 };   // this video's "colour", constant for the whole video
const SFX = [                                   // [t, name, { options }]
  [T.tag1, 'tik'],                               // no gain: the kit's level-matched default volume
  [T.title, 'sparkle', { bright: 0.5 }],         // per-cue tweak
  [T.count, 'tally', { dur: 0.8 }],              // dur covers the roll; the last tick lands on the settling frame
];
```

| Knob | Range | Effect |
|---|---|---|
| `pitch` | 0.85–1.2 | Pitch factor, 1.06 ≈ one semitone up. Pitched sounds are then snapped to the key of the video's BGM |
| `bright` | −1…1 | Positive = brighter and crisper, negative = darker and softer |
| `len` | 0.7–1.4 | Duration factor; smaller is shorter and drier |
| `seed` | integer | Sounds with random grains (`sparkle`, `riffle` ...) get a different arrangement per seed |

Cue fields (read by `scripts/sfx.py`): `t` (s), `name`, `gain` (0..1), `pan` (−1..1), `pitch`, `dur` (some sounds), `align` (`'start'` | `'end'`), `bright`, `len`, `snap` (default true: pitched sounds snap to the key), `keep` (true = exempt from "only the first of a series").

- Without `window.SFX_KIT` nothing changes: no variant, no level matching, no series rule.
- Legacy sounds from `sfx.py` only take `pitch` and `seed`.
- Sounds with an alignment point (`revcut`, `notify`, `swoop`): write the cue's `t` at the visual hit or cut; `sfx.py` shifts the sound earlier by itself.
- After editing `timeline.js`, re-run `render_frames.js . --stills 0` to refresh `build/sfx_cues.json`, then run `sfx.py`.

## Which picture gets which sound

The names on the left of each arrow are the event names in `XM.DS.SFX`; components use them, and they map to the kit sounds on the right.

| Picture event | Sound (`XM.DS.SFX` name -> sound) | When not to add one |
|---|---|---|
| Cut to a new shot (a hard cut to a picture that is already in place) | **No sound by default** (`enter` is empty) | Push / pull or card swaps within a shot; cuts between talking-head shots; a new shot that flies or slides in (its entry animation is enough) |
| Major section change: the subject slowly turns in and settles, the whole screen becomes a new scene | `scene` -> `airin` (long entry hiss, 1.5 s, bright head then a flat bed) | Only a few times per video, for big section changes; ordinary cuts use `enter` |
| Card swap, cards landing on each other: photos, screenshots, evidence cards replacing one another | `swap` -> `slide` ("click-clack"), on the frame the new card appears; a single card pressed / stamped / dropped on a table: `press` -> `deal` (first click of `slide`) | Only the first of a series (see below); a full scene change uses `enter` / `scene` |
| Paper or cards flying in: a paper stack scattering, sheets landing one by one | `fly` -> `sheet` (paper "whsh", the object's own sound) | Only the first of a series; a 3D evidence-card entry gets nothing (the entry animation is enough) |
| Messages / notifications popping up: chat bubbles, phone notifications | `message` -> `notify` (a run of tiny notes + "ding"), cue `t` on the frame the message appears | Only the first of a series |
| A tag, label or line of big text dropping from above | `drop` -> `swoop` (three falling "whsh"), cue `t` on the landing frame | Big text slamming in uses `kacha` / `pa`; only the first of a series |
| Rushing into the next shot: the picture blurs out / dashes into a hard cut | `rushcut` -> `revcut` (reversed metal cymbal, peaks just before the cut, rings after it), cue `t` at the cut | A few times per video; ordinary cuts use `enter` |
| Rapid cuts: keywords, documents, screenshots changing every 2–3 frames | `cuts` -> `flick` (a flat run of clicks), `dur` covers the cuts, hard stop on the last cut | Slow changes are not rapid cuts; individual cuts in the run get nothing extra |
| Small elements appearing: tags, bullet bars, nodes, badges, stamps | One at a time: `tag` -> `tik` (a single small icon or dot can use `dot` -> `pip`, a round 670 Hz pop); several popping up together (within 0.3 s): a fast run of `bubble` -> `bub` with rising pitch (1 -> 1.12 -> 1.26 -> 1.5), counted as one; a whole row at once: `multi` -> `swick` | **Text appearing word by word with the voiceover** (formulas, lists of words, text revealed as it is read) gets no sound at all, the voice already sets the beat; slow fade-ins of small text; the same thing appearing a second time |
| Big text slamming in | First line `kacha`, each later line cutting in `pa` | Quote lines fading in after the big text; on a two-line card with a lead-in line + the key line, only the key line gets a sound |
| Big moves | Rolling in, dashing past: `dash` -> `zip` (align end, on arrival); lighting up: `glow` -> `glint`; sliding aside, wiping across: `wipe` -> `whip` (align end); something flying in and being collected: `collect` -> `chirp` | Slow pushes, slow drifts, breathing-style small motion |
| Narrative accents | Verdict / reveal / settle: `snap`; emphasis on a line: `ting`; keyword big text: `sparkle` | The same accent three times in a row |
| Highlighter sweep | `sweep` -> `paper` | — |
| Number rolling, counting, years flipping | `count` -> `tally`: a run of dry ticks, dense then sparser, the last one on the settling frame, no ding (`dur` covers the roll); a number racing up (countdown, progress filling, hitting the top): `rush` -> `tallyup`, faster and faster; climbing a ranking, one beep per place: `bleep` | A big number that just appears without rolling counts as a small element: one `tik` |

- **Density**: 10–15 sound moments per minute of animation (sounds < 0.3 s apart count as one), mostly the very light ones from the first rows.
- **Only the first of a series**: when the same kind of thing appears one after another (cards landing, photos swapping, tags popping up), only the first gets a sound; things popping up together (within 0.3 s) count as one. `sfx.py` enforces this for `tik` `bub` `swick` `slide` `deal` `sheet` `pip` `notify` `swoop` `pop` `bloop`: the same sound repeating within 2 s is skipped; to make every one play, add `keep: true` to the cue. Text appearing word by word with the voiceover gets no sound, not even the first.
- **At most 3 sounds at the same instant**; keep the most important one.
- Silence is fine: where the viewer is reading a picture or listening to an explanation, leave it quiet on purpose.

## Ground rules

1. **No heavy or muffled sounds.** Verdicts, reveals and settles use the bright `snap`; emphasis uses `ting` or `sparkle`; big moves use bright sounds too.
2. **Within one video, the same kind of event always gets the same sound.** Variety goes between videos (a different `SFX_KIT`), not within one.
3. **Under speech, use high and short sounds.** The `talk` column in `KIT`: `True` any time; `'短'` (short) sits in the voice band but is very short, use lightly; `False` (`swoosh`, `whoosh`, `riffle`, `filmfeed`) only between sentences.
4. **A sound belongs to the kind of picture it was chosen for**; don't stretch it to other events.

## Changing or adding sounds

- **Change a sound**: edit the numbers in its `PRESETS` table in `sfx_kit.py` (frequencies in Hz, times in seconds); the comment above each table says what it is for.
- **Add a sound**: add a `PRESETS` table using one of the engines: `partials` (a few sine partials), `hiss` (a puff of breath), `glide` (a sliding tone), `arp` (a run of short notes), `grains` (sparkling grains), `cluster` (a slowly lighting cluster), `flutter` (an accelerating riffle), `clicks` (very short noise clicks: shutter / clap), `tally` (a run of dry ticks), `swap` (a two-click card swap), `puff` (a swelling "whsh"), `train` (an even run of clicks), `sweep` (a breath moving along a path), `layers` (layered tones / noise bands for matching a specific sound). Then add a line to `KIT` with status `'待试听'` (awaiting audition).
- **Add a legacy `sfx.py` sound to the kit**: add a line to `KIT`.
- **Default volume** is level-matched against the constant `GAIN_REF` in `sfx_kit.py`, so adding sounds never shifts the defaults of existing ones.

## Not in the kit

Still available in `sfx.py` for standalone shorts, but not used in voiceover animation:

- Heavy / muffled: `stamp`, `thud`, `punch`, `slam`, `sub`, `impact`, `boom`, `bonk`.
- Gong-like: `clang`, `trailerhit`, `braam`.
- `stab`: no brass for "?" or for hits.
- `room`, `vinyl`: no filler beds.
