---
name: aiux-preview
description: 离线预览规范：file:// 下双击即开、Vue + TDesign UMD、内嵌 aiux-spec、右下角交互说明抽屉。Use when scaffolding .aiux, writing or debugging page HTML, checking script order, anchors, drawer behavior, or file:// failures.
---

# AIUX · 离线预览规范

目标：任何一页都能**双击打开**，不需要 dev server、不需要构建、断网也能看。

## 0. 两个 profile

一个任务只能选一个端，页面和 vendor 不能混。

| profile | 端 | 页面骨架 | vendor 来源 | spec 里的 framework |
|---|---|---|---|---|
| `vue-next` | 桌面端 | `page-skeleton.html` | `assets/vendor/` | `vue-next` |
| `mobile-vue` | 移动端 | `page-skeleton-mobile-vue.html` | `assets/vendor-mobile-vue/` + 共享 Vue/sprite | `mobile-vue` |

初始化时显式传：

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/aiux-init.mjs" .aiux --profile mobile-vue --page order-list:订单列表
```

任务根目录会生成 `aiux-profile.json`。`aiux-check` / `aiux-export` 自动读取它；页面里的 `mcp.framework` 必须与它一致。

移动端 vendor 约 2.2MB：Vue 167KB + `tdesign-mobile-vue` JS 711KB + CSS 293KB + 图标 sprite 957KB + 面板 30KB。桌面端约 2.9MB。

## 1. 三条禁令

1. **禁用 `type="module"`**。所有脚本用传统 `<script src>` 全局加载。
2. **禁用 `fetch` / `XMLHttpRequest` 读本地文件**。交互说明必须内嵌在页面里。
3. **禁止构建步骤与裸模块导入**。页面是最终产物，不是源码。

违反任一条，`file://` 下直接打不开。校验脚本会把 `type="module"`、裸 `import` 判为违规，把 `fetch` / `XHR` 判为警告。

## 2. 技术栈与体积

| 文件 | 桌面端 | 移动端 | 作用 |
|---|---|---|---|
| `vendor/vue.global.prod.js` | 167 KB | 167 KB | Vue 3 global prod build |
| `vendor/tdesign.min.js` | 1.3 MB | 711 KB | TDesign UMD，全局名都是 `TDesign` |
| `vendor/tdesign.min.css` | 432 KB | 293 KB | TDesign 样式与 token |
| `vendor/tdesign-sprite.js` | 957 KB | 957 KB | 官方 SVG sprite，`t-icon` 依赖它 |
| `vendor/aiux/aiux-panel.js` + `.css` | ~30 KB | ~30 KB | 右下角交互说明面板 |

桌面端任务约 2.9MB，移动端约 2.2MB。多出来的是图标 sprite：主 UMD 不含完整图标数据，`<t-icon name>` 通过 `<use href="#t-icon-xxx">` 取 sprite，必须单独引入。

## 3. 初始化

```bash
# 桌面端
node "${CLAUDE_PLUGIN_ROOT}/scripts/aiux-init.mjs" .aiux \
  --page order-list:订单列表 \
  --page order-detail:订单详情

# 移动端
node "${CLAUDE_PLUGIN_ROOT}/scripts/aiux-init.mjs" .aiux \
  --profile mobile-vue \
  --page order-list:订单列表
```

它会：

- 创建 `.aiux/pages/`、`.aiux/docs/`
- 按 profile 复制 vendor 与面板运行时
- 写 `.aiux/aiux-profile.json`
- 按对应 profile 的骨架生成页面，内嵌一份 `aiux-spec`

已存在的页面默认跳过；确需覆盖加 `--force`。不要手写一套新骨架，插件升级时骨架会跟着变。

## 4. 页面结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>页面名</title>
  <link rel="stylesheet" href="../vendor/tdesign.min.css">
  <link rel="stylesheet" href="../vendor/aiux/aiux-panel.css">
  <style>
    /* 页面自写样式：颜色/字号/圆角/阴影/边框只能 var(--td-*) */
  </style>
</head>
<body>
  <div id="app">
    <!-- 页面内容；可定位元素带 data-aiux="list-area" -->
  </div>

  <script type="application/json" id="aiux-spec">{ ... }</script>

  <script src="../vendor/vue.global.prod.js"></script>
  <script src="../vendor/tdesign.min.js"></script>
  <script src="../vendor/tdesign-sprite.js"></script>
  <script src="../vendor/aiux/aiux-panel.js"></script>
  <script>
    (function () {
      if (TDesign.Icon && TDesign.Icon.props && TDesign.Icon.props.loadDefaultIcons) {
        TDesign.Icon.props.loadDefaultIcons.default = false;
      }
      // 兜底：老版 vendor/aiux-panel.js 初始化漏设遮罩 hidden，全屏透明遮罩拦截点击
      var ov = document.querySelector('.aiux-overlay');
      if (ov && !ov.hidden) ov.hidden = true;
      var app = Vue.createApp({});
      app.use(TDesign);
      app.mount('#app');
    })();
  </script>
</body>
</html>
```

### 移动端页面结构

移动端骨架在 `#app` 里多一层 375px 手机画框：

```html
<div id="app">
  <div class="aiux-mobile-frame" data-aiux="page-root">
    <t-navbar title="页面名" :fixed="false"></t-navbar>
    <main class="aiux-mobile-body">
      <!-- 页面内容；可定位元素带 data-aiux -->
    </main>
  </div>
</div>
```

- 画框宽 375px、`max-width: 100%`；桌面浏览器居中展示，手机上铺满。
- `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`。
- `Navbar` / `TabBar` 默认安全区适配；在桌面画框里把 `fixed` 关掉，避免固定到浏览器视口。
- 点击目标建议 ≥ 44px；不要依赖 hover 才发现操作。
- 移动端页面自定义样式同样只能用 `refs/mobile-vue/td-tokens.json` 里的 `var(--td-*)`；375px、padding、margin、gap 这类尺寸和间距可以用 px。不要拿桌面端 token 来用。
- 移动端 UMD 全局名同样是 `TDesign`，但**不要在同一页同时加载桌面端和移动端 UMD**。
- 页面 spec 写 `"framework": "mobile-vue"`；任务 profile 是 `mobile-vue`。

### 脚本顺序不能乱

1. Vue
2. TDesign
3. 图标 sprite
4. 面板
5. 页面引导脚本（`app.use(TDesign)` + `app.mount('#app')`）

TDesign 必须在 `app.use` 之前加载；面板不依赖 Vue，但要等 DOM 存在。

### in-DOM 模板

- 页面内容直接写在 `#app` 里，`Vue.createApp({})` 会把 `#app` 的 innerHTML 当模板。
- 所有自定义组件写显式闭合标签：`<t-icon ...></t-icon>`、`<t-button>...</t-button>`。浏览器不把 `<t-icon />` 当自闭合。
- `app.use(TDesign)` 注册全部组件；没有这一步，`t-*` 标签只是未知 HTML 元素。
- 关闭 CDN 图标加载，使用本地 sprite；否则断网时 `t-icon` 会尝试拉 CDN。

## 5. 面板做什么、不做什么

`aiux-panel.js` 由插件统一提供，**每页只引一行，不要每页各写一套**。

面板负责：

- 右下角圆形悬浮按钮「交互」，无角标、无进度、无状态
- 右侧抽屉，四段：
  1. 页面名 + 一句话摘要
  2. 可点击的交互条目（按主流程/异常流程分组）
  3. 七章正文
  4. 待确认项
- 点击条目：平滑滚动到 `[data-aiux="..."]`，加 1.5 秒品牌色描边
- 找不到元素：条目内就地提示「未绑定元素」，不滚动
- Esc 关闭、遮罩点击关闭、焦点回到悬浮按钮、Tab 焦点循环

面板不负责：

- 不做校验（校验在 `aiux-check.mjs`）
- 不写业务逻辑
- 不依赖 Vue/TDesign JS，只用 TDesign CSS Variables
- 不改页面内容

## 6. 锚点

页面：

```html
<section data-aiux="list-area">...</section>
<t-button data-aiux="refresh-button">刷新</t-button>
```

spec：

```json
{ "id": "I-01", "text": "筛选后列表局部刷新", "anchor": "list-area" }
```

规则：

- `data-aiux` 的值与 `anchor` 完全一致。
- `anchor` 不带 `#`、不带 `.class`、不带选择器。
- 一条交互一个可验证行为；多个条目可以指向同一元素。
- 页面渲染后，面板用 `[data-aiux]` 查找；写在注释或未渲染的模板里不算。
- 校验脚本按源码里的 `data-aiux` 判断可达性；面板按渲染后的 DOM 判断。两边都要过。

## 7. 怎么验一页

1. 双击 `.aiux/pages/<page>.html`，确认页面渲染、TDesign 组件正常、图标不是空白。
2. 点右下角「交互」，确认抽屉能打开、四段都有内容。
3. 点每条交互，确认页面滚到对应元素并有品牌色描边；找不到时出现「未绑定元素」。
4. 跑单页校验：

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/aiux-check.mjs" .aiux/pages/<page>.html
```

5. 移动端额外在 375 / 390 / 414 宽度各看一次；检查顶部/底部安全区、点击目标 ≥ 44px、没有依赖 hover 的操作。
6. 0 违规再进入下一页。

如果浏览器工具不支持 `file://`，用插件的交付预览脚本验证渲染与交互：

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/aiux-serve.mjs" .aiux
# 打开输出的 Local / Network 地址，或 http://localhost:5173/pages/<page>.html
```

`file://` 是单页自检基线；**对外交付**按 `aiux-serve` 起服务，并在最终回复同时给出 Local 与 Network 地址。服务只用于评审，正式交付用 `npm run build` 的产物，不要长期跑 dev server。启动失败时贴真实日志，不要编造地址。

## 8. 常见故障

| 现象 | 先查 |
|---|---|
| 整页空白 | 控制台报错；脚本顺序；`Vue` / `TDesign` 是否 404；`app.mount('#app')` 是否执行 |
| `t-button` 不渲染 | 是否 `app.use(TDesign)`；标签是否拼错；in-DOM 是否写了自闭合 |
| 图标空白 | 是否引入 `tdesign-sprite.js`；`loadDefaultIcons` 是否关闭；name 是否在 `refs/td-icons.json` |
| 抽屉不出现 | `aiux-panel.js` 是否引入；`#aiux-spec` 是否是合法 JSON；控制台是否报错 |
| 抽屉首屏就展开 | `aiux-panel.css` 是否最新；`[hidden]` 规则是否被覆盖 |
| 点击条目不滚动 | 页面是否给目标加了 `data-aiux`；anchor 是否完全一致；页面是否被 `overflow: hidden` 锁住 |
| 样式不生效 | `tdesign.min.css` 是否在页面样式之前；token 名是否拼错（大小写敏感） |
| `file://` 打不开 | 是否有 `type="module"`、裸 `import`、`fetch`/XHR；是否依赖了构建产物 |
| 字体不对 | 是否用了外部字体；TDesign 字体栈由 `--td-font-family` 提供 |
| 移动端组件不渲染 | 是否误加载了桌面端 UMD；是否 `app.use(TDesign)`；profile 是否 `mobile-vue` |
| 移动端页面像桌面 | 是否用了桌面骨架；vendor 是否从 `assets/vendor/` 而不是 `assets/vendor-mobile-vue/` 复制 |
| 移动端 token 报错 | 是否用了桌面端 token（如 `--td-radius-medium`）；改用 `refs/mobile-vue/td-tokens.json` |
| 移动端图标空白 | 是否引入共享 `tdesign-sprite.js`；`loadDefaultIcons` 是否关闭 |
| profile 不一致 | 任务根目录 `aiux-profile.json` 与页面 `mcp.framework` 必须一致；一个任务只能选一个端 |

## 9. 不要做

- 不要把 vendor 改成 CDN 链接。
- 不要为每页复制一份面板脚本。
- 不要在页面里写 `fetch` 去读 `docs/*.md`。
- 不要把 md 当事实源；唯一事实源是页面里的 `aiux-spec`。
- 不要手工改 `.aiux/docs/*.md` 或 `.aiux/自检清单.md`，它们会被覆盖。
- 不要用 `!important` 改页面样式；面板的高亮样式除外。
- 不要在同一个任务里混桌面端和移动端页面；vendor 和 UMD 会互相覆盖。
- 不要在同一个页面里同时加载桌面端和移动端 UMD；全局名都叫 `TDesign`。
