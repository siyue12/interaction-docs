import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(__dirname, '../..');
export const REFS_DIR = path.join(PLUGIN_ROOT, 'refs');

export const STATE_LABELS = {
  default: '默认态',
  loading: '加载中',
  empty: '空数据',
  error: '错误',
  noPermission: '无权限',
  overLimit: '超限',
};

export const EDGE_LABELS = {
  network: '网络异常',
  concurrency: '并发操作',
  empty: '数据为空',
  timeout: '超时',
  duplicate: '重复提交',
};

export const GLOBAL_LABELS = {
  loading: '加载与反馈',
  motion: '动效',
  shortcuts: '快捷键',
  back: '返回与中断',
  cache: '刷新与缓存',
};

export const I18N_LABELS = {
  languages: '多语言',
  responsive: '分辨率 / 响应式',
  a11y: '无障碍',
};

export const REASON_LABELS = {
  'conversation-missing': '对话未提供',
  'business-rule': '业务规则',
  'api-dependent': '依赖接口',
  'visual-decision': '视觉取舍',
  other: '其他',
};

export function lineAt(text, index) {
  return text.slice(0, Math.max(0, index)).split('\n').length;
}

export function loadRefs(refsDir = 'refs') {
  const dir = path.isAbsolute(refsDir) ? refsDir : path.join(PLUGIN_ROOT, refsDir);
  const files = {
    whitelist: path.join(dir, 'td-whitelist.json'),
    tokens: path.join(dir, 'td-tokens.json'),
    icons: path.join(dir, 'td-icons.json'),
    schema: path.join(REFS_DIR, 'spec-schema.json'),
  };
  for (const [name, file] of Object.entries(files)) {
    if (!fs.existsSync(file)) throw new Error(`缺少 ${path.relative(PLUGIN_ROOT, file)}，插件安装不完整`);
  }
  return {
    whitelist: JSON.parse(fs.readFileSync(files.whitelist, 'utf8')),
    tokens: JSON.parse(fs.readFileSync(files.tokens, 'utf8')),
    icons: JSON.parse(fs.readFileSync(files.icons, 'utf8')),
    schema: JSON.parse(fs.readFileSync(files.schema, 'utf8')),
    refsDir: path.relative(PLUGIN_ROOT, dir).split(path.sep).join('/'),
  };
}

export function findSpecScript(html) {
  let m = html.match(/<script\b[^>]*\bid\s*=\s*(["'])aiux-spec\1[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) m = html.match(/<script\b[^>]*\bid\s*=\s*aiux-spec\b[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  const full = m[0];
  const text = m[2] !== undefined ? m[2] : m[1];
  const startOffset = html.indexOf(full) + full.indexOf('>') + 1;
  return {
    text,
    startOffset,
    line: lineAt(html, startOffset),
  };
}

export function readSpecFromHtml(html) {
  const script = findSpecScript(html);
  if (!script) {
    return { ok: false, error: '缺少 <script type="application/json" id="aiux-spec">', line: 1 };
  }
  const raw = script.text.trim();
  if (!raw) return { ok: false, error: '#aiux-spec 内容为空', line: script.line };
  try {
    return {
      ok: true,
      spec: JSON.parse(raw),
      raw,
      startOffset: script.startOffset,
      startLine: script.line,
    };
  } catch (err) {
    return { ok: false, error: `#aiux-spec JSON 解析失败：${err.message}`, line: script.line };
  }
}

export function inferRoot(file) {
  const dir = path.dirname(file);
  return path.basename(dir) === 'pages' ? path.dirname(dir) : dir;
}

export function listPages(target) {
  const resolved = path.resolve(process.cwd(), target);
  if (!fs.existsSync(resolved)) throw new Error(`路径不存在：${resolved}`);
  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    if (!resolved.toLowerCase().endsWith('.html')) throw new Error(`不是 HTML 文件：${resolved}`);
    return { root: inferRoot(resolved), files: [resolved] };
  }
  const pagesDir = path.join(resolved, 'pages');
  if (fs.existsSync(pagesDir) && fs.statSync(pagesDir).isDirectory()) {
    const files = fs
      .readdirSync(pagesDir)
      .filter((name) => name.toLowerCase().endsWith('.html'))
      .map((name) => path.join(pagesDir, name))
      .sort();
    return { root: resolved, files };
  }
  const files = fs
    .readdirSync(resolved)
    .filter((name) => name.toLowerCase().endsWith('.html'))
    .map((name) => path.join(resolved, name))
    .sort();
  return { root: resolved, files };
}

export function mdCell(value) {
  if (value === undefined || value === null) return '未填写';
  const text = typeof value === 'string' ? value : String(value);
  if (!text.trim()) return '未填写';
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

export function mdTable(headers, rows, emptyText = '未提供') {
  if (!Array.isArray(rows) || !rows.length) return `${emptyText}\n`;
  const head = `| ${headers.map(mdCell).join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(mdCell).join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}\n`;
}

export function flattenStrings(value, prefix = '', out = []) {
  if (typeof value === 'string') {
    out.push({ path: prefix, value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => flattenStrings(item, `${prefix}[${index}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      flattenStrings(item, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

export function readPage(targetFile) {
  const html = fs.readFileSync(targetFile, 'utf8');
  const parsed = readSpecFromHtml(html);
  return { file: targetFile, html, ...parsed };
}
