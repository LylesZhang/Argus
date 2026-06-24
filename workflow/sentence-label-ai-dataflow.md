# Sentence Label AI 模式完整数据流

## 1. 架构总览

```
┌─────────────────┐        chrome.runtime.sendMessage        ┌────────────────────────┐
│   panel/panel.js │ ─────────────────────────────────────▶ │ background/index.js    │
│   (Side Panel)   │   { type: 'SETTINGS_CHANGED', ... }    │ (Service Worker)       │
└─────────────────┘                                          └──────────┬─────────────┘
                                                                        │
                              ┌─────────────────────────────────────────┘
                              │  chrome.tabs.sendMessage → content script
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  content/index.js  (消息路由)                                                        │
│  content/render.js (渲染协调)                                                        │
│  content/features/labels.js (句子提取 / 请求发送)                                    │
│  content/state.js  (全局状态)                                                        │
└──────────────────────────────────┬──────────────────────────────────────────────────┘
                                   │  chrome.runtime.sendMessage
                                   │  { type: 'LABEL_REQUEST', sentences, articleLens }
                                   ▼
                         ┌────────────────────────┐
                         │ background/index.js     │
                         │ fetchSentenceLabels()   │
                         └──────────┬─────────────┘
                                    │  POST /api/label
                                    ▼
                         ┌────────────────────────┐
                         │ server/index.js         │
                         │ /api/label endpoint     │
                         └──────────┬─────────────┘
                                    │  Gemini API calls (分块)
                                    ▼
                         ┌────────────────────────┐
                         │ Gemini 2.5 Flash API    │
                         └────────────────────────┘
```

---

## 2. 全局状态（content/state.js）

与 sentence label AI 模式直接相关的字段：

| 字段 | 类型 | 含义 |
|------|------|------|
| `state.settings.sentenceLabels` | `boolean` | 句子标签功能总开关 |
| `state.settings.sentenceLabelsMode` | `'ai' \| 'local'` | 当前模式 |
| `state.settings.sentenceLabelsLens` | `'news' \| 'stem' \| 'humanities' \| 'fiction'` | 当前透镜（决定标签类型） |
| `state.sentenceLabelsInProgress` | `boolean` | 是否正在等待 AI 响应（防重复请求） |
| `state.aiSentenceLabels` | `Array<{index, type}>` | AI 返回的标签数组（持久化，切换 OFF/ON 不清空） |
| `state.sentenceLabels` | `Array<{index, type}>` | 当前渲染使用的标签（AI 模式下 = `aiSentenceLabels`） |
| `state.allSentences` | `string[]` | 页面所有句子（按段落展开），用于 index 对应 |

---

## 3. 触发路径

### 3.1 用户开启 Sentence Labels 开关

```
用户点击 panel 里的 toggle-labels
        │
        ▼
enableReadingAidIfNeeded(true)          ← 如果 readingAidsEnabled=false，先广播 { readingAidsEnabled: true }
broadcast({ sentenceLabels: true })     ← 广播 sentenceLabels 开关
        │
        ▼ (background 转发)
content/index.js: SETTINGS_CHANGED
  state.settings.sentenceLabels = true
  render()
```

### 3.2 用户切换到 AI 模式

```
用户点击 AI 模式按钮 (.mode-btn[data-mode="ai"])
        │
        ▼
broadcast({ sentenceLabelsMode: 'ai' })
        │
        ▼ (background 转发)
content/index.js: SETTINGS_CHANGED
  state.settings.sentenceLabelsMode = 'ai'
  render()
```

### 3.3 用户切换透镜（Article Type）

```
用户改变 label-lens-select
        │
        ▼
broadcast({ sentenceLabelsLens: 'stem' })
        │
        ▼ (background 转发)
content/index.js: SETTINGS_CHANGED
  prevLens = state.settings.sentenceLabelsLens   // 保存旧值
  state.settings.sentenceLabelsLens = 'stem'
  if (sentenceLabelsLens 发生变化) {
    state.aiSentenceLabels = []                  // ← 清空缓存，强制重新请求
    state.sentenceLabels   = []
    state.sentenceLabelsInProgress = false
  }
  render()
```

---

## 4. render() 内部逻辑（content/render.js）

每次 render 时：

```js
if (state.settings.readingAidsEnabled) {

  if (state.settings.sentenceLabels) {
    state.allSentences = extractAllSentences();          // 重新提取所有句子

    if (state.settings.sentenceLabelsMode === 'local') {
      state.sentenceLabels = generateSentenceLabels();  // 本地正则匹配，不需要 AI
    } else {
      state.sentenceLabels = state.aiSentenceLabels;    // 直接用缓存的 AI 结果（可能为空）
    }
  }

  const needsLabelsAI = state.settings.sentenceLabels
                     && state.settings.sentenceLabelsMode === 'ai';
  if (needsLabelsAI) requestSentenceLabels();            // 尝试发请求（内有去重守卫）
}

applyTransformations();                                  // 把 sentenceLabels 渲染到 DOM
```

**关键点**：`state.aiSentenceLabels` 在请求返回之前是空数组。render() 先用空数组渲染（没有高亮），同时发出 AI 请求；等结果回来后触发第二次 render()，这时才出现高亮。

---

## 5. requestSentenceLabels()（content/features/labels.js）

```js
export function requestSentenceLabels() {
  if (state.sentenceLabelsInProgress)    return;  // ① 守卫：请求进行中，跳过
  if (state.aiSentenceLabels.length > 0) return;  // ② 守卫：已有缓存结果，跳过

  state.sentenceLabelsInProgress = true;
  state.allSentences = extractAllSentences();      // 提取全文句子列表
  chrome.runtime.sendMessage({
    type:        'LABEL_REQUEST',
    sentences:   state.allSentences,              // 完整句子数组（不做截断）
    articleLens: state.settings.sentenceLabelsLens ?? 'news',
  });
}
```

### extractAllSentences() 逻辑

```js
export function extractAllSentences() {
  const area = findContentArea();                    // 找到主内容区（detect.js）
  return area.innerText
    .split(/\n+/)                                    // 按段落分割
    .filter(p => p.trim().length > 20)              // 过滤掉太短的段落
    .flatMap(p => splitSentences(p.trim())           // 每段再按句分割
      .filter(s => s.trim()));
}
```

---

## 6. Background Service Worker（background/index.js）

### 6.1 接收 LABEL_REQUEST

```js
if (msg.type === 'LABEL_REQUEST') {
  fetchSentenceLabels(msg.sentences, sender.tab.url, msg.articleLens).then(labels => {
    const type = labels ? 'LABEL_RESULT' : 'LABEL_ERROR';
    chrome.tabs.sendMessage(sender.tab.id,
      labels ? { type, labels } : { type }
    );
  });
}
```

### 6.2 fetchSentenceLabels() — 三层缓存 + 去重

```
┌─────────────────────────────────────────────────────────┐
│  cacheKey = "${tab.url}|${articleLens}"                 │
│                                                         │
│  1. 检查 labelCache（内存，30分钟 TTL）                   │
│     命中 → 直接返回缓存结果                              │
│                                                         │
│  2. 检查 labelPending（正在进行的 Promise）               │
│     命中 → 返回同一个 Promise（不发新请求）               │
│                                                         │
│  3. 发起新请求：                                         │
│     - 创建新 Promise，存入 labelPending                  │
│     - POST /api/label（带 90秒超时）                     │
│     - 成功 → 存入 labelCache，删除 labelPending 记录     │
│     - 失败 → 删除 labelPending 记录，返回 null           │
└─────────────────────────────────────────────────────────┘
```

**关键设计**：`labelPending` Map 解决了并发重复请求问题。如果两条 LABEL_REQUEST 同时到达 background（例如 LABEL_ERROR 的 8 秒重试 timer 触发时第一个请求还没结束），两者共享同一个 Promise，只发一次 Gemini 请求，结果一致，不会出现"先出现一个结果马上变成另一个"的情况。

---

## 7. 服务器端（server/index.js: /api/label）

### 7.1 分块策略

```
sentences.length ≤ 40  →  一个 chunk，一次 Gemini 调用
sentences.length > 40  →  顺序分块，每块 40 句，依次调用 Gemini
```

例：100 句文章 → 3 个 chunk（40 + 40 + 20），顺序执行 3 次 Gemini API 调用。

### 7.2 单次 Gemini 调用（callGemini）

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent

请求参数：
  - responseMimeType: 'application/json'（强制 JSON 输出）
  - thinkingBudget: 0（关闭思考，降低延迟）
  - maxOutputTokens: 4096

重试逻辑：
  - 最多 3 次尝试
  - 遇到 503（服务繁忙）自动等待 1500ms × attempt 后重试
  - 其他错误直接 throw
```

### 7.3 Prompt 示例（News 透镜）

```
Classify sentences from this NEWS ARTICLE. Only include sentences you are confident about.

Sentences:
0. [sentence 0]
1. [sentence 1]
...

Return ONLY this JSON:
{ "labels": [{ "index": <n>, "type": "core-fact" | "context" | "quote" }] }

Definitions:
- "core-fact" — 5W1H 核心事实（who/what/when/where）
- "context"   — 历史背景，解释事件意义
- "quote"     — 直接或间接引用（具名官员/目击者/专家）
```

### 7.4 四种透镜的标签类型

| 透镜 | 标签 |
|------|------|
| `news` | `core-fact` / `context` / `quote` |
| `stem` | `concept` / `mechanism` / `constraint` |
| `humanities` | `thesis` / `evidence` / `explanation` |
| `fiction` | `dialogue` / `plot-turn` / `setting` |

### 7.5 容错机制（非致命分块失败）

```js
const runChunk = async (chunk, offset) => {
  try {
    const result = await callGemini(apiKey, promptFn(chunk));
    return (result?.labels ?? []).map(l => ({ ...l, index: l.index + offset }));
  } catch (err) {
    console.error(`[label] chunk offset=${offset} failed, skipping`);
    return [];                // ← 失败的块返回空数组，不影响其他块
  }
};
```

某个块 3 次重试全部失败时，该块的句子不会被标记，但其他块的结果仍然返回。服务器最终返回：

```json
{ "labels": [ { "index": 0, "type": "core-fact" }, ... ] }
```

---

## 8. 响应返回 Content Script（content/index.js）

### 8.1 LABEL_RESULT（成功）

```js
if (msg.type === 'LABEL_RESULT') {
  state.sentenceLabelsInProgress = false;
  if (msg.labels?.length > 0) {
    state.aiSentenceLabels = msg.labels;   // 存入持久缓存（不会被 ON/OFF 切换清空）
    state.sentenceLabels   = msg.labels;
  }
  render();                                // 触发重新渲染，把标签写入 DOM
}
```

**注意**：如果 labels 为空数组（所有 chunk 都失败），`aiSentenceLabels` 不更新，下次 render 时 `aiSentenceLabels.length === 0`，`requestSentenceLabels()` 会再次发请求（自动重试）。

### 8.2 LABEL_ERROR（失败）

```js
if (msg.type === 'LABEL_ERROR') {
  if (state.settings.sentenceLabels && state.settings.sentenceLabelsMode === 'ai') {
    // AI 模式下：保持 inProgress=true，8秒后才允许重新请求
    setTimeout(() => {
      state.sentenceLabelsInProgress = false;
      render();
    }, 8000);
  } else {
    state.sentenceLabelsInProgress = false;
  }
}
```

**设计原因**：立刻重置 `inProgress` 会导致 render 马上触发第二次请求，与可能仍在服务器处理的第一次请求产生竞争。8 秒冷却窗口避免了这种情况。

---

## 9. DOM 渲染（content/render.js）

### 9.1 句子匹配逻辑（sentenceLabelClass）

```js
const sentenceLabelClass = (s) => {
  if (!state.settings.sentenceLabels) return '';
  const trimmed = s.trim();
  // 用前 25 个字符做前缀匹配，找到该句在 allSentences 中的 index
  const idx   = state.allSentences.findIndex(as => as.slice(0, 25) === trimmed.slice(0, 25));
  const label = state.sentenceLabels.find(l => l.index === idx);
  return VALID_LABEL_TYPES.has(label?.type)
    ? ` dra-label-${label.type}`
    : '';
};
```

**前 25 字符匹配**：避免完整字符串比较的性能问题，同时处理段落 split 后句子文本略有差异的情况。

### 9.2 段落重写

```js
// 对每个 <p> / <li> / <blockquote>
const rendered = buildParagraphHTML(para.innerText);
// buildParagraphHTML 把段落拆成句子，每句包裹为：
// <span class="dra-sentence dra-label-core-fact">...</span>
para.innerHTML = reInjectAnnotations(rendered, annotations);
```

### 9.3 CSS 样式（content/content.css）

每个标签类型对应独立的 CSS 类，颜色通过 CSS 变量控制（可在 panel 实时修改）：

```css
.dra-label-core-fact {
  background: color-mix(in srgb, var(--dra-label-core-fact, #eab308) 28%, transparent);
  font-weight: 700;
  padding: 1px 3px;
  border-radius: 4px;
}
.dra-label-context {
  background: color-mix(in srgb, var(--dra-label-context, #3b82f6) 12%, transparent);
  border-left: 3px solid color-mix(in srgb, var(--dra-label-context, #3b82f6) 45%, transparent);
  padding: 1px 3px 1px 6px;
}
/* ... 共 12 种标签类型 */
```

CSS 变量在 `applyTransformations()` 中设置：

```js
document.documentElement.style.setProperty('--dra-label-core-fact', state.settings.labelCoreFactColor);
// ... 每次 render 都重新设置，确保颜色与 settings 同步
```

---

## 10. 完整时序图（正常流程）

```
用户打开 AI Sentence Labels
        │
        ▼
panel: broadcast({ sentenceLabels: true, sentenceLabelsMode: 'ai' })
        │
        ▼
background: 转发 SETTINGS_CHANGED 到 content script
        │
        ▼
content: state.settings 更新 → render()
  ├─ state.sentenceLabels = state.aiSentenceLabels (= [])
  ├─ applyTransformations() → DOM 渲染（无高亮，因为 labels 为空）
  └─ requestSentenceLabels()
       ├─ 检查 sentenceLabelsInProgress = false → 通过
       ├─ 检查 aiSentenceLabels.length = 0 → 通过
       ├─ state.sentenceLabelsInProgress = true
       ├─ state.allSentences = extractAllSentences()
       └─ chrome.runtime.sendMessage({ type: 'LABEL_REQUEST', sentences: [...], articleLens: 'news' })
                │
                ▼
        background: fetchSentenceLabels()
          ├─ labelCache miss
          ├─ labelPending miss → 创建新 Promise，存入 labelPending
          └─ POST https://argus-1ygn.onrender.com/api/label
                      │ (90秒超时)
                      ▼
              server: fetchSentenceLabelsFromGemini()
                ├─ 100句 → chunk[0..39], chunk[40..79], chunk[80..99]
                ├─ await callGemini(chunk[0])  → { labels: [...] }
                ├─ await callGemini(chunk[1])  → { labels: [...] }
                └─ await callGemini(chunk[2])  → { labels: [...] }
                   合并所有 labels，修正 index offset
                   return { labels: [ {index:0, type:'core-fact'}, ... ] }
                      │
                      ▼
        background: 收到响应
          ├─ labelCache.set(key, { result: labels, timestamp: now })
          ├─ labelPending.delete(key)
          └─ chrome.tabs.sendMessage({ type: 'LABEL_RESULT', labels: [...] })
                │
                ▼
        content: LABEL_RESULT handler
          ├─ state.sentenceLabelsInProgress = false
          ├─ state.aiSentenceLabels = labels    ← 存入持久缓存
          ├─ state.sentenceLabels   = labels
          └─ render()
               ├─ state.sentenceLabels = state.aiSentenceLabels (非空)
               ├─ requestSentenceLabels()
               │    └─ aiSentenceLabels.length > 0 → 直接 return（不再发请求）
               └─ applyTransformations()
                    └─ buildParagraphHTML() → sentenceLabelClass()
                         └─ <span class="dra-sentence dra-label-core-fact">...</span>
                              ↓
                         ✅ 页面出现高亮
```

---

## 11. 缓存机制对比

| 层级 | 位置 | 存储位置 | 生命周期 | key |
|------|------|----------|----------|-----|
| Content 内存缓存 | `state.aiSentenceLabels` | JS 内存 | 页面刷新清空；切换透镜清空；关闭/打开不清空 | — |
| Background 内存缓存 | `labelCache` Map | Service Worker 内存 | SW 重启清空（约 30 秒空闲后）；30 分钟 TTL | `url\|lens` |
| Background 请求去重 | `labelPending` Map | Service Worker 内存 | 请求完成后立即删除 | `url\|lens` |

**没有** `chrome.storage.local` 持久化：页面刷新或 SW 重启后必须重新调用 Gemini API。

---

## 12. 常见问题与根因

### 12.1 经常没有渲染结果
- **根因**：`FETCH_TIMEOUT_MS` 原来是 10 秒，100句文章需要 ~15 秒（3 chunk × 5s）
- **修复**：调整为 90 秒

### 12.2 反复切换 ON/OFF 高亮内容变化
- **根因**：LABEL_ERROR 立刻重置 `sentenceLabelsInProgress`，允许新请求在旧请求刚失败后立即发出；Gemini 非确定性导致两次结果不同
- **修复**：LABEL_ERROR 后保持 `inProgress=true`，等待 8 秒冷却窗口

### 12.3 先出现一个结果，马上变成另一个
- **根因**：Background 没有请求去重，两个 LABEL_REQUEST 同时触发两次独立 Gemini 调用，第二次结果覆盖第一次
- **修复**：加入 `labelPending` Map，同一 `url|lens` 进行中时复用同一个 Promise

### 12.4 某个 chunk 失败导致整个请求失败
- **根因**：服务器 `runChunk` 抛出异常向上传播，`/api/label` 返回 500
- **修复**：每个 chunk 用 try/catch 包裹，失败的 chunk 返回 `[]`，成功的 chunk 结果仍然返回
