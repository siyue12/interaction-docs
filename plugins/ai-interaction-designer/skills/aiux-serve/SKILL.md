---
name: aiux-serve
description: 前端交付预览协议：识别 package.json 与框架、后台启动监听 0.0.0.0 的开发服务器、解析 Local/Network 地址、HTTP 验证，并在最终回复同时给出两个可点击链接。Use when finishing a page or project, starting/restarting the preview server, reporting Local and Network URLs, or diagnosing why the LAN address is unreachable.
---

# AIUX · 本地 / 局域网交付预览

完成任何前端页面或项目后，**必须**启动本地开发服务器，并在最终回复中同时给出 **Local** 与 **Network** 两个可访问地址。没有启动、或只有一个地址，都算交付未完成。

## 0. 硬约束

1. 先识别项目，再用项目已有的 dev 命令；不要擅自换框架、换构建工具或新建脚手架。
2. 必须监听 `0.0.0.0`，不能只监听 `127.0.0.1`。
3. 优先 `5173`；被占用就顺延到 `5174` 或下一个可用端口，并在回复中写实际端口。
4. 后台启动并保存 stdout/stderr；不要用前台命令阻塞后续操作。
5. 启动后必须做 HTTP 验证，只有 `200` / `304` 才算成功。
6. 最终回复必须包含这两行，并给可点击链接：

```text
本地预览：http://localhost:5173/
局域网预览：http://192.168.1.23:5173/
```

7. 失败时贴真实日志和真实原因，**禁止编造地址**，禁止说「应该可以访问」。
8. 不要把 `localhost` 当 Network 地址；Network 必须是局域网 IPv4。

## 1. 识别项目

先看项目根目录的 `package.json`，确认三件事：

| 项 | 怎么取 |
|---|---|
| 框架 | `dependencies` / `devDependencies` 里的 `vite`、`next`、`nuxt`、`@vue/cli-service`、`react-scripts`、`webpack-dev-server` |
| 包管理器 | `packageManager` 字段优先；否则看 `pnpm-lock.yaml` / `yarn.lock` / `bun.lockb` / `package-lock.json`；都没有用 `npm` |
| dev 脚本 | `scripts.dev` / `scripts.start` / `scripts.serve`，按框架选，不要自己拼一套 |

- 有 `package.json`：走 dev server。
- 没有 `package.json`：走静态服务。AIUX 生成的 `.aiux` 任务就是这个模式，是唯一例外；直接服务 `.aiux` 目录。
- `node_modules` 缺失：先装依赖（`npm install` / `pnpm install` / `yarn install` / `bun install`）。安装失败要贴出真实错误、退出码和关键日志，不要跳过。
- 找不到可用的 dev/start 脚本：停下来，列出 `package.json` 里现有 scripts，让用户确认，不要猜命令。

## 2. 启动开发服务器

固定监听 `0.0.0.0`，端口从 `5173` 开始。按框架使用已有命令：

| 框架 | 启动方式 |
|---|---|
| Vite | `npm run dev -- --host 0.0.0.0 --port 5173`；或在 `vite.config.*` 配 `server: { host: '0.0.0.0', port: 5173, strictPort: true }` |
| Next.js | `npm run dev -- -H 0.0.0.0 -p 5173` |
| Nuxt | `npm run dev -- --host 0.0.0.0 --port 5173` |
| Vue CLI | `npm run serve -- --host 0.0.0.0 --port 5173` |
| Create React App | `HOST=0.0.0.0 PORT=5173 BROWSER=none npm start` |
| Webpack Dev Server | `devServer: { host: '0.0.0.0', port: 5173, allowedHosts: 'all' }`，再跑项目原有 dev 命令 |
| 纯静态页面 | `python3 -m http.server 5173 --bind 0.0.0.0`（或本插件静态服务） |

要求：

- 端口被占用时不要抢占别人的进程，顺延并说明实际端口。
- 后台运行；日志写到任务目录，例如 `.aiux/preview.log` 或 `.aiux-preview/preview.log`。
- 不要把 `HOST` / `PORT` 之类的配置写死到源码里；优先用命令行参数或项目已有配置。
- 不要为了「能访问」临时改框架、删 lockfile 或换包管理器。

### 本插件的一键方式

```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}"

# 真实前端项目：读 package.json，用原有 dev 脚本
node "$PLUGIN_ROOT/scripts/aiux-serve.mjs" .

# AIUX 任务：静态服务 .aiux（没有 package.json 时的标准用法）
node "$PLUGIN_ROOT/scripts/aiux-serve.mjs" .aiux
```

脚本会自动：停掉上一次自己启动的进程 → 装依赖（缺失时）→ 选端口 → 后台启动 → 等 HTTP 就绪 → 解析地址 → 写 `preview.json` → 打印 Local/Network。失败时返回退出码 1，并输出脱敏后的日志尾部与排查顺序。

其他参数：

```bash
node "$PLUGIN_ROOT/scripts/aiux-serve.mjs" . --port 5180   # 指定起始端口
node "$PLUGIN_ROOT/scripts/aiux-serve.mjs" .aiux --static  # 强制静态，不读 package.json
node "$PLUGIN_ROOT/scripts/aiux-serve.mjs" .aiux --json    # 机器可读结果
node "$PLUGIN_ROOT/scripts/aiux-serve.mjs" .aiux --stop    # 停止服务
```

## 3. 获取 Local 和 Network

1. 先从启动日志解析 `Local:` / `Network:`（不同框架也叫 `On Your Network`）。日志在 `preview.log`，`preview.json` 里有解析后的结果。
2. 日志只有 Local 时，用系统命令取局域网 IPv4：

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I | awk '{print $1}'

# Windows PowerShell
(Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -First 1).IPAddress
```

3. 只接受私有 IPv4：`192.168.x.x`、`10.x.x.x`、`172.16.x.x`–`172.31.x.x`。`127.*`、`localhost`、`0.0.0.0` 都不是 Network 地址。
4. 多网卡时优先真实 Wi-Fi/有线网卡（macOS 常见 `en0`，Linux 常见 `wlan0` / `eth0`），避开 `utun` / `docker` / `bridge` 等虚拟网卡；回复里写明用的是哪个网卡/IP。
5. 找不到私有 IPv4 时，明确写「局域网地址不可用」，不要拿公网 IP 或 `localhost` 顶替。

## 4. 验证

启动后必须实际请求一次：

```bash
curl -sS -o /dev/null -w "%{http_code}" http://localhost:5173/
```

- 只有 `200` 或 `304` 算成功。
- 同时尝试一次 Network 地址；Network 失败但 Local 成功时，说明可能是防火墙、代理或 Wi-Fi 隔离，不要因此伪造成功。
- 失败时贴出：端口占用、依赖报错、host 配置、防火墙/容器相关日志。不要只写结论。

## 5. 最终回复格式

必须包含以下两行，并给可点击链接（Markdown 链接或裸 URL 均可）：

```text
本地预览：http://localhost:5173/
局域网预览：http://192.168.1.23:5173/
```

补充说明：

- Local 只在这台电脑上有效。
- Network 需要对方和你在同一局域网/Wi-Fi，并可能受系统防火墙影响。
- 端口不是 5173 时写实际端口。
- 服务已停止时，明确写重新启动命令。
- 有多个页面时，逐页给链接，例如 `http://192.168.1.23:5173/pages/order-list.html`。

## 6. 安全约束

1. 监听 `0.0.0.0` 会把开发服务暴露给同一局域网，只在可信网络使用。
2. 不要把开发服务暴露到公网；不要做端口转发、内网穿透或公网隧道。
3. 回复和日志里不要出现密钥、token、cookie、个人信息；脚本会脱敏常见字段，人工检查仍然必要。
4. 评审结束后可以停止服务；正式交付用 `npm run build` 后的静态产物部署，不要长期跑 dev server。
5. 不要把 `.env`、`.npmrc` 里的敏感值贴进聊天或日志。

## 7. 失败处理

按顺序排查，并在回复里说明实际命中的那一项：

1. **端口**：是否被占用；本脚本会自动顺延，手动启动时换下一个端口。
2. **依赖**：`node_modules` 是否完整；安装日志里的真实报错是什么。
3. **监听地址**：是否只监听了 `127.0.0.1`；日志里是否只有 localhost。
4. **防火墙**：Local 通、Network 不通时，检查系统防火墙、VPN、代理、Wi-Fi 客户端隔离。
5. **容器**：是否在 Docker/容器内；端口是否用 `-p` 映射到宿主机，服务是否监听容器内 `0.0.0.0`。

补充：

- 启动进程已退出：看 `preview.log` 尾部，不要把旧地址当成功。
- `preview.json` 的 `status` 不是 `ok`：说明上次失败或已停止，重新运行脚本。
- 需要换端口/换目录：重新运行脚本，它会先停掉自己上一次启动的进程。

## 8. 不要做

- 不要换掉项目框架或包管理器来「让服务跑起来」。
- 不要只监听 `127.0.0.1` 后把 localhost 当 Network 地址。
- 不要在没验证 HTTP 的情况下说「已经可以访问」。
- 不要把 dev server 当生产交付；正式交付走 build。
- 不要在回复里泄露密钥、token、cookie 或用户隐私。
- 不要把服务暴露到公网。
