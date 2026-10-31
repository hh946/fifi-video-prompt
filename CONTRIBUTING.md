# Contributing

[中文](CONTRIBUTING.zh-CN.md)

Thanks for helping. Please search [existing issues](../../issues) first. Questions go to [Discussions](../../discussions), not issues.

## Issues

- **Bug**: use the *Bug report* form. Include the component, the time, the full MP4 where it goes wrong, and the smallest `scene.js` that shows it.
- **New component idea**: use the *Component proposal* form. Show what it looks like (a full video of your own, or a sketch) and when you would use it.

## Pull requests

1. Fork, branch from `main`, keep one change per PR.
2. Link the issue it fixes (`Fixes #12`).
3. Fill in the PR template. **Show it, don't describe it, and show all of it.** Anything that changes how a video looks or sounds needs **full MP4 videos with sound**, not stills or GIFs (drag the .mp4 into the PR; GitHub takes up to 10 MB, 100 MB on paid plans):
   - **Fix / tweak**: the full video of the same demo *before* and *after* (same scene, same parameters), plus what changed at which time.
   - **New component**: the full demo video, **when to use it**, **the best way to use it** (minimal code), and **its style** (tone, palette, how it moves).
4. Run the checks below.
5. **A human ticks the last box.** The PR template ends with a *Human review* box: a person confirms they watched every video from start to finish, with sound, and read every changed line. Agents must leave it unticked. PRs with the box unticked are not reviewed.

## The bar for components

Every component here was reviewed frame by frame before it shipped, and most ideas were cut. New ones go through the same review. A PR can be declined on looks alone. That's how the library keeps its no-AI-look feel.

## Checks

- [ ] `node scripts/render_frames.js <demo> --stills …` looks right at the key frames.
- [ ] `bash scripts/build.sh <demo>` gives a 1920×1080, 30 fps mp4 with the expected frame count.
- [ ] `render(t)` is pure: same `t`, same frame. No `Date.now()`, no unseeded random.
- [ ] All content is parameters. Nothing hard-coded for one video.
- [ ] No third-party images, logos or footage. Fonts come with their license file.
- [ ] New component: doc page added in `motion/docs/components/`.
- [ ] A human watched every video in the PR, start to finish, with sound, and read every changed line.

By contributing you agree your work is released under the [MIT License](LICENSE).
