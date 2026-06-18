# Word List Customization — Data Flow

## 涉及功能

用户可以自定义 Emotion（Positive / Negative / Complex）和 Transition 词表，有两种入口：
1. 在页面上选中文字 → 浮动菜单添加/移除
2. 在 Settings 面板直接编辑词表

---

## 存储结构

```
chrome.storage.sync
  ├── draSettings    （原有，各种开关 + 颜色设置）
  └── draWordLists   （新增）
        ├── emotionPositive: string[] | null
        ├── emotionNegative: string[] | null
        ├── emotionComplex:  string[] | null
        └── transition:      string[] | null
```

`null` = 用户从未修改过，运行时使用代码里的默认列表。

---

## 启动时加载（content/index.js:12–22）

```
chrome.storage.sync.get(['draSettings', 'draWordLists'])
  └── state.wordLists = { ...state.wordLists, ...data.draWordLists }
  └── render()
```

默认值在 `content/state.js:15–20`：

```js
wordLists: {
  emotionPositive: null,
  emotionNegative: null,
  emotionComplex:  null,
  transition:      null,
}
```

---

## 渲染时读取词表

### Emotion（content/features/emotions.js）

```
generateEmotionHighlights()
  └── pos = state.wordLists.emotionPositive ?? DEFAULT_EMOTION_POSITIVE
  └── neg = state.wordLists.emotionNegative ?? DEFAULT_EMOTION_NEGATIVE
  └── cmp = state.wordLists.emotionComplex  ?? DEFAULT_EMOTION_COMPLEX
  └── 遍历词表，匹配 contentArea.innerText → 返回 highlights[]
```

### Transition（content/features/transitions.js）

```
generateTransitionHighlights()
  └── words = state.wordLists.transition ?? DEFAULT_TRANSITION_WORDS
  └── 遍历词表，匹配 contentArea.innerText → 返回 highlights[]
```

默认词表导出自各自文件（`DEFAULT_EMOTION_POSITIVE` 等），供 selectionMenu.js 和 panel.js 读取。

---

## 入口一：页面选词浮动菜单

### 菜单启动条件（content/render.js:267–270）

```
render() 末尾：
  needsSelectionMenu = state.settings.readingAidsEnabled
                    && (state.settings.emotionColor || state.settings.transitionAnimation)
  true  → setupSelectionMenu(render)
  false → teardownSelectionMenu()
```

### 监听器注册（content/features/selectionMenu.js:120–126）

```
setupSelectionMenu(renderFn)
  └── _render = renderFn
  └── 若 listening === true → 直接返回（不重复注册）
  └── document.addEventListener('mouseup', onMouseUp)
  └── document.addEventListener('selectionchange', onSelectionChange)
```

`listening` 是模块级变量，扩展生命周期内只注册一次。

### 显示弹窗（selectionMenu.js:103–113）

```
mouseup 事件
  └── onMouseUp()
        ├── sel.isCollapsed → hideMenu(), return
        ├── word = sel.toString().trim().toLowerCase()
        ├── word 为空 / 超 60 字符 / 含连续空格 → hideMenu(), return
        └── showMenu(word, rect)
              ├── 创建 #dra-word-menu div，插入 document.body
              ├── 4 个按钮：Positive / Negative / Complex / Transition
              │     每个按钮检查 getCurrentList(key).includes(word)
              │     已在列表 → 显示 "✓ Label"，button.classList.add('active')
              │     不在列表 → 显示 "＋ Label"
              └── 定位：选区上方 8px（若超出顶部则改为下方）

selectionchange 事件
  └── sel.isCollapsed → hideMenu()
```

### 用户点击按钮（selectionMenu.js:67–73, 92–101）

```
button mousedown
  └── e.preventDefault() + e.stopPropagation()
  └── toggleWord(word, key, inList)
        ├── updated = inList ? current.filter(...) : [...Set([...current, word])]
        ├── state.wordLists = { ...state.wordLists, [key]: updated }
        ├── chrome.storage.sync.set({ draWordLists: state.wordLists })
        ├── chrome.runtime.sendMessage({ type: 'WORDLISTS_CHANGED', wordLists })
        └── if (_render) _render()   ← 立即重渲染当前页面
  └── hideMenu()
```

---

## 入口二：Settings 面板编辑词表（panel/panel.js）

```
initWordListEditor()
  └── chrome.storage.sync.get('draWordLists')
        └── wordLists[key] = data.draWordLists?.[key] ?? DEFAULT_WORDS[key]
        └── renderChips(key, chipsId)   ← 渲染 chip 列表

用户点击 chip 上的 ✕
  └── removeWord(key, word)
        ├── wordLists[key] = wordLists[key].filter(w => w !== word)
        └── saveAndBroadcast()

用户在输入框输入后点 Add
  └── addWord(key, word, chipsId)
        ├── wordLists[key] = [...new Set([...wordLists[key], word])]
        └── saveAndBroadcast()

用户点 Reset all to default
  └── wordLists = { ...DEFAULT_WORD_LISTS }
      chrome.storage.sync.remove('draWordLists')
      saveAndBroadcast()

saveAndBroadcast()
  ├── chrome.storage.sync.set({ draWordLists: wordLists })
  └── chrome.runtime.sendMessage({ type: 'WORDLISTS_CHANGED', wordLists })
```

---

## WORDLISTS_CHANGED 广播路径

### 从 panel 发出（panel → content）

```
panel/panel.js
  └── chrome.runtime.sendMessage({ type: 'WORDLISTS_CHANGED', wordLists })
        └── background/index.js:117
              sender.tab 不存在（panel 不是 tab）→ 走 forwardToActiveTab()
              └── chrome.tabs.sendMessage(activeTab.id, msg)
                    └── content/index.js:87–90
                          state.wordLists = { ...state.wordLists, ...msg.wordLists }
                          render()
```

### 从 selectionMenu 发出（content → background → 丢弃）

```
selectionMenu.js
  └── chrome.runtime.sendMessage({ type: 'WORDLISTS_CHANGED', wordLists })
        └── background/index.js:69–103
              sender.tab 存在（content script）→ 走 content 分支 → return（line 102）
              WORDLISTS_CHANGED 不被 relay（正常，content 端已直接调用 _render()）
```

---

## 调试检查点

| 检查 | 方法 |
|------|------|
| `setupSelectionMenu` 是否被调用 | Console: `getEventListeners(document)` 看有无 mouseup |
| 启动条件是否满足 | 确认 Reading Aids 开启 + Emotion Colors 或 Transition Words 至少一个开启 |
| mouseup 是否到达 document | `document.addEventListener('mouseup', e => console.log('mouseup', e.target))` |
| 弹窗是否被创建但不可见 | Elements 面板搜 `dra-word-menu`，检查 position/z-index/display |
| 词表读取是否正确 | Console: `chrome.storage.sync.get('draWordLists', console.log)` |
