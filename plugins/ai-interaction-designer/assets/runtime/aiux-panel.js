/**
 * AIUX 预览面板
 * 读取页面内 #aiux-spec，渲染右下角悬浮按钮与右侧抽屉。
 * 纯 DOM，无构建步骤，可在 file:// 下直接运行。
 */
(function () {
  'use strict';

  var STATE_LABELS = {
    default: '默认态',
    loading: '加载中',
    empty: '空数据',
    error: '错误',
    noPermission: '无权限',
    overLimit: '超限'
  };
  var EDGE_LABELS = {
    network: '网络异常',
    concurrency: '并发操作',
    empty: '数据为空',
    timeout: '超时',
    duplicate: '重复提交'
  };
  var GLOBAL_LABELS = {
    loading: '加载与反馈',
    motion: '动效',
    shortcuts: '快捷键',
    back: '返回与中断',
    cache: '刷新与缓存'
  };
  var REDUCE_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function isFilled(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function display(value) {
    return isFilled(value) ? value : '未填写';
  }

  function addMissing(node) {
    node.classList.add('aiux-is-missing');
    return node;
  }

  function readSpec() {
    var node = document.getElementById('aiux-spec');
    if (!node) throw new Error('页面缺少 #aiux-spec');
    var raw = (node.textContent || '').trim();
    if (!raw) throw new Error('#aiux-spec 为空');
    return JSON.parse(raw);
  }

  function safeSpec() {
    try {
      return { ok: true, spec: readSpec() };
    } catch (err) {
      return {
        ok: false,
        spec: {
          page: { name: '交互说明加载失败' },
          summary: [String(err && err.message ? err.message : err)],
          openQuestions: [
            { item: '修复页面内 #aiux-spec 的 JSON 后重新打开', reason: 'other', owner: '前端' }
          ]
        }
      };
    }
  }

  var loaded = safeSpec();
  var spec = loaded.spec || {};

  // ---------- 基础布局 ----------
  var fab = el('button', 'aiux-fab', '交互');
  fab.type = 'button';
  fab.setAttribute('aria-label', '打开交互说明');
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-controls', 'aiux-drawer');

  var overlay = el('div', 'aiux-overlay');
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');

  var drawer = el('aside', 'aiux-drawer');
  drawer.id = 'aiux-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-labelledby', 'aiux-drawer-title');
  drawer.hidden = true;

  var head = el('header', 'aiux-drawer-head');
  var titleWrap = el('div', 'aiux-drawer-title-wrap');
  titleWrap.appendChild(el('div', 'aiux-drawer-kicker', '交互说明'));
  var pageName = spec.page && spec.page.name ? spec.page.name : '未命名页面';
  var title = el('h2', 'aiux-drawer-title', pageName);
  title.id = 'aiux-drawer-title';
  titleWrap.appendChild(title);
  head.appendChild(titleWrap);

  var closeBtn = el('button', 'aiux-close', '×');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', '关闭交互说明');
  head.appendChild(closeBtn);
  drawer.appendChild(head);

  var body = el('div', 'aiux-drawer-body');
  drawer.appendChild(body);

  var root = el('div', 'aiux-root');
  root.appendChild(overlay);
  root.appendChild(drawer);
  root.appendChild(fab);
  document.body.appendChild(root);

  // ---------- 小工具 ----------
  function section(titleText, extraClass) {
    var sec = el('section', 'aiux-section' + (extraClass ? ' ' + extraClass : ''));
    if (titleText) sec.appendChild(el('h3', 'aiux-section-title', titleText));
    return sec;
  }

  function paragraph(value, mutedFallback) {
    var p = el('p', 'aiux-p', display(value));
    if (!isFilled(value) && mutedFallback !== false) p.classList.add('aiux-muted');
    return p;
  }

  function bulletList(items, emptyText) {
    var wrap = el('div', 'aiux-list');
    if (!items || !items.length) {
      wrap.appendChild(el('p', 'aiux-p aiux-muted', emptyText || '未提供'));
      return wrap;
    }
    items.forEach(function (item) {
      wrap.appendChild(el('div', 'aiux-list-item', item));
    });
    return wrap;
  }

  function table(headers, rows, emptyText) {
    if (!rows || !rows.length) {
      return el('p', 'aiux-p aiux-muted', emptyText || '未提供');
    }
    var wrap = el('div', 'aiux-table-wrap');
    var t = el('table', 'aiux-table');
    var thead = el('thead');
    var tr = el('tr');
    headers.forEach(function (h) { tr.appendChild(el('th', null, h)); });
    thead.appendChild(tr);
    t.appendChild(thead);
    var tbody = el('tbody');
    rows.forEach(function (cells) {
      var row = el('tr');
      cells.forEach(function (cell) {
        var td = el('td');
        if (cell && cell.nodeType) td.appendChild(cell);
        else if (isFilled(cell)) td.textContent = cell;
        else { td.textContent = '未填写'; td.className = 'aiux-muted'; }
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  }

  function definitionList(pairs) {
    var dl = el('dl', 'aiux-dl');
    pairs.forEach(function (pair) {
      var row = el('div', 'aiux-dl-row');
      row.appendChild(el('dt', null, pair[0]));
      var dd = el('dd');
      if (isFilled(pair[1])) dd.textContent = pair[1];
      else { dd.textContent = '未填写'; dd.className = 'aiux-muted'; }
      row.appendChild(dd);
      dl.appendChild(row);
    });
    return dl;
  }

  function note(text) {
    var p = el('p', 'aiux-note', text);
    return p;
  }

  // ---------- 交互条目 ----------
  var anchorItems = [];

  function flowButton(item, groupLabel) {
    var missing = !isFilled(item.anchor);
    var btn = el('button', 'aiux-flow');
    btn.type = 'button';
    btn.setAttribute('data-aiux-flow-id', item.id || '');
    if (missing) btn.classList.add('aiux-is-missing');

    var top = el('span', 'aiux-flow-top');
    top.appendChild(el('span', 'aiux-flow-id', isFilled(item.id) ? item.id : '缺 ID'));
    top.appendChild(el('span', 'aiux-flow-anchor', missing ? '缺锚点' : '#' + item.anchor));
    if (groupLabel) top.appendChild(el('span', 'aiux-flow-group', groupLabel));
    btn.appendChild(top);
    btn.appendChild(el('span', 'aiux-flow-text', display(item.text)));

    btn.addEventListener('click', function () {
      locate(item.anchor, btn);
    });
    anchorItems.push({ item: item, node: btn });
    return btn;
  }

  function flowsSection(flows) {
    var sec = section('交互条目', 'aiux-interactions');
    var main = flows && flows.main ? flows.main : [];
    var exception = flows && flows.exception ? flows.exception : [];

    function group(label, items) {
      var g = el('div', 'aiux-flow-group-block');
      g.appendChild(el('h4', 'aiux-flow-group-title', label + '（' + items.length + '）'));
      if (!items.length) {
        g.appendChild(el('p', 'aiux-p aiux-muted', '未填写'));
        return g;
      }
      items.forEach(function (item) { g.appendChild(flowButton(item, label)); });
      return g;
    }

    sec.appendChild(group('主流程', main));
    sec.appendChild(group('异常流程', exception));
    return sec;
  }

  function locate(anchor, itemNode) {
    if (!isFilled(anchor)) {
      showMissing(itemNode, '缺锚点');
      return;
    }
    var all = document.querySelectorAll('[data-aiux]');
    var target = null;
    for (var i = 0; i < all.length; i += 1) {
      if (all[i].getAttribute('data-aiux') === anchor) { target = all[i]; break; }
    }
    if (!target) {
      showMissing(itemNode, '未绑定元素（anchor: ' + anchor + '）');
      return;
    }
    var previous = target.__aiuxMissingNote;
    if (previous && previous.parentNode) previous.parentNode.removeChild(previous);
    target.classList.remove('aiux-anchor-flash');
    // 强制重排，保证连续点击同一元素也能重新触发动画
    void target.offsetWidth;
    target.classList.add('aiux-anchor-flash');
    target.scrollIntoView({
      behavior: REDUCE_MOTION ? 'auto' : 'smooth',
      block: 'center',
      inline: 'nearest'
    });
    if (target.__aiuxFlashTimer) clearTimeout(target.__aiuxFlashTimer);
    target.__aiuxFlashTimer = setTimeout(function () {
      target.classList.remove('aiux-anchor-flash');
    }, 1500);
  }

  function showMissing(itemNode, message) {
    if (!itemNode) return;
    itemNode.classList.add('aiux-is-missing');
    var old = itemNode.querySelector('.aiux-flow-missing');
    if (old) old.textContent = message;
    else itemNode.appendChild(el('span', 'aiux-flow-missing', message));
  }

  // ---------- 七章 ----------
  function chapter(titleText, contentNode) {
    var details = el('details', 'aiux-chapter');
    details.open = true;
    var summary = el('summary', 'aiux-chapter-title', titleText);
    details.appendChild(summary);
    var content = el('div', 'aiux-chapter-body');
    if (contentNode) content.appendChild(contentNode);
    details.appendChild(content);
    return details;
  }

  function accessChapter(data) {
    var wrap = el('div');
    var d = data || {};
    var roles = d.roles || [];
    var roleBox = el('div', 'aiux-role-list');
    if (!roles.length) {
      roleBox.appendChild(el('p', 'aiux-p aiux-muted', '未提供'));
    } else {
      roles.forEach(function (r) {
        var card = el('div', 'aiux-role');
        card.appendChild(el('div', 'aiux-role-name', display(r.name)));
        card.appendChild(el('div', 'aiux-role-desc', display(r.desc)));
        roleBox.appendChild(card);
      });
    }
    wrap.appendChild(el('h4', 'aiux-sub-title', '角色定义'));
    wrap.appendChild(roleBox);
    wrap.appendChild(el('h4', 'aiux-sub-title', '权限矩阵'));
    wrap.appendChild(table(
      ['角色', '操作', '是否允许', '备注'],
      (d.matrix || []).map(function (m) { return [m.role, m.action, m.allowed, m.note || '']; }),
      '未提供'
    ));
    wrap.appendChild(el('h4', 'aiux-sub-title', '本页角色差异'));
    wrap.appendChild(bulletList(d.roleDiffs, '未提供'));
    return wrap;
  }

  function iaChapter(data) {
    var wrap = el('div');
    var d = data || {};
    wrap.appendChild(el('h4', 'aiux-sub-title', '本页位置'));
    wrap.appendChild(paragraph(d.position));
    wrap.appendChild(el('h4', 'aiux-sub-title', '入口'));
    wrap.appendChild(table(
      ['从哪来', '怎么来'],
      (d.entries || []).map(function (x) { return [x.from, x.how]; }),
      '未提供'
    ));
    wrap.appendChild(el('h4', 'aiux-sub-title', '去向'));
    wrap.appendChild(table(
      ['去哪里', '怎么去'],
      (d.exits || []).map(function (x) { return [x.to, x.how]; }),
      '未提供'
    ));
    return wrap;
  }

  function pageChapter(page) {
    var wrap = el('div');
    var d = page || {};

    wrap.appendChild(el('h4', 'aiux-sub-title', '3.1 页面目标与入口'));
    wrap.appendChild(paragraph(d.goal));

    wrap.appendChild(el('h4', 'aiux-sub-title', '3.2 布局与元素清单'));
    wrap.appendChild(table(
      ['元素', 'TDesign 组件', '锚点'],
      (d.elements || []).map(function (e) { return [e.name, e.component, e.anchor ? '#' + e.anchor : '']; }),
      '未填写'
    ));

    if (spec.gaps && spec.gaps.length) {
      wrap.appendChild(el('h4', 'aiux-sub-title', 'TDesign 缺口登记'));
      wrap.appendChild(table(
        ['缺口', '为何无法用现有组件组合', '批准人'],
        spec.gaps.map(function (g) { return [g.gap, g.why, g.approver]; }),
        '未提供'
      ));
    }

    wrap.appendChild(el('h4', 'aiux-sub-title', '3.3 交互流程'));
    var flows = d.flows || { main: [], exception: [] };
    ['main', 'exception'].forEach(function (key) {
      var label = key === 'main' ? '主流程' : '异常流程';
      var list = flows[key] || [];
      wrap.appendChild(el('h5', 'aiux-sub-sub-title', label));
      if (!list.length) {
        wrap.appendChild(el('p', 'aiux-p aiux-muted', '未填写'));
      } else {
        var listWrap = el('div', 'aiux-flow-inline');
        list.forEach(function (item) { listWrap.appendChild(flowButton(item, label)); });
        wrap.appendChild(listWrap);
      }
    });

    wrap.appendChild(el('h4', 'aiux-sub-title', '3.4 状态设计'));
    var states = d.states || {};
    wrap.appendChild(table(
      ['状态', '设计'],
      Object.keys(STATE_LABELS).map(function (key) {
        return [STATE_LABELS[key], isFilled(states[key]) ? states[key] : addMissing(el('span', null, '未填写'))];
      }),
      '未填写'
    ));

    wrap.appendChild(el('h4', 'aiux-sub-title', '3.5 字段与校验'));
    wrap.appendChild(table(
      ['字段', '规则', '错误文案', '状态'],
      (d.fields || []).map(function (f) { return [f.name, f.rule, f.message || '', f.status || '']; }),
      '未提供'
    ));

    wrap.appendChild(el('h4', 'aiux-sub-title', '3.6 按钮与操作反馈'));
    wrap.appendChild(table(
      ['操作', '反馈', '禁用条件'],
      (d.actions || []).map(function (a) { return [a.name, a.feedback, a.disabledWhen || '']; }),
      '未提供'
    ));
    return wrap;
  }

  function globalChapter(data) {
    var d = data || {};
    var pairs = Object.keys(GLOBAL_LABELS).map(function (key) {
      return [GLOBAL_LABELS[key], d[key]];
    });
    var wrap = el('div');
    wrap.appendChild(definitionList(pairs));
    wrap.appendChild(el('h4', 'aiux-sub-title', 'Token 覆写'));
    wrap.appendChild(table(
      ['Token', '值', '原因'],
      (d.tokenOverrides || []).map(function (x) { return [x.token, x.value, x.reason]; }),
      '无覆写'
    ));
    return wrap;
  }

  function edgeChapter(data) {
    var d = data || {};
    return definitionList(Object.keys(EDGE_LABELS).map(function (key) {
      return [EDGE_LABELS[key], d[key]];
    }));
  }

  function trackingChapter(data) {
    var d = data || {};
    var wrap = el('div');
    wrap.appendChild(table(
      ['事件名', '触发时机', '上报字段'],
      (d.events || []).map(function (e) { return [e.name, e.trigger, (e.fields || []).join(', ')]; }),
      '未提供'
    ));
    return wrap;
  }

  function i18nChapter(data) {
    var d = data || {};
    return definitionList([
      ['多语言', d.languages],
      ['分辨率 / 响应式', d.responsive],
      ['无障碍', d.a11y]
    ]);
  }

  // ---------- 渲染抽屉内容 ----------
  function render() {
    // 1. 页面名 + 一句话摘要
    var summary = section('页面摘要');
    var lines = spec.summary || [];
    if (!lines.length) {
      summary.appendChild(el('p', 'aiux-p aiux-muted', '未填写页面摘要（校验会失败）'));
    } else {
      lines.forEach(function (line) { summary.appendChild(el('p', 'aiux-p', line)); });
    }
    if (loaded.ok === false) {
      summary.appendChild(note('当前页面不是有效的 aiux-spec，先修 JSON。'));
    }
    body.appendChild(summary);

    // 2. 可点击的交互条目
    body.appendChild(flowsSection(spec.s3_page && spec.s3_page.flows));

    // 3. 七章正文
    var chapters = el('div', 'aiux-chapters');
    chapters.appendChild(el('h2', 'aiux-body-title', '七章正文'));
    chapters.appendChild(chapter('1 用户与权限', accessChapter(spec.s1_access)));
    chapters.appendChild(chapter('2 信息架构', iaChapter(spec.s2_ia)));
    chapters.appendChild(chapter('3 页面 / 模块详述', pageChapter(spec.s3_page)));
    chapters.appendChild(chapter('4 全局交互规范', globalChapter(spec.s4_global)));
    chapters.appendChild(chapter('5 边界与异常', edgeChapter(spec.s5_edge)));
    chapters.appendChild(chapter('6 数据与埋点', trackingChapter(spec.s6_tracking)));
    chapters.appendChild(chapter('7 国际化与适配', i18nChapter(spec.s7_i18n)));
    body.appendChild(chapters);

    // 4. 待确认项
    var questions = section('待确认项', 'aiux-questions');
    var items = spec.openQuestions || [];
    if (!items.length) {
      questions.appendChild(el('p', 'aiux-p aiux-muted', '无待确认项'));
    } else {
      var qTable = table(
        ['待确认', '原因', '转给'],
        items.map(function (q) {
          return [q.item, {
            'conversation-missing': '对话未提供',
            'business-rule': '业务规则',
            'api-dependent': '依赖接口',
            'visual-decision': '视觉取舍',
            other: '其他'
          }[q.reason] || q.reason, q.owner];
        }),
        '无待确认项'
      );
      questions.appendChild(qTable);
    }
    body.appendChild(questions);
  }

  render();

  // ---------- 开关与键盘 ----------
  var isOpen = false;
  var lastFocused = null;
  var closeTimer = null;

  function openDrawer() {
    if (isOpen) return;
    isOpen = true;
    lastFocused = document.activeElement;
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    overlay.hidden = false;
    drawer.hidden = false;
    root.classList.add('aiux-is-open');
    fab.setAttribute('aria-expanded', 'true');
    closeBtn.focus();
  }

  function closeDrawer() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove('aiux-is-open');
    fab.setAttribute('aria-expanded', 'false');
    closeTimer = setTimeout(function () {
      if (!isOpen) { overlay.hidden = true; drawer.hidden = true; }
      closeTimer = null;
    }, REDUCE_MOTION ? 0 : 220);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
    else fab.focus();
  }

  fab.addEventListener('click', openDrawer);
  closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', function (event) {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== 'Tab') return;
    var focusables = drawer.querySelectorAll(
      'a[href], button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // 供冒烟测试与外部调试使用
  window.__AIUX_PANEL__ = {
    open: openDrawer,
    close: closeDrawer,
    locate: locate,
    missingAnchors: function () {
      return anchorItems.filter(function (x) {
        var anchor = x.item && x.item.anchor;
        if (!isFilled(anchor)) return true;
        var all = document.querySelectorAll('[data-aiux]');
        for (var i = 0; i < all.length; i += 1) {
          if (all[i].getAttribute('data-aiux') === anchor) return false;
        }
        return true;
      }).map(function (x) { return x.item; });
    }
  };
})();
