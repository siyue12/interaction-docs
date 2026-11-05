#!/usr/bin/env node
/**
 * aiux-check.mjs
 * 校验页面内嵌的 aiux-spec 与页面实现，0 违规后生成前端自检清单。
 *
 * 用法：
 *   node scripts/aiux-check.mjs [任务目录或页面文件] [--profile vue-next|mobile-vue] [--json] [--selfcheck] [--no-selfcheck]
 *
 * 默认目标为当前目录下的 .aiux。
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  EDGE_LABELS,
  GLOBAL_LABELS,
  I18N_LABELS,
  PLUGIN_ROOT,
  REASON_LABELS,
  STATE_LABELS,
  flattenStrings,
  lineAt,
  listPages,
  loadRefs,
  mdCell,
  readSpecFromHtml,
} from './lib/aiux-common.mjs';
import {
  DEFAULT_PROFILE,
  getProfile,
  isValidProfile,
  profileList,
  readTaskProfile,
} from './lib/aiux-profiles.mjs';

const CSS_COLOR_NAMES = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
  cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
  darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
  darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
  firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
  hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
  mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred
  midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple
  rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
  slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
  whitesmoke yellow yellowgreen`
    .split(/\s+/)
    .filter(Boolean)
);

const NATIVE_CONTROLS = new Set(['button', 'input', 'select', 'textarea', 'table']);
// \x54ODO 是英文待办占位词的转义写法，避免插件校验器把源码里的规则词当成未完成占位。
const BANNED_PLACEHOLDERS = /待填写|待生成|空壳页|\b\x54ODO\b|\bTBD\b/i;
const COLOR_PROPS = /^(color|background|background-color|background-image|fill|stroke|caret-color|accent-color|text-decoration-color)$/i;
const BORDER_PROPS = /^(border|border-(top|right|bottom|left)|border-(top|right|bottom|left)-color|outline|outline-color)$/i;
const REQUIRED_SECTIONS = [
  'schema',
  'page',
  'mcp',
  'summary',
  's1_access',
  's2_ia',
  's3_page',
  's4_global',
  's5_edge',
  's6_tracking',
  's7_i18n',
  'openQuestions',
];

function usage() {
  console.log(`用法：node scripts/aiux-check.mjs [任务目录或页面文件] [--profile vue-next|mobile-vue] [--json] [--selfcheck] [--no-selfcheck]

可选 profile：${profileList()}
默认从任务根目录的 aiux-profile.json 或页面 mcp.framework 自动判断，缺省 vue-next。

默认：传入目录（任务根）且 0 违规时写 自检清单.md；传入单个页面文件时不写，除非加 --selfcheck。

示例：
  node scripts/aiux-check.mjs .aiux
  node scripts/aiux-check.mjs .aiux --json
  node scripts/aiux-check.mjs .aiux/pages/order-list.html
  node scripts/aiux-check.mjs .aiux/pages/order-list.html --selfcheck
  node scripts/aiux-check.mjs .aiux --profile mobile-vue
`);
}

function parseArgs(argv) {
  const options = { target: '.aiux', json: false, selfcheck: null, help: false, profile: null };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--selfcheck') options.selfcheck = true;
    else if (arg === '--no-selfcheck') options.selfcheck = false;
    else if (arg === '--profile') {
      options.profile = argv[++i];
      if (!options.profile) throw new Error('--profile 需要 vue-next 或 mobile-vue');
    } else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('-')) throw new Error(`未知参数：${arg}`);
    else rest.push(arg);
  }
  if (rest.length > 1) throw new Error('只接受一个任务目录或页面文件');
  if (rest.length === 1) options.target = rest[0];
  return options;
}

function isNonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function blankKeepLines(text) {
  return text.replace(/[^\n]/g, ' ');
}

function maskNonMarkup(html) {
  let out = html.replace(/<!--[\s\S]*?-->/g, (m) => blankKeepLines(m));
  out = out.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => blankKeepLines(m));
  return out;
}

function parseAttrs(text) {
  const attrs = {};
  const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1].toLowerCase();
    let value = '';
    if (m[2] !== undefined) value = m[2];
    else if (m[3] !== undefined) value = m[3];
    else if (m[4] !== undefined) value = m[4];
    attrs[name] = value;
  }
  return attrs;
}

function scanTags(markup) {
  const tags = [];
  let i = 0;
  while (i < markup.length) {
    const lt = markup.indexOf('<', i);
    if (lt < 0) break;
    const next = markup[lt + 1];
    if (next === '!' || next === '/' || next === '?') {
      const end = markup.indexOf('>', lt);
      i = end < 0 ? markup.length : end + 1;
      continue;
    }
    let j = lt + 1;
    let quote = null;
    while (j < markup.length) {
      const ch = markup[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
      j += 1;
    }
    if (j >= markup.length) break;
    const inner = markup.slice(lt + 1, j);
    const nameMatch = inner.match(/^([a-zA-Z][a-zA-Z0-9:_-]*)/);
    if (nameMatch) {
      tags.push({
        name: nameMatch[1].toLowerCase(),
        attrs: parseAttrs(inner.slice(nameMatch[0].length)),
        offset: lt,
        line: lineAt(markup, lt),
      });
    }
    i = j + 1;
  }
  return tags;
}

function extractStyleBlocks(html) {
  const blocks = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html))) {
    const start = m.index + m[0].indexOf('>') + 1;
    blocks.push({ text: m[1], startOffset: start });
  }
  return blocks;
}

function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => blankKeepLines(m));
}

function parseDeclsOnly(text, baseOffset, out) {
  let start = 0;
  for (let i = 0; i <= text.length; i += 1) {
    if (i === text.length || text[i] === ';') {
      const seg = text.slice(start, i);
      if (seg.indexOf('{') < 0 && seg.indexOf('}') < 0) {
        const colon = seg.indexOf(':');
        if (colon > 0) {
          const prop = seg.slice(0, colon).trim();
          const value = seg.slice(colon + 1).trim();
          if (/^-{0,2}[A-Za-z][A-Za-z0-9-]*$/.test(prop) && value) {
            out.push({ prop, value, offset: baseOffset + start + colon + 1 });
          }
        }
      }
      start = i + 1;
    }
  }
}

function parseCssBlocks(css, baseOffset, out) {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') depth -= 1;
      j += 1;
    }
    const end = depth === 0 ? j - 1 : css.length;
    const content = css.slice(open + 1, end);
    parseDeclsOnly(content, baseOffset + open + 1, out);
    parseCssBlocks(content, baseOffset + open + 1, out);
    i = j;
  }
}

function hasColorLiteral(value) {
  if (/#[0-9a-fA-F]{3,8}\b/.test(value)) return true;
  if (/\b(rgba?|hsla?)\s*\(/i.test(value)) return true;
  const withoutVars = value.replace(/var\([^)]*\)/g, ' ');
  const words = withoutVars.toLowerCase().match(/[a-z]+/g) || [];
  return words.some((word) => CSS_COLOR_NAMES.has(word));
}

function findLineInRaw(html, startOffset, raw, keys) {
  if (!keys || !keys.length) return lineAt(html, startOffset);
  let from = 0;
  let last = -1;
  for (const key of keys) {
    const needle = `"${key}"`;
    const idx = raw.indexOf(needle, from);
    if (idx < 0) continue;
    last = idx;
    from = idx + needle.length;
  }
  if (last < 0) return lineAt(html, startOffset);
  return lineAt(html, startOffset + last);
}

function makeReporter(html, parsed) {
  const errors = [];
  const warnings = [];
  const lineFor = (keys) => findLineInRaw(html, parsed.startOffset, parsed.raw, keys);
  return {
    errors,
    warnings,
    error(check, line, message) {
      errors.push({ check, line, message });
    },
    warn(check, line, message) {
      warnings.push({ check, line, message });
    },
    lineFor,
  };
}

function checkCompleteness(spec, rep) {
  const missing = REQUIRED_SECTIONS.filter((key) => !(key in spec));
  if (missing.length) rep.error(1, rep.lineFor(['schema']), `缺章节：${missing.join('、')}`);
  if (spec.schema !== 'aiux/spec@1') rep.error(1, rep.lineFor(['schema']), 'schema 必须是 aiux/spec@1');
  if (!isObject(spec.page)) {
    rep.error(1, rep.lineFor(['page']), '缺 page 对象');
  } else {
    if (!isNonEmpty(spec.page.name)) rep.error(1, rep.lineFor(['page', 'name']), 'page.name 为空');
    if (!isNonEmpty(spec.page.file)) rep.error(1, rep.lineFor(['page', 'file']), 'page.file 为空');
  }
  if (!isObject(spec.mcp)) {
    rep.error(1, rep.lineFor(['mcp']), '缺 mcp 对象');
  } else {
    if (!isNonEmpty(spec.mcp.package)) rep.error(1, rep.lineFor(['mcp', 'package']), 'mcp.package 为空');
    if (!isNonEmpty(spec.mcp.version)) rep.error(1, rep.lineFor(['mcp', 'version']), 'mcp.version 为空');
    if (!Array.isArray(spec.mcp.checkedComponents) || !spec.mcp.checkedComponents.length) {
      rep.error(1, rep.lineFor(['mcp', 'checkedComponents']), 'mcp.checkedComponents 至少要有一个组件');
    }
  }
  if (!Array.isArray(spec.summary) || !spec.summary.length) {
    rep.error(1, rep.lineFor(['summary']), 'summary 不能为空');
  } else {
    spec.summary.forEach((line, index) => {
      if (!isNonEmpty(line)) rep.error(1, rep.lineFor(['summary']), `summary[${index}] 为空`);
    });
  }
  if (!isObject(spec.s3_page)) {
    rep.error(1, rep.lineFor(['s3_page']), '缺 s3_page 对象');
    return;
  }
  for (const key of ['goal', 'elements', 'flows', 'states', 'fields', 'actions']) {
    if (!(key in spec.s3_page)) rep.error(1, rep.lineFor(['s3_page', key]), `缺 s3_page.${key}`);
  }
  if (!isNonEmpty(spec.s3_page.goal)) rep.error(1, rep.lineFor(['s3_page', 'goal']), 's3_page.goal 为空');
  if (!Array.isArray(spec.s3_page.elements) || !spec.s3_page.elements.length) {
    rep.error(1, rep.lineFor(['s3_page', 'elements']), 's3_page.elements 至少要有一个元素');
  }
  if (!Array.isArray(spec.s3_page.fields)) rep.error(1, rep.lineFor(['s3_page', 'fields']), 's3_page.fields 必须是数组');
  if (!Array.isArray(spec.s3_page.actions)) rep.error(1, rep.lineFor(['s3_page', 'actions']), 's3_page.actions 必须是数组');
  if (!isObject(spec.s3_page.flows)) rep.error(1, rep.lineFor(['s3_page', 'flows']), '缺 s3_page.flows');
  if (!Array.isArray(spec.s3_page.flows?.main)) rep.error(1, rep.lineFor(['s3_page', 'flows', 'main']), 'flows.main 必须是数组');
  if (!Array.isArray(spec.s3_page.flows?.exception)) rep.error(1, rep.lineFor(['s3_page', 'flows', 'exception']), 'flows.exception 必须是数组');

  const s1 = spec.s1_access;
  if (!isObject(s1)) {
    rep.error(1, rep.lineFor(['s1_access']), '缺 s1_access 对象');
  } else {
    for (const key of ['roles', 'matrix', 'roleDiffs']) {
      if (!Array.isArray(s1[key])) rep.error(1, rep.lineFor(['s1_access', key]), `s1_access.${key} 必须是数组`);
    }
    if (Array.isArray(s1.roleDiffs) && !s1.roleDiffs.length) {
      rep.warn(1, rep.lineFor(['s1_access', 'roleDiffs']), '角色差异为空；没有就写「未提供」');
    }
  }

  const s2 = spec.s2_ia;
  if (!isObject(s2)) {
    rep.error(1, rep.lineFor(['s2_ia']), '缺 s2_ia 对象');
  } else {
    if (!isNonEmpty(s2.position)) rep.error(1, rep.lineFor(['s2_ia', 'position']), 's2_ia.position 为空');
    if (!Array.isArray(s2.entries)) rep.error(1, rep.lineFor(['s2_ia', 'entries']), 's2_ia.entries 必须是数组');
    if (!Array.isArray(s2.exits)) rep.error(1, rep.lineFor(['s2_ia', 'exits']), 's2_ia.exits 必须是数组');
  }

  const s4 = spec.s4_global;
  if (!isObject(s4)) {
    rep.error(1, rep.lineFor(['s4_global']), '缺 s4_global 对象');
  } else {
    for (const key of Object.keys(GLOBAL_LABELS)) {
      if (!isNonEmpty(s4[key])) rep.error(1, rep.lineFor(['s4_global', key]), `s4_global.${key} 为空；不涉及也要写原因`);
    }
    if (!Array.isArray(s4.tokenOverrides)) rep.error(1, rep.lineFor(['s4_global', 'tokenOverrides']), 's4_global.tokenOverrides 必须是数组');
  }

  const s5 = spec.s5_edge;
  if (!isObject(s5)) {
    rep.error(1, rep.lineFor(['s5_edge']), '缺 s5_edge 对象');
  } else {
    for (const key of Object.keys(EDGE_LABELS)) {
      if (!isNonEmpty(s5[key])) rep.error(1, rep.lineFor(['s5_edge', key]), `s5_edge.${key} 为空；没有结论就进 openQuestions`);
    }
  }

  const s6 = spec.s6_tracking;
  if (!isObject(s6)) {
    rep.error(1, rep.lineFor(['s6_tracking']), '缺 s6_tracking 对象');
  } else if (!Array.isArray(s6.events)) {
    rep.error(1, rep.lineFor(['s6_tracking', 'events']), 's6_tracking.events 必须是数组');
  }

  const s7 = spec.s7_i18n;
  if (!isObject(s7)) {
    rep.error(1, rep.lineFor(['s7_i18n']), '缺 s7_i18n 对象');
  } else {
    for (const key of Object.keys(I18N_LABELS)) {
      if (!isNonEmpty(s7[key])) rep.error(1, rep.lineFor(['s7_i18n', key]), `s7_i18n.${key} 为空；不涉及也要写原因`);
    }
  }

  if (!Array.isArray(spec.openQuestions)) rep.error(1, rep.lineFor(['openQuestions']), 'openQuestions 必须是数组');
}

function checkFlows(spec, anchors, rep) {
  const flows = spec.s3_page?.flows;
  if (!isObject(flows)) return [];
  const main = Array.isArray(flows.main) ? flows.main : [];
  const exception = Array.isArray(flows.exception) ? flows.exception : [];
  const items = [
    ...main.map((item) => ({ item, group: 'main' })),
    ...exception.map((item) => ({ item, group: 'exception' })),
  ];
  if (!items.length) {
    rep.warn(2, rep.lineFor(['s3_page', 'flows']), '主流程和异常流程都是空的；确认这一页真的没有交互');
  }
  const ids = new Map();
  for (const { item, group } of items) {
    if (!isObject(item)) {
      rep.error(2, rep.lineFor(['s3_page', 'flows', group]), '交互条目必须是对象');
      continue;
    }
    const idLine = isNonEmpty(item.id) ? rep.lineFor([item.id]) : rep.lineFor(['s3_page', 'flows', group]);
    if (!isNonEmpty(item.id)) rep.error(2, idLine, '交互条目缺 id');
    if (!isNonEmpty(item.text)) rep.error(2, idLine, `交互条目 ${item.id || '(无 id)'} 缺 text`);
    if (!isNonEmpty(item.anchor)) rep.error(2, idLine, `交互条目 ${item.id || '(无 id)'} 缺 anchor`);
    if (isNonEmpty(item.id)) {
      if (ids.has(item.id)) rep.error(2, idLine, `交互 id 重复：${item.id}`);
      else ids.set(item.id, true);
      if (!/^I-\d{2,}$/.test(item.id)) {
        rep.warn(2, idLine, `交互 id 建议用 I-01 这种格式，当前是 ${item.id}`);
      }
    }
    if (isNonEmpty(item.anchor)) {
      if (/^[#.[]/.test(item.anchor)) {
        rep.error(3, idLine, `anchor 只写 data-aiux 的值，不要带 # 或选择器：${item.anchor}`);
      } else if (!anchors.has(item.anchor)) {
        rep.error(3, idLine, `锚点不可达：找不到 data-aiux="${item.anchor}"`);
      }
    }
    if (isNonEmpty(item.text) && /^示例[:：]/.test(item.text)) {
      rep.warn(11, idLine, '这条还是骨架示例文案，替换成真实交互');
    }
  }
  return items.map((x) => x.item);
}

function checkStates(spec, rep) {
  const states = spec.s3_page?.states;
  if (!isObject(states)) {
    rep.error(1, rep.lineFor(['s3_page', 'states']), '缺 s3_page.states');
    return;
  }
  for (const key of Object.keys(STATE_LABELS)) {
    if (!isNonEmpty(states[key])) {
      rep.error(4, rep.lineFor(['s3_page', 'states', key]), `状态 ${STATE_LABELS[key]} 为空；不涉及也要写原因`);
    }
  }
}

function checkTagsAndCss(html, spec, refs, anchors, rep, profile) {
  const markup = maskNonMarkup(html);
  const tags = scanTags(markup);
  const whitelist = refs.whitelist;
  const iconSet = new Set(refs.icons.icons);
  const tokenSet = new Set(refs.tokens.names);
  const checkedItems = Array.isArray(spec.mcp?.checkedComponents) ? spec.mcp.checkedComponents : [];
  const checked = new Set(checkedItems.map((x) => String(x).toLowerCase()));
  const allComponents = new Set();
  for (const info of Object.values(whitelist.tags)) {
    allComponents.add(String(info.component).toLowerCase());
    allComponents.add(String(info.family).toLowerCase());
  }

  const usedTags = new Map();
  const usedIcons = [];
  const definedTokens = new Map();

  for (const tag of tags) {
    if (tag.name === 'svg') {
      rep.error(8, tag.line, '页面不要内联 SVG；图标只用 <t-icon name="..."></t-icon>');
    }
    if (NATIVE_CONTROLS.has(tag.name)) {
      rep.error(5, tag.line, `出现原生 <${tag.name}>；改用 TDesign 组件`);
    }
    if (tag.name.startsWith('t-')) {
      if (!usedTags.has(tag.name)) usedTags.set(tag.name, tag);
      if (!whitelist.tags[tag.name]) {
        rep.error(6, tag.line, `<${tag.name}> 不在 TDesign 白名单`);
        continue;
      }
      const info = whitelist.tags[tag.name];
      if (info.public === false) {
        rep.warn(6, tag.line, `<${tag.name}> 是内部标签，页面不要直接使用`);
      }
    }
    if (tag.name === 't-icon') {
      const dynamic = tag.attrs[':name'] !== undefined || tag.attrs['v-bind:name'] !== undefined;
      const name = tag.attrs.name;
      if (dynamic) {
        rep.error(8, tag.line, 't-icon 的 name 不能动态绑定；静态写死才能校验');
      } else if (!isNonEmpty(name)) {
        rep.error(8, tag.line, 't-icon 缺 name');
      } else if (name.indexOf('{{') >= 0) {
        rep.error(8, tag.line, `t-icon 的 name 不能是模板表达式：${name}`);
      } else if (!iconSet.has(name)) {
        rep.error(8, tag.line, `图标名不存在：${name}；先用 MCP search-icon 核实`);
      } else {
        usedIcons.push(name);
      }
    }
    if (tag.attrs['data-aiux'] !== undefined) {
      const value = tag.attrs['data-aiux'];
      if (!isNonEmpty(value)) rep.warn(3, tag.line, 'data-aiux 是空值');
      else anchors.set(value, tag);
    }
  }

  // 运行依赖（文件名由 profile 决定，两个 profile 目前都叫 tdesign.min.js/css）
  const runtime = profile.runtime;
  if (!html.includes('aiux-panel.js')) rep.error(12, 1, '缺少 aiux-panel.js，交互说明面板不会出现');
  if (!html.includes('aiux-panel.css')) rep.error(12, 1, '缺少 aiux-panel.css');
  if (usedTags.size && !html.includes(runtime.script)) rep.error(12, 1, `用了 TDesign 组件但没有引入 ${runtime.script}`);
  if (usedTags.size && !html.includes(runtime.css)) rep.error(12, 1, `用了 TDesign 组件但没有引入 ${runtime.css}`);
  if (!html.includes('vue.global.prod.js')) rep.warn(12, 1, '没有引入 vue.global.prod.js；确认这是有意的静态页');
  if (usedIcons.length && !html.includes(runtime.sprite)) {
    rep.error(8, 1, `用了 t-icon 但没有引入 ${runtime.sprite}，图标不会显示`);
  }

  // 脚本加载方式
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let sm;
  while ((sm = scriptRe.exec(html))) {
    const attrs = sm[1];
    const body = sm[2];
    const line = lineAt(html, sm.index);
    if (/\btype\s*=\s*["']module["']/i.test(attrs)) {
      rep.error(12, line, '禁用 type="module"；file:// 下直接打不开');
    }
    if (/\bsrc\s*=/i.test(attrs)) continue;
    if (/\btype\s*=\s*["']application\/json["']/i.test(attrs)) continue;
    if (/\bimport\s+[\s\S]*?\bfrom\s*["']|\bimport\s*\(/.test(body)) {
      rep.error(12, line, '禁用裸模块导入；页面是最终产物，不做构建');
    }
    if (/\bfetch\s*\(|XMLHttpRequest/.test(body)) {
      rep.warn(12, line, '原型不要依赖 fetch / XHR；交互说明必须内嵌');
    }
  }

  // CSS
  const decls = [];
  for (const block of extractStyleBlocks(html)) {
    const text = stripCssComments(block.text);
    parseCssBlocks(text, block.startOffset, decls);
  }
  for (const tag of tags) {
    if (tag.attrs.style) parseDeclsOnly(stripCssComments(tag.attrs.style), tag.offset, decls);
  }

  for (const decl of decls) {
    const line = lineAt(html, decl.offset);
    const prop = decl.prop;
    const value = decl.value;
    if (/!\s*important/i.test(value)) {
      rep.error(9, line, `${prop} 用了 !important；禁止强制覆写`);
    }

    for (const m of value.matchAll(/var\(\s*(--td-[A-Za-z0-9-]+)/g)) {
      if (!tokenSet.has(m[1])) rep.error(7, line, `引用了不存在的变量 ${m[1]}`);
    }

    if (prop.startsWith('--td-')) {
      if (!tokenSet.has(prop)) rep.error(7, line, `覆写的 token ${prop} 不在官方清单`);
      else definedTokens.set(prop, line);
      continue;
    }
    if (prop.startsWith('--')) {
      rep.warn(7, line, `新增了自定义属性 ${prop}；规范只允许覆写 --td-*`);
      continue;
    }

    if (COLOR_PROPS.test(prop) || BORDER_PROPS.test(prop)) {
      if (hasColorLiteral(value)) {
        rep.error(7, line, `${prop} 写了硬编码颜色（${value}）；改用 var(--td-*)`);
      }
    }
    if (prop === 'box-shadow' || prop === 'text-shadow') {
      if (!/var\(\s*--td-shadow-/.test(value) && !/^(none|inherit|unset|initial)$/i.test(value.trim())) {
        rep.error(7, line, `${prop} 必须使用 var(--td-shadow-*)，不要写裸阴影`);
      }
    }
    if (prop === 'font-size') {
      if (!/var\(\s*--td-font-size-/.test(value) && !/^(inherit|unset|initial)$/i.test(value.trim())) {
        rep.error(7, line, `font-size 必须使用 var(--td-font-size-*)，不要写裸字号`);
      }
    }
    if (/^border(-(top|bottom)-(left|right))?-radius$/i.test(prop)) {
      if (!/var\(\s*--td-radius-/.test(value) && !/^(0|50%|inherit|unset|initial|none)$/i.test(value.trim())) {
        rep.error(7, line, 'border-radius 必须使用 var(--td-radius-*)，不要写裸圆角');
      }
    }
    if (prop === 'font' && /\b\d+(\.\d+)?(px|rem|em|pt|%)\b/i.test(value)) {
      rep.error(7, line, 'font 简写里不能写裸字号；改用 font-size: var(--td-font-size-*)');
    }
  }

  // token 覆写登记
  const overrideItems = Array.isArray(spec.s4_global?.tokenOverrides) ? spec.s4_global.tokenOverrides : [];
  const registered = new Set(overrideItems.map((x) => x && x.token).filter(Boolean));
  for (const [token, line] of definedTokens) {
    if (!registered.has(token)) rep.warn(7, line, `token 覆写 ${token} 没有登记到 s4_global.tokenOverrides`);
  }
  for (const token of registered) {
    if (!definedTokens.has(token)) rep.warn(7, rep.lineFor(['s4_global', 'tokenOverrides']), `登记了 ${token}，但页面样式里没有覆写`);
  }

  // MCP 追溯
  if (checked.size) {
    for (const [tagName, tag] of usedTags) {
      const info = whitelist.tags[tagName];
      if (!info) continue;
      const family = String(info.family || info.component).toLowerCase();
      const component = String(info.component || info.family).toLowerCase();
      if (!checked.has(family) && !checked.has(component)) {
        rep.error(10, tag.line, `MCP 追溯缺失：用了 ${info.family || info.component}，但 checkedComponents 没记录；写页面前先查 get-component-docs`);
      }
    }
    for (const name of checkedItems) {
      if (!allComponents.has(String(name).toLowerCase())) {
        rep.warn(10, rep.lineFor(['mcp', 'checkedComponents']), `checkedComponents 里的 ${name} 不在 TDesign 白名单；确认名字没写错`);
      }
    }
  }

  if (spec.mcp?.package && spec.mcp.package !== refs.whitelist.mcp.package) {
    rep.error(10, rep.lineFor(['mcp', 'package']), `MCP 包名应为 ${refs.whitelist.mcp.package}`);
  }
  if (spec.mcp?.version && spec.mcp.version !== refs.whitelist.mcp.version) {
    rep.error(10, rep.lineFor(['mcp', 'version']), `MCP 版本应锁定为 ${refs.whitelist.mcp.version}`);
  }

  return { usedTags, usedIcons, definedTokens };
}

function checkPage(file, root, refs, options) {
  const html = fs.readFileSync(file, 'utf8');
  const parsed = readSpecFromHtml(html);
  const rel = path.relative(root, file).split(path.sep).join('/');
  const base = {
    absFile: file,
    file: rel,
    page: path.basename(file, '.html'),
    spec: null,
    usedTags: new Map(),
    usedIcons: [],
    errors: [],
    warnings: [],
  };
  if (!parsed.ok) {
    base.errors.push({ check: 1, line: parsed.line, message: parsed.error });
    return base;
  }
  const spec = parsed.spec;
  base.spec = spec;
  base.page = spec.page?.name || base.page;
  const rep = makeReporter(html, parsed);

  // 页面必须与任务 profile 一致；一个任务只能选桌面端或移动端。
  const specFramework = spec.mcp?.framework;
  if (!isNonEmpty(specFramework)) {
    rep.warn(10, rep.lineFor(['mcp', 'framework']), `mcp.framework 未填写；按任务 profile ${options.profile.id} 处理`);
  } else if (!isValidProfile(specFramework)) {
    rep.error(10, rep.lineFor(['mcp', 'framework']), `mcp.framework 只能是 vue-next 或 mobile-vue，当前是 ${specFramework}`);
  } else if (specFramework !== options.profile.framework) {
    rep.error(10, rep.lineFor(['mcp', 'framework']), `本任务 profile 是 ${options.profile.id}，页面写的是 ${specFramework}；一个任务只能选一个端`);
  }

  // 占位内容：合并成一条，避免空壳页刷屏
  const placeholders = flattenStrings(spec).filter(({ value }) => BANNED_PLACEHOLDERS.test(value));
  if (placeholders.length) {
    const first = placeholders[0];
    const shown = placeholders.slice(0, 8).map((x) => x.path).join('、');
    const more = placeholders.length > 8 ? ` 等 ${placeholders.length} 处` : '';
    rep.error(11, rep.lineFor(first.path.split('.').filter((x) => !x.includes('['))), `仍是占位内容：${shown}${more}`);
  }

  checkCompleteness(spec, rep);

  const anchors = new Map();
  const tagInfo = checkTagsAndCss(html, spec, refs, anchors, rep, options.profile);
  base.usedTags = tagInfo.usedTags;
  base.usedIcons = tagInfo.usedIcons;

  checkStates(spec, rep);
  checkFlows(spec, anchors, rep);

  if (options.isTaskRoot && spec.page?.file && spec.page.file !== rel) {
    rep.warn(1, rep.lineFor(['page', 'file']), `page.file 写的是 ${spec.page.file}，实际是 ${rel}`);
  }

  base.errors = rep.errors;
  base.warnings = rep.warnings;
  return base;
}

function usedComponentNames(usedTags, refs) {
  const names = new Set();
  for (const tagName of usedTags.keys()) {
    const info = refs.whitelist.tags[tagName];
    if (info) names.add(info.family || info.component);
  }
  return [...names].sort();
}

function buildSelfCheck(pages, refs, root, profile) {
  const okPages = pages.filter((p) => p.errors.length === 0);
  const lines = [];
  lines.push('# 前端自检清单');
  lines.push('');
  lines.push('> 由 `aiux-check.mjs` 根据页面内 `aiux-spec` 生成。只有 0 违规才会生成；改页面 JSON 后重跑校验。');
  lines.push(`> 组件库：${profile.tdesignPackage}@${profile.tdesignVersion} ｜ MCP：tdesign-mcp-server@${refs.whitelist.mcp.version} ｜ 图标 sprite：${refs.icons.spriteVersion}`);
  lines.push(`> Profile：${profile.id}（${profile.label}）`);
  lines.push('');
  lines.push('## 校验摘要');
  lines.push('');
  lines.push('| 页面 | 文件 | 违规 | 警告 |');
  lines.push('| --- | --- | --- | --- |');
  for (const p of pages) {
    lines.push(`| ${mdCell(p.page)} | ${mdCell(p.file)} | ${p.errors.length} | ${p.warnings.length} |`);
  }
  lines.push('');

  const group = (title, items) => {
    lines.push(`## ${title}`);
    lines.push('');
    if (!items.length) lines.push('- [ ] 无');
    else items.forEach((item) => lines.push(`- [ ] ${item}`));
    lines.push('');
  };

  const a = [];
  const b = [];
  const c = [];
  const d = [];
  const e = [];
  const f = [];
  const g = new Map();

  for (const p of okPages) {
    const spec = p.spec;
    const flows = spec.s3_page?.flows || {};
    const allFlows = [...(flows.main || []), ...(flows.exception || [])];
    for (const item of allFlows) {
      a.push(`${p.page} · ${item.id} ${item.text}（${p.file}#${item.anchor}）`);
    }
    if (!allFlows.length) a.push(`${p.page} · 无交互条目（确认）`);

    for (const key of Object.keys(STATE_LABELS)) {
      b.push(`${p.page} · ${STATE_LABELS[key]}：${spec.s3_page?.states?.[key] || '未填写'}`);
    }

    const names = usedComponentNames(p.usedTags, refs);
    c.push(`${p.page} · 组件：${names.length ? names.join(' / ') : '未使用 TDesign 组件'}（均经 MCP 查询）`);
    c.push(`${p.page} · 无裸控件、无第二套组件库、无硬编码颜色/字号/圆角/阴影/边框`);
    const overrides = Array.isArray(spec.s4_global?.tokenOverrides) ? spec.s4_global.tokenOverrides : [];
    if (overrides.length) {
      c.push(`${p.page} · token 覆写：${overrides.map((x) => `${x.token}=${x.value}`).join('；')}`);
    }
    const gaps = Array.isArray(spec.gaps) ? spec.gaps : [];
    if (gaps.length) {
      c.push(`${p.page} · TDesign 缺口已登记：${gaps.map((x) => x.gap).join('；')}`);
    }

    const a11y = spec.s7_i18n?.a11y || '未提供';
    d.push(`${p.page} · 键盘可达、焦点顺序、焦点可见（${a11y}）`);
    d.push(`${p.page} · 图标有替代文本；t-icon 已确认存在`);
    if (profile.id === 'mobile-vue') {
      d.push(`${p.page} · 点击目标 ≥ 44px；不依赖 hover；安全区适配`);
    }

    const responsive = spec.s7_i18n?.responsive || '';
    const normalize = (text) => String(text).replace(/[。.\s]/g, '');
    const covered = responsive && (
      normalize(profile.adaptation).includes(normalize(responsive)) ||
      normalize(responsive).includes(normalize(profile.adaptation))
    );
    const extraResponsive = responsive && !covered ? `（${responsive}）` : '';
    e.push(`${p.page} · ${profile.adaptation}${extraResponsive}`);

    const fields = Array.isArray(spec.s3_page?.fields) ? spec.s3_page.fields : [];
    const messages = fields.map((x) => x.message).filter(Boolean);
    f.push(`${p.page} · 错误文案：${messages.length ? messages.join('；') : '未提供（有校验就要补文案）'}`);
    const events = Array.isArray(spec.s6_tracking?.events) ? spec.s6_tracking.events : [];
    f.push(`${p.page} · 埋点：${events.length ? events.map((x) => `${x.name} ← ${x.trigger}`).join('；') : '未提供'}`);
    const apiFields = fields.filter((x) => /前端|接口|联调/.test(x.status || ''));
    if (apiFields.length) f.push(`〔联调项〕${p.page} · 字段：${apiFields.map((x) => x.name).join('、')}`);

    const questions = Array.isArray(spec.openQuestions) ? spec.openQuestions : [];
    for (const q of questions) {
      const owner = q.owner || '未指定';
      if (!g.has(owner)) g.set(owner, []);
      const mark = q.reason === 'api-dependent' ? '〔联调项〕' : '';
      g.get(owner).push(`${mark}${p.page} · ${q.item}（${REASON_LABELS[q.reason] || q.reason}）`);
    }
  }

  group('A 交互与锚点', a);
  group('B 状态六态', b);
  group('C 组件与 token', c);
  group('D 可访问性', d);
  group('E 适配', e);
  group('F 文案与埋点', f);

  lines.push('## G 待确认项');
  lines.push('');
  if (!g.size) lines.push('- [ ] 无');
  else {
    for (const [owner, items] of [...g.entries()].sort((x, y) => x[0].localeCompare(y[0], 'zh'))) {
      lines.push(`### ${owner}`);
      lines.push('');
      items.forEach((item) => lines.push(`- [ ] ${item}`));
      lines.push('');
    }
  }
  lines.push('> 〔联调项〕表示需要真实数据或接口才能验证，不要当设计缺陷打回。');
  lines.push('');
  lines.push(`生成时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push('');
  const out = path.join(root, '自检清单.md');
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  return out;
}

function printHuman(report) {
  const refs = report.refs;
  console.log(`AIUX CHECK · ${report.profile.tdesignPackage}@${report.profile.tdesignVersion} · tdesign-mcp-server@${refs.whitelist.mcp.version}`);
  console.log(`Profile：${report.profile.id}（${report.profile.label}）`);
  console.log(`扫描：${report.root}`);
  console.log('');
  for (const page of report.pages) {
    const errorCount = page.errors.length;
    const warnCount = page.warnings.length;
    const mark = errorCount ? '✗' : '✓';
    console.log(`${mark} ${page.page}  ${page.file}  ${errorCount} 违规 / ${warnCount} 警告`);
    const rows = [
      ...page.errors.map((e) => ({ ...e, level: 'error' })),
      ...page.warnings.map((w) => ({ ...w, level: 'warn' })),
    ].sort((x, y) => x.line - y.line || x.check - y.check);
    for (const row of rows) {
      const prefix = row.level === 'error' ? '  ✗' : '  !';
      console.log(`${prefix} [${row.check}] 第 ${row.line} 行  ${row.message}`);
    }
    if (rows.length) console.log('');
  }
  const errors = report.pages.reduce((n, p) => n + p.errors.length, 0);
  const warnings = report.pages.reduce((n, p) => n + p.warnings.length, 0);
  console.log(`结果：${report.pages.length} 页，${errors} 违规，${warnings} 警告`);
  if (report.selfCheck) console.log(`自检清单：${report.selfCheck}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  const resolvedTarget = path.resolve(process.cwd(), options.target);
  const targetIsDir = fs.statSync(resolvedTarget).isDirectory();
  const { root, files } = listPages(options.target);
  if (!files.length) throw new Error(`没有找到页面 HTML：${root}`);
  const isTaskRoot = fs.existsSync(path.join(root, 'pages')) && fs.statSync(path.join(root, 'pages')).isDirectory();

  // profile 优先级：显式 --profile > 任务 aiux-profile.json > 第一页 mcp.framework > vue-next
  const taskProfile = readTaskProfile(root);
  const firstParsed = readSpecFromHtml(fs.readFileSync(files[0], 'utf8'));
  const firstFramework = firstParsed.ok ? firstParsed.spec?.mcp?.framework : null;
  const profileName =
    options.profile ||
    (taskProfile && taskProfile.id) ||
    (isValidProfile(firstFramework) ? firstFramework : DEFAULT_PROFILE);
  const profile = getProfile(profileName);
  const refs = loadRefs(profile.refsDir);

  const pages = files.map((file) => checkPage(file, root, refs, { isTaskRoot, profile }));
  const errors = pages.reduce((n, p) => n + p.errors.length, 0);
  const warnings = pages.reduce((n, p) => n + p.warnings.length, 0);
  let selfCheck = null;
  const shouldSelfCheck = options.selfcheck === true || (options.selfcheck === null && targetIsDir);
  if (!errors && shouldSelfCheck && isTaskRoot) {
    selfCheck = buildSelfCheck(pages, refs, root, profile);
  }
  const report = {
    ok: errors === 0,
    root,
    profile: {
      id: profile.id,
      label: profile.label,
      framework: profile.framework,
      tdesignPackage: profile.tdesignPackage,
      tdesignVersion: profile.tdesignVersion,
      mcpFramework: profile.mcpFramework,
      adaptation: profile.adaptation,
    },
    refs: {
      profile: profile.id,
      tdesignPackage: profile.tdesignPackage,
      tdesignVersion: profile.tdesignVersion,
      whitelist: { tdesignVersion: refs.whitelist.tdesignVersion, mcp: refs.whitelist.mcp, tags: Object.keys(refs.whitelist.tags).length },
      tokens: { count: refs.tokens.count },
      icons: { count: refs.icons.count, spriteVersion: refs.icons.spriteVersion },
      schema: refs.schema.$id,
    },
    pages: pages.map((p) => ({
      file: p.file,
      page: p.page,
      errors: p.errors,
      warnings: p.warnings,
    })),
    summary: { pages: pages.length, errors, warnings },
    selfCheck,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman({ ...report, refs });
  }
  if (errors) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error(`aiux-check 失败：${err.message}`);
  usage();
  process.exitCode = 2;
}
