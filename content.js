/**
 * DeskGate content script 2.6.8
 * Inventory + exact-selector type. Does not click Submit.
 * 2.6.8: remembers what it staged, reports coordinator edits on staged boxes
 *        (lengths and flags only — never the text), and reads staged boxes back.
 */
(() => {
  const VERSION = '2.6.8';
  if (window.__DESKGATE_CONTENT_SCRIPT_LOADED__) {
    try { window.postMessage({ type: 'deskgate-content-ready', version: VERSION }, '*'); } catch (_) {}
    return;
  }
  window.__DESKGATE_CONTENT_SCRIPT_LOADED__ = true;

  const IS_TOP = (() => { try { return window === window.top; } catch (_) { return false; } })();

  /** Boxes DeskGate typed into: { el, selector, key, value, caseId } */
  const stagedRecords = [];
  let activeCaseId = '';
  const pendingEmit = new Map();

  function cssEscape(v) {
    try { return CSS.escape(v); } catch (_) { return String(v).replace(/[^\w-]/g, '\\$&'); }
  }

  function isIrreversibleControl(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    const type = String(el.type || '').toLowerCase();
    const blob = [
      el.id, el.name, el.getAttribute && el.getAttribute('aria-label'), el.value, el.textContent,
    ].join(' ').toLowerCase();
    if (type === 'submit' || type === 'image' || type === 'button' || type === 'reset') return true;
    if (tag === 'button') return true;
    if (tag === 'a' && /submit|file|send|affirm|authorize/.test(blob)) return true;
    if (/\b(submit|file claim|send to payer|affirm|authorize request)\b/.test(blob)) return true;
    return false;
  }

  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
      const t = String(el.type || 'text').toLowerCase();
      return !['hidden', 'submit', 'button', 'image', 'reset', 'checkbox', 'radio', 'file'].includes(t);
    }
    return false;
  }

  function resolveRaw(selector) {
    const raw = String(selector || '').trim();
    if (!raw) return null;
    const tryOne = (sel) => { try { return document.querySelector(sel); } catch (_) { return null; } };
    if (raw.startsWith('#') || raw.includes('[') || raw.includes('>') || raw.includes('.')) {
      return tryOne(raw);
    }
    return (
      document.getElementById(raw) ||
      tryOne('#' + cssEscape(raw)) ||
      tryOne('[data-deskgate-target="' + raw.replace(/"/g, '\\"') + '"]') ||
      tryOne('[name="' + raw.replace(/"/g, '\\"') + '"]') ||
      tryOne(raw)
    );
  }

  function fieldSelector(el) {
    if (el.id) return '#' + cssEscape(el.id);
    const target = el.getAttribute('data-deskgate-target');
    if (target) return '[data-deskgate-target="' + target.replace(/"/g, '\\"') + '"]';
    const name = el.getAttribute('name');
    if (name) return '[name="' + name.replace(/"/g, '\\"') + '"]';
    return el.tagName.toLowerCase();
  }

  function fieldLabel(el) {
    if (el.id) {
      try {
        const lbl = document.querySelector('label[for="' + cssEscape(el.id) + '"]');
        if (lbl && lbl.textContent.trim()) return lbl.textContent.trim();
      } catch (_) {}
    }
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const wrap = el.closest('label');
    if (wrap) {
      const own = wrap.textContent.replace(el.value || '', '').trim();
      if (own) return own.slice(0, 120);
    }
    if (el.placeholder && el.placeholder.trim()) return el.placeholder.trim();
    return el.getAttribute('name') || el.id || '';
  }

  function fieldVisible(el) {
    if (!el.getClientRects || el.getClientRects().length === 0) return false;
    const cs = window.getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
    return true;
  }

  function fieldValue(el) {
    if (el.isContentEditable) return (el.textContent || '').trim();
    return (el.value || '').trim();
  }

  function norm(v) {
    return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function deltaChars(a, b) {
    const x = String(a || '');
    const y = String(b || '');
    let i = 0;
    while (i < x.length && i < y.length && x[i] === y[i]) i += 1;
    let j = 0;
    while (j < x.length - i && j < y.length - i && x[x.length - 1 - j] === y[y.length - 1 - j]) j += 1;
    return Math.max(x.length - i - j, y.length - i - j);
  }

  function enumerateFields(max = 160) {
    const query = [
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])',
      'textarea',
      'select',
      '[contenteditable="true"]',
    ].join(', ');
    let els;
    try { els = Array.from(document.querySelectorAll(query)); } catch (_) { return []; }
    const out = [];
    for (const el of els) {
      if (out.length >= max) break;
      if (!fieldVisible(el)) continue;
      const value = fieldValue(el);
      out.push({
        selector: fieldSelector(el),
        label: fieldLabel(el).replace(/\s+/g, ' ').slice(0, 160),
        tag: el.tagName.toLowerCase(),
        type: el.isContentEditable ? 'contenteditable' : (el.type || 'text'),
        value: value.slice(0, 200),
        empty: !value,
        required: !!(el.required || el.getAttribute('aria-required') === 'true'),
        readonly: !!(el.readOnly || el.getAttribute('aria-readonly') === 'true'),
        disabled: !!el.disabled,
      });
    }
    return out;
  }

  function glow(el) {
    if (!el || !el.style) return;
    el.style.transition = 'box-shadow 0.3s, border-color 0.3s';
    el.style.borderColor = '#16a34a';
    el.style.boxShadow = '0 0 12px rgba(22,163,74,0.45)';
    setTimeout(() => { try { el.style.boxShadow = ''; } catch (_) {} }, 1400);
  }

  function rememberStaged(el, key, caseId) {
    const rec = stagedRecords.find((r) => r.el === el);
    const value = fieldValue(el);
    if (rec) {
      rec.value = value;
      rec.key = key || rec.key;
      rec.caseId = caseId || rec.caseId;
    } else {
      stagedRecords.push({ el, selector: fieldSelector(el), key: key || '', value, caseId: caseId || '' });
    }
    if (caseId) activeCaseId = caseId;
  }

  /** Hint-only fallback: best-scoring EMPTY visible box whose label shares words with the hint. */
  function fuzzyTarget(hint) {
    const words = String(hint || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    if (!words.length) return null;
    let best = null;
    let bestScore = 0;
    for (const f of enumerateFields()) {
      if (!f.empty || f.readonly || f.disabled) continue;
      const blob = `${f.selector} ${f.label}`.toLowerCase();
      const score = words.filter((w) => blob.includes(w)).length;
      if (score > bestScore) { best = f; bestScore = score; }
    }
    const need = words.length >= 3 ? 2 : 1;
    return best && bestScore >= need ? resolveRaw(best.selector) : null;
  }

  function typeText({ selector, text, field_hint, key, case_id }) {
    let target = null;
    const bySelector = resolveRaw(selector);
    if (bySelector && isIrreversibleControl(bySelector)) {
      return { ok: false, status: 'IRREVERSIBLE_BLOCKED', selector: fieldSelector(bySelector) };
    }
    if (isEditable(bySelector)) target = bySelector;
    if (!target && !selector) {
      const byHint = resolveRaw(field_hint);
      if (isEditable(byHint)) target = byHint;
      else target = fuzzyTarget(field_hint);
    }
    if (!target) return { ok: false, status: 'NOT_FOUND', selector: selector || '' };
    if (isIrreversibleControl(target)) {
      return { ok: false, status: 'IRREVERSIBLE_BLOCKED', selector: fieldSelector(target) };
    }
    const textToType = text == null ? '' : String(text);
    try { target.focus({ preventScroll: true }); } catch (_) { try { target.focus(); } catch (__) {} }
    if (target.tagName === 'SELECT') {
      const want = textToType.toLowerCase();
      const opt = want ? Array.from(target.options || []).find((o) =>
        (o.value || '').toLowerCase() === want || (o.text || '').toLowerCase() === want
      ) || Array.from(target.options || []).find((o) =>
        (o.value || '').toLowerCase().includes(want) || (o.text || '').toLowerCase().includes(want)
      ) : null;
      if (!opt) return { ok: false, status: 'NO_MATCHING_OPTION', selector: fieldSelector(target) };
      target.value = opt.value;
    } else if (target.isContentEditable) {
      // Rich-text editors (some appeal-letter and portal note boxes) ignore a
      // plain textContent assignment: the text appears but never enters the
      // editor's own model, so it is lost on Submit. Insert it the way a paste
      // does, so the editor's handlers run. Typing only — nothing is clicked.
      let inserted = false;
      try {
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) {}
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', textToType);
        inserted = target.dispatchEvent(new ClipboardEvent('paste', {
          clipboardData: dt, bubbles: true, cancelable: true,
        }));
      } catch (_) {}
      if (!inserted || !norm(fieldValue(target)).includes(norm(textToType))) {
        try { document.execCommand('insertText', false, textToType); }
        catch (_) { target.textContent = textToType; }
      }
    } else {
      const proto = target.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(target, textToType);
      else target.value = textToType;
    }
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    glow(target);
    rememberStaged(target, key || field_hint || '', case_id || '');
    const verified = target.tagName === 'SELECT' ? true : norm(fieldValue(target)) === norm(textToType);
    return { ok: true, status: 'TYPED', selector: fieldSelector(target), verified };
  }

  function fillFields(fields, caseId) {
    const report = [];
    const map = fields && typeof fields === 'object' ? fields : {};
    for (const [selector, text] of Object.entries(map)) {
      const res = typeText({ selector, text: String(text ?? ''), key: selector, case_id: caseId });
      report.push({ selector, resolved: res.selector || '', ok: !!res.ok, status: res.status });
    }
    return { ok: report.some((r) => r.ok), status: 'FILL_FIELDS', fields: report };
  }

  function getDomState() {
    const fields = enumerateFields();
    return {
      ok: true,
      url: window.location.href,
      title: document.title,
      frame: IS_TOP ? 'top' : 'sub',
      text: (document.body?.innerText || '').replace(/\s+\n/g, '\n').slice(0, 16000),
      fields,
      field_summary: {
        total: fields.length,
        empty: fields.filter((f) => f.empty && !f.readonly && !f.disabled).length,
        required_empty: fields.filter((f) => f.empty && f.required && !f.readonly && !f.disabled).length,
      },
    };
  }

  function verifyStaged(caseId) {
    const rows = stagedRecords
      .filter((r) => !caseId || r.caseId === caseId)
      .map((r) => {
        const present = !!(r.el && r.el.isConnected);
        const now = present ? fieldValue(r.el) : '';
        return {
          selector: r.selector,
          key: r.key,
          present,
          ok: present && norm(now) === norm(r.value),
          staged_len: r.value.length,
          now_len: now.length,
          miss_marker: present && /\[MISS\b/i.test(now),
        };
      });
    return { ok: true, status: 'VERIFY_STAGED', rows };
  }

  /* ---------- coordinator edits (trusted input only; lengths + flags, never text) ---------- */

  function emitEdit(el) {
    pendingEmit.delete(el);
    const rec = stagedRecords.find((r) => r.el === el);
    const now = fieldValue(el);
    const data = rec
      ? {
        case_id: rec.caseId,
        selector: rec.selector,
        key: rec.key,
        staged: true,
        staged_len: rec.value.length,
        now_len: now.length,
        delta_chars: deltaChars(rec.value, now),
        material: norm(now) !== norm(rec.value),
        cleared: !now && !!rec.value,
      }
      : {
        case_id: activeCaseId,
        selector: fieldSelector(el),
        key: '',
        staged: false,
        staged_len: 0,
        now_len: now.length,
        delta_chars: now.length,
        material: false,
        cleared: false,
      };
    if (!data.case_id) return;
    try {
      const p = chrome.runtime.sendMessage({ action: 'DESKGATE_FIELD_EDIT', data });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
  }

  function onUserEdit(e) {
    if (!e.isTrusted || !activeCaseId) return;
    let el = e.target;
    if (el && !isEditable(el) && el.closest) el = el.closest('input, textarea, select, [contenteditable="true"]');
    if (!isEditable(el)) return;
    clearTimeout(pendingEmit.get(el));
    pendingEmit.set(el, setTimeout(() => emitEdit(el), e.type === 'input' ? 600 : 0));
  }

  document.addEventListener('input', onUserEdit, true);
  document.addEventListener('change', onUserEdit, true);

  /* ---------- messaging ---------- */
  // Frames that cannot act stay silent, so a sub-frame's NOT_FOUND never beats the frame that typed.

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const action = request.action || request.type;
    const data = request.data || request.payload || request || {};
    try {
      switch (action) {
        case 'GET_DOM_STATE':
        case 'read_active_tab_data': {
          const state = getDomState();
          if (!IS_TOP && state.fields.length === 0 && state.text.length < 200) return false;
          sendResponse(state);
          return false;
        }
        case 'TYPE_TEXT':
        case 'type_text_in_active_page': {
          const res = typeText(data);
          if (res.status === 'NOT_FOUND') return false;
          sendResponse(res);
          return false;
        }
        case 'FILL_FIELDS':
        case 'fill_fields': {
          const res = fillFields(data.fields || data, data.case_id || '');
          if (!res.fields.some((r) => r.status !== 'NOT_FOUND')) return false;
          sendResponse(res);
          return false;
        }
        case 'VERIFY_STAGED': {
          const res = verifyStaged(data.case_id || '');
          if (!res.rows.length) return false;
          sendResponse(res);
          return false;
        }
        case 'PING':
          if (!IS_TOP) return false;
          sendResponse({ ok: true, version: VERSION, host: location.hostname });
          return false;
        default:
          if (!IS_TOP) return false;
          sendResponse({ ok: false, status: 'UNKNOWN_ACTION', action });
          return false;
      }
    } catch (err) {
      sendResponse({ ok: false, status: 'ERROR', error: String(err && err.message) });
      return false;
    }
  });

  try { window.postMessage({ type: 'deskgate-content-ready', version: VERSION }, '*'); } catch (_) {}
})();
