---
name: aiux-tdesign
description: 锁定 TDesign 组件库与 MCP 查询，约束页面只能用官方组件、官方 token、已核实图标；支持桌面端 vue-next 与移动端 mobile-vue 两个 profile。Use when writing or reviewing any AIUX page HTML, choosing TDesign components, checking props/icons/tokens, or when a page fails the component, token or icon checks.
---

# AIUX · TDesign 锁定规范

这个技能只解决一件事：让「高保真原型只能用 TDesign 官方的东西」变成可执行、可校验的动作，而不是靠记忆。

## 0. 两个 profile

一个任务只能选一个端，不要在同一任务里混桌面和移动页面。

| profile | 端 | 组件库 | MCP framework | refs | 页面骨架 |
|---|---|---|---|---|---|
| `vue-next` | 桌面端 | `tdesign-vue-next@1.20.10` | `vue-next` | `refs/` | `page-skeleton.html` |
| `mobile-vue` | 移动端 | `tdesign-mobile-vue@1.17.1` | `mobile-vue` | `refs/mobile-vue/` | `page-skeleton-mobile-vue.html` |

- 页面 spec 的 `mcp.framework` 必须写对应的值。
- `aiux-init --profile <profile>` 会在任务根目录写 `aiux-profile.json`。
- `aiux-check` / `aiux-export` 会从 `aiux-profile.json` 或页面 `mcp.framework` 自动判断 profile；页面写的 framework 与任务 profile 不一致会直接报错。

## 1. 版本与资产

| 项 | 桌面端 vue-next | 移动端 mobile-vue |
|---|---|---|
| TDesign | `tdesign-vue-next@1.20.10` | `tdesign-mobile-vue@1.17.1` |
| Vue | `3.5.44` global prod | 同左 |
| 图标 sprite | 官方 `0.4.6`，共享 | 官方 `0.4.6`，共享 |
| 白名单 | 72 个顶层组件、162 个标签 | 67 个顶层组件、95 个标签 |
| token | 252 个 `--td-*` | 224 个 `--td-*` |
| 图标清单 | 2358 个 | 2358 个（同一套 sprite） |
| 单任务 vendor | 约 2.9MB | 约 2.2MB |

同批生成后不再单独升级某个文件。升版必须整套重出：组件包、CSS、sprite、白名单、token、图标、页面回归。

## 2. MCP 工具契约

插件声明 `tdesign-mcp-server`，实际工具名：

| 工具 | 用途 | 关键参数 |
|---|---|---|
| `get-component-list` | 生成/核对组件白名单 | `framework` |
| `get-component-docs` | 查 Props / 事件 / 插槽 | `framework`, `names: [...]` |
| `get-component-dom` | 改内部结构或核对 class 前查 | `framework`, `names: [...]` |
| `get-component-changelog` | 升版前查 breaking change | `framework`, `names`, `version` |
| `search-icon` | 确认图标名 | `keywords: ["..."]` |

`framework` 必须与当前 profile 一致：

- 桌面端：`vue-next`
- 移动端：`mobile-vue`

工具前缀由宿主分配，不要硬编码 `mcp__...`；按上表的工具名调用。

### 写页面前的强制顺序

1. 每个任务先调一次 `get-component-list(framework=<当前 profile>)`。
2. 本页要用的每个组件，先调 `get-component-docs`。**没查过就不许写 Props、事件、插槽。**
3. 要改组件内部结构或核对 class，先调 `get-component-dom`。
4. 每个图标先调 `search-icon`，再对照当前 profile 的 `td-icons.json`。
5. 把实际查过的组件名（PascalCase）写进本页 `mcp.checkedComponents`。子组件可写父组件名，例如用了 `t-form-item` 就记 `Form`。

### 失败即停

MCP 调用失败时：

- 停止生成新页面，已生成的页面保持不动。
- 明确提示检查三件事：`npx` 是否可用、能否联网拉包、server 是否启动。
- **禁止**因为查不到就凭记忆写 Props、事件、插槽、图标名。
- 启动器会读取系统 CA（`NODE_EXTRA_CA_CERTS`）；仍失败按 README 排障。

## 3. 组件与标签

### 白名单

- 只允许当前 profile 的 `refs/*/td-whitelist.json` 里的标签。
- 只用 `public: true` 的标签；`public: false` 是内部标签，页面不要直接使用。
- 标签统一写 `<t-组件名>`，不自造 HTML 控件。
- 禁止原生 `<button>` `<input>` `<select>` `<textarea>` `<table>`。
- 禁止第二套 UI 库。

### 子组件归属

桌面端常见：

| 标签 | 归属 |
|---|---|
| `t-form-item` | Form |
| `t-tab-panel` | Tabs |
| `t-step-item` | Steps |
| `t-option` / `t-option-group` | Select |
| `t-anchor-item` / `t-anchor-target` | Anchor |
| `t-row` / `t-col` | Grid |
| `t-layout` / `t-header` / `t-aside` / `t-content` / `t-footer` | Layout |
| `t-typography-text` / `t-typography-title` / `t-typography-paragraph` | Typography |
| `t-qrcode` | QRCode |

移动端常见：

| 标签 | 归属 |
|---|---|
| `t-cell` / `t-cell-group` | Cell |
| `t-navbar` | Navbar |
| `t-tab-bar` / `t-tab-bar-item` | TabBar |
| `t-tab-panel` | Tabs |
| `t-grid` / `t-grid-item` | Grid |
| `t-side-bar` / `t-side-bar-item` | SideBar |
| `t-indexes` / `t-indexes-anchor` | Indexes |
| `t-step-item` | Steps |
| `t-form-item` | Form |
| `t-picker` / `t-picker-item` | Picker |
| `t-dropdown-menu` / `t-dropdown-item` | DropdownMenu |
| `t-collapse-panel` | Collapse |

完整映射看当前 profile 的 `tags[tag].family`。

### in-DOM 模板的硬规则

页面内容写在 `#app` 里，Vue 会把它当 in-DOM 模板编译。浏览器不认识自定义标签的自闭合写法：

```html
<!-- 对 -->
<t-icon name="check-circle" size="16px"></t-icon>
<t-button theme="primary">新建订单</t-button>

<!-- 错：in-DOM 下不会按自闭合处理 -->
<t-icon name="check-circle" />
```

所有 `t-*` 标签都写显式闭合标签。

### 不自造组件

- 不重写组件默认交互（例如自定义下拉展开逻辑）。
- 只用文档定义的状态：尺寸、主题、状态、禁用、加载。
- 组件没有的能力，先组合；组合不了，登记到 `spec.gaps`：

```json
{ "gap": "字段映射表", "why": "Table 无法满足可编辑映射结构", "approver": "设计负责人" }
```

已知缺口：

- **桌面端**没有独立 `Result` 结果页组件，用 `Empty` + `Typography` + `Button` 组合。
- **移动端**有 `t-result`，直接用，不要套桌面的组合方案。

## 4. Props / 事件 / 插槽

- 写之前必须查组件文档。
- 文档里只记「用了哪些能力」，不把 API 细节抄进交互说明。
- 不发明 Props / 事件 / 插槽名；不使用文档里不存在的值。
- 不为了「更好看」改写组件默认行为。
- 交付说明里的状态必须与组件真实状态一致。

## 5. CSS Variables

### 三层

| 层 | 规则 |
|---|---|
| 组件内部 | 不动。禁止用 `!important` 覆盖组件内部样式 |
| 页面自定义样式 | 颜色、字号、圆角、阴影、边框一律 `var(--td-*)` |
| 主题定制 | 只在根容器集中覆写一次 token，登记到第 4 章 |

### 允许与禁止

| 属性 | 要求 |
|---|---|
| 颜色（`color` / `background*` / `border-color` / `fill` / `stroke` …） | `var(--td-*)`，禁止 `#hex` / `rgb()` / `hsl()` / 颜色关键字 |
| `font-size` | `var(--td-font-size-*)`，禁止裸字号 |
| `border-radius` | `var(--td-radius-*)`；`0` / `50%` 可用 |
| `box-shadow` / `text-shadow` | `var(--td-shadow-*)` 或 `none` |
| `border` | 宽度可用 px，颜色必须 `var(--td-*)` |
| 间距、宽高、定位 | 允许 px |

### 两个 profile 的 token 不能混用

- **移动端不例外**：颜色、字号、圆角、阴影、边框只能用 `refs/mobile-vue/td-tokens.json` 里的 `var(--td-*)`；375px、padding、margin、gap 这类尺寸和间距可以用 px。
- 桌面端看 `refs/td-tokens.json`；移动端看 `refs/mobile-vue/td-tokens.json`。
- 变量名大小写敏感：`--td-font-size-title-extraLarge` 的 `L` 不能写成 `l`。
- 移动端没有 `--td-radius-medium`；用 `--td-radius-default` 或 `--td-radius-large`。
- 移动端组件文档里列出的组件级 CSS 变量（例如 `--td-navbar-bg-color`）不一定在全局 token 清单里；页面样式只用清单里的变量，避免校验失败。
- 禁止新增 `--my-*` 自定义属性；要定制就覆写已有 `--td-*`。
- 禁止 `!important`。唯一例外是插件自带的 `aiux-panel.css`，它不属于页面作者样式。
- 暗色模式只通过 TDesign 的 `theme-mode="dark"` 切换，不写第二套颜色。

### token 覆写登记

根容器覆写 token 时，同步写进 `s4_global.tokenOverrides`：

```json
{ "token": "--td-brand-color", "value": "#0052d9", "reason": "客户品牌蓝" }
```

校验脚本会检查「页面里覆写了但没登记」和「登记了但页面没写」。

## 6. 图标

- 只用 `<t-icon name="..."></t-icon>`，显式闭合。
- `name` 必须是当前 profile `td-icons.json` 里的名字，并先用 `search-icon` 核实。
- 禁止 emoji、内联 SVG、图标字体拼字符。
- 页面必须引入 `../vendor/tdesign-sprite.js`。桌面端和移动端共用同一套 sprite；图标通过 `<use href="#t-icon-xxx">` 取 symbol。
- 页面骨架会关闭 TDesign 的 CDN 默认图标加载：

```js
if (TDesign.Icon && TDesign.Icon.props && TDesign.Icon.props.loadDefaultIcons) {
  TDesign.Icon.props.loadDefaultIcons.default = false;
}
```

这段只写在页面引导脚本里一次，不要逐页改组件。

## 7. 移动端补充

- 页面放在 375px 手机画框里；桌面浏览器居中展示，手机上 `max-width: 100%`。
- 点击目标建议 ≥ 44px；不要依赖 hover 才能发现操作。
- 顶部导航、底部标签栏、弹层要考虑安全区；TDesign 移动组件默认开启安全区适配。
- 移动端常用组件：`Navbar` / `Cell` / `CellGroup` / `TabBar` / `Search` / `Popup` / `Toast` / `Result` / `SwipeCell` / `PullDownRefresh`。
- 移动端 UMD 全局名同样是 `TDesign`，但**不要在同一页同时加载桌面端和移动端 UMD**。
- 移动端有 `t-result`；桌面端没有，继续用组合方案。

## 8. 页面交付前检查

- [ ] 任务 profile 与页面 `mcp.framework` 一致
- [ ] 本页用到的组件都在当前 profile 白名单里，且 `public: true`
- [ ] 每个组件写之前都查过 `get-component-docs`，`framework` 正确
- [ ] `mcp.checkedComponents` 覆盖页面实际用到的所有 family
- [ ] 没有原生控件、没有第二套库、没有自造组件（有则登记 gaps）
- [ ] 所有颜色/字号/圆角/阴影/边框都走当前 profile 的 `var(--td-*)`
- [ ] 没有 `!important`，没有新增 `--my-*`
- [ ] 所有 `t-icon` 的 name 都在图标清单里，页面已引入 sprite
- [ ] 组件状态与文档一致，没有自造状态
- [ ] 移动端额外检查：点击目标 ≥ 44px、不依赖 hover、安全区适配

跑校验：

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/aiux-check.mjs" .aiux/pages/<page>.html
```

0 违规再进入下一页。
