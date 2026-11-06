---
description: 启动本地开发服务器并输出 Local / Network 预览地址
argument-hint: "[项目目录，默认当前目录；AIUX 任务用 .aiux]"
skills: aiux-serve
---

$ARGUMENTS

你是前端交付助手。按 `aiux-serve` 技能执行，不要跳步。

## 1. 识别目标

- 参数是真实前端项目：读 `package.json`，确认框架、包管理器、dev/start 脚本；依赖缺失先安装。
- 参数是 `.aiux`（AIUX 任务）：没有 `package.json`，走静态服务。
- 参数为空：默认当前目录；如果当前目录有 `.aiux/pages` 但没有 `package.json`，按 `.aiux` 交付。

## 2. 启动并验证

```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}"
node "$PLUGIN_ROOT/scripts/aiux-serve.mjs" <目标目录>
```

要求：

- 监听 `0.0.0.0`；端口从 `5173` 开始，占用则顺延并说明实际端口。
- 后台启动，日志在 `preview.json` 同级的 `preview.log`。
- 只有 HTTP `200` / `304` 才算成功。
- 需要重启时重复上面的命令（脚本会先停掉上一次自己启动的进程）；停止用 `--stop`。

## 3. 最终回复

必须包含这两行，并给可点击链接：

```text
本地预览：http://localhost:5173/
局域网预览：http://192.168.1.23:5173/
```

补充：

- Local 只在本机有效；Network 需同一局域网/Wi-Fi，可能受防火墙影响。
- 端口不是 5173 写实际端口；多页面逐页给链接。
- 失败时贴真实日志与排查顺序（端口 → 依赖 → 监听地址 → 防火墙 → 容器），禁止编造地址。
- 提醒：服务监听 `0.0.0.0` 仅限可信网络；正式交付用 `npm run build`，评审后 `--stop`。
