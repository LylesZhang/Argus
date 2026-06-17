# Render 流程文档

## 总览

每次设置变化或 Topic Focus 触发时，`render()` 被调用。流程分三个阶段：

```
render()
  ├── 1. removeTransformations()   ← 还原页面到原始状态
  ├── 2. 准备数据（高亮、标签）
  └── 3. applyTransformations()   ← 重新渲染
        └── 每个段落（p / li / blockquote）：
              ├── 应用 Typography 样式
              └── shouldWrap 为 true → 三步重建段落 HTML
```

---

## 第一步：removeTransformations()

- 遍历所有 `p, li, blockquote`
- 如果 `state.originalHTML` 里有备份，用备份还原 `innerHTML`
- 清除所有内联 style（fontSize、lineHeight 等）
- 清除背景色、关闭 Reading Ruler

---

## 第二步：准备数据

在 `render()` 里，`applyTransformations` 之前：

| 数据 | 来源 | 条件 |
|------|------|------|
| `state.articleHighlights` | emotion + transition 词列表合并 | readingAidsEnabled |
| `state.allSentences` | `extractAllSentences()` 扫描全文 | sentenceLabels 开启 |
| `state.sentenceLabels` | local: `generateSentenceLabels()` / ai: `state.aiSentenceLabels` | sentenceLabels 开启 |

如果 AI 模式开启（emotionMode='ai' 或 sentenceLabelsMode='ai'），同时发起异步请求。

---

## 第三步：applyTransformations() — 段落重建

对每个 `p, li, blockquote`（innerText 长度 ≥ 20 才处理）：

### 3a. Typography 样式

`typographyEnabled` 为 true 时，直接写 inline style：fontSize、lineHeight、fontFamily、wordSpacing、letterSpacing、color。

### 3b. shouldWrap 判断

```js
const needsSentenceWrap = emotionColor || gradientRows || transitionAnimation || sentenceLabels;
const shouldWrap = (readingAidsEnabled && needsSentenceWrap)
                || (typographyEnabled && boldBeginning)
                || topicFocusKeywords !== null
                || topicFocusAIPrefixes !== null;
```

- `shouldWrap = false` → 段落 innerHTML 不动，跳过
- `shouldWrap = true` 且 `hasEmbeddedContent(para) = true`（含图片/视频/空 span 等）→ 也跳过，不能安全重建
- 其余情况 → 执行三步重建

### 3c. 三步重建（保留原始内联 HTML）

```
① extractInlineAnnotations(originalHTML)
     → DOM 树遍历，记录每个内联标签在纯文本中的字符位置
     → 返回 [{ textPos, tag }, ...]

② buildParagraphHTML(para.innerText)
     → 把纯文本切成句子，包裹 dra-sentence span/div
     → 同时应用 Bionic Effect、Emotion Color、Transition Words、Sentence Labels
     → 返回渲染后的 HTML 字符串

③ reInjectAnnotations(rendered, annotations)
     → 建立"纯文本字符位置 → HTML 字节偏移"映射表（textToHtmlPos）
     → 按 textPos 从大到小插入标签（从后往前，保证前面位置不失效）
     → 返回含原始内联标签的最终 HTML
```

最终写入 `para.innerHTML`。

---

## buildParagraphHTML 内部

```
plainText.trim()
  → split(/(?<=[.!?])\s+(?=[A-Z"'\[])/)   ← 按句子边界切分，消耗分隔空白
  → 每个句子 → renderSentence(s)
                  ├── 匹配 state.articleHighlights（emotion / transition 词）
                  ├── 应用 Bionic Effect（applyBionicToText）
                  └── 返回带高亮 span 的 HTML 片段
  → 每个句子 → badge(s)（Sentence Label 标签）
  → 包裹成 <span class="dra-sentence">...</span>（无 gradientRows）
          或 <div class="dra-sentence dra-row-even/odd">...</div>（gradientRows）
  → join(' ')   ← 空格补回被 split 消耗的句间空白，保证 textToHtmlPos 对齐
```

---

## extractInlineAnnotations 内部

DOM 树遍历（用 `document.createElement('div').innerHTML = html` 解析）：

| 节点类型 | 处理 |
|----------|------|
| TEXT_NODE | `textPos += text.replace(/[ \t\r\n]+/g, ' ').length`（折叠空白，与 innerText 对齐） |
| `<br>` | `textPos += 1`（innerText 把 `<br>` 转成 `\n`，占 1 位） |
| INLINE_TAG（见下表） | 记录 open tag，递归子节点，记录 close tag |
| 其他元素 | 只递归子节点，不记录 |

**INLINE_TAGS**：`a, abbr, b, bdi, cite, code, data, del, dfn, em, i, ins, kbd, mark, q, s, samp, small, span, strong, sub, sup, time, u, var`

---

## reInjectAnnotations 内部

1. 扫描 renderedHTML，跳过 `<...>` 内的字符，把每个可见字符的字节偏移存入 `textToHtmlPos[]`
2. 按 `textPos` 从大到小排序 annotations（同一位置按原始 index 从大到小，保证插入顺序正确）
3. 从后往前依次插入：`result = result.slice(0, htmlPos) + tag + result.slice(htmlPos)`

---

## Topic Focus（附加步骤）

`applyTransformations` 之后，`render()` 里：

```
topicFocusKeywords !== null   → applyFocusMask(keywords)
                                  遍历 .dra-sentence，按关键词评分，相关句加粗，不相关句变灰
topicFocusAIPrefixes !== null → applyFocusMaskByPrefixes(prefixes)
                                  前 30 字符前缀匹配，匹配句高亮
```

---

## 哪些功能会重建 HTML，哪些只加效果

| 功能 | 重建 innerHTML | 只叠加效果 |
|------|:--------------:|:---------:|
| Bionic Effect | ✓ | |
| Emotion Colors | ✓ | |
| Row Shading | ✓ | |
| Transition Words | ✓ | |
| Sentence Labels | ✓ | |
| Topic Focus | ✓ | |
| Typography（字体/字号等） | | ✓（inline style） |
| Reading Ruler | | ✓（浮动 overlay） |
| Topic Focus 遮罩 | | ✓（在重建后的 spans 上加 class） |
