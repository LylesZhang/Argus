# 功能开发计划

---

## ✅ 已完成

- **Auto Scroll**：页面自动向下滚动，速度可调（`content/features/autoScroll.js`）
- **纯净阅读器（Reader Mode）**：提取正文，覆盖层中以干净排版重新渲染，支持 Light/Warm/Dark 主题（`content/features/immersiveReader.js`）
- **打字机效果**：Reader Mode 内逐字呈现，galgame 式空格推进/补全交互，当前行保持视口竖直居中；开关与速度滑杆在 Panel 的 Reader Mode 子目录下（`content/features/immersiveReader.js`、`panel/panel.html`、`panel/panel.js`）
- **Panel 文字大小调整**：compact / comfortable / large 三档可调，影响全局字号与控件尺寸
- **自动刷新**：SPA 导航时通过 MutationObserver 检测 URL 变化，debounce 500ms 后重新抓取正文并 render
- **权限缩减**：`host_permissions` 已收紧为 `https://argus-1ygn.onrender.com/*`，不再声明 `<all_urls>`

---

## AI 功能

### Simplify（语言简化）
对正文内容进行语言简化，降低词汇复杂度，适合语言学习者或快速浏览。弹窗进行展示。

### Summary（摘要）
对文章正文生成 AI 摘要：选中摘要思维导图的节点可以高亮原文中的对应部分。

### Sentence Label 准确性提升
- 针对不同类型文章（新闻、学术、博客等）使用不同的分类标签组合
- 优化 prompt 或本地规则，提升 evidence / argument / explanation 的识别准确率

### 多语言支持
- 检测文章原文语言，AI 功能（Emotion、Sentence Label、Topic Focus 等）支持中文等非英语内容
- Panel UI 文案本地化（i18n），支持中英文切换

---

## 用户体验优化

### 浮窗工具栏
在网页上提供一个可拖拽的悬浮小工具栏，收起时只是一个小图标，点击展开成精简控制面板，包含最常用功能（Typography、Reading Aids、Reader Mode 等）的快捷开关，不需要打开 Side Panel 即可快速调整阅读效果。位置/展开状态可记忆。

### 效果过多警告弹窗
当用户同时启用的效果数量超过阈值时，弹出提示弹窗，告知用户同时开启过多效果可能会影响页面性能或阅读体验，建议适当精简。

### 视觉效果审查弹窗
提供一个预览/审查弹窗，让用户在应用效果前后对比当前页面的视觉效果（如 emotion 高亮、sentence label 配色、ruler 等），便于快速判断是否符合预期。

### 纯文字导出 PDF
将提取出的正文（纯净阅读器内容）导出为 PDF 文件，保留基本排版（字体、字号、段落），方便离线阅读或打印。

---

## 技术改进

（暂无新增项）
