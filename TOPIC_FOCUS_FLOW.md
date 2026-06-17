# Topic Focus 工作流文档

## 概览

Topic Focus 支持两种模式，由 `settings.topicFocusMode`（`'local'` | `'ai'`）控制。  
模式切换通过 panel 上的 Local / AI pill 完成，Apply / Clear 按钮触发实际操作。

---

## Local 模式

```
用户输入 topic → 点 Apply
        ↓
panel.js: 将输入按空格拆词，过滤掉长度 ≤ 2 的词
        ↓
sendMessage({ type: 'FOCUS_APPLY', keywords: [...] })
        ↓
background: forwardToActiveTab() 转发给当前 tab 的 content script
        ↓
content/index.js:
  state.topicFocusKeywords = keywords
  render()
        ↓
render.js — render():
  1. removeTransformations()  ← 还原页面 HTML
  2. applyTransformations()   ← shouldWrap 条件成立（topicFocusKeywords !== null）
                                 → 为每个段落创建 .dra-sentence spans
  3. applyFocusMask(keywords) ← 遍历 .dra-sentence，用 scoreSentence() 评分
                                 → 相关句子加粗，不相关句子变灰
```

**关键函数（topicFocus.js）：**
- `extractKeywords(text)` — 去 stop words，提取有效词
- `scoreSentence(text, keywords)` — 精确匹配 +3 分，词干匹配 +1 分，> 0 分即高亮
- `applyFocusMask(keywords)` — 遍历 `.dra-sentence`，按评分设置样式

---

## AI 模式

```
用户输入 topic → 点 Apply
        ↓
panel.js: sendMessage({ type: 'FOCUS_AI_REQUEST', topic })
        ↓
background: forwardToActiveTab() 转发给 content script
        ↓
content/index.js (FOCUS_AI_REQUEST handler):
  findContentArea() 获取页面正文
  sendMessage({ type: 'FOCUS_ANALYZE', topic, text: 页面全文 })
        ↓
background/index.js (FOCUS_ANALYZE handler):
  withTimeout( fetch('http://localhost:3000/api/focus', { topic, text }) )
  超时时间：10 秒
        ↓
  成功 → sendMessage({ type: 'FOCUS_RESULT', relevant: [句子前缀数组] })
  失败/超时 → sendMessage({ type: 'FOCUS_ERROR' })
        ↓
content/index.js:

  FOCUS_RESULT:
    state.topicFocusAIPrefixes = msg.relevant
    render()
    ↓
    render.js — render():
      1. removeTransformations()
      2. applyTransformations()  ← topicFocusAIPrefixes !== null，创建 spans
      3. applyFocusMaskByPrefixes(prefixes)
           ← 比对每个 .dra-sentence 的前 30 字符
              与 prefixes 中每项的前 25 字符
              匹配则高亮

  FOCUS_ERROR:
    state.topicFocusAIPrefixes = null
    clearFocusMask()  ← 移除所有焦点样式
```

**关键函数（topicFocus.js）：**
- `applyFocusMaskByPrefixes(prefixes)` — 前缀匹配高亮，不用评分

---

## Clear

```
用户点 Clear
        ↓
panel.js: sendMessage({ type: 'FOCUS_CLEAR' })
        ↓
background: forwardToActiveTab()
        ↓
content/index.js:
  state.topicFocusKeywords  = null
  state.topicFocusAIPrefixes = null
  clearFocusMask()   ← 立即清除样式
  render()           ← 重建页面，若 readingAids 也关则还原原始 HTML
```

---

## State 变量

| 变量 | 类型 | 用途 |
|------|------|------|
| `state.topicFocusKeywords` | `string[] \| null` | Local 模式关键词；非 null 时触发 span 创建和 applyFocusMask |
| `state.topicFocusAIPrefixes` | `string[] \| null` | AI 模式句子前缀；非 null 时触发 span 创建和 applyFocusMaskByPrefixes |
| `settings.topicFocusMode` | `'local' \| 'ai'` | 决定 Apply 按钮的路由 |

---

## span 创建条件（render.js applyTransformations）

`.dra-sentence` spans **独立于 Reading Aids 总开关**：

```js
const shouldWrap = (state.settings.readingAidsEnabled && needsSentenceWrap) ||
                   state.topicFocusKeywords !== null ||
                   state.topicFocusAIPrefixes !== null;
```

只要 Topic Focus 处于激活状态（任一 state 变量非 null），spans 就会被创建。

---

## 消息协议

| 消息 | 方向 | 触发时机 |
|------|------|---------|
| `FOCUS_APPLY` | panel → bg → content | Local 模式点 Apply |
| `FOCUS_AI_REQUEST` | panel → bg → content | AI 模式点 Apply |
| `FOCUS_ANALYZE` | content → bg | 收到 FOCUS_AI_REQUEST，携带页面全文 |
| `FOCUS_RESULT` | bg → content | 服务器返回成功，携带 relevant 前缀数组 |
| `FOCUS_ERROR` | bg → content | 服务器失败或超时（10秒） |
| `FOCUS_CLEAR` | panel → bg → content | 点 Clear |
