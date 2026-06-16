# Dyslexia Reading Aid 设计文档

## 背景与目标

本项目基于现有 demo（Bionic Reading、Row Shading、Emotion Colors、Reading Ruler、Topic Focus 等功能），将其升级为一个真正面向 dyslexia 人群的**浏览器插件**。

核心差异化：通过 AI 驱动的语义理解，为不同用户群体（儿童/成人、轻度/重度）和不同阅读材料（新闻/学术/小说）自动定制视觉辅助策略，而非静态规则。

---

## 一、技术栈

### 前端 / 插件层
| 模块 | 技术 | 说明 |
|---|---|---|
| 浏览器插件框架 | Chrome Extension Manifest V3 | 兼容 Chrome/Edge；可后续移植 Firefox |
| UI | Vanilla JS + TypeScript | 沿用 demo 风格，保持轻量；TS 提供类型安全 |
| DOM 注入 | Content Script | 在任意页面注入视觉辅助层 |
| 设置面板 | Chrome Side Panel API | 侧边栏（替代 demo 的左侧 sidebar） |
| 弹窗 | Extension Popup | 快速开关常用功能 |
| 字体 | OpenDyslexic（开源） | 专为 dyslexia 设计，降低字母混淆 |
| 本地存储 | Chrome Storage Sync API | 跨设备同步用户偏好 |
| 缓存 | IndexedDB | 缓存已分析页面的语义结果 |

### 后端 / API 层
| 模块 | 技术 | 说明 |
|---|---|---|
| API 服务器 | Node.js + Express | 作为 Gemini API 的代理，持有 API Key |
| AI 模型 | Google Gemini `gemini-2.5-flash-lite` | 语义分析主力（速度/成本优先） |
| 响应缓存 | Redis 或内存 LRU Cache | 避免对相同内容重复调用 AI |
| 文字转语音 | Web Speech API（浏览器内置，零成本） | TTS 基础功能 |
| 部署 | Railway / Fly.io / Vercel Functions | 轻量 Serverless 部署 |

---

## 二、开发 Checklist

### Phase 1：基础插件化（第 1-2 周）
> 目标：将 demo 转化为可在任意网页运行的浏览器插件

#### 1.1 插件脚手架
- [x] 创建 `manifest.json` — 插件的"身份证"，Chrome 通过它认识这个插件
  - `manifest_version: 3` — Chrome 当前要求的格式版本，必须是 3
  - `permissions` — 插件需要的权限：
    - `storage` — 读写用户偏好设置
    - `activeTab` — 访问当前用户正在看的标签页
    - `scripting` — 向网页注入 JS/CSS 代码
    - `sidePanel` — 开启右侧边栏
  - `host_permissions: <all_urls>` — 允许在所有网页上运行
  - `background.service_worker` — 后台 Service Worker 的入口文件路径
  - `content_scripts` — 要自动注入到每个网页的 JS 和 CSS 文件
  - `side_panel` — 侧边栏的 HTML 文件路径
  - `action` — 点击 Chrome 工具栏插件图标时弹出的小窗口
- [x] 创建 `content/index.js` — 注入任意网页，负责找正文、加标记、实时监听设置变更
  - `findContentArea()` — 三层查找：① `PLATFORM_SELECTORS` 按 hostname 精准匹配（Wikipedia、GitHub、HN、Substack、dev.to）→ ② `[itemprop="articleBody"]` 覆盖 CSS-in-JS 新闻站（NYT、BBC、Guardian）→ ③ article / main 等通用选择器，最终兜底 `document.body`
  - `PLATFORM_SELECTORS` — 收录选择器长期稳定的平台；使用 CSS-in-JS 哈希类名的站点（NYT、BBC、Guardian）不列入，由 Schema.org itemprop 属性处理
  - `applyBionicToText(text)` — 对任意文本（单词或多词短语）应用 Bionic Reading 粗体
  - `renderSentence(s)` — 位置感知渲染：在句子字符串上用 regex 找出所有命中的词/短语，按位置排序后分段渲染（支持多词短语高亮）
  - `generateTransitionHighlights()` — 规则驱动：扫描文章 innerText，返回出现在 `TRANSITION_WORDS` 词表中的所有过渡词条目
  - `buildParagraphHTML()` — 把段落文本重建为带标记的 HTML
  - `applyTransformations()` — 排版样式直接设在每个 `<p>` 上（而非容器），避免被网页自身样式覆盖
  - `removeTransformations()` — 撤销所有变换，逐段落清除内联样式并还原原始 HTML
  - `setupRuler()` / `updateRuler()` — Reading Ruler 跟随鼠标
  - `applyFocusMask()` / `clearFocusMask()` — Topic Focus 句子评分与半透明
  - `chrome.storage.sync.get` — 启动时读取已保存的用户偏好
  - `chrome.runtime.onMessage.addListener` — 监听 Side Panel 的实时设置变更
  - **Bug 修复**：fontSize / lineHeight 必须设在每个段落元素上，设在父容器上会被子元素自身 CSS 规则覆盖
- [x] 创建 `content/content.css` — 所有视觉效果的样式，前缀 `dra-` 防止与网页样式冲突
- [x] 创建 `background/index.js` — 插件的"后端"，Phase 1 负责在 Side Panel 和 content script 之间转发消息
  - `chrome.runtime.onMessage.addListener` — 收到消息后判断来源（`sender.tab` 区分网页 vs 插件）
  - `forwardToActiveTab()` — 用 `chrome.tabs.query` 找到当前活跃标签页，用 `chrome.tabs.sendMessage` 转发
  - `chrome.sidePanel.setPanelBehavior` — 点击工具栏图标时自动打开 Side Panel
- [x] 创建 `panel/panel.html` — Side Panel 界面结构：开关、滑块、颜色选择器
- [x] 创建 `panel/panel.css` — Side Panel 样式，与 demo 左侧 sidebar 视觉一致
- [x] 创建 `panel/panel.js` — Side Panel 逻辑
  - `DEFAULT_SETTINGS` — 与 `content/index.js` 保持一致的默认值
  - `broadcast(changed)` — 用户改动时同时做三件事：更新本地变量 / 存入 Chrome Storage / 发消息给 background
  - `syncUI()` — 启动时把存储里的设置刷到所有界面控件上
  - `init()` — 给所有控件绑定事件监听器
  - 完整数据流：用户拨开关 → `broadcast()` → `background` 转发 → `content/index.js` 重新渲染
- [ ] 创建 `popup/popup.html` + `popup.js`（暂时跳过，点击工具栏图标直接打开 Side Panel）
- [x] 创建 `icons/` 目录 — 蓝底白色占位图标，三个尺寸：`icon16.png` / `icon48.png` / `icon128.png`

#### 1.2 DOM 正文提取
- [x] `findContentArea()` 已内置在 `content/index.js`，三层查找策略，兜底用 `document.body`
- [x] `PLATFORM_SELECTORS` 平台专属选择器：Wikipedia（`#mw-content-text`）、GitHub（`.markdown-body`）、HackerNews（`.fatitem`）、Substack（`.reader2-post-body`）、dev.to（`#article-body`）
- [x] `[itemprop="articleBody"]`（Schema.org）覆盖 CSS-in-JS 新闻站：NYT、BBC、Guardian 等使用哈希类名的平台
- [ ] 处理动态页面（SPA）：监听 DOM 变化，内容更新后重新提取
- [ ] 测试：NYT、Wikipedia、Medium 三个典型页面提取效果

#### 1.3 视觉辅助移植（从 demo app.js 移植）
- [x] Bionic Reading — `bionicN()` + `processWord()` 已移植至 `content/index.js`
- [x] Row Shading — `dra-row-even` / `dra-row-odd` 已实现
- [x] Reading Ruler — `setupRuler()` + `updateRuler()` 已实现
- [x] Topic Focus — `applyFocusMask()` + `scoreSentence()` 已实现
- [x] Transition Word 高亮 — `TRANSITION_WORDS` 词表 + `generateTransitionHighlights()` 客户端规则驱动，完全不依赖 AI
- [x] ~~本地词库~~ 静态 `EMOTION_WORDS` / `LOGIC_WORDS` 词表已移除；Emotion 高亮由 AI 逐次标注，Transition 高亮由本地词表扫描
- [ ] Sentence Labels 标签 — 待实现（Phase 2 接入 AI 后一起做）

#### 1.4 新增 Dyslexia 排版控件
- [x] 字间距（`word-spacing`）— 已在 `applyTransformations()` 中支持
- [x] 字母间距（`letter-spacing`）— 已在 `applyTransformations()` 中支持
- [ ] 字体选项加入 OpenDyslexic（引入 CDN 或本地字体文件）
- [ ] 段落最大宽度控制（60ch ~ 80ch，防止过长行）

#### 1.5 用户偏好持久化
- [x] `DEFAULT_SETTINGS` 对象统一管理所有默认状态字段
- [x] 读取：`chrome.storage.sync.get('draSettings')` 启动时加载
- [ ] 写入：Side Panel 设置变更时调用 `chrome.storage.sync.set()`（在 panel.js 里实现）
- [ ] 默认值：首次安装时写入合理默认配置

---

### Phase 2：AI 语义分析接入（第 3-4 周）
> 目标：用 AI 替换 demo 中的硬编码词表，实现动态语义理解

#### 2.1 后端 API 服务搭建
- [x] 初始化 Node.js + Express 项目（`server/` 目录）
- [x] 实现 `POST /api/analyze` 端点（接收文本，返回 `{ highlights: [{ word, context, category }] }` JSON）
- [x] 配置 `server/.env` 管理 `GEMINI_API_KEY`（Key 不进代码仓库，已加入 `.gitignore`）
- [x] Background SW 内存缓存（URL → 结果，TTL 30 分钟），避免重复调用
- [x] 降级策略：服务器未启动 / API 报错时静默跳过，本地词表正常工作
- [ ] 实现 `POST /api/simplify` 端点（接收段落，返回简化版本）
- [ ] 部署到 Railway / Fly.io，配置 HTTPS

#### 2.2 Gemini AI 语义分析集成
- [x] 使用 `gemini-2.5-flash` 模型，`thinkingBudget: 1024`
- [x] AI **只做 Emotion 标注**（transition 已改为客户端词表，见 2.1）
- [x] Prompt 两步式：① 判断文章类型（narrative / analytical / mixed）→ 确定 emotion 数量；② 逐次标注词出现（每次出现独立判断）
- [x] 动态 budget：`Math.floor(wordCount / 100) * 6`，无上限，随文章长度线性缩放
- [x] **分块并行分析**：`chunkByParagraphs()`（每 8 段一块），`Promise.all()` 并行发送，结果合并，保证全文均匀分布
- [x] Emotion 三分类：`emotion-positive` / `emotion-negative` / `emotion-complex`
- [x] `responseMimeType: "application/json"` + `thinkingBudget: 1024`；兜底 strip markdown 代码块
- [x] Background SW 新增 `ANALYZE_REQUEST` 消息处理（来自 content script）
- [x] Content script 新增 `requestAIAnalysis()` — 每页只请求一次（`aiAnalysisRequested` 标志位）
- [x] Content script：`ANALYSIS_RESULT` 收到后合并 AI emotion highlights + 客户端 transition highlights → `articleHighlights`
- [ ] 解析容错：字段缺失 / 格式异常时不崩溃（现有 try/catch 已覆盖）
- [ ] Background SW：分析结果存入 IndexedDB 实现跨 SW 重启持久化

#### 2.3 动态情感词高亮
- [x] AI 返回 `highlights` 数组（per-occurrence），`processWord(token, sentenceContext)` 通过上下文窗口匹配决定是否高亮；相同词在不同语境下可得到不同结果（如 "Love" 作专有名词不标注），颜色方案复用现有 CSS 变量（`--dra-positive` / `--dra-negative` / `--dra-complex`）
- [ ] Panel 加入 AI 分析状态提示（加载中 / 已增强 / 服务不可用）

#### 2.4 动态句子结构标注
- [ ] 用 AI 返回的 `sentenceTags` 替换基于 `[Tag]` 前缀的规则匹配
- [ ] 标签样式沿用现有 `.tag-argument` / `.tag-evidence` / `.tag-explanation`

#### 2.5 难词 Tooltip
- [ ] Content Script 遍历 `difficultWords`，为匹配词添加 `<span class="difficult-word">` 包裹
- [ ] 鼠标悬停显示浮层，内容为 Claude 返回的 `simpleDefinition`
- [ ] Tooltip 样式：圆角卡片，最大宽度 220px，不遮挡相邻行

#### 2.6 音近词混淆警示
- [ ] Content Script 遍历 `homophoneRisks`，为匹配词添加波浪下划线样式
- [ ] 悬停时显示提示："注意：此词与 ___ 发音相似"

---

### Phase 3：Dyslexia 专项功能（第 5-6 周）
> 目标：针对 dyslexia 核心障碍点设计专属辅助

#### 3.1 音节分割高亮
- [ ] 集成 `hypher` 或 `syllable` npm 包进行音节拆分
- [ ] 渲染时对 5 字母以上单词按音节交替上色（两种颜色循环）
- [ ] 颜色透明度低（不干扰阅读），用户可在设置中关闭

#### 3.2 段落简化模式
- [ ] Side Panel 加入"简化此段"按钮（选中段落后激活）
- [ ] 调用 `POST /api/simplify`，传入原文段落
- [ ] 返回后在原段落下方插入简化版，以折叠/展开方式呈现
- [ ] 简化版背景色与原文区分（浅黄色底）

#### 3.3 TTS 跟读模式
- [ ] 使用 Web Speech API `SpeechSynthesisUtterance`
- [ ] 点击任意段落触发朗读，逐词触发 `onboundary` 事件
- [ ] 当前朗读词添加 `tts-active` CSS class（黄色高亮背景）
- [ ] 工具栏显示播放/暂停/停止按钮及语速滑块

#### 3.4 混淆字母警示
- [ ] 统计段落中 b/d/p/q 出现密度，密度超阈值的段落加轻微背景提示
- [ ] 或：对单独的 b/d/p/q 加微小放大效果（`font-size: 1.05em; font-weight: 600`）

---

### Phase 4：个性化与智能适配（第 7-8 周）
> 目标：为不同用户群体和材料类型生成不同辅助策略

#### 4.1 用户档案
- [ ] 首次安装触发引导页（Onboarding），3 步填写：
  - [ ] 步骤 1：年龄段（儿童 6-12 / 青少年 13-17 / 成人 18+）
  - [ ] 步骤 2：dyslexia 主要困难（字母混淆 / 单词识别 / 阅读理解 / 多选）
  - [ ] 步骤 3：阅读场景（学习 / 工作 / 休闲）
- [ ] 档案存储到 `chrome.storage.sync`
- [ ] Side Panel 可随时修改档案

#### 4.2 材料类型检测
- [ ] Claude `/api/analyze` 响应中包含 `contentType` 字段（news / academic / fiction / technical / social）
- [ ] 根据 `contentType` 自动调整默认开启的功能组合

#### 4.3 策略推荐引擎
- [ ] 定义策略矩阵（`userProfile × contentType → featurePreset`）：
  - 学术 + 重度 → 开启：音节分割、句子标注、段落简化、难词 Tooltip
  - 新闻 + 轻度 → 开启：Bionic Reading、Row Shading
  - 小说 + 儿童 → 开启：TTS、字母警示、OpenDyslexic 字体
- [ ] 首次访问某类页面时，弹出推荐提示（可一键应用或忽略）

#### 4.4 阅读理解问答
- [ ] 用户读完页面后，工具栏显示"生成理解题"按钮
- [ ] 调用 Claude 生成 3 道选择题，在 Side Panel 中展示
- [ ] 答题后显示解析

#### 4.5 使用数据统计
- [ ] 记录每个功能的开启次数、使用时长（IndexedDB，不上传）
- [ ] Side Panel 底部显示"最常用功能"小统计，辅助用户了解自己的偏好

---

## 三、数据流设计

### 3.0 通用渲染流程（所有功能共用）

```
页面加载 / 用户改动设置
    │
    ├─ 页面加载 ──► chrome.storage.sync.get('draSettings') ──► settings 合并默认值
    │
    └─ 改动设置 ──► Panel broadcast() ──► SETTINGS_CHANGED ──► Background 转发 ──► Content Script
    │
    ▼
render()
    ├─ removeTransformations()          // 清除上一次渲染，还原原始 innerHTML
    ├─ 生成 articleHighlights[]         // 按各功能开关决定（见下各节）
    ├─ 生成 sentenceLabels[]            // 按各功能开关决定（见下各节）
    ├─ 触发 AI 请求（如需要）
    └─ applyTransformations()
           └─ buildParagraphHTML()
                  ├─ renderSentence(s) ──► 用 articleHighlights 在句子中定位词/短语，加 <span>
                  └─ badge(s)          ──► 用 sentenceLabels 前缀匹配，注入角标 <span>
```

---

### 3.1 Transition Words（纯本地）

```
settings.transitionAnimation = true
    │
    ▼
render()
    └─ generateTransitionHighlights()
           扫描 TRANSITION_WORDS 词表（~60 词/短语）
           用正则 (?<![a-zA-Z-]){word}(?![a-zA-Z-]) 检测出现
           返回 [{ word, category: 'transition' }]
    └─ articleHighlights = [...emotionHL, ...transitionHL]
    └─ renderSentence()
           命中 transition 类 → <span class="dra-transition-word">${word}</span>
           CSS: font-weight:700, color:#2471a3, border-bottom
```

---

### 3.2 Emotion Words — Local 模式

```
settings.emotionColor = true && settings.emotionMode = 'local'
    │
    ▼
render()
    └─ generateEmotionHighlights()
           扫描 EMOTION_POSITIVE / EMOTION_NEGATIVE / EMOTION_COMPLEX 三个词表
           按正则检测出现，返回 [{ word, category: 'emotion-*' }]
    └─ articleHighlights = [...emotionHL, ...transitionHL]
    └─ renderSentence()
           命中 emotion-* 类 → <span class="dra-emotion-{positive|negative|complex}">
           颜色来自 CSS 变量 --dra-positive / --dra-negative / --dra-complex
           （由用户在 Panel 颜色选择器中设定）
```

---

### 3.3 Emotion Words — AI 模式

```
settings.emotionColor = true && settings.emotionMode = 'ai'
    │
    ▼
render()
    └─ emotionHL = aiEmotionHighlights（初始为 []）
    └─ requestEmotionAnalysis()          // emotionAIRequested 标志防重复
           └─ Content Script 发 EMOTION_REQUEST { url, text }
                  │
                  ▼
           Background SW
                  ├─ 命中内存缓存（URL key，TTL 30min）──► 直接返回 EMOTION_RESULT
                  └─ 未命中 ──► POST /api/analyze { text }
                                     │
                                     ▼
                               Node.js Server
                                     └─ 文章分块（每 8 段），Promise.all 并行调 Gemini
                                     └─ Prompt：判断文章类型 → 动态 budget → 标注 emotion 词
                                     └─ 返回 { highlights: [{word, context, category}] }
                                     │
                                     ▼
                               Background SW
                                     └─ 写入内存缓存
                                     └─ 发 EMOTION_RESULT { highlights } → Content Script
    │
    ▼
Content Script 收到 EMOTION_RESULT
    └─ aiEmotionHighlights = highlights（过滤掉 transition 类）
    └─ render()
           └─ emotionHL = aiEmotionHighlights  // 这次 render 使用 AI 结果
           └─ 同 Local 模式渲染
```

---

### 3.4 Sentence Labels — Local 模式

```
settings.sentenceLabels = true && settings.sentenceLabelsMode = 'local'
    │
    ▼
render()
    └─ allSentences = extractAllSentences()
           换行符拆段落（>20字符），再用 /(?<=[.!?])\s+(?=[A-Z"'\[])/ 拆句子
    └─ sentenceLabels = generateSentenceLabels()
           对每句按 LABEL_RULES 优先级匹配（evidence > argument > explanation）
           第一个命中的类别即为该句标签，未命中则跳过
           返回 [{ index, type }]
    └─ buildParagraphHTML()
           badge(s)：用 s.trim().slice(0,25) 前缀匹配 allSentences
                     找到对应 index → 在 sentenceLabels 里查 type
                     注入 <span class="dra-label dra-label-{type}">{TYPE}</span>
```

---

### 3.5 Sentence Labels — AI 模式

```
settings.sentenceLabels = true && settings.sentenceLabelsMode = 'ai'
    │
    ▼
render()
    └─ allSentences = extractAllSentences()      // 每次 render 都更新
    └─ requestSentenceLabels()                   // sentenceLabelsRequested 防重复
           └─ 发 LABEL_REQUEST { sentences: allSentences } → Background
                  │
                  ▼
           Background SW
                  └─ POST /api/label { sentences }
                               │
                               ▼
                         Node.js Server
                               └─ 单次调 Gemini（不分块）
                               └─ Prompt：给每句子编号，返回有把握的句子标签
                               └─ 返回 { labels: [{ index, type }] }
                               │
                               ▼
                         Background SW
                               └─ 发 LABEL_RESULT { labels } → Content Script
    │
    ▼
Content Script 收到 LABEL_RESULT
    └─ sentenceLabels = labels
    └─ render()
           └─ allSentences 已在第一次 render 时设好，requestSentenceLabels() 变 no-op
           └─ badge() 用 index 匹配 allSentences 前缀 → 注入角标
```

---

### 3.6 Topic Focus — Local 模式

```
用户在 Panel 输入话题 → 点 Apply，topicFocusMode = 'local'
    │
    ▼
Panel
    └─ 关键词提取：raw.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    └─ 发 FOCUS_APPLY { keywords } → Background forwardToActiveTab()
    │
    ▼
Content Script 收到 FOCUS_APPLY
    └─ applyFocusMask(keywords)
           对每个 .dra-sentence：scoreSentence() 打分
               精确匹配 +3，词干匹配 +1（词长≥5时）
           有分 → fontWeight:'700'，color:''（正常）
           无分 → fontWeight:''，color:'#aaa'（变灰）

用户点 Clear → FOCUS_CLEAR → clearFocusMask()（清除所有 inline style）
```

---

### 3.7 Topic Focus — AI 模式

```
用户在 Panel 输入话题 → 点 Apply，topicFocusMode = 'ai'
    │
    ▼
Panel
    └─ 发 FOCUS_AI_REQUEST { topic } → Background forwardToActiveTab()
    │
    ▼
Content Script 收到 FOCUS_AI_REQUEST
    └─ 读取 findContentArea().innerText
    └─ 发 FOCUS_ANALYZE { topic, text } → Background
           （两跳原因：Panel 不知道文章内容，必须由 content script 提供）
    │
    ▼
Background SW 收到 FOCUS_ANALYZE
    └─ POST /api/focus { text, topic }
               │
               ▼
         Node.js Server
               └─ 单次调 Gemini（文章截断至 60,000 字符）
               └─ Prompt：找出与 topic 语义相关的句子（不限字面匹配）
               └─ 返回 { relevant: ["句子前30字符", ...] }
               │
               ▼
         Background SW
               └─ 发 FOCUS_RESULT { relevant } → Content Script
    │
    ▼
Content Script 收到 FOCUS_RESULT
    └─ applyFocusMaskByPrefixes(relevant)
           对每个 .dra-sentence：textContent.trim().slice(0,30)
           与 relevant 列表中的前缀（slice 0-25）比对
           命中 → 加粗，未命中 → 变灰
```

---

### 3.8 OpenDyslexic 字体

```
settings.typographyEnabled = true && settings.fontFamily = 'OpenDyslexic, sans-serif'
    │
    ▼
applyTransformations()
    └─ injectOpenDyslexicFont()（幂等，检查 #dra-od-font 是否已存在）
           在 <head> 插入 <style> 注册三个 @font-face
           字体文件路径：chrome.runtime.getURL('fonts/OpenDyslexic-*.otf')
           （manifest.json web_accessible_resources 开放 fonts/*.otf 访问权限）
    └─ 对每个 <p> 设置 fontFamily = 'OpenDyslexic, sans-serif'
```

---

## 四、工作流设计

### 4.1 插件架构

```
┌─────────────────────────────────────────────────────────┐
│  浏览器                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────┐  │
│  │  Content Script │  │ Background SW   │  │  Side   │  │
│  │                 │◄─│                 │◄─│  Panel  │  │
│  │ • DOM 注入       │  │ • API 调用       │  │ (设置)  │  │
│  │ • 视觉变换       │  │ • 缓存管理       │  │        │  │
│  │ • TTS 控制       │  │ • 消息路由       │  │ Popup  │  │
│  │ • 事件监听       │  │ • 用户档案       │  │(快速开关)│  │
│  └─────────────────┘  └────────┬────────┘  └─────────┘  │
└─────────────────────────────────────────────────────────┘
                                 │ HTTPS
                         ┌───────▼────────┐
                         │  API Server    │
                         │  Node.js/      │
                         │  Express       │
                         │                │
                         │  POST /analyze │
                         │  POST /simplify│
                         │  GET  /define  │
                         └───────┬────────┘
                                 │
                         ┌───────▼────────┐
                         │  Claude API    │
                         │                │
                         │  haiku → 快速  │
                         │  sonnet → 深度 │
                         └────────────────┘
```

### 4.2 Gemini Prompt 策略

**Analyze Prompt（语义标注，当前实现）：**

- 模型：`gemini-2.5-flash`，端点：`POST /api/analyze`，`thinkingBudget: 1024`
- 文章截断：前 60,000 字符；分块：`chunkByParagraphs()`（每 8 段），`Promise.all` 并行
- Budget 计算（服务端）：`Math.floor(wordCount / 100) * 6`，无上限
- Prompt：判断文章类型（narrative / analytical / mixed）→ 调整 emotion 数量；每条 `{ word, context, category }`
- 返回格式（AI）：`{ "highlights": [{ "word": "...", "context": "...", "category": "emotion-positive|emotion-negative|emotion-complex" }] }`
- Transition words 不经过 AI：客户端 `generateTransitionHighlights()` 扫描 `TRANSITION_WORDS` 词表（~60 词/短语，来源 smart-words.org），直接合并进 `articleHighlights`

**Simplify Prompt（段落简化，待实现）：**
```
将以下段落改写为适合 {age_group} 阅读的简单版本，
保留核心意思，减少从句，使用常见词汇：
{paragraph}
```

### 4.3 消息通信协议

所有消息均通过 `chrome.runtime.sendMessage` 传递。Background 根据 `sender.tab` 是否存在区分来源（content script vs panel）。

```
// ── Content Script → Background ──────────────────────────────────────

// Emotion 词 AI 分析请求
{ type: 'EMOTION_REQUEST', url: string, text: string }

// Sentence Labels AI 分析请求
{ type: 'LABEL_REQUEST', sentences: string[] }

// Topic Focus AI 分析请求（content script 提供文章文本）
{ type: 'FOCUS_ANALYZE', topic: string, text: string }

// ── Background → Content Script ──────────────────────────────────────

// Emotion 词 AI 分析结果
{ type: 'EMOTION_RESULT', highlights: [{ word, context, category }] }

// Sentence Labels AI 分析结果
{ type: 'LABEL_RESULT', labels: [{ index: number, type: 'argument'|'evidence'|'explanation' }] }

// Topic Focus AI 分析结果
{ type: 'FOCUS_RESULT', relevant: string[] }   // 相关句子的前 30 字符

// ── Panel → Background → Content Script（Background 直接转发）────────

// 设置变更
{ type: 'SETTINGS_CHANGED', payload: Partial<UserSettings> }

// Topic Focus 本地模式应用
{ type: 'FOCUS_APPLY', keywords: string[] }

// Topic Focus 清除
{ type: 'FOCUS_CLEAR' }

// Topic Focus AI 模式触发（Background 转发给 content script，由 content script 回发 FOCUS_ANALYZE）
{ type: 'FOCUS_AI_REQUEST', topic: string }
```

---

## 五、目录结构（参考）

```
deja-extension/
├── manifest.json
├── src/
│   ├── content/
│   │   ├── index.ts          # Content Script 入口
│   │   ├── domExtractor.ts   # 正文提取
│   │   ├── renderer.ts       # DOM 变换（移植自 app.js）
│   │   ├── tts.ts            # TTS 控制
│   │   └── features/
│   │       ├── bionicReading.ts
│   │       ├── syllableSplit.ts
│   │       ├── ruler.ts
│   │       └── focusMask.ts
│   ├── background/
│   │   ├── index.ts          # Service Worker
│   │   ├── apiClient.ts      # 与后端通信
│   │   └── cache.ts          # IndexedDB 缓存
│   ├── panel/                # Side Panel UI
│   │   ├── panel.html
│   │   ├── panel.ts
│   │   └── panel.css
│   └── popup/                # Extension Popup
│       ├── popup.html
│       └── popup.ts
├── server/                   # 后端 API
│   ├── index.ts
│   ├── routes/analyze.ts
│   ├── routes/simplify.ts
│   └── claudeClient.ts
└── shared/
    └── types.ts              # 共享 TypeScript 类型
```

---

## 六、验收标准

| Phase | 验收方式 |
|---|---|
| Phase 1 | 在 NYT / Wikipedia 任意文章页面加载插件，所有 demo 功能正常运行；OpenDyslexic 字体可切换 |
| Phase 2 | 在学术文章上触发 AI 分析，情感词/句子标签由 Claude 动态返回而非硬编码词表；难词 tooltip 显示 |
| Phase 3 | 音节分割在 5 个字母以上单词上正确显示；TTS 模式逐词高亮跟进；段落简化可折叠展开 |
| Phase 4 | 填写用户档案后，插件自动推荐并开启对应功能组合；材料类型识别准确率 > 80% |

---

## 七、关键风险与应对

| 风险 | 应对 |
|---|---|
| Claude API 延迟影响页面加载 | 分析在后台异步进行，先用规则引擎渲染，AI 结果到达后增量更新 |
| API Key 泄露 | Key 只存在后端服务器，前端通过代理调用，支持 Rate Limit |
| 不同网页 DOM 结构差异大 | 使用 Mozilla Readability.js 提取正文，降低对页面结构的依赖 |
| 用户隐私（文章内容上传） | 明确告知用户；提供"仅本地模式"选项（使用规则引擎，不上传文本） |
