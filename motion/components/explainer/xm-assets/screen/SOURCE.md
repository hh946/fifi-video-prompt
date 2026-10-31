# XS.screen upstream source

- Repository: https://github.com/vibe-motion/fisheye-motion
- Commit: `c163ee8c20ffcbba384e792ff0bc26618a392aba` (2026-09-04, author zjucat)
- Files used:
  - `src/lib/FisheyeRenderer.js`: fragment shader (barrel distortion, fade to black out of bounds, four blend modes for mark rectangles + mask slide-in, moire interference, vignette), default parameters, rectangle coordinate conversion (page y down -> gl y up).
  - `vibe-motion-app/motion/timeline.js` / `config.js`: easeInOutCubic for the focus push, easeOutCubic for the mark mask, linear drift after the push (zoomDrift).
- License: the repository has no LICENSE file.
- Permission: the vibe-motion author has allowed direct use of these projects, including commercial use.
- Not used: upstream assets such as `public/test.jpg`, `assets/fisheye-demo.gif`, `public/img/claude.svg`.
- Our changes: uses the shared renderer `XM.gl()` (three r158 ShaderMaterial); added `uCenter` (distortion centre fixed at the lens centre), `uCrop` (screenshot pixel crop), `uExpo` (entry exposure), `uMoirePhase` (moire crawl); mipmaps + anisotropic filtering on the texture; bracket marks and leader lines drawn on canvas through the forward distortion mapping; everything determined by t.

No screenshots are stored in this folder.
