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

// ---------- 前端开发自检清单 ----------
// 从每页七章 spec 提取前端可实现、可验证的条目，转成 checkbox；
// 前端开发完对照自查：页面交互与样式是否和交互说明/设计稿一致。

function devChecklistForPage(spec, profile) {
  const title = spec.page && spec.page.name ? spec.page.name : '';
  const file = spec.page && spec.page.file ? spec.page.file : '';
  const head = (text) => `### ${title}（\`${file}\`）\n\n${text}`;
  const items = [];
  const add = (text) => items.push(`- [ ] ${text}`);
  const page = spec.s3_page || {};

  // 3.1 目标与入口
  if (page.goal) add(`页面目标与入口与说明一致：${page.goal}`);

  // 3.2 布局与元素清单
  const elements = arr(page.elements);
  for (const e of elements) {
    add(`布局元素「${e.name}」使用 ${e.component || '指定组件'}${e.anchor ? `，锚点 data-aiux="${e.anchor}"` : ''}，位置与设计稿一致`);
  }

  // 3.3 交互流程
  const flows = page.flows || {};
  for (const item of [...arr(flows.main), ...arr(flows.exception)]) {
    add(`${item.id || ''} ${item.text || ''}${item.anchor ? `（验证锚点元素存在且行为一致：data-aiux="${item.anchor}"）` : ''}`.trim());
  }

  // 3.4 状态六态
  const states = page.states || {};
  for (const key of Object.keys(STATE_LABELS)) {
    const v = states[key];
    if (v) add(`${STATE_LABELS[key]}：${v}`);
  }

  // 3.5 字段与校验
  for (const f of arr(page.fields)) {
    const parts = [`字段「${f.name}」校验规则：${f.rule || '未提供'}`];
    if (f.message) parts.push(`错误文案：「${f.message}」`);
    add(parts.join('，'));
  }

  // 3.6 按钮与操作反馈
  for (const a of arr(page.actions)) {
    const parts = [`按钮「${a.name}」反馈：${a.feedback || '未提供'}`];
    if (a.disabledWhen) parts.push(`禁用条件：${a.disabledWhen}`);
    add(parts.join('，'));
  }

  // 1 用户与权限
  const matrix = arr(spec.s1_access?.matrix);
  for (const m of matrix) {
    add(`权限：角色「${m.role}」执行「${m.action}」${m.allowed === false || /否|不允许|禁止/.test(String(m.allowed)) ? '应被禁止/隐藏' : '应允许'}${m.note ? `（${m.note}）` : ''}`);
  }
  for (const diff of arr(spec.s1_access?.roleDiffs)) {
    if (diff && diff !== '未提供') add(`角色差异：${diff}`);
  }

  // 4 全局交互规范
  const g = spec.s4_global || {};
  for (const key of Object.keys(GLOBAL_LABELS)) {
    if (g[key]) add(`${GLOBAL_LABELS[key]}：${g[key]}`);
  }
  for (const t of arr(g.tokenOverrides)) {
    add(`Token 覆写按登记值实现：${t.token} = ${t.value}${t.reason ? `（${t.reason}）` : ''}`);
  }

  // 5 边界与异常
  const e5 = spec.s5_edge || {};
  for (const key of Object.keys(EDGE_LABELS)) {
    if (e5[key]) add(`边界·${EDGE_LABELS[key]}：${e5[key]}`);
  }

  // 6 数据与埋点
  for (const ev of arr(spec.s6_tracking?.events)) {
    add(`埋点「${ev.name}」触发时机：${ev.trigger || '未提供'}${ev.fields && ev.fields.length ? `，字段：${ev.fields.join(', ')}` : ''}`);
  }

  // 7 国际化与适配
  const i18n = spec.s7_i18n || {};
  for (const key of Object.keys(I18N_LABELS)) {
    const v = i18n[key];
    if (v && !/^不涉及/.test(String(v))) add(`${I18N_LABELS[key]}：${v}`);
  }

  // 无内容兜底
  if (!items.length) items.push('- [ ] 本页暂无可自查条目（spec 七章均为空/未提供）');

  return head(items.join('\n'));
}

function renderDevChecklist(pages, profile) {
  const out = [];
  out.push('<!-- 由页面内 aiux-spec 生成，直接编辑会被覆盖。改页面 JSON 后重跑 aiux-export.mjs。 -->');
  out.push('');
  out.push('# 前端开发自检清单');
  out.push('');
  out.push(`> 用途：前端开发完成后，逐条对照自查页面的**交互行为、样式与交互说明/设计稿是否一致**。勾完再提测。`);
  out.push(`> 组件库：${profile.tdesignPackage}@${profile.tdesignVersion} ｜ Profile：${profile.id}（${profile.label}） ｜ 生成：${new Date().toLocaleString('zh-CN')}`);
  out.push('> 来源：每页 `aiux-spec` 七章内容；「未提供」的条目表示对话未覆盖，实现前先与产品确认。');
  out.push('');
  for (const p of pages) {
    out.push(devChecklistForPage(p.spec, profile));
    out.push('');
  }
  return out.join('\n');
}

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
  const okSpecs = [];
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    const parsed = readSpecFromHtml(html);
    if (!parsed.ok) {
      failed.push({ file, error: parsed.error });
      continue;
    }
    const spec = parsed.spec;
    okSpecs.push({ spec });
    const rel = path.relative(root, file).split(path.sep).join('/');
    const page = { file: rel, absFile: file };
    const md = renderMarkdown(page, spec, profile);
    const base = path.basename(file, '.html');
    const dest = path.join(outDir, `${base}.md`);
    fs.writeFileSync(dest, md, 'utf8');
    written.push(dest);
  }

  // 第 8 张：前端开发自检清单（只要有一页解析成功就生成）
  if (okSpecs.length) {
    const checklistDest = path.join(outDir, '前端开发自检清单.md');
    fs.writeFileSync(checklistDest, renderDevChecklist(okSpecs, profile), 'utf8');
    written.push(checklistDest);
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
