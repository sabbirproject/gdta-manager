/* pages/progress.js - printable progress reports: one student (#/progress/STU-...) or a whole batch */
(function () {
  'use strict';
  var h = UI.h;
  var state = { tab: 'student', from: '', to: '', batch_id: '' };

  function toast(e) { UI.toast(e.message, 'error'); }
  function num(v) { return v === '' || v === null || v === undefined ? '' : String(Math.round(Number(v) * 100) / 100); }
  function addDays(ymd, n) {
    var p = ymd.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }
  function pctBadge(p) {
    if (p === null || p === undefined) return '—';
    return UI.badge(p + '%', p >= 60 ? 'ok' : p >= 40 ? 'warn' : 'bad');
  }
  function resultBadge(r) { return UI.badge(r, r === 'Pass' ? 'ok' : r === 'Fail' ? 'bad' : 'muted'); }
  function stat(label, value, note, cls) {
    return h('div', { class: 'stat ' + (cls || '') }, [
      h('div', { class: 'stat-label', text: label }), h('div', { class: 'stat-value', text: value }),
      note ? h('div', { class: 'stat-note', text: note }) : null
    ]);
  }

  /** Horizontal bar 0-100; `marker` (class average) is drawn as a thin line. */
  function bar(percent, marker, kind) {
    var fill = h('span', { class: 'pbar-fill ' + (kind || '') });
    fill.style.width = Math.max(0, Math.min(100, percent)) + '%';
    var track = h('div', { class: 'pbar', role: 'img', 'aria-label': percent + ' percent' + (marker !== null && marker !== undefined ? ', class average ' + marker + ' percent' : '') }, fill);
    if (marker !== null && marker !== undefined) {
      var m = h('i', { class: 'pbar-mark', title: 'Class average ' + marker + '%' });
      m.style.left = Math.max(0, Math.min(100, marker)) + '%';
      track.appendChild(m);
    }
    return track;
  }

  function periodBar(onChange) {
    var today = UI.todayStr();
    if (!state.to) state.to = today;
    if (!state.from) state.from = addDays(state.to, -364);
    var fromIn = h('input', { type: 'date', 'aria-label': 'From date', value: state.from, max: today });
    var toIn = h('input', { type: 'date', 'aria-label': 'To date', value: state.to, max: today });
    function changed() {
      if (!fromIn.value || !toIn.value) return;
      if (fromIn.value > toIn.value) { UI.toast('The From date must be on or before the To date', 'error'); fromIn.value = state.from; toIn.value = state.to; return; }
      state.from = fromIn.value; state.to = toIn.value; onChange();
    }
    fromIn.addEventListener('change', changed); toIn.addEventListener('change', changed);
    return { from: h('div', null, [h('label', { text: 'From' }), fromIn]), to: h('div', null, [h('label', { text: 'To' }), toIn]) };
  }

  function letterhead(inst, title, lines) {
    return h('div', { class: 'report-head' }, [
      h('div', { class: 'report-inst', text: inst.name }),
      inst.address || inst.phone ? h('div', { class: 'muted', text: [inst.address, inst.phone ? 'Phone: ' + inst.phone : ''].filter(Boolean).join(' · ') }) : null,
      h('h2', { class: 'report-title', text: title }),
      h('div', { class: 'report-lines' }, lines.map(function (l) { return h('div', { text: l }); }))
    ]);
  }

  // ------------------------------------------------------------ student report
  function buildStudentReport(d) {
    var s = d.summary, sheet = h('div', { class: 'card report-sheet' });
    sheet.appendChild(letterhead(d.institute, 'Progress Report', [
      d.student.full_name + ' (' + d.student.student_id + ')',
      'Period: ' + UI.fmtDate(d.from) + ' to ' + UI.fmtDate(d.to)
    ]));
    if (!d.exams.length && !d.attendance.total) {
      sheet.appendChild(UI.empty('Nothing to report in this period', 'No exam marks or attendance were recorded between these dates.'));
      return sheet;
    }
    sheet.appendChild(h('div', { class: 'grid-stats' }, [
      stat('Exams taken', String(s.appeared), s.absent ? s.absent + ' absent' : ''),
      stat('Average', s.average_percent === null ? '—' : s.average_percent + '%', s.appeared ? s.passed + ' passed, ' + s.failed + ' failed' : '', s.average_percent !== null && s.average_percent < 40 ? 'warn' : 'ok'),
      stat('Attendance', d.attendance.percent === null ? '—' : d.attendance.percent + '%', d.attendance.total ? d.attendance.present + ' of ' + d.attendance.total + ' days present' : 'None marked'),
      stat('Best result', s.best ? s.best.percentage + '%' : '—', s.best ? s.best.subject : '')
    ]));

    if (d.subjects.length) {
      sheet.appendChild(h('h3', { class: 'report-sub', text: 'Subject-wise average' }));
      sheet.appendChild(h('ul', { class: 'bar-list' }, d.subjects.map(function (x) {
        return h('li', null, [
          h('span', { class: 'bar-label', text: x.subject + ' (' + x.exams + (x.exams === 1 ? ' exam)' : ' exams)') }),
          bar(x.average_percent, null, x.average_percent < 40 ? 'low' : ''),
          h('span', { class: 'bar-value', text: x.average_percent + '%' })
        ]);
      })));
    }

    if (d.exams.length) {
      sheet.appendChild(h('h3', { class: 'report-sub', text: 'Exam results' }));
      sheet.appendChild(UI.table([
        { label: 'Date', render: function (x) { return UI.fmtDate(x.exam_date); } },
        { label: 'Exam', render: function (x) { return h('span', null, [h('a', { href: '#/exams/' + x.exam_id, text: x.exam_name }), h('span', { class: 'sub', text: x.subject })]); } },
        { label: 'Marks', render: function (x) { return x.marks_obtained === '' ? 'Absent' : num(x.marks_obtained) + ' / ' + num(x.max_marks); } },
        { label: 'Score', render: function (x) { return x.percentage === null ? '' : h('div', { class: 'score-cell' }, [bar(x.percentage, x.class_average_percent, x.result === 'Fail' ? 'low' : ''), h('span', { text: x.percentage + '%' })]); } },
        { label: 'Class avg', cls: 'hide-sm', render: function (x) { return x.class_average_percent === null ? '' : x.class_average_percent + '%'; } },
        { label: 'Rank', cls: 'hide-sm', render: function (x) { return x.rank === '' ? '' : x.rank + ' of ' + x.appeared; } },
        { label: 'Result', render: function (x) { return resultBadge(x.result); } }
      ], d.exams));
      sheet.appendChild(h('p', { class: 'muted report-note', text: 'The thin line on each bar marks the class average for that exam.' }));
    }
    sheet.appendChild(h('div', { class: 'report-foot' }, [h('span', { text: 'Generated on ' + UI.fmtDate(UI.todayStr()) }), h('span', { class: 'sign', text: 'Principal / Coordinator' })]));
    return sheet;
  }

  function studentReportInto(box, id) {
    var seq = 0;
    var out = h('div');
    var pb = periodBar(load);
    box.appendChild(h('div', { class: 'report-bar no-print' }, [
      pb.from, pb.to,
      h('div', null, [h('label', { text: '\u00a0' }), h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { window.print(); } }, [UI.icon('print', 16), 'Print report'])])
    ]));
    box.appendChild(out);
    function load() {
      var mine = ++seq;
      out.replaceChildren(UI.loading());
      API.call('progress.student', { student_id: id, from: state.from, to: state.to }).then(function (d) {
        if (mine === seq) out.replaceChildren(buildStudentReport(d));
      }).catch(function (e) { if (mine === seq) out.replaceChildren(UI.errorState(e.message, load)); });
    }
    load();
  }

  function renderStudentPage(id) {
    var root = h('div');
    root.appendChild(h('a', { class: 'back-link no-print', href: '#/students/' + id }, [UI.icon('back', 18), 'Back to student']));
    root.appendChild(h('div', { class: 'page-head no-print' }, [h('div', null, [h('h2', { text: 'Progress report' })])]));
    studentReportInto(root, id);
    return Promise.resolve(root);
  }

  function studentPicker(box) {
    var input = h('input', { type: 'search', 'aria-label': 'Search students', placeholder: 'Type a name, ID or phone', maxlength: 60, autocomplete: 'off' });
    var list = h('ul', { class: 'picker-results' });
    box.appendChild(h('div', { class: 'card section' }, [h('label', { text: 'Find a student' }), input, list]));
    var seq = 0;
    function search() {
      var mine = ++seq;
      API.call('students.options', { q: input.value.trim() }).then(function (d) {
        if (mine !== seq) return;
        list.replaceChildren();
        if (!d.items.length) { list.appendChild(h('li', null, UI.empty('No matching students'))); return; }
        d.items.forEach(function (s) {
          list.appendChild(h('li', null, h('a', { class: 'picker-link', href: '#/progress/' + s.student_id }, [
            h('span', { text: s.full_name }), h('span', { class: 'muted', text: s.student_id + (s.phone ? ' · ' + s.phone : '') })
          ])));
        });
      }).catch(function (e) { if (mine === seq) { list.replaceChildren(); list.appendChild(h('li', { class: 'form-error', text: e.message })); } });
    }
    input.addEventListener('input', UI.debounce(search, 250));
    search();
  }

  // ------------------------------------------------------------ batch report
  function buildBatchReport(d) {
    var sheet = h('div', { class: 'card report-sheet' });
    sheet.appendChild(letterhead(d.institute, 'Batch Progress Report', [
      d.batch.batch_name + ' (' + d.batch.batch_id + ')',
      'Period: ' + UI.fmtDate(d.from) + ' to ' + UI.fmtDate(d.to) + ' · ' + d.exams.length + (d.exams.length === 1 ? ' exam' : ' exams')
    ]));
    if (!d.students.length) { sheet.appendChild(UI.empty('No students in this batch')); return sheet; }
    if (!d.exams.length) sheet.appendChild(h('div', { class: 'notice warn', role: 'status', text: 'No exams in this batch during this period. Only attendance is shown.' }));
    else sheet.appendChild(h('div', { class: 'grid-stats' }, [
      stat('Class average', d.class_average_percent === null ? '—' : d.class_average_percent + '%', 'average of student averages'),
      stat('Exams held', String(d.exams.length)),
      stat('Students', String(d.students.length))
    ]));
    sheet.appendChild(UI.table([
      { label: 'Rank', render: function (x) { return x.rank === '' ? '—' : String(x.rank); } },
      { label: 'Student', render: function (x) { return h('span', null, [h('a', { href: '#/progress/' + x.student_id, text: x.full_name }), h('span', { class: 'sub', text: x.student_id })]); } },
      { label: 'Exams', render: function (x) { return x.exams_appeared + (x.absent ? ' (+' + x.absent + ' absent)' : ''); } },
      { label: 'Total marks', cls: 'hide-sm', render: function (x) { return x.exams_appeared ? num(x.total_obtained) + ' / ' + num(x.total_max) : ''; } },
      { label: 'Average', render: function (x) { return pctBadge(x.average_percent); } },
      { label: 'Pass / Fail', cls: 'hide-sm', render: function (x) { return x.exams_appeared ? x.passed + ' / ' + x.failed : ''; } },
      { label: 'Attendance', render: function (x) { return pctBadge(x.attendance_percent); } }
    ], d.students));
    sheet.appendChild(h('div', { class: 'report-foot' }, [h('span', { text: 'Generated on ' + UI.fmtDate(UI.todayStr()) }), h('span', { class: 'sign', text: 'Principal / Coordinator' })]));
    return sheet;
  }

  function batchReportInto(box) {
    return API.call('batches.list', { status: 'All', pageSize: 100 }).then(function (bd) {
      if (!bd.items.length) { box.appendChild(h('div', { class: 'card' }, UI.empty('No batches yet'))); return; }
      if (!state.batch_id || !bd.items.some(function (b) { return b.batch_id === state.batch_id; })) state.batch_id = bd.items[0].batch_id;
      var sel = UI.select(bd.items.map(function (b) { return { value: b.batch_id, label: b.batch_name + (b.status !== 'Active' ? ' (' + b.status.toLowerCase() + ')' : '') }; }), state.batch_id, { 'aria-label': 'Batch' });
      var pb = periodBar(load);
      box.appendChild(h('div', { class: 'report-bar report-bar-batch no-print' }, [h('div', null, [h('label', { text: 'Batch' }), sel]), pb.from, pb.to]));
      box.appendChild(h('div', { class: 'section-head no-print' }, [h('span'), h('button', { class: 'btn btn-outline btn-small', type: 'button', onclick: function () { window.print(); } }, [UI.icon('print', 16), 'Print report'])]));
      var out = h('div');
      box.appendChild(out);
      var seq = 0;
      function load() {
        var mine = ++seq;
        out.replaceChildren(UI.loading());
        API.call('progress.batch', { batch_id: state.batch_id, from: state.from, to: state.to }).then(function (d) {
          if (mine === seq) out.replaceChildren(buildBatchReport(d));
        }).catch(function (e) { if (mine === seq) out.replaceChildren(UI.errorState(e.message, load)); });
      }
      sel.addEventListener('change', function () { state.batch_id = sel.value; load(); });
      load();
    });
  }

  function renderHome() {
    var root = h('div');
    root.appendChild(h('div', { class: 'page-head no-print' }, [h('div', null, [h('h2', { text: 'Progress reports' }), h('div', { class: 'muted', text: 'Marks and attendance, ready to print' })])]));
    var content = h('div');
    function show(tab) {
      state.tab = tab;
      content.replaceChildren();
      if (tab === 'batch') batchReportInto(content).catch(function (e) { content.replaceChildren(UI.errorState(e.message, function () { show(tab); })); });
      else studentPicker(content);
    }
    root.appendChild(UI.tabs([{ id: 'student', label: 'Student report' }, { id: 'batch', label: 'Batch report' }], state.tab, show));
    root.appendChild(content);
    show(state.tab);
    return Promise.resolve(root);
  }

  Router.register({ id: 'progress', title: 'Progress reports', label: 'Progress', icon: 'chart', render: function (ctx) {
    return ctx && ctx.param ? renderStudentPage(ctx.param) : renderHome();
  } });
})();
