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

## 二、功能列表（按开发时间顺序）

### Phase 1：基础插件化（第 1-2 周）
> 目标：将 demo 转化为可在任意网页运行的浏览器插件

1. **插件脚手架** — 创建 `manifest.json`、Content Script、Background Service Worker、Side Panel
2. **DOM 文本提取** — Content Script 智能识别正文区域（排除导航、广告），提取干净文本
3. **视觉辅助移植** — 将 demo 所有功能移植：
   - Bionic Reading（加粗词首）
   - Row Shading（行间交替底色）
   - Reading Ruler（鼠标跟随遮罩尺）
   - Topic Focus（选词高亮相关句）
   - Logic Word 高亮
   - Sentence Labels 标签
4. **OpenDyslexic 字体** — 在字体选择中加入 OpenDyslexic 选项
5. **用户偏好持久化** — 所有设置通过 Chrome Storage Sync 跨设备保存
6. **字间距 / 字母间距控制** — 新增 letter-spacing 和 word-spacing 滑块（dyslexia 核心辅助）

### Phase 2：AI 语义分析接入（第 3-4 周）
> 目标：用 Claude 替换 demo 中的硬编码词表，实现真正的动态语义理解

7. **后端 API 服务** — `/api/analyze` 端点，接收文本，返回语义标注 JSON
8. **动态情感词检测** — Claude 分析文章中的情感词并返回词→类别映射（替代硬编码 `EMOTION_WORDS`）
9. **句子结构标注** — Claude 识别 Argument / Evidence / Explanation（替代 demo 中基于 `[Tag]` 前缀的规则）
10. **关键词抽取与难词标注** — 识别低频词、专业术语，提供简短释义 tooltip（鼠标悬停显示）
11. **音近词混淆警示** — 检测在上下文中容易与其他词混淆的词（如 there/their/they're），用边框或下划线提示

### Phase 3：Dyslexia 专项功能（第 5-6 周）
> 目标：针对 dyslexia 的核心障碍点设计专属辅助

12. **音节分割高亮** — 将长词按音节拆分并用颜色区分，辅助发音识别
13. **段落简化模式** — 调用 Claude 对选定段落进行语言简化（降低 Flesch 难度级别），以折叠/展开方式呈现
14. **TTS 跟读模式** — 点击段落自动朗读，逐词高亮跟进（Web Speech API）
15. **阅读进度线** — 记录并可视化用户阅读位置，防止行丢失（与 Reading Ruler 联动）
16. **混淆字母警示** — 检测 b/d/p/q 等易混字母较密集的区域，轻微放大或加颜色提示

### Phase 4：个性化与智能适配（第 7-8 周）
> 目标：为不同用户群体和材料类型生成不同的辅助策略

17. **用户档案** — 首次使用引导填写：年龄段（儿童/青少年/成人）、dyslexia 程度（轻/中/重）、主要困难类型
18. **阅读材料类型检测** — Claude 判断当前页面类型（新闻/学术论文/小说/技术文档/社交媒体），自动调整默认辅助策略
19. **策略推荐引擎** — 基于用户档案 × 材料类型，自动推荐最优功能组合（如：学术 + 重度 → 开启音节分割 + 句子标注 + 段落简化）
20. **阅读理解问答** — 用户读完一段后可选择生成 2-3 道理解题（Claude 生成），辅助信息留存
21. **使用数据统计** — 记录每个功能的使用频率，优化个人化策略（本地存储，不上传）

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
