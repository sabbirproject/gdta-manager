/* pages/attendance.js - mark daily attendance by batch, and view the attendance report for a period */
(function () {
  'use strict';
  var h = UI.h;
  var state = { tab: 'mark', batch_id: '', date: '', rbatch: '', from: '', to: '' };
  var LABELS = { P: 'Present', A: 'Absent', L: 'Leave' };

  function toast(e) { UI.toast(e.message, 'error'); }
  function addDays(ymd, n) {
    var p = ymd.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }

  function batchSelect(batches, value, label) {
    return UI.select(batches.map(function (b) { return { value: b.batch_id, label: b.batch_name + ' — ' + b.course_name }; }), value, { 'aria-label': label });
  }

  function percentBadge(p) {
    if (p === null || p === undefined) return '—';
    return UI.badge(p + '%', p >= 75 ? 'ok' : p >= 50 ? 'warn' : 'bad');
  }

  // ------------------------------------------------------------ mark
  function renderMark(box, batches) {
    var today = UI.todayStr();
    if (!state.batch_id || !batches.some(function (b) { return b.batch_id === state.batch_id; })) state.batch_id = batches[0].batch_id;
    if (!state.date || state.date > today) state.date = today;

    var batchSel = batchSelect(batches, state.batch_id, 'Batch');
    var dateIn = h('input', { type: 'date', 'aria-label': 'Date', max: today, value: state.date });
    box.appendChild(h('div', { class: 'toolbar toolbar-2' }, [
      h('div', null, [h('label', { text: 'Batch' }), batchSel]),
      h('div', null, [h('label', { text: 'Date' }), dateIn])
    ]));
    var sheetBox = h('div');
    box.appendChild(sheetBox);

    var dirty = false, seq = 0;

    function guardedChange(apply, revert) {
      if (!dirty) { apply(); return; }
      UI.confirmDialog({ title: 'Discard changes?', okLabel: 'Discard', danger: true, message: 'You have attendance that is not saved yet. Discard it and continue?' })
        .then(function (yes) { if (yes) apply(); else revert(); });
    }
    batchSel.addEventListener('change', function () {
      var prev = state.batch_id;
      guardedChange(function () { state.batch_id = batchSel.value; load(); }, function () { batchSel.value = prev; });
    });
    dateIn.addEventListener('change', function () {
      var prev = state.date;
      if (!dateIn.value) { dateIn.value = prev; return; }
      guardedChange(function () { state.date = dateIn.value > today ? today : dateIn.value; dateIn.value = state.date; load(); }, function () { dateIn.value = prev; });
    });

    function load() {
      var mine = ++seq;
      dirty = false;
      sheetBox.replaceChildren(UI.loading());
      API.call('attendance.sheet', { batch_id: state.batch_id, date: state.date }).then(function (sheet) {
        if (mine !== seq) return;
        sheetBox.replaceChildren(buildSheet(sheet));
      }).catch(function (e) { if (mine === seq) sheetBox.replaceChildren(UI.errorState(e.message, load)); });
    }

    function buildSheet(sheet) {
      var wrap = h('div');
      if (!sheet.students.length) {
        wrap.appendChild(h('div', { class: 'card' }, UI.empty('No students in this batch on ' + UI.fmtDate(sheet.date), 'Add students from the batch page, or pick another date.')));
        return wrap;
      }
      var marks = {}, original = {};
      sheet.students.forEach(function (s) { marks[s.student_id] = { status: s.status, remarks: s.remarks || '' }; original[s.student_id] = s.status + '|' + (s.remarks || ''); });
      var locked = !sheet.editable;

      var counts = h('div', { class: 'att-counts', 'aria-live': 'polite' });
      var saveBtn = h('button', { class: 'btn btn-primary', type: 'button' }, [UI.icon('check', 18), 'Save attendance']);
      var hint = h('span', { class: 'muted' });
      var rowEls = {};

      function refresh() {
        var c = { P: 0, A: 0, L: 0, none: 0 };
        sheet.students.forEach(function (s) { var st = marks[s.student_id].status; if (st) c[st]++; else c.none++; });
        counts.replaceChildren(
          h('span', { class: 'att-count p', text: 'Present ' + c.P }), h('span', { class: 'att-count a', text: 'Absent ' + c.A }),
          h('span', { class: 'att-count l', text: 'Leave ' + c.L }), h('span', { class: 'att-count n', text: 'Not marked ' + c.none }));
        dirty = sheet.students.some(function (s) { var m = marks[s.student_id]; return (m.status + '|' + m.remarks) !== original[s.student_id]; });
        saveBtn.disabled = locked || c.none > 0 || !dirty;
        hint.textContent = locked ? '' : c.none > 0 ? c.none + ' student(s) still need a mark' : dirty ? 'Unsaved changes' : sheet.marked ? 'Saved' : '';
      }

      if (locked) wrap.appendChild(h('div', { class: 'notice warn', role: 'status', text: sheet.lockedReason }));
      else if (sheet.marked) wrap.appendChild(h('div', { class: 'notice ok', role: 'status', text: 'Attendance was already taken for this day. You can correct it below.' }));

      var tools = h('div', { class: 'att-tools' }, [
        counts,
        locked ? null : h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Mark all present', onclick: function () {
          sheet.students.forEach(function (s) { setStatus(s.student_id, 'P'); });
          refresh();
        } })
      ]);
      wrap.appendChild(tools);
      wrap.appendChild(h('p', { class: 'muted att-legend', text: 'P = Present · A = Absent · L = Leave' }));

      function setStatus(id, st) {
        marks[id].status = st;
        var el = rowEls[id];
        Array.prototype.forEach.call(el.row.querySelectorAll('input[type=radio]'), function (r) { r.checked = (r.value === st); });
        el.note.hidden = !(st === 'A' || st === 'L' || marks[id].remarks);
      }

      var list = h('ul', { class: 'att-list' });
      sheet.students.forEach(function (s) {
        var name = 'att-' + s.student_id;
        var group = h('div', { class: 'att-group', role: 'radiogroup', 'aria-label': s.full_name + ' attendance' }, ['P', 'A', 'L'].map(function (code) {
          var input = h('input', { type: 'radio', name: name, value: code, 'aria-label': LABELS[code] });
          if (s.status === code) input.checked = true;
          if (locked) input.disabled = true;
          input.addEventListener('change', function () { setStatus(s.student_id, code); refresh(); });
          return h('label', { class: 'att-opt att-' + code.toLowerCase(), title: LABELS[code] }, [input, h('span', { text: code })]);
        }));
        var note = h('input', { type: 'text', class: 'att-note', 'aria-label': 'Note for ' + s.full_name, placeholder: 'Note (optional)', maxlength: 100, value: s.remarks || '' });
        note.hidden = !(s.status === 'A' || s.status === 'L' || s.remarks);
        if (locked) note.disabled = true;
        note.addEventListener('input', function () { marks[s.student_id].remarks = note.value.trim(); refresh(); });
        var row = h('li', { class: 'att-row' }, [
          h('div', { class: 'att-name' }, [h('a', { href: '#/students/' + s.student_id, text: s.full_name }), h('span', { class: 'sub', text: s.student_id })]),
          group, note
        ]);
        rowEls[s.student_id] = { row: row, note: note };
        list.appendChild(row);
      });
      wrap.appendChild(h('div', { class: 'card att-card' }, list));

      var saving = false;
      saveBtn.addEventListener('click', function () {
        if (saving) return;
        saving = true; saveBtn.disabled = true; saveBtn.lastChild.textContent = 'Saving…';
        var records = sheet.students.map(function (s) { return { student_id: s.student_id, status: marks[s.student_id].status, remarks: marks[s.student_id].remarks }; });
        API.call('attendance.save', { batch_id: state.batch_id, date: state.date, records: records }, { requestId: API.newRequestId() }).then(function (r) {
          UI.toast(r.created + r.updated ? 'Attendance saved' : 'Nothing changed', 'success');
          dirty = false;
          load();
        }).catch(function (e) {
          toast(e); saving = false; saveBtn.lastChild.textContent = 'Save attendance'; refresh();
        });
      });
      wrap.appendChild(h('div', { class: 'att-save' }, [hint, saveBtn]));
      refresh();
      return wrap;
    }
    load();
  }

  // ------------------------------------------------------------ report
  function renderReport(box, batches) {
    var today = UI.todayStr();
    if (!state.rbatch || !batches.some(function (b) { return b.batch_id === state.rbatch; })) state.rbatch = batches[0].batch_id;
    if (!state.to) state.to = today;
    if (!state.from) state.from = addDays(state.to, -29);

    var batchSel = batchSelect(batches, state.rbatch, 'Batch');
    var fromIn = h('input', { type: 'date', 'aria-label': 'From date', value: state.from, max: today });
    var toIn = h('input', { type: 'date', 'aria-label': 'To date', value: state.to, max: today });
    box.appendChild(h('div', { class: 'toolbar toolbar-3' }, [
      h('div', null, [h('label', { text: 'Batch' }), batchSel]),
      h('div', null, [h('label', { text: 'From' }), fromIn]),
      h('div', null, [h('label', { text: 'To' }), toIn])
    ]));
    var out = h('div');
    box.appendChild(out);
    var seq = 0;

    function load() {
      var mine = ++seq;
      out.replaceChildren(UI.loading());
      API.call('attendance.report', { batch_id: state.rbatch, from: state.from, to: state.to }).then(function (d) {
        if (mine !== seq) return;
        out.replaceChildren();
        out.appendChild(h('div', { class: 'section-head' }, [
          h('div', { class: 'muted', text: d.batch.batch_name + ' · ' + UI.fmtDate(d.from) + ' to ' + UI.fmtDate(d.to) + ' · ' + d.sessions + (d.sessions === 1 ? ' day marked' : ' days marked') }),
          h('button', { class: 'btn btn-outline btn-small no-print', type: 'button', onclick: function () { window.print(); } }, [UI.icon('print', 16), 'Print'])
        ]));
        if (!d.students.length) { out.appendChild(h('div', { class: 'card' }, UI.empty('No students or attendance in this period'))); return; }
        out.appendChild(UI.table([
          { label: 'Student', render: function (s) { return h('span', null, [h('a', { href: '#/students/' + s.student_id, text: s.full_name }), h('span', { class: 'sub', text: s.student_id })]); } },
          { label: 'Present', render: function (s) { return String(s.present); } },
          { label: 'Absent', render: function (s) { return String(s.absent); } },
          { label: 'Leave', render: function (s) { return String(s.leave); } },
          { label: 'Attendance', render: function (s) { return percentBadge(s.percent); } }
        ], d.students));
        if (d.days.length) {
          out.appendChild(h('h3', { class: 'report-sub', text: 'Day by day' }));
          out.appendChild(UI.table([
            { label: 'Date', render: function (x) { return UI.fmtDate(x.date); } },
            { label: 'Present', render: function (x) { return String(x.present); } },
            { label: 'Absent', render: function (x) { return String(x.absent); } },
            { label: 'Leave', render: function (x) { return String(x.leave); } }
          ], d.days.slice().reverse()));
        }
      }).catch(function (e) { if (mine === seq) out.replaceChildren(UI.errorState(e.message, load)); });
    }
    batchSel.addEventListener('change', function () { state.rbatch = batchSel.value; load(); });
    function dates() {
      if (!fromIn.value || !toIn.value) return;
      if (fromIn.value > toIn.value) { UI.toast('The From date must be on or before the To date', 'error'); fromIn.value = state.from; toIn.value = state.to; return; }
      state.from = fromIn.value; state.to = toIn.value; load();
    }
    fromIn.addEventListener('change', dates); toIn.addEventListener('change', dates);
    load();
  }

  // ------------------------------------------------------------ page
  function render() {
    var root = h('div');
    root.appendChild(h('div', { class: 'page-head' }, [h('div', null, [h('h2', { text: 'Attendance' }), h('div', { class: 'muted', text: 'Mark daily attendance and view reports' })])]));
    var content = h('div');
    return API.call('batches.list', { status: 'Active', pageSize: 100 }).then(function (d) {
      if (!d.items.length) {
        root.appendChild(h('div', { class: 'card' }, UI.empty('No active batches', 'Create a batch and add students to it before taking attendance.')));
        return root;
      }
      function show(tab) {
        state.tab = tab;
        content.replaceChildren();
        (tab === 'report' ? renderReport : renderMark)(content, d.items);
      }
      root.appendChild(UI.tabs([{ id: 'mark', label: 'Take attendance' }, { id: 'report', label: 'Report' }], state.tab, show));
      root.appendChild(content);
      show(state.tab);
      return root;
    });
  }

  Router.register({ id: 'attendance', title: 'Attendance', label: 'Attendance', icon: 'calendar', primary: true, render: render });
})();
