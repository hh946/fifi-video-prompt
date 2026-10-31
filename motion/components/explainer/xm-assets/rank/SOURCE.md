# XS.rank: source and license

## Animation code
- Repository: https://github.com/w52m/qwen3-8-max-text-arena-rank-climb
- File: `src/TextArenaRankClimb.tsx` (Remotion / React, portrait 1080x1920, 30 fps, 8 s)
- Commit: `3bddb3264c588ff3cc63bb0f9a24b710d2b2095c` (2026-09-30, author Bron)
- License: the repository has no LICENSE file, and package.json has no license field.
- Permission: the vibe-motion author has allowed direct use of these projects, including commercial use.
- What was used: the motion logic, ported to `components/explainer/xs-rank.js` (deterministic, a pure function of t, CSS 3D):
  camera locked on the target row, tilted perspective flattening over time (rotateX 57->39->24->0, rotateY -20->0, rotateZ -5.6->0, scale 1.7 -> pull-back),
  each row the target passes is bumped down one place, blur and opacity by distance (distance 80/440/850 -> opacity .92/.54/.18, blur capped at 4.2 px),
  landing impact (z lifts 122 -> 0, spring), landing shake / motion blur / glow pulse (only with `hit:true`), pull-back revealing the whole board, board header info fading in on pull-back.
- What was not used: the upstream visuals (beige web page, rounded white cards, green glow, Arial, made-up leaderboard data). Visuals are redrawn with the `xm-ds.js` design system.

## Demo screenshot and data
- Page: https://lmarena.ai/leaderboard/text (redirects to https://arena.ai/leaderboard/text), text arena overall leaderboard, page data dated 2026-10-02.
- Captured 2026-10-07T16:54:30Z at 1440x1000, scale 4, cropped to the title + table area.
- The redrawn row data (rank, model, vendor, score, +-, votes, rank range) are real values read from the page table at the same moment.
- The screenshot itself is not included in this folder.
