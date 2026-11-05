import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * 一个任务只能选一个 profile。桌面端和移动端共用 Vue 3 与图标 sprite，
 * 但 TDesign 组件包、白名单、token 和页面骨架不同。
 */
export const PROFILES = {
  'vue-next': {
    id: 'vue-next',
    label: '桌面端 Vue Next',
    framework: 'vue-next',
    mcpFramework: 'vue-next',
    tdesignPackage: 'tdesign-vue-next',
    tdesignVersion: '1.20.10',
    refsDir: 'refs',
    skeleton: 'assets/runtime/page-skeleton.html',
    vendor: [
      ['vue.global.prod.js', 'assets/vendor/vue.global.prod.js'],
      ['tdesign.min.js', 'assets/vendor/tdesign.min.js'],
      ['tdesign.min.css', 'assets/vendor/tdesign.min.css'],
      ['tdesign-sprite.js', 'assets/vendor/tdesign-sprite.js'],
    ],
    runtime: {
      script: 'tdesign.min.js',
      css: 'tdesign.min.css',
      sprite: 'tdesign-sprite.js',
    },
    adaptation: 'Chrome / Safari / Edge × 1440 / 1920',
    viewportHint: '桌面端 1440 / 1920',
    pageFrame: '桌面端页面',
  },
  'mobile-vue': {
    id: 'mobile-vue',
    label: '移动端 Vue',
    framework: 'mobile-vue',
    mcpFramework: 'mobile-vue',
    tdesignPackage: 'tdesign-mobile-vue',
    tdesignVersion: '1.17.1',
    refsDir: 'refs/mobile-vue',
    skeleton: 'assets/runtime/page-skeleton-mobile-vue.html',
    vendor: [
      ['vue.global.prod.js', 'assets/vendor/vue.global.prod.js'],
      ['tdesign.min.js', 'assets/vendor-mobile-vue/tdesign.min.js'],
      ['tdesign.min.css', 'assets/vendor-mobile-vue/tdesign.min.css'],
      ['tdesign-sprite.js', 'assets/vendor/tdesign-sprite.js'],
    ],
    runtime: {
      script: 'tdesign.min.js',
      css: 'tdesign.min.css',
      sprite: 'tdesign-sprite.js',
    },
    adaptation: '移动端 375 / 390 / 414 × 667 / 812 / 844；触摸目标 ≥ 44px',
    viewportHint: '移动端 375 / 390 / 414',
    pageFrame: '375px 手机画框',
  },
};

export const DEFAULT_PROFILE = 'vue-next';

export function isValidProfile(name) {
  return Object.prototype.hasOwnProperty.call(PROFILES, name);
}

export function getProfile(name) {
  if (!isValidProfile(name)) {
    throw new Error(`未知 profile：${name}。可选：${Object.keys(PROFILES).join(' / ')}`);
  }
  return PROFILES[name];
}

export function profileList() {
  return Object.values(PROFILES).map((p) => `${p.id}（${p.label}）`).join(' / ');
}

/** 读取任务根目录的 aiux-profile.json；没有或无效时返回 null。 */
export function readTaskProfile(root) {
  const file = path.join(root, 'aiux-profile.json');
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const name = data.profile || data.framework;
    if (!isValidProfile(name)) return null;
    return getProfile(name);
  } catch {
    return null;
  }
}

export function writeTaskProfile(root, profile) {
  const file = path.join(root, 'aiux-profile.json');
  const data = {
    schema: 'aiux/profile@1',
    profile: profile.id,
    framework: profile.framework,
    tdesignPackage: profile.tdesignPackage,
    tdesignVersion: profile.tdesignVersion,
    mcp: {
      package: 'tdesign-mcp-server',
      version: '0.2.4',
      framework: profile.mcpFramework,
    },
  };
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return file;
}
