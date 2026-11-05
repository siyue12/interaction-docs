# AI 交互设计师 · ZCode 插件

`/aiux`：一边聊，一边把交互按七章大纲写进**每一页自己的**交互说明；页面用 TDesign 组件和 token 生成，双击就能在浏览器打开；交互条目可点击定位并高亮页面元素；全部页面完成后再由脚本产出前端自检清单。

支持两个端：桌面端 `tdesign-vue-next`，移动端 `tdesign-mobile-vue`。一个任务只选一个端。

## 安装（本地测试市场）

1. 打开 **插件市场 → 添加 → 添加插件市场**。
2. 粘贴市场根目录（包含 `marketplace.json` 的目录），点添加。
3. 打开 **个人 → dev-aiux-local → AI 交互设计师 → 安装**。
4. 新建任务，输入 `/aiux 桌面端 订单列表、订单详情` 或 `/aiux 移动端 订单列表、订单详情`。
5. 安装后也可以在 **设置 → 插件** 里管理或禁用。

## 两个 profile

| profile | 端 | 组件库 | MCP framework | 页面骨架 |
|---|---|---|---|---|
| `vue-next` | 桌面端 | `tdesign-vue-next@1.20.10` | `vue-next` | `page-skeleton.html` |
| `mobile-vue` | 移动端 | `tdesign-mobile-vue@1.17.1` | `mobile-vue` | `page-skeleton-mobile-vue.html` |

- 一个任务只能选一个端；页面 spec 的 `mcp.framework` 必须与任务 `aiux-profile.json` 一致。
- 移动端页面放在 375px 手机画框里，点击目标 ≥ 44px，不依赖 hover，注意安全区和键盘遮挡。
- 桌面端和移动端 UMD 的全局名都是 `TDesign`，不要在同一页同时加载。

## 快速开始

1. 添加本地插件市场并安装本插件（见交付说明里的市场目录）。
2. 新建任务，输入 `/aiux 移动端 订单列表、订单详情`（桌面端把「移动端」换成「桌面端」）。
3. 按命令提示确认页面范围、端和预览环境。
4. 逐页聊、逐页生成、逐页校验。
5. 最后得到：

```text
.aiux/
├── pages/
│   ├── order-list.html       # 页面 + 内嵌 aiux-spec
│   └── order-detail.html
├── docs/                     # 由 aiux-export.mjs 生成
├── vendor/                   # 桌面端 ~2.9MB / 移动端 ~2.2MB，离线可用
├── aiux-profile.json         # 本任务选的端
└── 自检清单.md                # 由 aiux-check.mjs 生成
```

## 前置要求

| 依赖 | 说明 |
|---|---|
| Node.js 18+ / npx | 跑脚本、拉起 TDesign MCP |
| 网络 | MCP 查组件文档时需要；页面本身离线可用 |
| ZCode Desktop | 加载命令、技能、MCP |

MCP 启动器会优先使用系统 CA（`NODE_EXTRA_CA_CERTS` 指向 `/etc/ssl/cert.pem` 等）。如果机器在 TLS 代理后面仍拉不到包，按下面的排障顺序处理。

## 命令与技能

| 组成 | 文件 | 作用 |
|---|---|---|
| 命令 | `commands/aiux.md` | `/aiux` 入口，固定四步链路与硬约束 |
| 技能 | `skills/aiux-flow/SKILL.md` | 七章大纲、记录口径、锚点约定 |
| 技能 | `skills/aiux-tdesign/SKILL.md` | 组件白名单、token、MCP 强制查询 |
| 技能 | `skills/aiux-preview/SKILL.md` | 离线预览、页面骨架、排障 |
| MCP | `.mcp.json` + `mcp/launch-mcp.sh` | 锁定 `tdesign-mcp-server@0.2.4` |
| 参考 | `refs/*.json` + `refs/mobile-vue/*.json` | 桌面/移动白名单、token、图标、spec schema |
| 运行时 | `assets/vendor/`、`assets/vendor-mobile-vue/` + `assets/runtime/` | 桌面/移动 TDesign / 共享 Vue/sprite / 面板 |
| 脚本 | `scripts/aiux-init.mjs` | 按 profile 铺预览环境、生成页面骨架 |
| 脚本 | `scripts/aiux-check.mjs` | 校验 + 生成自检清单 |
| 脚本 | `scripts/aiux-export.mjs` | 由页面 JSON 生成逐页 md |

## 脚本用法

```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}"

# 桌面端：铺环境 + 生成页面骨架
node "$PLUGIN_ROOT/scripts/aiux-init.mjs" .aiux \
  --profile vue-next \
  --page order-list:订单列表 \
  --page order-detail:订单详情

# 移动端：铺环境 + 生成页面骨架
node "$PLUGIN_ROOT/scripts/aiux-init.mjs" .aiux \
  --profile mobile-vue \
  --page order-list:订单列表

# 单页校验（不写自检清单）
node "$PLUGIN_ROOT/scripts/aiux-check.mjs" .aiux/pages/order-list.html

# 全量校验（0 违规时生成 自检清单.md）
node "$PLUGIN_ROOT/scripts/aiux-check.mjs" .aiux

# 生成逐页 md
node "$PLUGIN_ROOT/scripts/aiux-export.mjs" .aiux

# 机器可读报告
node "$PLUGIN_ROOT/scripts/aiux-check.mjs" .aiux --json
```

`aiux-init` 默认不覆盖已有页面；确需覆盖加 `--force`。`aiux-init` 会按 profile 写 `aiux-profile.json`；`aiux-check` 和 `aiux-export` 自动读取它，也可以用 `--profile` 显式覆盖。

`aiux-check` 传入目录且 0 违规时写自检清单；传入单个页面文件默认不写，避免逐页循环时用一页覆盖全量清单；单页需要时加 `--selfcheck`，完全关闭用 `--no-selfcheck`。

## 校验规则

| # | 检查 | 失败条件 |
|---|---|---|
| 1 | spec 完整性 | 缺章节、`summary` 为空、必填对象缺失 |
| 2 | 交互条目 | 缺 `id` / `text` / `anchor`，或 `id` 重复 |
| 3 | 锚点可达 | 页面找不到对应 `data-aiux`，或 anchor 写成选择器 |
| 4 | 状态六态 | 任一状态为空 |
| 5 | 裸控件 | 原生 `<button>` `<input>` `<select>` `<textarea>` `<table>` |
| 6 | 组件白名单 | `t-*` 不在白名单；使用 `public: false` 内部标签会警告 |
| 7 | CSS 变量 | 颜色/字号/圆角/阴影/边框出现硬编码；`--td-*` 不在 token 清单；`!important` 归到第 9 条 |
| 8 | 图标名 | `t-icon` 的 `name` 不在当前 profile 的 `td-icons.json`；动态 name；缺 sprite |
| 9 | 强制覆写 | 页面自写样式出现 `!important` |
| 10 | MCP 追溯 | `mcp.checkedComponents` 未覆盖页面实际用到的组件 family；`mcp.framework` 与任务 profile 不一致 |
| 11 | 占位内容 | `待填写` / `待生成` / `空壳页` / `英文待办占位词` / `TBD` |
| 12 | 运行依赖 | 缺 panel JS/CSS、TDesign JS/CSS、`type="module"`、裸 import；fetch/XHR 警告 |

`vendor/` 与插件自带的 `aiux-panel.js/css` 不参与扫描，只扫页面作者写的部分。桌面端和移动端分别使用 `refs/` 与 `refs/mobile-vue/` 的白名单、token 和图标清单；混用会报错。

**移动端同样遵守 token 规则**：颜色、字号、圆角、阴影、边框只能用 `refs/mobile-vue/td-tokens.json` 里的 `var(--td-*)`；375px、padding、margin、gap 这类尺寸和间距可以用 px。用桌面端 token（例如 `--td-radius-medium`）会被第 7 条拦住。

## 锁定与实测结论

| 项 | 结论 |
|---|---|
| TDesign 桌面端 | `tdesign-vue-next@1.20.10` |
| TDesign 移动端 | `tdesign-mobile-vue@1.17.1` |
| Vue | `3.5.44`，`dist/vue.global.prod.js` |
| UMD 全局名 | 两个包都是 `TDesign`；另需 `Vue` 全局。不要在同一页同时加载两套 UMD |
| 图标 | 两个包都通过 `<use href="#t-icon-xxx">` 取共享官方 sprite，sprite 约 957KB；主 UMD 不含完整图标数据 |
| token | 桌面 252 个、移动 224 个 `--td-*`；命名不完全一致，移动端没有 `--td-radius-medium`；大小写敏感 |
| MCP 工具 | `get-component-list` / `get-component-docs` / `get-component-dom` / `get-component-changelog` / `search-icon`；`framework` 取 `vue-next` 或 `mobile-vue` |
| 组件白名单 | 桌面 72 个顶层组件 / 162 个标签 / 132 个 public；移动 67 个顶层组件 / 95 个标签 / 90 个 public |
| 移动端 Result | 移动端有 `t-result`，直接用；桌面端没有，继续用 `Empty + Typography + Button` 组合 |
| in-DOM 模板 | `<t-button>` 可直接渲染；自定义组件必须写显式闭合标签，`<t-icon />` 不行 |
| 同名校验 | 官方 tdesign 插件的 server key 是 `tdesign`，与本插件的 `tdesign-mcp-server` 不冲突；若宿主已有同名 `tdesign-mcp-server`，把 `.mcp.json` 的 key 改成 `aiux-tdesign` 并重装 |
| 体积 | 桌面端约 2.9MB；移动端约 2.2MB（Vue 167KB + 移动 JS 711KB + CSS 293KB + sprite 957KB + 面板 30KB） |
| profile 一致性 | 任务 `aiux-profile.json` 与页面 `mcp.framework` 必须一致；一个任务只能选一个端 |

### file:// 说明

页面满足三条禁令：无 `type="module"`、无 fetch/XHR、无构建与裸导入；脚本全部相对路径。面板是纯 DOM，不依赖 Vue。桌面端和移动端都已在无头 Chrome 的真实 `file://` 下实测：TDesign 组件、图标 sprite、抽屉、锚点高亮均正常；移动端滚动定位在减少动效模式下也通过。最终交付仍以双击 `file://` 为准，首次安装后请按验收清单双击确认一次。

## 面板行为

- 右下角圆形按钮「交互」，无角标、无进度、无状态。
- 抽屉四段：页面摘要、可点击交互条目、七章正文、待确认项。
- 点击条目：平滑滚动到 `[data-aiux="..."]`，加 1.5 秒 `var(--td-brand-color)` 描边。
- 找不到元素：条目内提示「未绑定元素」，不滚动，校验失败。
- Esc / 遮罩 / 关闭按钮均可关闭；Tab 焦点在抽屉内循环。
- 移动端窄屏下抽屉铺满宽度；桌面端和移动端共用同一个面板，不需要每页各写一套。
- 面板 CSS 里的 `!important` 只用于高亮覆盖页面样式，属于插件运行时，不参与页面校验。

## 排障

### MCP 起不来

1. `npx --version` 是否可用。
2. `NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem npx -y tdesign-mcp-server@0.2.4` 能否启动。
3. `get-component-list` 是否返回当前 profile 对应的列表：桌面端 `vue-next`，移动端 `mobile-vue`。
4. 宿主是否已有同名 `tdesign-mcp-server`；有就改 key 为 `aiux-tdesign`。

**MCP 失败时不要继续写页面**，更不要凭记忆补 Props、事件、插槽、图标名。

### 页面双击空白

- 看控制台：`Vue` / `TDesign` 是否 404。
- 脚本顺序是否 Vue → TDesign → sprite → panel → 引导。
- 是否有 `type="module"`、裸 `import`、`fetch`/XHR。
- 是否 `app.use(TDesign)` 后 `app.mount('#app')`。

### 图标空白

- 是否引入 `vendor/tdesign-sprite.js`。
- 是否关闭 `loadDefaultIcons`。
- `name` 是否在当前 profile 的 `td-icons.json`（桌面 `refs/td-icons.json`，移动 `refs/mobile-vue/td-icons.json`）。
- 页面 DOM 里是否存在 `<symbol id="t-icon-xxx">`。

### 移动端组件不渲染或页面像桌面

- 是否误用了桌面 profile：检查 `aiux-profile.json` 和页面 `mcp.framework` 是否为 `mobile-vue`。
- 是否误用了桌面 UMD：移动端 vendor 应来自 `assets/vendor-mobile-vue/`。
- 是否用了桌面骨架：移动端应使用 `page-skeleton-mobile-vue.html`，页面在 375px 画框里。
- 移动端 token 报错通常是用了桌面变量（例如 `--td-radius-medium`）；改用 `refs/mobile-vue/td-tokens.json`。

### 抽屉首屏就展开

- 确认 `vendor/aiux/aiux-panel.css` 是最新版；抽屉有 `[hidden] { display: none }` 规则。
- 重新跑 `aiux-init` 会覆盖 vendor；已有页面不会被动。

## 目录

```text
ai-interaction-designer/
├── .zcode-plugin/plugin.json
├── .mcp.json
├── mcp/launch-mcp.sh
├── commands/aiux.md
├── skills/
│   ├── aiux-flow/SKILL.md
│   ├── aiux-tdesign/SKILL.md
│   └── aiux-preview/SKILL.md
├── refs/
│   ├── td-whitelist.json          # 桌面端
│   ├── td-tokens.json
│   ├── td-icons.json
│   ├── spec-schema.json
│   └── mobile-vue/                # 移动端
│       ├── td-whitelist.json
│       ├── td-tokens.json
│       └── td-icons.json
├── assets/
│   ├── vendor/                    # 桌面端
│   ├── vendor-mobile-vue/         # 移动端
│   └── runtime/
│       ├── page-skeleton.html
│       └── page-skeleton-mobile-vue.html
├── scripts/
│   ├── aiux-init.mjs
│   ├── aiux-check.mjs
│   ├── aiux-export.mjs
│   └── lib/
│       ├── aiux-common.mjs
│       └── aiux-profiles.mjs
└── README.md
```

## 来源与许可

- [TDesign Vue Next](https://github.com/Tencent/tdesign-vue-next)（MIT）
- [TDesign Mobile Vue](https://github.com/Tencent/tdesign-mobile-vue)（MIT）
- [Vue 3](https://github.com/vuejs/core)（MIT）
- [tdesign-icons](https://github.com/Tencent/tdesign-icons) 官方 sprite（MIT）
- [tdesign-mcp-server](https://cnb.cool/tencent/tdesign/tdesign-mcp-server)（通过 npx 锁定 `0.2.4`，不随插件分发）
