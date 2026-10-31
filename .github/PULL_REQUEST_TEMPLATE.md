<!-- Fill in the part that fits and delete the rest. / 填对应的部分，其余删掉。See CONTRIBUTING.md -->

Fixes #

## Type
- [ ] Fix / tweak
- [ ] New component
- [ ] Docs / scripts

## Fix / tweak: Before → After
<!-- Anything that changes how a video looks or sounds: upload the FULL MP4 of the same demo before and after, with sound. Same scene, same parameters. No stills or GIFs. Drag the .mp4 files into this box.
     改动会影响画面或声音的：上传同一个演示改前、改后的完整 MP4（带声音），同一个 scene、同样参数。不要截图或 GIF，直接把 .mp4 拖进来。 -->
**Before** (full video):

**After** (full video):

**What changed and at what time** <!-- e.g. 0:02.4 the tag no longer overlaps the title / 例：0:02.4 标签不再压标题 -->

## New component
**Demo** <!-- the FULL MP4 of your demo, with sound. Not a GIF. / 演示的完整 MP4，带声音，不要 GIF。 -->

**When to use it** <!-- one or two sentences -->

**Best way to use it**
```js
SH.x = XM.yourComponent({ /* minimal params */ });
```

**Style** <!-- tone, palette, how it moves -->

## Checks
- [ ] Stills checked at key frames; full build is 1920×1080 @ 30 fps
- [ ] `render(t)` is pure (same t → same frame)
- [ ] All content is parameters
- [ ] No third-party images / logos; fonts include their license
- [ ] Doc page added (new component)

## Human review
<!-- A person ticks this box, never an agent. PRs with this box unticked are not reviewed.
     这一格只能由真人自己勾，agent 不许勾。没勾的 PR 不会被审。 -->
- [ ] I am a human. I watched every video in this PR from start to finish, with sound, and I read every changed line myself. / 我是真人，我从头到尾带声音看完了这个 PR 里的每一支视频，也亲自看过每一行改动。
