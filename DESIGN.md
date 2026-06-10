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
| API 服务器 | Node.js + Express（或 Python FastAPI） | 作为 Claude API 的代理，管理 API Key |
| AI 模型 | Claude claude-haiku-4-5（快速/低成本）/ claude-sonnet-4-6（高质量） | 语义分析主力 |
| 响应缓存 | Redis 或内存 LRU Cache | 避免对相同内容重复调用 AI |
| 文字转语音 | Web Speech API（浏览器内置，零成本） | TTS 基础功能 |
| 部署 | Railway / Fly.io / Vercel Functions | 轻量 Serverless 部署 |

---

## 二、开发 Checklist

### Phase 1：基础插件化（第 1-2 周）
> 目标：将 demo 转化为可在任意网页运行的浏览器插件

#### 1.1 插件脚手架
- [ ] 创建 `manifest.json`（Manifest V3，声明 permissions: storage, activeTab, scripting, sidePanel）
- [ ] 创建 `content/index.ts`（Content Script 入口，注入页面）
- [ ] 创建 `background/index.ts`（Service Worker，管理消息路由）
- [ ] 创建 `panel/panel.html` + `panel.ts`（Side Panel 设置界面）
- [ ] 创建 `popup/popup.html` + `popup.ts`（Toolbar 弹窗，快速开关）
- [ ] 配置构建工具（Vite 或 webpack + TypeScript）

#### 1.2 DOM 正文提取
- [ ] 引入 `@mozilla/readability` 提取页面正文（排除导航、广告、页脚）
- [ ] 处理动态页面（SPA）：监听 DOM 变化，内容更新后重新提取
- [ ] 测试：NYT、Wikipedia、Medium 三个典型页面提取效果

#### 1.3 视觉辅助移植（从 demo app.js 移植）
- [ ] Bionic Reading — `bionicReading.ts`（移植 `bionicN()` + `processWord()` 逻辑）
- [ ] Row Shading — 按句子交替加 `row-even` / `row-odd` CSS class
- [ ] Reading Ruler — `ruler.ts`（移植 `updateRuler()` + `setRulerVisible()`）
- [ ] Topic Focus — `focusMask.ts`（移植 `applyFocusMask()` + `scoreSentence()`）
- [ ] Logic Word 高亮 — 移植 `LOGIC_WORDS` set + `logic-word` CSS class
- [ ] Sentence Labels 标签 — 移植 `renderOneSentence()` + `.sentence-tag` 样式

#### 1.4 新增 Dyslexia 排版控件
- [ ] 字间距滑块（`word-spacing`：0 ~ 0.5em）
- [ ] 字母间距滑块（`letter-spacing`：0 ~ 0.1em）
- [ ] 字体选项加入 OpenDyslexic（引入 CDN 或本地字体文件）
- [ ] 段落最大宽度控制（60ch ~ 80ch，防止过长行）

#### 1.5 用户偏好持久化
- [ ] 定义 `UserSettings` TypeScript 接口（统一所有状态字段）
- [ ] 写入：设置变更时调用 `chrome.storage.sync.set()`
- [ ] 读取：Content Script 和 Side Panel 启动时加载已保存偏好
- [ ] 默认值：首次安装时写入合理默认配置

---

### Phase 2：AI 语义分析接入（第 3-4 周）
> 目标：用 Claude 替换 demo 中的硬编码词表，实现动态语义理解

#### 2.1 后端 API 服务搭建
- [ ] 初始化 Node.js + Express 项目（`server/` 目录）
- [ ] 实现 `POST /api/analyze` 端点（接收文本，返回语义标注 JSON）
- [ ] 实现 `POST /api/simplify` 端点（接收段落，返回简化版本）
- [ ] 配置 `.env` 管理 `ANTHROPIC_API_KEY`（禁止前端直接持有 key）
- [ ] 添加内存 LRU 缓存（相同文本 hash 命中时直接返回，跳过 Claude 调用）
- [ ] 部署到 Railway / Fly.io，配置 HTTPS

#### 2.2 Claude 语义分析集成
- [ ] 编写 Analyze Prompt（输出 `emotionWords` / `sentenceTags` / `difficultWords` / `homophoneRisks` / `suggestedFeatures`）
- [ ] 使用 `claude-haiku-4-5` 作为默认模型（速度/成本优先）
- [ ] 解析 Claude 返回 JSON，做字段校验和容错处理
- [ ] Background SW：页面加载后异步发起分析，结果存入 IndexedDB

#### 2.3 动态情感词高亮
- [ ] 用 Claude 返回的 `emotionWords` 替换 `app.js` 中硬编码的 `EMOTION_WORDS`
- [ ] 颜色方案沿用现有 CSS 变量（`--emotion-positive` 等），用户仍可自定义颜色

#### 2.4 动态句子结构标注
- [ ] 用 Claude 返回的 `sentenceTags` 替换基于 `[Tag]` 前缀的规则匹配
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

```
用户打开网页
    │
    ▼
[Content Script 激活]
    │ 提取正文文本 (readability-style DOM parse)
    ▼
[Background Service Worker]
    │ 查询 IndexedDB 缓存 (by URL hash + text hash)
    │
    ├─── 缓存命中 ──────────────────────────────────┐
    │                                               │
    │ 缓存未命中                                    │
    ▼                                               │
[POST /api/analyze]                                 │
    │ 发送: { text, userProfile, contentType }      │
    ▼                                               │
[Node.js API Server]                                │
    │ 构建 Claude Prompt                            │
    ▼                                               │
[Claude API]                                        │
    │ 返回语义标注 JSON:                            │
    │   - emotionWords: {word → positive/negative}  │
    │   - sentenceTags: {sentenceId → type}         │
    │   - difficultWords: {word → definition}       │
    │   - homophones: [word, ...]                   │
    │   - contentType: "academic"                   │
    │   - suggestedFeatures: ["bionic", "syllable"] │
    ▼                                               │
[写入 IndexedDB 缓存] ──────────────────────────────┘
    │
    ▼
[Content Script 接收标注数据]
    │ 与用户当前偏好合并
    ▼
[DOM 变换层]
    │ - 注入 CSS 变量
    │ - 逐词/逐句包裹 <span> 标签
    │ - 绑定 tooltip / TTS 事件
    ▼
[增强后的阅读视图]
    │
    ▼
[用户交互] ──► [实时偏好调整] ──► [Chrome Storage Sync]
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

### 4.2 Claude Prompt 策略

**Analyze Prompt（语义分析）：**
```
你是一个阅读辅助 AI，专门帮助 dyslexia 用户。
用户档案：{age_group}, {severity}, {difficulty_type}
内容类型：{content_type}

请分析以下文本，返回 JSON：
{
  "emotionWords": {"word": "positive|negative|surprise"},
  "sentenceTags": [{"id": 0, "type": "argument|evidence|explanation"}],
  "difficultWords": [{"word": "...", "simpleDefinition": "..."}],
  "homophoneRisks": ["word1", "word2"],
  "suggestedFeatures": ["bionic", "syllable", "simplify"]
}

文本：{article_text}
```

**Simplify Prompt（段落简化）：**
```
将以下段落改写为适合 {age_group} 阅读的简单版本，
保留核心意思，减少从句，使用常见词汇：
{paragraph}
```

### 4.3 消息通信协议

Content Script ↔ Background Service Worker 通过 `chrome.runtime.sendMessage`：

```typescript
// Content Script 发出请求
{ type: 'ANALYZE_TEXT', payload: { text, url } }

// Background SW 返回
{ type: 'ANALYSIS_RESULT', payload: AnnotationJSON }

// Side Panel 更新设置
{ type: 'SETTINGS_CHANGED', payload: Partial<UserSettings> }

// Content Script 回应设置变更
{ type: 'RERENDER' }
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
