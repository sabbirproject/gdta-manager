/* ui.js - small DOM helpers. User data is always set with textContent, never innerHTML. */
var UI = (function () {
  'use strict';

  var ICONS = {
    home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
    refresh: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
    users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
    book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
    layers: 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
    plus: 'M12 5v14 M5 12h14',
    edit: 'M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
    back: 'M19 12H5 M12 19l-7-7 7-7',
    x: 'M18 6L6 18 M6 6l12 12',
    menu: 'M3 12h18 M3 6h18 M3 18h18',
    calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    rupee: 'M6 3h12 M6 8h12 M6 13l8.5 8 M6 13h3a4 4 0 0 0 0-10',
    sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
    clipboard: 'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 13l2 2 4-4',
    chart: 'M3 3v18h18 M7 16v-5 M12 16V8 M17 16v-8',
    clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v6l4 2',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0',
    file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h8',
    print: 'M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z',
    check: 'M20 6L9 17l-5-5'
  };

  /** h('div', {class:'x', text:'hi', onclick: fn}, [child, 'text']) */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'value') el.value = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    (function add(list) {
      if (list === null || list === undefined || list === false) return;
      if (Array.isArray(list)) { list.forEach(add); return; }
      el.appendChild(typeof list === 'object' ? list : document.createTextNode(String(list)));
    })(kids);
    return el;
  }

  function icon(name, size) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    var s = String(size || 20);
    svg.setAttribute('width', s); svg.setAttribute('height', s);
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', ICONS[name] || '');
    svg.appendChild(p);
    return svg;
  }

  function toast(message, type) {
    var root = document.getElementById('toasts');
    if (!root) return;
    var t = h('div', { class: 'toast ' + (type || ''), role: type === 'error' ? 'alert' : 'status', text: message });
    root.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, type === 'error' ? 7000 : 4000);
  }

  function loading() {
    return h('div', { class: 'loading' }, h('div', { class: 'spinner', role: 'status', 'aria-label': 'Loading' }));
  }

  function empty(title, text) {
    return h('div', { class: 'empty' }, [h('h3', { text: title }), text ? h('p', { text: text }) : null]);
  }

  function errorState(message, retryFn) {
    return h('div', { class: 'error-state card' }, [
      h('p', { text: message || 'Something went wrong.' }),
      retryFn ? h('button', { class: 'btn btn-outline', type: 'button', onclick: retryFn, text: 'Try again' }) : null
    ]);
  }

  function badge(text, kind) { return h('span', { class: 'badge badge-' + (kind || 'muted'), text: text }); }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  // ---------------------------------------------------------------- formatting
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function money(n) {
    var v = Number(n) || 0;
    var whole = Math.abs(v - Math.round(v)) < 0.005;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2
    }).format(v);
  }

  /** '2026-10-25' -> '25 Oct 2026' */
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    return Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + m[1];
  }

  /** '14:30' -> '2:30 PM' */
  function fmtTime(hhmm) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
    if (!m) return String(hhmm || '');
    var hr = Number(m[1]);
    return ((hr + 11) % 12 + 1) + ':' + m[2] + ' ' + (hr >= 12 ? 'PM' : 'AM');
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  // ---------------------------------------------------------------- modal
  var modalCount = 0;

  /**
   * modal(title, content, {static: true}) -> {close, el}.  static = clicking outside does not close it (use for forms).
   * Escape closes. Focus stays inside and returns to the opener when closed.
   */
  function modal(title, content, opts) {
    opts = opts || {};
    var root = document.getElementById('modal-root');
    var opener = document.activeElement;
    var titleId = 'modal-title-' + (++modalCount);
    var closed = false;

    var closeBtn = h('button', { class: 'btn btn-ghost modal-x', type: 'button', 'aria-label': 'Close', onclick: function () { close(); } }, icon('x', 20));
    var dialog = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' }, [
      h('div', { class: 'modal-head' }, [h('h2', { id: titleId, text: title }), closeBtn]),
      h('div', { class: 'modal-body' }, content)
    ]);
    var backdrop = h('div', { class: 'modal-backdrop' }, dialog);
    backdrop.addEventListener('mousedown', function (e) { if (e.target === backdrop && !opts.static) close(); });

    function focusables() {
      return Array.prototype.slice.call(dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'));
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = focusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (!root.children.length) document.body.classList.remove('modal-open');
      if (opener && opener.focus && document.contains(opener)) opener.focus();
      if (opts.onClose) opts.onClose();
    }

    root.appendChild(backdrop);
    document.body.classList.add('modal-open');
    document.addEventListener('keydown', onKey, true);
    var firstField = dialog.querySelector('.modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea, .modal-body button');
    (firstField || dialog).focus();
    return { close: close, el: dialog };
  }

  /** confirmDialog({title, message, okLabel, danger}) -> Promise<boolean> */
  function confirmDialog(o) {
    return new Promise(function (resolve) {
      var answered = false;
      function answer(v) { if (!answered) { answered = true; resolve(v); } m.close(); }
      var content = h('div', null, [
        h('p', { text: o.message }),
        h('div', { class: 'modal-actions' }, [
          h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { answer(false); }, text: 'Cancel' }),
          h('button', { class: 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary'), type: 'button', onclick: function () { answer(true); }, text: o.okLabel || 'OK' })
        ])
      ]);
      var m = modal(o.title || 'Please confirm', content, { static: true, onClose: function () { if (!answered) { answered = true; resolve(false); } } });
    });
  }

  // ---------------------------------------------------------------- forms
  var fieldCount = 0;

  /**
   * field spec: {name, label, type: text|tel|email|date|time|number|select|textarea|checks, required, options:[{value,label}],
   *              value, maxlength, min, max, step, pattern, hint, wide, autocomplete, placeholder}
   */
  function buildField(f) {
    var id = 'f-' + f.name + '-' + (++fieldCount);
    var control;
    var common = { id: id, name: f.name };
    if (f.required) common.required = true;
    if (f.hint) common['aria-describedby'] = id + '-hint';

    if (f.type === 'select') {
      control = h('select', common, (f.options || []).map(function (o) {
        var opt = h('option', { value: o.value, text: o.label });
        if (String(o.value) === String(f.value === undefined || f.value === null ? '' : f.value)) opt.selected = true;
        return opt;
      }));
    } else if (f.type === 'textarea') {
      control = h('textarea', Object.assign({ rows: 3, maxlength: f.maxlength || 500 }, common));
      control.value = f.value || '';
    } else if (f.type === 'checks') {
      var chosen = {};
      (f.value || []).forEach(function (v) { chosen[v] = true; });
      control = h('div', { class: 'checks', role: 'group', 'aria-label': f.label }, f.options.map(function (o) {
        var cb = h('input', { type: 'checkbox', value: o.value, name: f.name });
        if (chosen[o.value]) cb.checked = true;
        return h('label', { class: 'check-pill' }, [cb, o.label]);
      }));
    } else {
      var attrs = Object.assign({ type: f.type || 'text', autocomplete: f.autocomplete || 'off' }, common);
      if (f.maxlength) attrs.maxlength = f.maxlength;
      if (f.min !== undefined) attrs.min = f.min;
      if (f.max !== undefined) attrs.max = f.max;
      if (f.step !== undefined) attrs.step = f.step;
      if (f.pattern) attrs.pattern = f.pattern;
      if (f.placeholder) attrs.placeholder = f.placeholder;
      if (f.type === 'tel') attrs.inputmode = 'tel';
      if (f.type === 'number') attrs.inputmode = 'decimal';
      control = h('input', attrs);
      control.value = f.value === undefined || f.value === null ? '' : f.value;
    }
    var label = h('label', f.type === 'checks' ? { class: 'field-label' } : { for: id }, [f.label, f.required ? h('span', { class: 'req', 'aria-hidden': 'true', text: ' *' }) : null]);
    var wrap = h('div', { class: 'field' + (f.wide ? ' wide' : '') }, [label, control, f.hint ? h('div', { id: id + '-hint', class: 'hint', text: f.hint }) : null]);
    return { el: wrap, control: control, spec: f };
  }

  /**
   * formModal({title, fields, submitLabel, intro, onSubmit(values) -> Promise})
   * Closes on success. If onSubmit rejects, the message is shown in the form and the person can fix and retry.
   */
  function formModal(o) {
    var built = o.fields.map(buildField);
    var errBox = h('div', { class: 'form-error', role: 'alert', hidden: true });
    var submit = h('button', { class: 'btn btn-primary', type: 'submit', text: o.submitLabel || 'Save' });
    var form = h('form', { class: 'form' }, [
      o.intro ? h('p', { class: 'muted', text: o.intro }) : null,
      errBox,
      h('div', { class: 'form-grid' }, built.map(function (b) { return b.el; })),
      h('div', { class: 'modal-actions' }, [
        h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { m.close(); }, text: 'Cancel' }),
        submit
      ])
    ]);
    var m = modal(o.title, form, { static: true });

    function collect() {
      var values = {};
      built.forEach(function (b) {
        var f = b.spec;
        if (f.type === 'checks') {
          values[f.name] = Array.prototype.slice.call(b.control.querySelectorAll('input:checked')).map(function (c) { return c.value; });
        } else {
          values[f.name] = (f.type === 'textarea' || f.type === 'select') ? b.control.value.trim() : b.control.value.trim();
        }
      });
      return values;
    }

    var busy = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;                       // ignore a second tap / Enter while saving
      errBox.hidden = true;
      if (!form.reportValidity()) return;
      busy = true;
      submit.disabled = true;
      var label = submit.textContent;
      submit.textContent = 'Saving…';
      Promise.resolve(o.onSubmit(collect())).then(function () {
        m.close();
      }).catch(function (err) {
        errBox.textContent = (err && err.message) || 'Could not save. Please try again.';
        errBox.hidden = false;
        busy = false;
        submit.disabled = false;
        submit.textContent = label;
        errBox.scrollIntoView({ block: 'nearest' });
      });
    });
    return m;
  }

  // ---------------------------------------------------------------- tables, details, paging
  /** table([{label, render(row) -> Node|string, cls}], rows) -> responsive table (cards on phones) */
  function table(cols, rows) {
    var thead = h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { scope: 'col', class: c.cls, text: c.label }); })));
    var tbody = h('tbody', null, rows.map(function (r) {
      return h('tr', null, cols.map(function (c) {
        var v = c.render(r);
        return h('td', { 'data-label': c.label, class: c.cls }, v === undefined || v === null || v === '' ? '—' : v);
      }));
    }));
    return h('div', { class: 'table-wrap' }, h('table', { class: 'rtable' }, [thead, tbody]));
  }

  /** details([[label, value]]) -> definition list; empty values show a dash */
  function details(pairs) {
    return h('dl', { class: 'details' }, pairs.map(function (p) {
      var v = p[1];
      return h('div', null, [h('dt', { text: p[0] }), h('dd', null, v === undefined || v === null || v === '' ? '—' : v)]);
    }));
  }

  /** pager({page, pages, total}, goToPage) */
  function pager(info, go) {
    return h('div', { class: 'pager' }, [
      h('button', { class: 'btn btn-outline', type: 'button', disabled: info.page <= 1, onclick: function () { go(info.page - 1); }, text: 'Previous' }),
      h('span', { class: 'muted', text: 'Page ' + info.page + ' of ' + info.pages + ' · ' + info.total + ' total' }),
      h('button', { class: 'btn btn-outline', type: 'button', disabled: info.page >= info.pages, onclick: function () { go(info.page + 1); }, text: 'Next' })
    ]);
  }

  /** <select> element from [{value,label}] */
  function select(options, value, attrs) {
    var el = h('select', attrs || {}, options.map(function (o) {
      var opt = h('option', { value: o.value, text: o.label });
      if (String(o.value) === String(value)) opt.selected = true;
      return opt;
    }));
    return el;
  }

  // ---------------------------------------------------------------- amount in words (Indian system)
  var ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function below100(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); }
  function below1000(n) {
    var hd = Math.floor(n / 100), r = n % 100;
    return (hd ? ONES[hd] + ' Hundred' + (r ? ' ' : '') : '') + (r ? below100(r) : '');
  }
  function wholeWords(n) {
    if (n === 0) return 'Zero';
    var parts = [];
    var cr = Math.floor(n / 1e7); n %= 1e7;
    var lk = Math.floor(n / 1e5); n %= 1e5;
    var th = Math.floor(n / 1e3); n %= 1e3;
    if (cr) parts.push(below1000(cr) + ' Crore');
    if (lk) parts.push(below100(lk) + ' Lakh');
    if (th) parts.push(below100(th) + ' Thousand');
    if (n) parts.push(below1000(n));
    return parts.join(' ');
  }
  /** 1500 -> 'Rupees One Thousand Five Hundred Only'; 10.5 -> 'Rupees Ten and Fifty Paise Only' */
  function rupeesInWords(amount) {
    var paise = Math.round(Math.abs(Number(amount) || 0) * 100 + 1e-7);
    var rs = Math.floor(paise / 100), ps = paise % 100;
    if (!rs && ps) return below100(ps) + ' Paise Only';
    return 'Rupees ' + wholeWords(rs) + (ps ? ' and ' + below100(ps) + ' Paise' : '') + ' Only';
  }

  /** tabs([{id,label}], activeId, onChange(id)) -> element; the caller re-renders the content */
  function tabs(list, active, onChange) {
    var wrap = h('div', { class: 'tabs', role: 'tablist' });
    list.forEach(function (t) {
      var b = h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': t.id === active ? 'true' : 'false', text: t.label });
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(wrap.children, function (c) { c.setAttribute('aria-selected', c === b ? 'true' : 'false'); });
        onChange(t.id);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }


  // ---------------------------------------------------------------- CSV and downloads
  /**
   * csv(columns:[{key,label}], rows:[{...}]) -> text for a .csv file (UTF-8 with BOM so Excel shows rupee signs and Bengali correctly).
   * Text that starts with = + - @ (or a tab / carriage return) gets a leading apostrophe so a spreadsheet never runs it as a formula.
   * Numbers are written as they are.
   */
  function csv(columns, rows) {
    function cell(v) {
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') return String(v);
      var t = String(v);
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }
    var lines = [columns.map(function (c) { return cell(c.label); }).join(',')];
    rows.forEach(function (r) { lines.push(columns.map(function (c) { return cell(r[c.key]); }).join(',')); });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  /** Saves text as a file in the browser. Nothing is uploaded anywhere. */
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  /** Copies text to the clipboard; resolves true/false. Falls back to a hidden textarea on older browsers. */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext !== false) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  return {
    csv: csv, download: download, copyText: copyText,
    field: buildField, rupeesInWords: rupeesInWords, tabs: tabs,
    h: h, icon: icon, toast: toast, loading: loading, empty: empty, errorState: errorState, badge: badge, debounce: debounce,
    money: money, fmtDate: fmtDate, fmtTime: fmtTime, todayStr: todayStr,
    modal: modal, confirmDialog: confirmDialog, formModal: formModal, table: table, details: details, pager: pager, select: select
  };
})();
