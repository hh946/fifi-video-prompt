# fifi-video-prompt

用纯代码做动画短视频的 prompt 合集：只用 HTML + SVG + JavaScript 画画面，Chrome 逐帧渲染，声音也由代码合成，全程不用任何图像、视频或音乐生成模型。

把 prompt 整段复制给能写代码、能跑命令的 AI 编程助手，比如 Claude Code、Codex、Cursor Agent，就能从零做出一支完整的 MP4。

## 合集

| 作品 | 预览 | 说明 |
|---|---|---|
| [AI 大战验证码](ai-vs-captcha/) | <img src="ai-vs-captcha/preview.gif" width="320"> | 30 秒横屏 1920×1080。鼠标光标想通过「我不是机器人」验证，一路被识破，再学着装人类。朋克拼贴杂志风，炸裂节奏，可选 120BPM 代码合成配乐。 |

## 需要的环境

- Node.js 18+ 和 Google Chrome（或 Chromium），用 Playwright / Puppeteer 逐帧截图
- Python 3，带 numpy、scipy，用来合成声音
- ffmpeg，用来合成 MP4

## 怎么用

1. 打开对应作品目录下的 `prompt.md`。
2. 把「任务」以下的全部内容复制给你的 AI 编程助手。
3. 它会依次写代码、渲染 900 帧、合成声音、出 MP4，最后按 prompt 里的自检清单抽帧检查。

每个 prompt 都写死了规格、节拍表、视觉风格、声音和自检清单，照着做出来的结果会和预览基本一致。细节会因为模型不同而有出入。
