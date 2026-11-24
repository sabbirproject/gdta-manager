/* pages/reports.js - run a report, look at it, print it, or save it as a CSV file (opens in Excel / Google Sheets) */
(function () {
  'use strict';
  var h = UI.h;
  var state = { type: 'students', filters: {} };

  var TYPES = [
    { id: 'students', label: 'Student directory', filters: ['status', 'course', 'batch_opt', 'q'] },
    { id: 'batch_students', label: 'Batch-wise student list', filters: ['batch'] },
    { id: 'attendance', label: 'Attendance report', filters: ['batch', 'period30'] },
    { id: 'fee_collection', label: 'Fee collection', filters: ['period30', 'method'] },
    { id: 'dues', label: 'Outstanding fees (dues)', filters: ['dues_filter', 'batch_opt', 'course'] },
    { id: 'exam_results', label: 'Exam result sheet', filters: ['exam'] },
    { id: 'progress', label: 'Batch progress report', filters: ['batch', 'period365'] }
  ];
  var MONEY = { amount: 1, net: 1, paid: 1, balance: 1, overdue: 1 };
  var DATES = { payment_date: 1, admission_date: 1, enrolled_on: 1, next_due: 1 };
  var NUMERIC = { amount: 1, net: 1, paid: 1, balance: 1, overdue: 1, present: 1, absent: 1, leave: 1, total: 1, percent: 1, percentage: 1, rank: 1, no: 1, exams_appeared: 1, total_obtained: 1, total_max: 1, average_percent: 1, passed: 1, failed: 1, attendance_percent: 1 };

  function addDays(ymd, n) {
    var p = ymd.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function show(col, v) {
    if (v === '' || v === null || v === undefined) return '';
    if (MONEY[col.key]) return UI.money(v);
    if (DATES[col.key]) return UI.fmtDate(v);
    return String(v);
  }

  function render() {
    var root = h('div');
    return Promise.all([
      API.call('batches.list', { status: 'All', pageSize: 100 }),
      API.call('courses.list', { status: 'All' }),
      API.call('exams.list', { status: 'Active', pageSize: 100 })
    ]).then(function (r) {
      var batches = r[0].items, courses = r[1].items, exams = r[2].items;
      var today = UI.todayStr();
      root.appendChild(h('div', { class: 'page-head no-print' }, [h('div', null, [h('h2', { text: 'Reports' }), h('div', { class: 'muted', text: 'Choose a report, then print it or download a CSV' })])]));

      var typeSel = UI.select(TYPES.map(function (t) { return { value: t.id, label: t.label }; }), state.type, { 'aria-label': 'Report type', id: 'rep-type' });
      var filterBox = h('div', { class: 'form-grid report-filters' });
      var run = h('button', { class: 'btn btn-primary', type: 'button' }, [UI.icon('file', 18), 'Show report']);
      root.appendChild(h('div', { class: 'card section no-print' }, [
        h('div', { class: 'field' }, [h('label', { for: 'rep-type', text: 'Report' }), typeSel]),
        filterBox,
        h('div', { class: 'modal-actions' }, run)
      ]));
      var out = h('div');
      root.appendChild(out);

      var ctl = {};
      function opt(list, valueKey, labelFn, first) { return [{ value: '', label: first }].concat(list.map(function (x) { return { value: x[valueKey], label: labelFn(x) }; })); }
      function add(name, label, field) { ctl[name] = field; filterBox.appendChild(field.el); }
      function drawFilters() {
        filterBox.replaceChildren(); ctl = {};
        var t = TYPES.filter(function (x) { return x.id === typeSel.value; })[0];
        var f = state.filters;
        t.filters.forEach(function (k) {
          if (k === 'status') add('status', '', UI.field({ name: 'status', label: 'Students', type: 'select', value: f.status || 'Active', options: [{ value: 'Active', label: 'Active' }, { value: 'Archived', label: 'Archived' }, { value: 'All', label: 'All' }] }));
          if (k === 'course' || k === 'course_opt') add('course_id', '', UI.field({ name: 'course_id', label: 'Course', type: 'select', value: f.course_id || '', options: opt(courses, 'course_id', function (c) { return c.course_name; }, 'All courses') }));
          if (k === 'batch_opt') add('batch_id', '', UI.field({ name: 'batch_id', label: 'Batch', type: 'select', value: f.batch_id || '', options: opt(batches, 'batch_id', function (b) { return b.batch_name; }, 'All batches') }));
          if (k === 'batch') add('batch_id', '', UI.field({ name: 'batch_id', label: 'Batch', type: 'select', required: true, value: f.batch_id || '', options: opt(batches, 'batch_id', function (b) { return b.batch_name + (b.status !== 'Active' ? ' (' + b.status.toLowerCase() + ')' : ''); }, 'Select a batch') }));
          if (k === 'q') add('q', '', UI.field({ name: 'q', label: 'Search name or ID', maxlength: 60, value: f.q || '' }));
          if (k === 'period30' || k === 'period365') {
            var days = k === 'period30' ? 29 : 364;
            add('from', '', UI.field({ name: 'from', label: 'From', type: 'date', value: f.from || addDays(today, -days) }));
            add('to', '', UI.field({ name: 'to', label: 'To', type: 'date', value: f.to || today }));
          }
          if (k === 'method') add('method', '', UI.field({ name: 'method', label: 'Payment method', type: 'select', value: f.method || '', options: [{ value: '', label: 'All methods' }, { value: 'Cash', label: 'Cash' }, { value: 'UPI', label: 'UPI' }, { value: 'Bank', label: 'Bank' }, { value: 'Cheque', label: 'Cheque' }, { value: 'Other', label: 'Other' }] }));
          if (k === 'dues_filter') add('filter', '', UI.field({ name: 'filter', label: 'Show', type: 'select', value: f.filter || 'All', options: [{ value: 'All', label: 'Everyone who owes' }, { value: 'Overdue', label: 'Overdue only' }, { value: 'Partial', label: 'Part-paid only' }] }));
          if (k === 'exam') add('exam_id', '', UI.field({ name: 'exam_id', label: 'Exam', type: 'select', required: true, wide: true, value: f.exam_id || '', options: opt(exams, 'exam_id', function (x) { return x.exam_name + ' — ' + x.subject + ' (' + x.batch_name + ')'; }, 'Select an exam') }));
        });
      }
      typeSel.addEventListener('change', function () { state.type = typeSel.value; state.filters = {}; out.replaceChildren(); drawFilters(); });
      drawFilters();

      var seq = 0;
      function go() {
        var payload = { type: typeSel.value };
        Object.keys(ctl).forEach(function (k) { payload[k] = ctl[k].control.value.trim(); });
        state.filters = {}; Object.keys(ctl).forEach(function (k) { state.filters[k] = payload[k]; });
        var missing = Object.keys(ctl).filter(function (k) { return ctl[k].control.required && !payload[k]; });
        if (missing.length) { UI.toast('Choose ' + (missing[0] === 'exam_id' ? 'an exam' : 'a batch') + ' first.', 'error'); return; }
        if (payload.from && payload.to && payload.from > payload.to) { UI.toast('The From date must be on or before the To date', 'error'); return; }
        var mine = ++seq;
        run.disabled = true;
        out.replaceChildren(UI.loading());
        API.call('reports.run', payload).then(function (d) {
          if (mine !== seq) return;
          out.replaceChildren(sheet(d));
        }).catch(function (e) { if (mine === seq) out.replaceChildren(UI.errorState(e.message, go)); })
          .then(function () { run.disabled = false; });
      }
      run.addEventListener('click', go);
      return root;
    });
  }

  function sheet(d) {
    var wrap = h('div');
    var csvBtn = h('button', { class: 'btn btn-outline', type: 'button', disabled: !d.rows.length, onclick: function () {
      UI.download(slug(d.title) + '-' + UI.todayStr() + '.csv', UI.csv(d.columns, d.rows));
      UI.toast('CSV file saved to your downloads', 'success');
    } }, [UI.icon('download', 18), 'Download CSV']);
    var printBtn = h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { window.print(); } }, [UI.icon('print', 18), 'Print']);
    wrap.appendChild(h('div', { class: 'section-head no-print' }, [h('span', { class: 'muted', text: d.rows.length + (d.rows.length === 1 ? ' row' : ' rows') }), h('div', { class: 'head-actions' }, [csvBtn, printBtn])]));
    var paper = h('div', { class: 'card report-sheet' });
    paper.appendChild(h('div', { class: 'report-head' }, [
      h('div', { class: 'report-inst', text: d.institute.name }),
      d.institute.address || d.institute.phone ? h('div', { class: 'muted', text: [d.institute.address, d.institute.phone ? 'Phone: ' + d.institute.phone : ''].filter(Boolean).join(' · ') }) : null,
      h('h2', { class: 'report-title', text: d.title }),
      h('div', { class: 'report-lines' }, h('div', { text: d.subtitle }))
    ]));
    if (d.totals && d.totals.length) {
      paper.appendChild(h('div', { class: 'report-totals' }, d.totals.map(function (t) {
        var isMoney = /^(Total collected|Total balance|Of which overdue)$/.test(t[0]) || /^\s{2}\S/.test(t[0]);   // method rows are indented by the server
        return h('div', null, [h('span', { class: 'muted', text: String(t[0]).trim() }), h('strong', { text: isMoney ? UI.money(t[1]) : String(t[1]) })]);
      })));
    }
    if (!d.rows.length) {
      paper.appendChild(UI.empty('Nothing to show', 'No records match these filters.'));
    } else {
      paper.appendChild(UI.table(d.columns.map(function (c, i) {
        return { label: c.label, cls: (NUMERIC[c.key] ? 'num ' : '') + (i > 5 ? 'hide-sm' : ''), render: function (row) { return show(c, row[c.key]); } };
      }), d.rows));
    }
    paper.appendChild(h('div', { class: 'report-foot' }, [h('span', { text: 'Generated on ' + UI.fmtDate(UI.todayStr()) }), h('span', { class: 'muted', text: 'Confidential: contains student details' })]));
    wrap.appendChild(paper);
    wrap.appendChild(h('p', { class: 'muted report-note no-print', text: 'The CSV has every column, including the ones hidden on a small screen. Text that begins with = + - or @ is saved with a leading apostrophe so a spreadsheet cannot run it as a formula.' }));
    return wrap;
  }

  Router.register({ id: 'reports', title: 'Reports', label: 'Reports', icon: 'file', render: render });
})();
