#!/usr/bin/env node
/**
 * aiux-serve.mjs
 * 交付预览服务：识别项目 → 后台启动 dev server（或静态服务）→ 解析 Local/Network → HTTP 验证。
 * 启动成功后把结果写入 preview.json；失败只报告真实状态，不编造地址。
 *
 * 用法：
 *   node scripts/aiux-serve.mjs [项目目录或 .aiux] [--port 5173] [--static] [--timeout 120] [--json]
 *   node scripts/aiux-serve.mjs [项目目录或 .aiux] --stop
 *
 * 默认监听 0.0.0.0，端口从 5173 开始，被占用时顺延到下一个可用端口。
 */
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const DEFAULT_PORT = 5173;
const PORT_SPAN = 100;
const DEFAULT_TIMEOUT = 120000;
const STATE_DIR_NAME = '.aiux-preview';
const PREVIEW_SCHEMA = 'aiux/preview@1';

const FRAMEWORK_LABELS = {
  vite: 'Vite',
  next: 'Next.js',
  nuxt: 'Nuxt',
  'vue-cli': 'Vue CLI',
  cra: 'Create React App',
  webpack: 'Webpack Dev Server',
  generic: '通用 dev 脚本',
  static: '静态服务',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/* ------------------------------------------------------------------ */
/* 静态服务 worker：由主流程以子进程方式拉起                             */
/* ------------------------------------------------------------------ */

function runStaticWorker(rootArg, port) {
  const root = path.resolve(rootArg);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`静态目录不存在：${root}`);
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, `http://127.0.0.1:${port}`);
    } catch {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }
    if (pathname.includes('\0')) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    // 只记录路径，不记录 query，避免把 token 写进日志。
    console.log(`${new Date().toISOString()} ${req.method} ${pathname}`);

    if (pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    const filePath = path.resolve(root, `.${pathname}`);
    const rel = path.relative(root, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // 不把日志、预览结果、.env、.git、node_modules 之类的文件暴露到局域网。
    const segments = rel.split(path.sep);
    if (segments.some((segment) => segment.startsWith('.') || segment === 'node_modules')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (/^(?:preview|install)\.(?:log|json)$/i.test(path.basename(filePath))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    if (stat.isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: `${pathname}/` });
        res.end();
        return;
      }
      const indexFile = path.join(filePath, 'index.html');
      if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
        sendFile(req, res, indexFile);
        return;
      }
      sendListing(res, root, filePath, pathname);
      return;
    }

    if (!stat.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    sendFile(req, res, filePath);
  });

  server.on('error', (err) => {
    console.error(`静态服务启动失败：${err.message}`);
    process.exit(1);
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`AIUX static server listening on 0.0.0.0:${port}`);
    console.log(`AIUX static root: ${root}`);
  });
}

function sendFile(req, res, file) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file).pipe(res);
}

function sendListing(res, root, dir, pathname) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  const base = pathname.endsWith('/') ? pathname : `${pathname}/`;
  const parent = base === '/' ? null : '../';
  const rows = entries
    .filter(
      (entry) =>
        !entry.name.startsWith('.') &&
        entry.name !== 'node_modules' &&
        !/^(?:preview|install)\.(?:log|json)$/i.test(entry.name)
    )
    .map((entry) => {
      const suffix = entry.isDirectory() ? '/' : '';
      const label = escapeHtml(entry.name) + suffix;
      const href = `${encodeURIComponent(entry.name)}${suffix}`;
      return `<li><a href="${href}">${label}</a></li>`;
    })
    .join('\n');
  const parentRow = parent ? `<li><a href="${parent}">../</a></li>` : '';
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AIUX Preview · ${escapeHtml(pathname)}</title>
<style>
  body { font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #1f2329; }
  h1 { font-size: 18px; margin: 0 0 16px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 6px 0; border-bottom: 1px solid #e7e9eb; }
  a { color: #0052d9; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { background: #f3f3f3; padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>
<h1>${escapeHtml(pathname)}</h1>
<p><code>${escapeHtml(path.relative(root, dir) || '.')}</code></p>
<ul>
${parentRow}
${rows}
</ul>
</body>
</html>
`;
  const body = Buffer.from(html, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const staticWorkerFlag = process.argv.indexOf('--static-worker');
if (staticWorkerFlag > -1) {
  runStaticWorker(process.argv[staticWorkerFlag + 1], Number(process.argv[staticWorkerFlag + 2]));
} else {
  main().catch((err) => {
    console.error(`aiux-serve 失败：${err.message}`);
    process.exit(1);
  });
}

function usage() {
  const label = process.platform === 'win32' ? '项目目录' : '项目目录或 .aiux';
  console.log(`用法：node scripts/aiux-serve.mjs [${label}] [--port 5173] [--static] [--timeout 120] [--json]
       node scripts/aiux-serve.mjs [${label}] --stop

默认从当前目录开始识别；有 package.json 时优先用项目已有的 dev 脚本，
没有时按静态目录服务（AIUX 的 .aiux 任务走这条）。

选项：
  --port <n>     起始端口，默认 5173；被占用时自动顺延
  --static       强制静态服务，不读 package.json
  --timeout <s>  等待服务就绪的秒数，默认 120
  --stop         停止上一次由本脚本启动的预览服务
  --json         输出机器可读 JSON（进度写 stderr）
  -h, --help     显示帮助

示例：
  node scripts/aiux-serve.mjs .
  node scripts/aiux-serve.mjs .aiux
  node scripts/aiux-serve.mjs .aiux --port 5180
  node scripts/aiux-serve.mjs .aiux --stop
`);
}

function parseArgs(argv) {
  const options = {
    target: '.',
    port: DEFAULT_PORT,
    timeout: DEFAULT_TIMEOUT,
    stop: false,
    json: false,
    static: false,
    help: false,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--stop') options.stop = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--static') options.static = true;
    else if (arg === '--port') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('--port 需要 1-65535 的整数');
      options.port = value;
    } else if (arg === '--timeout') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value <= 0) throw new Error('--timeout 需要正数秒数');
      options.timeout = Math.round(value * 1000);
    } else if (arg.startsWith('-')) {
      throw new Error(`未知参数：${arg}`);
    } else {
      rest.push(arg);
    }
  }
  if (rest.length > 1) throw new Error('只接受一个项目目录或 .aiux');
  if (rest.length === 1) options.target = rest[0];
  return options;
}

/* ------------------------------------------------------------------ */
/* 主流程                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }

  const root = path.resolve(process.cwd(), opts.target);
  if (!fs.existsSync(root)) throw new Error(`路径不存在：${root}`);
  if (!fs.statSync(root).isDirectory()) throw new Error(`不是目录：${root}`);

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < 18) throw new Error(`需要 Node.js 18+，当前 ${process.version}`);

  const stateDir = resolveStateDir(root);
  fs.mkdirSync(stateDir, { recursive: true });
  const previewFile = path.join(stateDir, 'preview.json');

  if (opts.stop) {
    const stopped = await stopPreview(previewFile, { ...opts, silent: true });
    if (!opts.json) {
      if (!stopped.found) {
        console.log('没有找到由 aiux-serve 启动的预览服务。');
      } else if (stopped.wasAlive) {
        console.log(`已停止预览服务（PID ${stopped.pid}）。`);
        console.log('重新启动：node scripts/aiux-serve.mjs ' + displayTarget(root));
      } else {
        console.log(`预览服务已不在运行（PID ${stopped.pid}）。`);
      }
    } else {
      emitJson({ ok: true, action: 'stop', ...stopped });
    }
    return;
  }

  // 同目录重复执行时先停掉旧进程，避免端口被自己占用后顺延。
  const previous = await stopPreview(previewFile, { ...opts, silent: true });
  if (previous.wasAlive) info(opts, `已停止上一次预览服务（PID ${previous.pid}）。`);

  let project;
  try {
    project = opts.static ? { mode: 'static' } : detectProject(root);
  } catch (err) {
    return fail(opts, {
      stage: 'detect',
      message: err.message,
      root,
      stateDir,
      logFile: null,
      logTail: '',
      checks: [
        '确认项目根目录的 package.json 是合法 JSON',
        '确认 package.json 里有 dev / start / serve 脚本',
        '如果只是想预览静态页面，加 --static 或直接把 .aiux 作为目标目录',
      ],
    });
  }
  let installLog = null;

  if (project.mode === 'dev' && project.installNeeded) {
    installLog = path.join(stateDir, 'install.log');
    info(opts, `依赖未安装，先执行：${project.installCommand}`);
    const installResult = await installDependencies(root, project, installLog, opts);
    if (!installResult.ok) {
      const tail = redact(readTail(installLog, 40));
      return fail(opts, {
        stage: 'install',
        message: `依赖安装失败（${project.installCommand}，退出码 ${installResult.code}）`,
        root,
        stateDir,
        logFile: installLog,
        logTail: tail,
        checks: [
          '确认包管理器可用：' + project.packageManager + ' --version',
          '确认网络/registry 可访问，必要时检查 .npmrc 与代理',
          '确认 lockfile 与 Node.js 版本匹配（Node 18+）',
        ],
      });
    }
  }

  let port;
  try {
    port = await pickPort(opts.port);
  } catch (err) {
    return fail(opts, {
      stage: 'port',
      message: err.message,
      root,
      stateDir,
      checks: [
        `端口 ${opts.port} 到 ${opts.port + PORT_SPAN - 1} 都不可用`,
        '先停止占用端口的 dev server，或显式传 --port 指定其他端口',
      ],
    });
  }
  if (port !== opts.port) {
    info(opts, `端口 ${opts.port} 被占用，改用 ${port}。`);
  }

  const logFile = path.join(stateDir, 'preview.log');
  fs.writeFileSync(logFile, '', 'utf8');
  const plan = buildPlan(project, root, port);
  info(opts, `模式：${FRAMEWORK_LABELS[plan.framework] || plan.framework}`);
  info(opts, `命令：${plan.command}`);
  info(opts, `日志：${logFile}`);

  let child;
  try {
    child = spawnDetached(plan, root, logFile, port);
  } catch (err) {
    return fail(opts, {
      stage: 'spawn',
      message: `启动命令失败：${err.message}`,
      root,
      stateDir,
      logFile,
      logTail: redact(readTail(logFile, 40)),
      checks: failureChecks({ port, log: '', root, project, networkProbe: null }),
    });
  }

  const ready = await waitForReady({ port, logFile, child, timeout: opts.timeout });
  const logText = readLog(logFile);

  if (!ready.ok) {
    killTree(child.pid);
    const lan = getLanCandidates();
    return fail(opts, {
      stage: 'ready',
      message: ready.reason,
      root,
      stateDir,
      logFile,
      logTail: redact(readTail(logFile, 60)),
      checks: failureChecks({ port, log: logText, root, project, networkProbe: null, lan }),
      httpStatus: ready.status,
      port,
      pid: child.pid,
    });
  }

  const lan = getLanCandidates();
  const addresses = parseAddresses(logText, port, lan);
  const actualPort = addresses.port || port;
  const pages = project.mode === 'static' ? listPages(root, addresses, actualPort) : [];
  const networkProbe = await probeNetwork(addresses.network);

  const result = {
    schema: PREVIEW_SCHEMA,
    status: 'ok',
    mode: project.mode,
    framework: plan.framework,
    frameworkLabel: FRAMEWORK_LABELS[plan.framework] || plan.framework,
    root,
    port: actualPort,
    requestedPort: opts.port,
    portFallback: actualPort !== opts.port,
    local: addresses.local,
    network: addresses.network,
    lanInterface: lan.length ? lan[0].interface : null,
    lanAddress: lan.length ? lan[0].address : null,
    lanCandidates: lan,
    entry: pages.length ? pages[0].local : addresses.local,
    pages,
    httpStatus: ready.status,
    networkHttpStatus: networkProbe.status,
    networkReachable: networkProbe.ok,
    networkProbeError: networkProbe.error,
    command: plan.command,
    packageManager: project.mode === 'dev' ? project.packageManager : null,
    installLog,
    pid: child.pid,
    logFile,
    stateDir,
    previewFile,
    startedAt: new Date().toISOString(),
    node: process.version,
  };

  fs.writeFileSync(previewFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  if (opts.json) {
    emitJson(result);
  } else {
    printSuccess(result, opts);
  }
}

/* ------------------------------------------------------------------ */
/* 项目识别                                                             */
/* ------------------------------------------------------------------ */

function detectProject(root) {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { mode: 'static' };
  }

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (err) {
    throw new Error(`package.json 解析失败：${err.message}`);
  }

  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const framework = detectFramework(deps, scripts);
  const script = pickScript(framework, scripts);

  if (!script) {
    const available = Object.keys(scripts);
    throw new Error(
      `没有可用的 dev/start 脚本（框架：${FRAMEWORK_LABELS[framework]}）。` +
        (available.length ? `package.json 里的脚本：${available.join(', ')}` : 'package.json 里没有任何 scripts。')
    );
  }

  const packageManager = detectPackageManager(root, pkg);
  const args = devArgs(framework, DEFAULT_PORT); // 仅用于判断该框架是否支持 host/port 参数
  const installNeeded = !hasNodeModules(root);

  return {
    mode: 'dev',
    framework,
    script,
    scripts,
    packageManager,
    installNeeded,
    installCommand: `${packageManager} install`,
    supportsHostArgs: args.length > 0,
  };
}

function detectFramework(deps, scripts) {
  const has = (name) => Boolean(deps[name]);
  const scriptText = `${scripts.dev || ''} ${scripts.start || ''} ${scripts.serve || ''}`;
  if (has('next')) return 'next';
  if (has('nuxt') || has('nuxt3')) return 'nuxt';
  if (has('@vue/cli-service')) return 'vue-cli';
  if (has('react-scripts')) return 'cra';
  if (has('vite')) return 'vite';
  if (has('webpack-dev-server') || /webpack(?:-dev-server)?\s+serve/.test(scriptText)) return 'webpack';
  return 'generic';
}

function pickScript(framework, scripts) {
  const preferred = {
    next: ['dev', 'start'],
    nuxt: ['dev', 'start'],
    'vue-cli': ['serve', 'dev', 'start'],
    cra: ['start', 'dev'],
    vite: ['dev', 'start'],
    webpack: ['dev', 'start', 'serve'],
    generic: ['dev', 'start', 'serve'],
  };
  return (preferred[framework] || preferred.generic).find((name) => typeof scripts[name] === 'string') || null;
}

function detectPackageManager(root, pkg) {
  const field = typeof pkg.packageManager === 'string' ? pkg.packageManager : '';
  const declared = field.split('@')[0];
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(declared)) return declared;

  const lockfiles = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['package-lock.json', 'npm'],
    ['npm-shrinkwrap.json', 'npm'],
  ];
  for (const [file, pm] of lockfiles) {
    if (fs.existsSync(path.join(root, file))) return pm;
  }
  return 'npm';
}

function hasNodeModules(root) {
  let dir = root;
  for (let i = 0; i < 3; i += 1) {
    if (fs.existsSync(path.join(dir, 'node_modules'))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

function devArgs(framework, port) {
  switch (framework) {
    case 'vite':
      return ['--host', '0.0.0.0', '--port', String(port), '--strictPort'];
    case 'next':
      return ['-H', '0.0.0.0', '-p', String(port)];
    case 'nuxt':
      return ['--host', '0.0.0.0', '--port', String(port)];
    case 'vue-cli':
      return ['--host', '0.0.0.0', '--port', String(port)];
    case 'webpack':
      return ['--host', '0.0.0.0', '--port', String(port)];
    case 'cra':
      return [];
    default:
      return [];
  }
}

function buildPlan(project, root, port) {
  if (project.mode === 'static') {
    return {
      framework: 'static',
      command: `${quote(process.execPath)} ${quote(SELF)} --static-worker ${quote(root)} ${port}`,
    };
  }

  const args = devArgs(project.framework, port);
  const run = project.packageManager === 'npm' ? 'npm run' : `${project.packageManager} run`;
  let command = `${run} ${project.script}`;
  if (args.length) command += ` -- ${args.join(' ')}`;
  if (project.framework === 'cra') {
    command =
      process.platform === 'win32'
        ? `set HOST=0.0.0.0&& set PORT=${port}&& set BROWSER=none&& ${run} ${project.script}`
        : `HOST=0.0.0.0 PORT=${port} BROWSER=none ${run} ${project.script}`;
  }
  return { framework: project.framework, command };
}

/* ------------------------------------------------------------------ */
/* 启动与等待                                                           */
/* ------------------------------------------------------------------ */

async function installDependencies(root, project, logFile, opts) {
  fs.writeFileSync(logFile, '', 'utf8');
  const fd = fs.openSync(logFile, 'a');
  const out = opts.json ? process.stderr : process.stdout;
  let child;
  try {
    child = spawn(project.installCommand, {
      cwd: root,
      shell: true,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (err) {
    fs.closeSync(fd);
    return { ok: false, code: -1 };
  }

  const pipe = (stream) => {
    stream.on('data', (chunk) => {
      const text = redact(chunk.toString());
      fd.write(text);
      out.write(text);
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);

  const timer = setTimeout(() => {
    info(opts, '依赖安装超过 10 分钟，已终止。');
    killTree(child.pid);
  }, 10 * 60 * 1000);

  const code = await new Promise((resolve) => {
    child.on('close', (exitCode) => resolve(exitCode === null ? -1 : exitCode));
    child.on('error', () => resolve(-1));
  });
  clearTimeout(timer);
  fs.closeSync(fd);
  return { ok: code === 0, code };
}

function spawnDetached(plan, cwd, logFile, port) {
  const fd = fs.openSync(logFile, 'a');
  const child = spawn(plan.command, {
    cwd,
    shell: true,
    detached: true,
    stdio: ['ignore', fd, fd],
    env: {
      ...process.env,
      HOST: '0.0.0.0',
      PORT: String(port),
      BROWSER: 'none',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
    windowsHide: true,
  });
  child.unref();
  fs.closeSync(fd);
  return child;
}

async function waitForReady({ port, logFile, child, timeout }) {
  const deadline = Date.now() + timeout;
  let last = { ok: false, status: null, error: null };
  let exited = false;

  while (Date.now() < deadline) {
    last = await probeHttp(port);
    if (last.ok) return { ok: true, status: last.status };

    if (!isAlive(child.pid)) {
      exited = true;
      // 有些启动器会再拉起子进程后自己退出，给日志和子进程一点时间。
      await sleep(600);
      last = await probeHttp(port);
      if (last.ok) return { ok: true, status: last.status };
      return {
        ok: false,
        reason: `启动进程已退出，服务未就绪（HTTP ${last.status ?? '无响应'}${last.error ? `，${last.error}` : ''}）`,
        status: last.status,
      };
    }

    await sleep(500);
  }

  const log = readLog(logFile);
  return {
    ok: false,
    reason: `等待 ${Math.round(timeout / 1000)} 秒后服务仍未就绪（HTTP ${last.status ?? '无响应'}${last.error ? `，${last.error}` : ''}）${exited ? '，启动进程已退出' : ''}`,
    status: last.status,
  };
}

async function probeHttp(port) {
  let last = { ok: false, status: null, error: null };
  for (const host of ['127.0.0.1', 'localhost']) {
    try {
      const res = await fetch(`http://${host}:${port}/`, {
        signal: AbortSignal.timeout(4000),
        redirect: 'follow',
      });
      if (res.status === 200 || res.status === 304) {
        return { ok: true, status: res.status, error: null };
      }
      last = { ok: false, status: res.status, error: `HTTP ${res.status}` };
    } catch (err) {
      last = { ok: false, status: null, error: err.cause?.code || err.message };
    }
  }
  return last;
}

async function probeNetwork(networkUrl) {
  if (!networkUrl) return { ok: false, status: null, error: '没有局域网地址' };
  try {
    const res = await fetch(networkUrl, { signal: AbortSignal.timeout(4000), redirect: 'follow' });
    return { ok: res.status === 200 || res.status === 304, status: res.status, error: null };
  } catch (err) {
    return { ok: false, status: null, error: err.cause?.code || err.message };
  }
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // 已经退出
    }
  }
}

async function stopPid(pid) {
  if (!pid) return false;
  killTree(pid);
  for (let i = 0; i < 20; i += 1) {
    if (!isAlive(pid)) return true;
    await sleep(100);
  }
  if (process.platform !== 'win32') {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // 已经退出
      }
    }
  }
  return !isAlive(pid);
}

async function stopPreview(previewFile, opts = {}) {
  if (!fs.existsSync(previewFile)) return { found: false, wasAlive: false, pid: null };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(previewFile, 'utf8'));
  } catch {
    return { found: false, wasAlive: false, pid: null };
  }
  const pid = Number(data.pid) || null;
  if (!pid) return { found: true, wasAlive: false, pid: null };
  const wasAlive = isAlive(pid);
  if (wasAlive) await stopPid(pid);
  const updated = {
    ...data,
    status: 'stopped',
    stoppedAt: new Date().toISOString(),
  };
  fs.writeFileSync(previewFile, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return { found: true, wasAlive, pid };
}

/* ------------------------------------------------------------------ */
/* 地址解析                                                             */
/* ------------------------------------------------------------------ */

function parseAddresses(log, fallbackPort, lanCandidates) {
  const clean = stripAnsi(log);
  const localLine = matchUrl(clean, /(?:Local|本机|本地)\s*[:：]\s*(https?:\/\/[^\s"'<>]+)/i);
  const networkLine = matchUrl(clean, /(?:Network|On Your Network|Host|局域网|网络)\s*[:：]\s*(https?:\/\/[^\s"'<>]+)/i);
  const allUrls = [...clean.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => normalizeUrl(m[0]));

  let local = localLine;
  if (!local) {
    local = allUrls.find((url) => /\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::|\/)/i.test(url)) || null;
  }
  if (!local) local = `http://localhost:${fallbackPort}/`;

  let localUrl;
  try {
    localUrl = new URL(local);
  } catch {
    localUrl = new URL(`http://localhost:${fallbackPort}/`);
  }
  if (localUrl.hostname === '0.0.0.0' || localUrl.hostname === '::') {
    localUrl.hostname = 'localhost';
  }
  const port = Number(localUrl.port) || fallbackPort;
  if (!localUrl.port) localUrl.port = String(port);
  local = localUrl.toString();

  let network = networkLine;
  if (network) {
    try {
      const u = new URL(network);
      if (!isPrivateHost(u.hostname) || isLoopbackHost(u.hostname)) network = null;
    } catch {
      network = null;
    }
  }
  if (!network) {
    network = allUrls.find((url) => {
      try {
        const u = new URL(url);
        return isPrivateHost(u.hostname) && (Number(u.port) || fallbackPort) === port;
      } catch {
        return false;
      }
    }) || null;
  }
  if (!network && lanCandidates.length) {
    network = `http://${lanCandidates[0].address}:${port}/`;
  }
  if (network) {
    try {
      const u = new URL(network);
      if (!u.port) u.port = String(port);
      // 日志里的 Network 可能落在 Docker/VPN 网卡；优先换成评分最高的真实局域网网卡。
      const best = lanCandidates[0];
      const matched = lanCandidates.find((item) => item.address === u.hostname);
      if (best && (!matched || matched.score < best.score - 5)) {
        u.hostname = best.address;
      }
      network = u.toString();
    } catch {
      network = null;
    }
  }

  return { local, network, port };
}

function matchUrl(text, regex) {
  const m = text.match(regex);
  return m ? normalizeUrl(m[1]) : null;
}

function normalizeUrl(url) {
  return String(url).replace(/[),.;，。；]+$/, '');
}

function isLoopbackHost(host) {
  return /^(localhost|127\.0\.0\.1|::1|0\.0\.0\.0)$/i.test(host);
}

function isPrivateHost(host) {
  if (isLoopbackHost(host)) return false;
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

function getLanCandidates() {
  const interfaces = os.networkInterfaces();
  const out = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs || []) {
      const family = addr.family;
      if (family !== 'IPv4' && family !== 4) continue;
      if (addr.internal) continue;
      if (!isPrivateHost(addr.address)) continue;

      let score = 0;
      if (addr.address.startsWith('192.168.')) score += 40;
      else if (addr.address.startsWith('10.')) score += 30;
      else score += 20;

      if (/^(en0|en1|wlan0|wlp\w*|eth0)$/i.test(name)) score += 10;
      if (/^(utun|tun|tap|awdl|llw|docker|br-|veth|vmnet|vboxnet)/i.test(name)) score -= 40;

      out.push({ interface: name, address: addr.address, netmask: addr.netmask, score });
    }
  }
  out.sort((a, b) => b.score - a.score || a.interface.localeCompare(b.interface));
  return out;
}

function listPages(root, addresses, port) {
  const pagesDir = path.join(root, 'pages');
  if (!fs.existsSync(pagesDir) || !fs.statSync(pagesDir).isDirectory()) return [];
  const localBase = new URL(addresses.local);
  const networkBase = addresses.network ? new URL(addresses.network) : null;
  return fs
    .readdirSync(pagesDir)
    .filter((name) => name.toLowerCase().endsWith('.html'))
    .sort()
    .map((name) => {
      const rel = `pages/${name}`;
      return {
        name: path.basename(name, path.extname(name)),
        file: rel,
        local: new URL(rel, localBase).toString(),
        network: networkBase ? new URL(rel, networkBase).toString() : null,
      };
    });
}

/* ------------------------------------------------------------------ */
/* 输出                                                                 */
/* ------------------------------------------------------------------ */

function printSuccess(result, opts) {
  const lines = [];
  lines.push('');
  lines.push(`AIUX SERVE · ${result.frameworkLabel}`);
  lines.push(`项目：${result.root}`);
  lines.push(`端口：${result.port}${result.portFallback ? `（${result.requestedPort} 被占用，已顺延）` : ''}`);
  lines.push(`命令：${result.command}`);
  lines.push(`日志：${result.logFile}`);
  lines.push(`验证：HTTP ${result.httpStatus}`);
  lines.push('');
  lines.push(`本地预览：${result.local}`);
  if (result.network) {
    lines.push(`局域网预览：${result.network}${result.lanInterface ? `   （${result.lanInterface} / ${result.lanAddress}）` : ''}`);
  } else {
    lines.push('局域网预览：不可用（未找到 192.168.x.x、10.x.x.x、172.16-31.x.x 私有 IPv4）');
  }
  lines.push('');
  if (result.pages.length) {
    lines.push('页面：');
    for (const page of result.pages) {
      lines.push(`- ${page.name}：${page.local}`);
      if (page.network) lines.push(`  局域网：${page.network}`);
    }
    lines.push('');
  }
  lines.push(`结果文件：${result.previewFile}`);
  if (result.network && !result.networkReachable) {
    lines.push('');
    lines.push(`注意：本机访问局域网地址失败（${result.networkProbeError || '连接被拒绝'}），可能是防火墙、代理或网卡隔离；Local 地址不受影响。`);
  }
  lines.push('');
  lines.push('说明：');
  lines.push('- 本地预览只在这台电脑上有效。');
  lines.push('- 局域网预览需要对方与你在同一 Wi-Fi/局域网，并可能受系统防火墙影响。');
  lines.push('- 服务监听 0.0.0.0，仅限可信网络；不要把开发服务暴露到公网。');
  lines.push(`- 停止服务：node ${quote(SELF)} ${displayTarget(result.root)} --stop`);
  lines.push(`- 重新启动：node ${quote(SELF)} ${displayTarget(result.root)}`);
  lines.push('- 正式交付请用 npm run build 后的静态文件部署，不要长期使用 dev server。');
  lines.push('');
  console.log(lines.join('\n'));
}

function fail(opts, detail) {
  const message = detail.message || '启动失败';
  const payload = {
    ok: false,
    stage: detail.stage || 'unknown',
    error: message,
    root: detail.root,
    port: detail.port ?? null,
    pid: detail.pid ?? null,
    httpStatus: detail.httpStatus ?? null,
    logFile: detail.logFile || null,
    logTail: detail.logTail || '',
    checks: detail.checks || [],
  };

  if (opts.json) {
    emitJson(payload);
    process.exitCode = 1;
    return;
  }

  console.error('');
  console.error(`AIUX SERVE 失败：${message}`);
  if (detail.root) console.error(`项目：${detail.root}`);
  if (detail.port) console.error(`端口：${detail.port}`);
  if (detail.httpStatus) console.error(`HTTP：${detail.httpStatus}`);
  if (detail.logFile) console.error(`日志：${detail.logFile}`);
  if (detail.logTail) {
    console.error('');
    console.error('日志尾部（已脱敏）：');
    console.error(detail.logTail.trimEnd());
  }
  if (detail.checks?.length) {
    console.error('');
    console.error('按顺序排查：');
    detail.checks.forEach((line, index) => console.error(`${index + 1}. ${line}`));
  }
  console.error('');
  process.exitCode = 1;
}

function failureChecks({ port, log, root, project, networkProbe, lan = [] }) {
  const checks = [];
  const text = stripAnsi(log || '');
  const lower = text.toLowerCase();

  if (/eaddrinuse|address already in use|端口.*占用/.test(lower)) {
    checks.push(`端口 ${port} 被占用：确认没有其他 dev server；本脚本会自动顺延，但可加 --port 指定新端口。`);
  } else {
    checks.push(`端口：确认 ${port} 没有被其他进程占用（脚本已尝试顺延；可加 --port 指定）。`);
  }

  if (project?.mode === 'dev') {
    checks.push(
      `依赖：${project.installNeeded ? 'node_modules 缺失，安装日志见上方' : 'node_modules 已存在'}；执行 ${project.packageManager} install 可补齐，失败时贴出真实报错。`
    );
  } else {
    checks.push('依赖：静态模式不依赖 node_modules；确认目录里有可访问的 index.html 或 pages/*.html。');
  }

  const onlyLoopback =
    /(?:localhost|127\.0\.0\.1):\d+/.test(lower) && !/0\.0\.0\.0/.test(lower) && !/network|on your network|局域网/.test(lower);
  if (onlyLoopback) {
    checks.push('监听地址：日志只出现 localhost，可能只监听了 127.0.0.1；给 dev 命令补 --host 0.0.0.0，或在配置里写 server.host = "0.0.0.0"。');
  } else {
    checks.push('监听地址：确认 dev server 实际监听 0.0.0.0，而不是 127.0.0.1。');
  }

  if (networkProbe && !networkProbe.ok) {
    checks.push(`防火墙/网卡：本机访问局域网地址失败（${networkProbe.error || `HTTP ${networkProbe.status}`}），检查系统防火墙、VPN/代理与 Wi-Fi 隔离。`);
  } else {
    checks.push('防火墙：如果 Local 通但其他设备打不开，检查系统防火墙是否放行该端口。');
  }

  if (detectDocker()) {
    checks.push('容器：当前看起来在 Docker/容器内，确认 -p 把端口映射到宿主机，且服务监听容器内的 0.0.0.0。');
  } else {
    checks.push('容器：如果在 Docker/容器内，确认端口已映射到宿主机。');
  }

  if (lan.length > 1) {
    checks.push(`多网卡：检测到 ${lan.map((x) => `${x.interface}=${x.address}`).join('、')}；如选错网卡，用实际局域网 IP 打开。`);
  } else if (!lan.length) {
    checks.push('局域网：未找到私有 IPv4，确认已连接 Wi-Fi/局域网。');
  }

  return checks;
}

function emitJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function info(opts, message) {
  if (opts.json) process.stderr.write(`${message}\n`);
  else console.log(message);
}

/* ------------------------------------------------------------------ */
/* 工具                                                                 */
/* ------------------------------------------------------------------ */

function resolveStateDir(root) {
  if (path.basename(root) === '.aiux') return root;
  const aiuxDir = path.join(root, '.aiux');
  if (fs.existsSync(aiuxDir) && fs.statSync(aiuxDir).isDirectory()) return aiuxDir;
  return path.join(root, STATE_DIR_NAME);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

function redact(text) {
  return String(text)
    .replace(/((?:token|secret|password|passwd|authorization|cookie|api[_-]?key)\s*[=:]\s*)([^\s,;]+)/gi, '$1***')
    .replace(/(https?:\/\/[^\s:/]+):([^\s@/]+)@/g, '$1:***@');
}

function readLog(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function readTail(file, lines = 40) {
  try {
    const stat = fs.statSync(file);
    const size = Math.min(stat.size, 200 * 1024);
    const fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(size);
    fs.readSync(fd, buffer, 0, size, Math.max(0, stat.size - size));
    fs.closeSync(fd);
    return buffer.toString('utf8').split('\n').slice(-lines).join('\n');
  } catch {
    return '';
  }
}

function quote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function displayTarget(root) {
  const rel = path.relative(process.cwd(), root);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel;
  return root;
}

async function pickPort(start) {
  for (let port = start; port < Math.min(start + PORT_SPAN, 65536); port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`从 ${start} 开始的 ${PORT_SPAN} 个端口都不可用`);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '0.0.0.0');
  });
}

function detectDocker() {
  try {
    if (fs.existsSync('/.dockerenv')) return true;
    const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
    return /docker|kubepods|containerd/.test(cgroup);
  } catch {
    return false;
  }
}
