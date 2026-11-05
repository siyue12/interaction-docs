#!/usr/bin/env node
/**
 * aiux-init.mjs
 * 铺预览环境：按 profile 复制 Vue / TDesign / 图标 sprite / 面板运行时，生成页面骨架。
 *
 * 用法：
 *   node scripts/aiux-init.mjs [任务目录] [--profile vue-next|mobile-vue] [--page slug:页面名] [--pages slug:页面名,...] [--force]
 *
 * 默认任务目录为当前工作目录下的 .aiux；默认 profile 为 vue-next。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProfile, profileList, writeTaskProfile } from './lib/aiux-profiles.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const RUNTIME_SRC = path.join(PLUGIN_ROOT, 'assets/runtime');

function usage() {
  console.log(`用法：node scripts/aiux-init.mjs [任务目录] [--profile vue-next|mobile-vue] [--page slug:页面名] [--pages slug:页面名,slug2:页面名2] [--force]

可选 profile：${profileList()}

示例：
  node scripts/aiux-init.mjs .aiux --page order-list:订单列表 --page order-detail:订单详情
  node scripts/aiux-init.mjs .aiux --profile mobile-vue --page order-list:订单列表
  node scripts/aiux-init.mjs .aiux --profile mobile-vue --pages order-list:订单列表,order-detail:订单详情
  node scripts/aiux-init.mjs .aiux --force --page order-list:订单列表
`);
}

function parseArgs(argv) {
  const options = { target: '.aiux', pages: [], force: false, help: false, profile: 'vue-next' };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--profile') {
      options.profile = argv[++i];
      if (!options.profile) throw new Error('--profile 需要 vue-next 或 mobile-vue');
    } else if (arg === '--page') {
      const pair = argv[++i];
      if (!pair) throw new Error('--page 需要一个 slug:页面名');
      options.pages.push(pair);
    } else if (arg === '--pages') {
      const list = argv[++i];
      if (!list) throw new Error('--pages 需要 slug:页面名,...');
      options.pages.push(...list.split(',').filter(Boolean));
    } else if (arg.startsWith('-')) {
      throw new Error(`未知参数：${arg}`);
    } else {
      rest.push(arg);
    }
  }
  if (rest.length > 1) throw new Error('只接受一个任务目录');
  if (rest.length === 1) options.target = rest[0];
  return options;
}

function parsePage(pair, index) {
  const raw = String(pair).trim();
  const idx = raw.indexOf(':');
  if (idx <= 0) throw new Error(`页面参数必须是 slug:页面名，收到：${raw}`);
  const slug = raw.slice(0, idx).trim();
  const name = raw.slice(idx + 1).trim();
  if (!slug || !name) throw new Error(`页面参数必须是 slug:页面名，收到：${raw}`);
  const safeSlug = slug.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return {
    slug: safeSlug || `page-${index + 1}`,
    name,
    file: `pages/${safeSlug || `page-${index + 1}`}.html`,
  };
}

function starterSpec(page, profile) {
  const mobile = profile.id === 'mobile-vue';
  const elements = mobile
    ? [
        { name: '顶部导航', component: 'Navbar', anchor: 'page-root' },
        { name: '状态图标', component: 'Icon', anchor: 'page-icon' },
        { name: '信息列表', component: 'Cell', anchor: 'list-area' },
        { name: '空态', component: 'Empty', anchor: 'page-empty' },
        { name: '主操作', component: 'Button', anchor: 'page-primary-action' },
      ]
    : [
        { name: '状态图标', component: 'Icon', anchor: 'page-icon' },
        { name: '空态', component: 'Empty', anchor: 'page-empty' },
        { name: '主操作', component: 'Button', anchor: 'page-primary-action' },
      ];
  const flows = mobile
    ? {
        main: [
          { id: 'I-01', text: '示例：点击条目定位到信息列表', anchor: 'list-area' },
          { id: 'I-02', text: '示例：点击条目定位到主操作', anchor: 'page-primary-action' },
        ],
        exception: [],
      }
    : {
        main: [
          { id: 'I-01', text: '示例：点击条目定位到空态区域', anchor: 'page-empty' },
        ],
        exception: [],
      };
  const actions = mobile
    ? [
        { name: '返回', feedback: '待填写', disabledWhen: '待填写' },
        { name: '主操作', feedback: '待填写', disabledWhen: '待填写' },
      ]
    : [
        { name: '主操作', feedback: '待填写', disabledWhen: '待填写' },
        { name: '示例操作', feedback: '待填写', disabledWhen: '待填写' },
      ];

  return {
    schema: 'aiux/spec@1',
    page: { name: page.name, file: page.file },
    mcp: {
      package: 'tdesign-mcp-server',
      version: '0.2.4',
      framework: profile.framework,
      checkedComponents: mobile
        ? ['Navbar', 'Cell', 'Button', 'Empty', 'Icon']
        : ['Button', 'Empty', 'Icon'],
    },
    summary: [
      mobile ? '移动端空壳页：仅用于确认预览环境可用。' : '空壳页：仅用于确认预览环境可用。',
      '页面内容与交互说明尚未填写。',
    ],
    s1_access: { roles: [], matrix: [], roleDiffs: ['未提供'] },
    s2_ia: { position: '未提供', entries: [], exits: [] },
    s3_page: {
      goal: '待填写',
      elements,
      flows,
      states: {
        default: '待填写',
        loading: '待填写',
        empty: '待填写',
        error: '待填写',
        noPermission: '待填写',
        overLimit: '待填写',
      },
      fields: [],
      actions,
    },
    s4_global: {
      loading: '待填写',
      motion: '待填写',
      shortcuts: '待填写',
      back: '待填写',
      cache: '待填写',
      tokenOverrides: [],
    },
    s5_edge: {
      network: '待填写',
      concurrency: '待填写',
      empty: '待填写',
      timeout: '待填写',
      duplicate: '待填写',
    },
    s6_tracking: { events: [] },
    s7_i18n: {
      languages: '待填写',
      responsive: mobile ? '375 / 390 / 414 × 667 / 812 / 844；触摸目标 ≥ 44px' : '待填写',
      a11y: '待填写',
    },
    openQuestions: [
      { item: '填写本页交互说明后删除这条占位项', reason: 'other', owner: '设计' },
    ],
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyVendor(targetRoot, profile) {
  const vendorDir = path.join(targetRoot, 'vendor');
  const aiuxDir = path.join(vendorDir, 'aiux');
  ensureDir(aiuxDir);

  const files = profile.vendor.map(([name, srcRel]) => [
    name,
    path.join(PLUGIN_ROOT, srcRel),
    path.join(vendorDir, name),
  ]);
  files.push(
    ['aiux-panel.js', path.join(RUNTIME_SRC, 'aiux-panel.js'), path.join(aiuxDir, 'aiux-panel.js')],
    ['aiux-panel.css', path.join(RUNTIME_SRC, 'aiux-panel.css'), path.join(aiuxDir, 'aiux-panel.css')]
  );

  const copied = [];
  for (const [name, src, dest] of files) {
    if (!fs.existsSync(src)) throw new Error(`插件资源缺失：${src}`);
    fs.copyFileSync(src, dest);
    copied.push({ name, size: fs.statSync(dest).size });
  }
  return copied;
}

function writePage(targetRoot, page, force, profile) {
  const dest = path.join(targetRoot, page.file);
  if (fs.existsSync(dest) && !force) {
    return { skipped: true, file: dest };
  }
  ensureDir(path.dirname(dest));
  const skeletonPath = path.join(PLUGIN_ROOT, profile.skeleton);
  if (!fs.existsSync(skeletonPath)) throw new Error(`缺少页面骨架：${skeletonPath}`);
  const skeleton = fs.readFileSync(skeletonPath, 'utf8');
  const spec = starterSpec(page, profile);
  // JSON 里如果出现 </script>，会提前关闭内嵌脚本；用 JSON 合法的 <\/script 转义。
  const specJson = JSON.stringify(spec, null, 2).replace(/<\/script/gi, '<\\/script');
  const html = skeleton
    .split('__PAGE_NAME__').join(page.name)
    .split('__PAGE_FILE__').join(page.file)
    .replace('__PAGE_SPEC__', specJson);
  fs.writeFileSync(dest, html, 'utf8');
  return { skipped: false, file: dest };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const profile = getProfile(options.profile);
  const targetRoot = path.resolve(process.cwd(), options.target);
  ensureDir(targetRoot);
  ensureDir(path.join(targetRoot, 'pages'));
  ensureDir(path.join(targetRoot, 'docs'));

  const profileFile = writeTaskProfile(targetRoot, profile);
  const copied = copyVendor(targetRoot, profile);
  const pages = options.pages.map(parsePage);
  const written = pages.map((page) => ({ ...page, ...writePage(targetRoot, page, options.force, profile) }));

  console.log(`AIUX 预览环境：${targetRoot}`);
  console.log(`Profile：${profile.id}（${profile.label}）· ${profile.tdesignPackage}@${profile.tdesignVersion}`);
  console.log(`任务 profile：${profileFile}`);
  console.log('已复制：');
  for (const f of copied) console.log(`  - vendor/${f.name === 'aiux-panel.js' || f.name === 'aiux-panel.css' ? 'aiux/' : ''}${f.name}  ${(f.size / 1024).toFixed(1)} KB`);
  if (!written.length) {
    console.log('未指定页面。用 --page slug:页面名 生成页面骨架。');
  } else {
    console.log('页面：');
    for (const p of written) {
      console.log(`  - ${p.skipped ? '已存在，跳过' : '已生成'} ${p.file}`);
    }
    console.log(`下一步：查 TDesign MCP（framework=${profile.mcpFramework}）→ 填写页面与 #aiux-spec → 双击 HTML 验证。`);
  }
}

try {
  main();
} catch (err) {
  console.error(`aiux-init 失败：${err.message}`);
  usage();
  process.exit(1);
}
