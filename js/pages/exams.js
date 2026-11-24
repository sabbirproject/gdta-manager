/* pages/exams.js - exam list, add/edit, exam page with ranked results, and marks entry */
(function () {
  'use strict';
  var h = UI.h;
  var state = { q: '', status: 'Active', batch_id: '', page: 1, dtab: 'results' };
  var STATUS_KIND = { Active: 'ok', Cancelled: 'muted' };
  var lastId = '';

  function toast(e) { UI.toast(e.message, 'error'); }
  function num(v) { return v === '' || v === null || v === undefined ? '' : String(Math.round(Number(v) * 100) / 100); }

  function resultBadge(r) { return UI.badge(r, r === 'Pass' ? 'ok' : r === 'Fail' ? 'bad' : 'muted'); }

  // ------------------------------------------------------------ add / edit
  function openForm(exam, presetBatch) {
    var e = exam || {};
    var requestId = API.newRequestId();
    Promise.all([API.call('batches.list', { status: 'Active', pageSize: 100 }), API.call('settings.get')]).then(function (r) {
      var batches = r[0].items.slice();
      if (exam && !batches.some(function (b) { return b.batch_id === exam.batch_id; })) batches.push({ batch_id: exam.batch_id, batch_name: exam.batch_name || exam.batch_id, course_name: '' });
      if (!batches.length) { UI.toast('Create a batch first, then add exams for it.', 'error'); return; }
      var opts = [{ value: '', label: 'Select a batch' }].concat(batches.map(function (b) {
        return { value: b.batch_id, label: b.batch_name + (b.course_name ? ' — ' + b.course_name : '') };
      }));
      UI.formModal({
        title: exam ? 'Edit exam' : 'Add exam',
        submitLabel: 'Save exam',
        intro: exam ? 'The batch and maximum marks cannot be changed once marks have been entered.' : '',
        fields: [
          { name: 'exam_name', label: 'Exam name', required: true, maxlength: 80, value: e.exam_name, wide: true, placeholder: 'e.g. Unit Test 1' },
          { name: 'batch_id', label: 'Batch', type: 'select', required: true, value: e.batch_id || presetBatch || '', options: opts },
          { name: 'subject', label: 'Subject', required: true, maxlength: 60, value: e.subject },
          { name: 'exam_date', label: 'Exam date', type: 'date', required: true, value: e.exam_date || UI.todayStr() },
          { name: 'max_marks', label: 'Maximum marks', type: 'number', required: true, min: 1, max: 1000, step: 'any', value: e.max_marks || 100 },
          { name: 'pass_percent', label: 'Pass percentage', type: 'number', required: true, min: 0, max: 100, step: 'any', value: exam ? e.pass_percent : r[1].pass_percent_default, hint: 'A student passes with this percentage or more' }
        ],
        onSubmit: function (v) {
          if (exam) v.exam_id = exam.exam_id;
          return API.call('exams.save', v, { requestId: requestId }).then(function (res) {
            UI.toast('Exam saved', 'success');
            if (!exam) location.hash = '#/exams/' + res.exam_id; else Router.reload();
          });
        }
      });
    }).catch(toast);
  }

  function changeStatus(exam, status) {
    var go = function () {
      return API.call('exams.setStatus', { exam_id: exam.exam_id, status: status }, { requestId: API.newRequestId() })
        .then(function () { UI.toast(status === 'Active' ? 'Exam restored' : 'Exam cancelled', 'success'); Router.reload(); }).catch(toast);
    };
    if (status === 'Active') return go();
    return UI.confirmDialog({ title: 'Cancel exam', okLabel: 'Cancel exam', danger: true,
      message: 'Cancel "' + exam.exam_name + '"? Marks already entered are kept but the exam is left out of reports. You can restore it later.' })
      .then(function (yes) { if (yes) return go(); });
  }

  // ------------------------------------------------------------ list
  function renderList() {
    var root = h('div');
    root.appendChild(h('div', { class: 'page-head' }, [
      h('div', null, [h('h2', { text: 'Exams' }), h('div', { class: 'muted', text: 'Tests, marks and results' })]),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { openForm(null); } }, [UI.icon('plus', 18), 'Add exam'])
    ]));
    var search = h('input', { type: 'search', 'aria-label': 'Search exams', placeholder: 'Search exam or subject', maxlength: 60, autocomplete: 'off', value: state.q });
    var status = UI.select([{ value: 'Active', label: 'Active' }, { value: 'Cancelled', label: 'Cancelled' }, { value: 'All', label: 'All statuses' }], state.status, { 'aria-label': 'Filter by status' });
    var batch = UI.select([{ value: '', label: 'All batches' }], state.batch_id, { 'aria-label': 'Filter by batch' });
    root.appendChild(h('div', { class: 'toolbar toolbar-3' }, [h('div', { class: 'search' }, search), h('div', null, status), h('div', null, batch)]));
    var results = h('div');
    root.appendChild(results);
    var today = UI.todayStr(), seq = 0;

    function load() {
      var mine = ++seq;
      results.replaceChildren(UI.loading());
      API.call('exams.list', { q: state.q, status: state.status, batch_id: state.batch_id, page: state.page, pageSize: 25 }).then(function (d) {
        if (mine !== seq) return;
        results.replaceChildren();
        if (!d.items.length) {
          var filtered = state.q || state.batch_id || state.status !== 'Active';
          results.appendChild(h('div', { class: 'card' }, UI.empty(filtered ? 'No exams match' : 'No exams yet',
            filtered ? 'Try a different search or filter.' : 'Use "Add exam" to create one, then enter marks after the exam date.')));
          return;
        }
        results.appendChild(UI.table([
          { label: 'Exam', render: function (x) { return h('span', null, [h('a', { href: '#/exams/' + x.exam_id, text: x.exam_name }), h('span', { class: 'sub', text: x.subject })]); } },
          { label: 'Batch', cls: 'hide-sm', render: function (x) { return x.batch_name; } },
          { label: 'Date', render: function (x) { return UI.fmtDate(x.exam_date); } },
          { label: 'Max marks', cls: 'hide-sm', render: function (x) { return num(x.max_marks); } },
          { label: 'Results', render: function (x) {
              if (x.status === 'Cancelled') return UI.badge('Cancelled', 'muted');
              if (!x.marks_entered) return x.exam_date > today ? UI.badge('Upcoming', 'warn') : UI.badge('Marks not entered', 'warn');
              return x.appeared + ' appeared · ' + x.passed + ' passed';
            } }
        ], d.items));
        if (d.pages > 1) results.appendChild(UI.pager(d, function (p) { state.page = p; load(); }));
      }).catch(function (e) { if (mine === seq) results.replaceChildren(UI.errorState(e.message, load)); });
    }
    search.addEventListener('input', UI.debounce(function () { state.q = search.value.trim(); state.page = 1; load(); }, 300));
    status.addEventListener('change', function () { state.status = status.value; state.page = 1; load(); });
    batch.addEventListener('change', function () { state.batch_id = batch.value; state.page = 1; load(); });
    API.call('batches.list', { status: 'All', pageSize: 100 }).then(function (bd) {
      batch.replaceChildren.apply(batch, [h('option', { value: '', text: 'All batches' })].concat(bd.items.map(function (b) {
        var o = h('option', { value: b.batch_id, text: b.batch_name });
        if (b.batch_id === state.batch_id) o.selected = true;
        return o;
      })));
    }).catch(function () { /* filter stays "All batches" */ });
    load();
    return root;
  }

  // ------------------------------------------------------------ results tab
  function stat(label, value, cls) {
    return h('div', { class: 'stat ' + (cls || '') }, [h('div', { class: 'stat-label', text: label }), h('div', { class: 'stat-value', text: value })]);
  }

  function buildResults(d) {
    var e = d.exam, s = d.summary, wrap = h('div');
    if (!d.results.length) {
      wrap.appendChild(h('div', { class: 'card' }, UI.empty('No marks entered yet', e.status === 'Active' ? 'Open the "Enter marks" tab to add them.' : 'This exam is cancelled.')));
      return wrap;
    }
    wrap.appendChild(h('div', { class: 'grid-stats' }, [
      stat('Appeared', String(s.appeared) + (s.absent ? ' (' + s.absent + ' absent)' : '')),
      stat('Passed', s.passed + ' of ' + s.appeared, 'ok'),
      stat('Class average', s.average === null ? '—' : num(s.average) + ' / ' + num(e.max_marks), ''),
      stat('Highest', s.highest === null ? '—' : num(s.highest) + ' / ' + num(e.max_marks), s.failed ? 'warn' : '')
    ]));
    wrap.appendChild(UI.table([
      { label: 'Rank', render: function (r) { return r.rank === '' ? '—' : String(r.rank); } },
      { label: 'Student', render: function (r) { return h('span', null, [h('a', { href: '#/students/' + r.student_id, text: r.full_name }), h('span', { class: 'sub', text: r.student_id })]); } },
      { label: 'Marks', render: function (r) { return r.marks_obtained === '' ? 'Absent' : num(r.marks_obtained) + ' / ' + num(e.max_marks); } },
      { label: 'Percent', cls: 'hide-sm', render: function (r) { return r.percentage === null ? '' : r.percentage + '%'; } },
      { label: 'Result', render: function (r) { return resultBadge(r.result); } },
      { label: 'Report', cls: 'actions no-print', render: function (r) { return h('a', { class: 'btn btn-outline btn-small', href: '#/progress/' + r.student_id, text: 'Progress' }); } }
    ], d.results));
    return wrap;
  }

  // ------------------------------------------------------------ marks entry tab
  function buildMarks(exam, onSaved) {
    var box = h('div', null, UI.loading());
    API.call('marks.sheet', { exam_id: exam.exam_id }).then(function (sheet) {
      box.replaceChildren(buildSheet(sheet, onSaved));
    }).catch(function (e) { box.replaceChildren(UI.errorState(e.message, function () { Router.reload(); })); });
    return box;
  }

  function buildSheet(sheet, onSaved) {
    var e = sheet.exam, wrap = h('div'), locked = !sheet.editable, max = Number(e.max_marks);
    if (!sheet.students.length) {
      wrap.appendChild(h('div', { class: 'card' }, UI.empty('No students in this batch on the exam date', 'Add students to the batch first.')));
      return wrap;
    }
    if (locked) wrap.appendChild(h('div', { class: 'notice warn', role: 'status', text: sheet.lockedReason }));
    else wrap.appendChild(h('p', { class: 'muted', text: 'Enter marks out of ' + num(max) + ', or tick "Absent". A cleared box keeps the saved marks, so tick Absent if the student did not appear.' }));

    var cur = {}, orig = {};
    sheet.students.forEach(function (s) {
      cur[s.student_id] = { marks: s.absent ? '' : num(s.marks_obtained), absent: s.absent, remarks: s.remarks || '' };
      orig[s.student_id] = JSON.stringify(cur[s.student_id]);
    });
    var rowEls = {}, hint = h('span', { class: 'muted' });
    var saveBtn = h('button', { class: 'btn btn-primary', type: 'button' }, [UI.icon('check', 18), 'Save marks']);

    function valid(st) {
      if (st.absent) return true;
      if (st.marks === '') return true;
      var n = Number(st.marks);
      return isFinite(n) && n >= 0 && n <= max;
    }
    function refresh() {
      var dirty = false, bad = 0, missing = 0;
      sheet.students.forEach(function (s) {
        var st = cur[s.student_id], el = rowEls[s.student_id];
        var ok = valid(st);
        el.input.setAttribute('aria-invalid', ok ? 'false' : 'true');
        el.input.classList.toggle('invalid', !ok);
        if (!ok) bad++;
        if (!st.absent && st.marks === '' && !s.entered) missing++;
        if (JSON.stringify(st) !== orig[s.student_id]) dirty = true;
      });
      saveBtn.disabled = locked || !dirty || bad > 0;
      hint.textContent = locked ? '' : bad ? bad + ' mark(s) are not between 0 and ' + num(max)
        : dirty ? 'Unsaved changes' + (missing ? ' · ' + missing + ' student(s) still blank' : '') : (sheet.students.some(function (s) { return s.entered; }) ? 'Saved' : '');
    }

    var list = h('ul', { class: 'att-list' });
    sheet.students.forEach(function (s) {
      var st = cur[s.student_id];
      var input = h('input', { type: 'number', class: 'marks-input', inputmode: 'decimal', min: 0, max: max, step: 'any', 'aria-label': 'Marks for ' + s.full_name, value: st.marks, placeholder: '/ ' + num(max) });
      var absent = h('input', { type: 'checkbox', 'aria-label': s.full_name + ' absent' });
      absent.checked = st.absent;
      var note = h('input', { type: 'text', class: 'att-note', 'aria-label': 'Note for ' + s.full_name, placeholder: 'Note (optional)', maxlength: 100, value: st.remarks });
      if (locked) { input.disabled = true; absent.disabled = true; note.disabled = true; }
      input.disabled = locked || st.absent;
      input.addEventListener('input', function () { st.marks = input.value.trim(); refresh(); });
      absent.addEventListener('change', function () {
        st.absent = absent.checked;
        if (st.absent) { st.marks = ''; input.value = ''; }
        input.disabled = locked || st.absent;
        refresh();
      });
      note.addEventListener('input', function () { st.remarks = note.value.trim(); refresh(); });
      rowEls[s.student_id] = { input: input };
      list.appendChild(h('li', { class: 'att-row marks-row' }, [
        h('div', { class: 'att-name' }, [h('a', { href: '#/students/' + s.student_id, text: s.full_name }), h('span', { class: 'sub', text: s.student_id })]),
        h('div', { class: 'marks-entry' }, [input, h('label', { class: 'absent-check' }, [absent, 'Absent'])]),
        note
      ]));
    });
    wrap.appendChild(h('div', { class: 'card att-card' }, list));

    var saving = false;
    saveBtn.addEventListener('click', function () {
      if (saving) return;
      saving = true; saveBtn.disabled = true; saveBtn.lastChild.textContent = 'Saving…';
      var records = sheet.students.map(function (s) {
        var st = cur[s.student_id];
        return { student_id: s.student_id, marks_obtained: st.marks, absent: st.absent, remarks: st.remarks };
      }).filter(function (r) { return r.absent || r.marks_obtained !== ''; });
      if (!records.length) { saving = false; saveBtn.lastChild.textContent = 'Save marks'; refresh(); UI.toast('Enter marks for at least one student', 'error'); return; }
      API.call('marks.save', { exam_id: e.exam_id, records: records }, { requestId: API.newRequestId() }).then(function (r) {
        UI.toast(r.created + r.updated ? 'Marks saved' : 'Nothing changed', 'success');
        state.dtab = 'results';
        onSaved();
      }).catch(function (err) {
        toast(err); saving = false; saveBtn.lastChild.textContent = 'Save marks'; refresh();
      });
    });
    wrap.appendChild(h('div', { class: 'att-save' }, [hint, saveBtn]));
    refresh();
    return wrap;
  }

  // ------------------------------------------------------------ detail
  function renderDetail(id) {
    return API.call('exams.get', { exam_id: id }).then(function (d) {
      var e = d.exam, root = h('div');
      root.appendChild(h('a', { class: 'back-link', href: '#/exams' }, [UI.icon('back', 18), 'All exams']));
      var actions = [h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { openForm(e); }, text: 'Edit' })];
      if (e.status === 'Active') actions.push(h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { changeStatus(e, 'Cancelled'); }, text: 'Cancel exam' }));
      else actions.push(h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { changeStatus(e, 'Active'); }, text: 'Restore' }));
      root.appendChild(h('div', { class: 'profile-head' }, [
        h('div', null, [h('h2', { text: e.exam_name }), h('div', { class: 'muted' }, [UI.badge(e.status, STATUS_KIND[e.status]), h('span', { text: e.exam_id }), h('span', { text: e.subject })])]),
        h('div', { class: 'head-actions' }, actions)
      ]));
      root.appendChild(h('section', { class: 'card section' }, UI.details([
        ['Batch', h('a', { href: '#/batches/' + e.batch_id, text: e.batch_name || e.batch_id })], ['Date', UI.fmtDate(e.exam_date)],
        ['Maximum marks', num(e.max_marks)], ['Pass percentage', num(e.pass_percent) + '%']
      ])));
      var content = h('div');
      function show(tab) {
        state.dtab = tab;
        content.replaceChildren(tab === 'marks' ? buildMarks(e, function () { Router.reload(); }) : buildResults(d));
      }
      root.appendChild(UI.tabs([{ id: 'results', label: 'Results' }, { id: 'marks', label: 'Enter marks' }], state.dtab, show));
      root.appendChild(content);
      show(state.dtab);
      return root;
    });
  }

  Router.register({ id: 'exams', title: 'Exams', label: 'Exams', icon: 'clipboard', render: function (ctx) {
    if (ctx && ctx.param) {
      if (ctx.param !== lastId) state.dtab = 'results';   // a different exam opens on its results
      lastId = ctx.param;
      return renderDetail(ctx.param);
    }
    lastId = '';
    return renderList();
  } });
})();
