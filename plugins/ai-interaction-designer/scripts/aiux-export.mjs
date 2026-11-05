#!/usr/bin/env node
/**
 * aiux-export.mjs
 * 从页面内 #aiux-spec 生成逐页 Markdown 文档。md 是生成物，唯一事实源仍是页面 JSON。
 *
 * 用法：
 *   node scripts/aiux-export.mjs [任务目录或页面文件] [--profile vue-next|mobile-vue] [--out docs]
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  EDGE_LABELS,
  GLOBAL_LABELS,
  I18N_LABELS,
  REASON_LABELS,
  STATE_LABELS,
  listPages,
  mdTable,
  readSpecFromHtml,
} from './lib/aiux-common.mjs';
import {
  DEFAULT_PROFILE,
  getProfile,
  isValidProfile,
  profileList,
  readTaskProfile,
} from './lib/aiux-profiles.mjs';

function usage() {
  console.log(`用法：node scripts/aiux-export.mjs [任务目录或页面文件] [--profile vue-next|mobile-vue] [--out docs]

可选 profile：${profileList()}
默认从任务根目录的 aiux-profile.json 或页面 mcp.framework 自动判断，缺省 vue-next。

示例：
  node scripts/aiux-export.mjs .aiux
  node scripts/aiux-export.mjs .aiux/pages/order-list.html
  node scripts/aiux-export.mjs .aiux --out docs
  node scripts/aiux-export.mjs .aiux --profile mobile-vue
`);
}

function parseArgs(argv) {
  const options = { target: '.aiux', out: 'docs', help: false, profile: null };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--profile') {
      options.profile = argv[++i];
      if (!options.profile) throw new Error('--profile 需要 vue-next 或 mobile-vue');
    } else if (arg === '--out') {
      options.out = argv[++i];
      if (!options.out) throw new Error('--out 需要一个目录');
    } else if (arg.startsWith('-')) throw new Error(`未知参数：${arg}`);
    else rest.push(arg);
  }
  if (rest.length > 1) throw new Error('只接受一个任务目录或页面文件');
  if (rest.length === 1) options.target = rest[0];
  return options;
}

function bullets(items, empty = '未提供') {
  if (!Array.isArray(items) || !items.length) return `${empty}\n`;
  return items.map((x) => `- ${x}`).join('\n') + '\n';
}

function definition(pairs) {
  return pairs.map(([k, v]) => `- **${k}**：${v && String(v).trim() ? v : '未填写'}`).join('\n') + '\n';
}

function flowTable(items) {
  return mdTable(
    ['ID', '交互', '锚点'],
    (Array.isArray(items) ? items : []).map((x) => [x.id, x.text, x.anchor ? `#${x.anchor}` : '']),
    '未填写'
  );
}

const arr = (value) => (Array.isArray(value) ? value : []);

function renderMarkdown(page, spec, profile) {
  const out = [];
  const title = spec.page && spec.page.name ? spec.page.name : path.basename(page.file, '.html');
  const file = spec.page && spec.page.file ? spec.page.file : page.file;
  out.push('<!-- 由页面内 aiux-spec 生成，直接编辑会被覆盖。改 JSON 才是正路。 -->');
  out.push('');
  out.push(`# ${title} · 交互说明`);
  out.push('');
  out.push(`> 页面：\`${file}\` ｜ 组件库：${profile.tdesignPackage}@${profile.tdesignVersion} ｜ 生成：${new Date().toLocaleString('zh-CN')}`);
  out.push('> 由页面内 `aiux-spec` 生成；直接编辑会被覆盖。');
  out.push('');

  out.push('## 页面摘要');
  out.push('');
  out.push(bullets(arr(spec.summary), '未填写'));
  out.push('');

  out.push('## 1 用户与权限');
  out.push('');
  out.push('### 角色定义');
  out.push('');
  out.push(mdTable(['角色', '说明'], arr(spec.s1_access?.roles).map((x) => [x.name, x.desc]), '未提供'));
  out.push('### 权限矩阵');
  out.push('');
  out.push(mdTable(
    ['角色', '操作', '是否允许', '备注'],
    arr(spec.s1_access?.matrix).map((x) => [x.role, x.action, x.allowed, x.note || '']),
    '未提供'
  ));
  out.push('### 本页角色差异');
  out.push('');
  out.push(bullets(arr(spec.s1_access?.roleDiffs), '未提供'));

  out.push('## 2 信息架构');
  out.push('');
  out.push(`- **本页位置**：${spec.s2_ia?.position || '未填写'}`);
  out.push('');
  out.push('### 入口');
  out.push('');
  out.push(mdTable(['从哪来', '怎么来'], arr(spec.s2_ia?.entries).map((x) => [x.from, x.how]), '未提供'));
  out.push('### 去向');
  out.push('');
  out.push(mdTable(['去哪里', '怎么去'], arr(spec.s2_ia?.exits).map((x) => [x.to, x.how]), '未提供'));

  out.push('## 3 页面 / 模块详述');
  out.push('');
  out.push('### 3.1 页面目标与入口');
  out.push('');
  out.push(`${spec.s3_page?.goal || '未填写'}\n`);
  out.push('### 3.2 布局与元素清单');
  out.push('');
  out.push(mdTable(
    ['元素', 'TDesign 组件', '锚点'],
    arr(spec.s3_page?.elements).map((x) => [x.name, x.component, x.anchor ? `#${x.anchor}` : '']),
    '未填写'
  ));
  if (Array.isArray(spec.gaps) && spec.gaps.length) {
    out.push('### TDesign 缺口登记');
    out.push('');
    out.push(mdTable(['缺口', '为何无法组合', '批准人'], spec.gaps.map((x) => [x.gap, x.why, x.approver]), '未提供'));
  }
  out.push('### 3.3 交互流程');
  out.push('');
  out.push('#### 主流程');
  out.push('');
  out.push(flowTable(spec.s3_page?.flows?.main));
  out.push('#### 异常流程');
  out.push('');
  out.push(flowTable(spec.s3_page?.flows?.exception));

  out.push('### 3.4 状态设计');
  out.push('');
  out.push(mdTable(
    ['状态', '设计'],
    Object.keys(STATE_LABELS).map((key) => [STATE_LABELS[key], spec.s3_page?.states?.[key] || '']),
    '未填写'
  ));
  out.push('### 3.5 字段与校验');
  out.push('');
  out.push(mdTable(
    ['字段', '规则', '错误文案', '状态'],
    arr(spec.s3_page?.fields).map((x) => [x.name, x.rule, x.message || '', x.status || '']),
    '未提供'
  ));
  out.push('### 3.6 按钮与操作反馈');
  out.push('');
  out.push(mdTable(
    ['操作', '反馈', '禁用条件'],
    arr(spec.s3_page?.actions).map((x) => [x.name, x.feedback, x.disabledWhen || '']),
    '未提供'
  ));

  out.push('## 4 全局交互规范');
  out.push('');
  out.push(definition(Object.keys(GLOBAL_LABELS).map((key) => [GLOBAL_LABELS[key], spec.s4_global?.[key]])));
  out.push('### Token 覆写');
  out.push('');
  out.push(mdTable(
    ['Token', '值', '原因'],
    Array.isArray(spec.s4_global?.tokenOverrides) ? spec.s4_global.tokenOverrides.map((x) => [x.token, x.value, x.reason]) : [],
    '无覆写'
  ));

  out.push('## 5 边界与异常');
  out.push('');
  out.push(definition(Object.keys(EDGE_LABELS).map((key) => [EDGE_LABELS[key], spec.s5_edge?.[key]])));

  out.push('## 6 数据与埋点');
  out.push('');
  out.push(mdTable(
    ['事件名', '触发时机', '上报字段'],
    Array.isArray(spec.s6_tracking?.events) ? spec.s6_tracking.events.map((x) => [x.name, x.trigger, (x.fields || []).join(', ')]) : [],
    '未提供'
  ));

  out.push('## 7 国际化与适配');
  out.push('');
  out.push(definition(Object.keys(I18N_LABELS).map((key) => [I18N_LABELS[key], spec.s7_i18n?.[key]])));

  out.push('## 待确认');
  out.push('');
  out.push(mdTable(
    ['待确认', '原因', '转给'],
    Array.isArray(spec.openQuestions)
      ? spec.openQuestions.map((x) => [x.item, REASON_LABELS[x.reason] || x.reason, x.owner])
      : [],
    '无待确认项'
  ));
  out.push('');
  return out.join('\n');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  const { root, files } = listPages(options.target);
  if (!files.length) throw new Error(`没有找到页面 HTML：${root}`);

  const taskProfile = readTaskProfile(root);
  const firstParsed = readSpecFromHtml(fs.readFileSync(files[0], 'utf8'));
  const firstFramework = firstParsed.ok ? firstParsed.spec?.mcp?.framework : null;
  const profileName =
    options.profile ||
    (taskProfile && taskProfile.id) ||
    (isValidProfile(firstFramework) ? firstFramework : DEFAULT_PROFILE);
  const profile = getProfile(profileName);

  const outDir = path.isAbsolute(options.out) ? options.out : path.join(root, options.out);
  fs.mkdirSync(outDir, { recursive: true });

  const written = [];
  const failed = [];
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    const parsed = readSpecFromHtml(html);
    if (!parsed.ok) {
      failed.push({ file, error: parsed.error });
      continue;
    }
    const spec = parsed.spec;
    const rel = path.relative(root, file).split(path.sep).join('/');
    const page = { file: rel, absFile: file };
    const md = renderMarkdown(page, spec, profile);
    const base = path.basename(file, '.html');
    const dest = path.join(outDir, `${base}.md`);
    fs.writeFileSync(dest, md, 'utf8');
    written.push(dest);
  }

  for (const f of written) console.log(`已生成 ${f}`);
  for (const f of failed) console.error(`跳过 ${f.file}：${f.error}`);
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error(`aiux-export 失败：${err.message}`);
  usage();
  process.exitCode = 2;
}
