/* pages/fees.js - dues, receipts, per-student fees, fee plans, collecting and reversing payments, printable receipts */
(function () {
  'use strict';
  var h = UI.h;
  var state = {
    tab: 'dues', q: '', filter: 'All', course_id: '', batch_id: '', page: 1,
    rq: '', rstatus: 'All', rmethod: '', rfrom: '', rto: '', rpage: 1
  };
  var METHODS = ['Cash', 'UPI', 'Bank', 'Cheque', 'Other'].map(function (m) { return { value: m, label: m }; });
  var SCHEDULES = ['One-time', 'Monthly', 'Quarterly', 'Custom'].map(function (m) { return { value: m, label: m }; });
  var FEE_KIND = { Paid: 'ok', Partial: 'warn', Pending: 'muted', Cancelled: 'muted' };

  function toast(e) { UI.toast(e.message, 'error'); }
  function link(href, text) { return h('a', { href: href, text: text }); }
  function phoneLink(p) { return p ? h('a', { href: 'tel:' + String(p).replace(/[^0-9+]/g, ''), text: p }) : ''; }
  function sub(a, b) { return h('span', null, [a, b ? h('span', { class: 'sub', text: b }) : null]); }

  // ------------------------------------------------------------ receipt
  function showReceipt(no) {
    API.call('payments.receipt', { receipt_no: no }).then(function (d) {
      var r = d.receipt, s = d.student, inst = d.institute;
      var paper = h('div', { class: 'receipt' }, [
        h('div', { class: 'receipt-head' }, [
          h('h3', { text: inst.name }),
          inst.address ? h('div', { class: 'muted', text: inst.address }) : null,
          inst.phone ? h('div', { class: 'muted', text: 'Phone: ' + inst.phone }) : null
        ]),
        h('div', { class: 'receipt-title', text: 'FEE RECEIPT' }),
        r.status === 'Reversed'
          ? h('div', { class: 'notice bad', role: 'status', text: 'REVERSED' + (r.reversed_on ? ' on ' + UI.fmtDate(r.reversed_on) : '') + (r.reversed_reason ? ' — ' + r.reversed_reason : '') })
          : null,
        UI.details([
          ['Receipt no', r.receipt_no], ['Date', UI.fmtDate(r.payment_date)], ['Student', s.full_name], ['Student ID', s.student_id],
          ['Payment method', r.method + (r.reference_no ? ' (' + r.reference_no + ')' : '')], ['Received by', r.received_by]
        ]),
        UI.table([
          { label: 'Installment', render: function (l) { return l.installment_no ? '#' + l.installment_no : ''; } },
          { label: 'Course', render: function (l) { return l.course_name; } },
          { label: 'Due date', render: function (l) { return l.due_date ? UI.fmtDate(l.due_date) : ''; } },
          { label: 'Amount', cls: 'num', render: function (l) { return UI.money(l.amount); } }
        ], r.lines),
        h('div', { class: 'receipt-total' }, [h('span', { text: 'Total received' }), h('strong', { text: UI.money(r.amount) })]),
        h('div', { class: 'receipt-words', text: UI.rupeesInWords(r.amount) }),
        h('div', { class: 'muted', text: 'Current balance due for this student: ' + UI.money(d.balance_now) }),
        h('div', { class: 'receipt-foot muted', text: 'This is a computer-generated receipt.' })
      ]);
      var m = UI.modal('Receipt ' + r.receipt_no, [paper, h('div', { class: 'modal-actions no-print' }, [
        h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { m.close(); }, text: 'Close' }),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { window.print(); } }, [UI.icon('print', 18), 'Print'])
      ])]);
    }).catch(toast);
  }

  // ------------------------------------------------------------ payment forms
  /** opts: {balance, fee}. fee = a single installment to pay; otherwise the amount fills the oldest dues first. */
  function openPayForm(student, opts, after) {
    var fee = opts.fee || null;
    var max = fee ? fee.balance : opts.balance;
    var requestId = API.newRequestId();
    UI.formModal({
      title: 'Collect payment — ' + student.full_name,
      submitLabel: 'Record payment',
      intro: fee
        ? 'Installment #' + fee.installment_no + ' · balance ' + UI.money(max)
        : 'Total due ' + UI.money(max) + '. The amount is applied to the oldest unpaid installments first.',
      fields: [
        { name: 'amount', label: 'Amount (₹)', type: 'number', required: true, min: 0.01, max: max, step: '0.01', value: max, hint: 'Up to ' + UI.money(max) },
        { name: 'payment_date', label: 'Payment date', type: 'date', required: true, max: UI.todayStr(), value: UI.todayStr() },
        { name: 'method', label: 'Method', type: 'select', required: true, value: 'Cash', options: METHODS },
        { name: 'reference_no', label: 'Reference no', maxlength: 40, hint: 'UPI transaction ID, cheque number…' },
        { name: 'notes', label: 'Note', maxlength: 200, wide: true }
      ],
      onSubmit: function (v) {
        var payload = { student_id: student.student_id, amount: v.amount, payment_date: v.payment_date, method: v.method, reference_no: v.reference_no, notes: v.notes };
        if (fee) payload.fee_id = fee.fee_id;
        return API.call('payments.record', payload, { requestId: requestId }).then(function (r) {
          UI.toast('Payment recorded · ' + r.receipt_no, 'success');
          setTimeout(function () { showReceipt(r.receipt_no); }, 0);
          after();
        });
      }
    });
  }

  function openReverseForm(receipt, after) {
    UI.formModal({
      title: 'Reverse receipt ' + receipt.receipt_no,
      submitLabel: 'Reverse payment',
      intro: 'This cancels the whole receipt (' + UI.money(receipt.amount) + '). The receipt stays on record marked Reversed, and the fees become due again. This cannot be undone, but you can record a new payment.',
      fields: [{ name: 'reason', label: 'Reason', required: true, maxlength: 150, wide: true, hint: 'For example: wrong student, wrong amount' }],
      onSubmit: function (v) {
        return API.call('payments.reverse', { receipt_no: receipt.receipt_no, reason: v.reason }, { requestId: API.newRequestId() }).then(function () {
          UI.toast('Receipt reversed', 'success');
          after();
        });
      }
    });
  }

  function openFeeEdit(fee, after) {
    UI.formModal({
      title: 'Edit installment #' + fee.installment_no,
      submitLabel: 'Save changes',
      intro: fee.paid > 0 ? 'Already paid ' + UI.money(fee.paid) + '. The amount after discount cannot be lower than this.' : null,
      fields: [
        { name: 'due_date', label: 'Due date', type: 'date', required: true, value: fee.due_date },
        { name: 'amount_due', label: 'Amount (₹)', type: 'number', required: true, min: 0.01, max: 1000000, step: '0.01', value: fee.amount_due },
        { name: 'discount', label: 'Discount (₹)', type: 'number', min: 0, max: 1000000, step: '0.01', value: fee.discount },
        { name: 'notes', label: 'Note', maxlength: 200, value: fee.notes, wide: true }
      ],
      onSubmit: function (v) {
        v.fee_id = fee.fee_id;
        return API.call('fees.update', v, { requestId: API.newRequestId() }).then(function () { UI.toast('Installment updated', 'success'); after(); });
      }
    });
  }

  function openFeeCancel(fee, after) {
    UI.formModal({
      title: 'Cancel installment #' + fee.installment_no,
      submitLabel: 'Cancel installment',
      intro: 'The installment stays on record marked Cancelled and is no longer counted as due.',
      fields: [{ name: 'reason', label: 'Reason', required: true, maxlength: 150, wide: true }],
      onSubmit: function (v) {
        return API.call('fees.cancel', { fee_id: fee.fee_id, reason: v.reason }, { requestId: API.newRequestId() }).then(function () { UI.toast('Installment cancelled', 'success'); after(); });
      }
    });
  }

  // ------------------------------------------------------------ fee plan
  function openPlanForm(student, after) {
    API.call('courses.list', { status: 'Active' }).then(function (cd) {
      var courses = cd.items;
      if (!courses.length) { UI.toast('Add a course first. Fee plans are created for a course.', 'error'); return; }
      var byId = {};
      courses.forEach(function (c) { byId[c.course_id] = c; });
      var first = byId[student.course_id] ? student.course_id : '';
      var requestId = API.newRequestId();

      var fCourse = UI.field({ name: 'course_id', label: 'Course', type: 'select', required: true, value: first, wide: true,
        options: [{ value: '', label: 'Select a course' }].concat(courses.map(function (c) { return { value: c.course_id, label: c.course_name }; })) });
      var fTotal = UI.field({ name: 'total_fee', label: 'Total fee (₹)', type: 'number', required: true, min: 0.01, max: 1000000, step: '0.01', value: first ? byId[first].total_fee : '' });
      var fDisc = UI.field({ name: 'discount', label: 'Discount (₹)', type: 'number', min: 0, max: 1000000, step: '0.01', value: 0 });
      var fSched = UI.field({ name: 'schedule', label: 'Fee schedule', type: 'select', required: true, value: first ? byId[first].fee_schedule : 'One-time', options: SCHEDULES });
      var fInst = UI.field({ name: 'installments', label: 'Number of installments', type: 'number', min: 1, max: 60, step: 1, value: first ? byId[first].installments : 1 });
      var fInt = UI.field({ name: 'interval_days', label: 'Days between installments', type: 'number', min: 1, max: 365, step: 1, value: 30 });
      var fDue = UI.field({ name: 'first_due_date', label: 'First due date', type: 'date', required: true, value: UI.todayStr() });
      var all = [fCourse, fTotal, fDisc, fSched, fInst, fInt, fDue];

      var preview = h('div', { class: 'plan-preview', 'aria-live': 'polite' });
      var errBox = h('div', { class: 'form-error', role: 'alert', hidden: true });
      var submit = h('button', { class: 'btn btn-primary', type: 'submit', text: 'Create fee plan' });
      var form = h('form', { class: 'form' }, [
        h('p', { class: 'muted', text: 'For ' + student.full_name + '. Installments are calculated for you and add up exactly to the total after discount.' }),
        errBox,
        h('div', { class: 'form-grid' }, all.map(function (f) { return f.el; })),
        h('div', { class: 'section' }, preview),
        h('div', { class: 'modal-actions' }, [
          h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { m.close(); }, text: 'Cancel' }), submit
        ])
      ]);
      var m = UI.modal('Add fee plan', form, { static: true });

      function vals() {
        return {
          student_id: student.student_id, course_id: fCourse.control.value, total_fee: fTotal.control.value, discount: fDisc.control.value,
          schedule: fSched.control.value, installments: fInst.control.value, interval_days: fInt.control.value, first_due_date: fDue.control.value
        };
      }
      function syncVisibility() {
        fInst.el.hidden = fSched.control.value === 'One-time';
        fInt.el.hidden = fSched.control.value !== 'Custom';
      }
      var seq = 0;
      var refreshPreview = UI.debounce(function () {
        var mine = ++seq;
        var v = vals();
        if (!v.total_fee) { preview.replaceChildren(h('p', { class: 'muted', text: 'Enter the total fee to see the installments.' })); return; }
        API.call('fees.planPreview', v).then(function (d) {
          if (mine !== seq) return;
          preview.replaceChildren(
            h('h3', { text: 'Installments' }),
            UI.table([
              { label: '#', render: function (r) { return String(r.installment_no); } },
              { label: 'Due date', render: function (r) { return UI.fmtDate(r.due_date); } },
              { label: 'Amount', cls: 'num', render: function (r) { return UI.money(r.amount_due); } },
              { label: 'Discount', cls: 'num', render: function (r) { return r.discount ? UI.money(r.discount) : ''; } },
              { label: 'To pay', cls: 'num', render: function (r) { return UI.money(r.net); } }
            ], d.rows),
            h('p', { class: 'muted', text: 'Total to pay: ' + UI.money(d.net) + (d.discount ? ' (after ' + UI.money(d.discount) + ' discount)' : '') })
          );
        }).catch(function (e) { if (mine === seq) preview.replaceChildren(h('p', { class: 'muted', text: e.message })); });
      }, 250);

      fCourse.control.addEventListener('change', function () {
        var c = byId[fCourse.control.value];
        if (c) { fTotal.control.value = c.total_fee; fSched.control.value = c.fee_schedule; fInst.control.value = c.installments; }
        syncVisibility(); refreshPreview();
      });
      all.forEach(function (f) { if (f !== fCourse) { f.control.addEventListener('input', function () { syncVisibility(); refreshPreview(); }); f.control.addEventListener('change', function () { syncVisibility(); refreshPreview(); }); } });
      syncVisibility(); refreshPreview();

      var busy = false;
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (busy) return;
        errBox.hidden = true;
        if (!form.reportValidity()) return;
        busy = true; submit.disabled = true; submit.textContent = 'Saving…';
        function send(extra) { return API.call('fees.createPlan', Object.assign(vals(), extra || {}), { requestId: requestId }); }
        send().catch(function (err) {
          if (err.code !== 'DUPLICATE') throw err;
          return UI.confirmDialog({ title: 'Fees already exist', okLabel: 'Add anyway', message: err.message + ' Add another plan anyway?' }).then(function (yes) {
            if (!yes) throw new Error('Not saved.');
            return send({ allowExisting: true });
          });
        }).then(function () {
          m.close();
          UI.toast('Fee plan created', 'success');
          after();
        }).catch(function (err) {
          errBox.textContent = err.message || 'Could not save. Please try again.';
          errBox.hidden = false; busy = false; submit.disabled = false; submit.textContent = 'Create fee plan';
        });
      });
    }).catch(toast);
  }

  // ------------------------------------------------------------ find a student
  function openStudentFinder() {
    var input = h('input', { type: 'search', 'aria-label': 'Search students', placeholder: 'Type a name, ID or phone', maxlength: 60, autocomplete: 'off' });
    var list = h('ul', { class: 'picker-results' });
    var m = UI.modal('Find a student', [input, h('p', { class: 'muted', text: 'Open a student\'s fees to collect a payment or add a fee plan.' }), list], { static: true });
    var seq = 0;
    function search() {
      var mine = ++seq;
      API.call('students.options', { q: input.value.trim() }).then(function (d) {
        if (mine !== seq) return;
        list.replaceChildren();
        if (!d.items.length) { list.appendChild(h('li', null, UI.empty('No matching students'))); return; }
        d.items.forEach(function (s) {
          list.appendChild(h('li', null, h('button', { type: 'button', onclick: function () { m.close(); location.hash = '#/fees/' + s.student_id; } }, [
            h('span', { text: s.full_name }), h('span', { class: 'muted', text: s.student_id + (s.phone ? ' · ' + s.phone : '') })
          ])));
        });
      }).catch(function (e) { if (mine === seq) { list.replaceChildren(h('li', { class: 'form-error', text: e.message })); } });
    }
    input.addEventListener('input', UI.debounce(search, 250));
    search();
  }

  // ------------------------------------------------------------ dues tab
  function renderDues(box) {
    var search = h('input', { type: 'search', 'aria-label': 'Search students', placeholder: 'Search name, ID or phone', maxlength: 60, autocomplete: 'off', value: state.q });
    var filter = UI.select([{ value: 'All', label: 'All dues' }, { value: 'Overdue', label: 'Overdue only' }, { value: 'Partial', label: 'Part-paid only' }], state.filter, { 'aria-label': 'Filter dues' });
    var course = UI.select([{ value: '', label: 'All courses' }], state.course_id, { 'aria-label': 'Filter by course' });
    var batch = UI.select([{ value: '', label: 'All batches' }], state.batch_id, { 'aria-label': 'Filter by batch' });
    box.appendChild(h('div', { class: 'toolbar' }, [h('div', { class: 'search' }, search), h('div', null, filter), h('div', null, course), h('div', null, batch)]));
    var summary = h('div');
    var results = h('div');
    box.appendChild(summary); box.appendChild(results);
    var seq = 0;

    function load() {
      var mine = ++seq;
      results.replaceChildren(UI.loading());
      API.call('fees.dues', { q: state.q, filter: state.filter, course_id: state.course_id, batch_id: state.batch_id, page: state.page, pageSize: 25 }).then(function (d) {
        if (mine !== seq) return;
        results.replaceChildren(); summary.replaceChildren();
        var t = d.totals;
        summary.appendChild(h('div', { class: 'grid-stats grid-stats-3' }, [
          h('div', { class: 'stat' }, [h('div', { class: 'stat-label', text: 'Students with dues' }), h('div', { class: 'stat-value', text: String(t.students) })]),
          h('div', { class: 'stat warn' }, [h('div', { class: 'stat-label', text: 'Total balance due' }), h('div', { class: 'stat-value', text: UI.money(t.balance) })]),
          h('div', { class: 'stat bad' }, [h('div', { class: 'stat-label', text: 'Overdue' }), h('div', { class: 'stat-value', text: UI.money(t.overdue) })])
        ]));
        if (!d.items.length) {
          var filtered = state.q || state.course_id || state.batch_id || state.filter !== 'All';
          results.appendChild(h('div', { class: 'card' }, UI.empty(filtered ? 'No dues match' : 'No pending fees',
            filtered ? 'Try a different search or filter.' : 'When students have unpaid installments they will appear here. Use "Find student" to add a fee plan.')));
          return;
        }
        results.appendChild(UI.table([
          { label: 'Student', render: function (s) { return h('span', null, [link('#/fees/' + s.student_id, s.full_name), h('span', { class: 'sub', text: s.student_id })]); } },
          { label: 'Phone', render: function (s) { return phoneLink(s.phone); } },
          { label: 'Course / Batch', cls: 'hide-sm', render: function (s) { return sub(s.course_name, s.batches.join(', ')); } },
          { label: 'Balance', cls: 'num', render: function (s) {
              return h('span', null, [h('strong', { text: UI.money(s.balance) }), s.overdue > 0 ? h('span', { class: 'sub bad-text', text: UI.money(s.overdue) + ' overdue' }) : null]);
            } },
          { label: 'Next due', render: function (s) { return s.next_due ? UI.fmtDate(s.next_due) : ''; } },
          { label: 'Actions', cls: 'actions', render: function (s) {
              return h('span', null, [
                h('button', { class: 'btn btn-primary btn-small', type: 'button', text: 'Collect', onclick: function () {
                  openPayForm({ student_id: s.student_id, full_name: s.full_name }, { balance: s.balance }, function () { load(); });
                } }),
                link('#/fees/' + s.student_id, 'Open')
              ]);
            } }
        ], d.items));
        if (d.pages > 1) results.appendChild(UI.pager(d, function (p) { state.page = p; load(); }));
      }).catch(function (e) { if (mine === seq) results.replaceChildren(UI.errorState(e.message, load)); });
    }

    search.addEventListener('input', UI.debounce(function () { state.q = search.value.trim(); state.page = 1; load(); }, 300));
    [[filter, 'filter'], [course, 'course_id'], [batch, 'batch_id']].forEach(function (p) {
      p[0].addEventListener('change', function () { state[p[1]] = p[0].value; state.page = 1; load(); });
    });
    Promise.all([API.call('courses.list', { status: 'All' }), API.call('batches.list', { status: 'Active', pageSize: 100 })]).then(function (r) {
      function fill(sel, first, rows, key, label, cur) {
        sel.replaceChildren.apply(sel, [h('option', { value: '', text: first })].concat(rows.map(function (x) {
          var o = h('option', { value: x[key], text: label(x) });
          if (x[key] === cur) o.selected = true;
          return o;
        })));
      }
      fill(course, 'All courses', r[0].items, 'course_id', function (c) { return c.course_name; }, state.course_id);
      fill(batch, 'All batches', r[1].items, 'batch_id', function (b) { return b.batch_name; }, state.batch_id);
    }).catch(function () { /* filters stay on "All" */ });
    load();
  }

  // ------------------------------------------------------------ receipts tab
  function renderReceipts(box) {
    var search = h('input', { type: 'search', 'aria-label': 'Search receipts', placeholder: 'Search receipt, student or reference', maxlength: 60, autocomplete: 'off', value: state.rq });
    var status = UI.select([{ value: 'All', label: 'All receipts' }, { value: 'Valid', label: 'Valid' }, { value: 'Reversed', label: 'Reversed' }], state.rstatus, { 'aria-label': 'Filter by status' });
    var method = UI.select([{ value: '', label: 'Any method' }].concat(METHODS), state.rmethod, { 'aria-label': 'Filter by method' });
    var from = h('input', { type: 'date', 'aria-label': 'From date', value: state.rfrom });
    var to = h('input', { type: 'date', 'aria-label': 'To date', value: state.rto });
    box.appendChild(h('div', { class: 'toolbar toolbar-5' }, [
      h('div', { class: 'search' }, search), h('div', null, status), h('div', null, method),
      h('div', null, [h('label', { text: 'From' }), from]), h('div', null, [h('label', { text: 'To' }), to])
    ]));
    var results = h('div');
    box.appendChild(results);
    var seq = 0;

    function load() {
      var mine = ++seq;
      results.replaceChildren(UI.loading());
      API.call('payments.list', { q: state.rq, status: state.rstatus, method: state.rmethod, from: state.rfrom, to: state.rto, page: state.rpage, pageSize: 25 }).then(function (d) {
        if (mine !== seq) return;
        results.replaceChildren();
        results.appendChild(h('p', { class: 'muted result-note', text: 'Collected ' + UI.money(d.totals.collected) + ' in ' + d.totals.receipts + (d.totals.receipts === 1 ? ' receipt' : ' receipts') + ' (reversed receipts are not counted)' }));
        if (!d.items.length) { results.appendChild(h('div', { class: 'card' }, UI.empty('No receipts found', 'Payments you record will be listed here.'))); return; }
        results.appendChild(UI.table([
          { label: 'Receipt', render: function (r) { return h('button', { class: 'link-btn', type: 'button', text: r.receipt_no, onclick: function () { showReceipt(r.receipt_no); } }); } },
          { label: 'Student', render: function (r) { return h('span', null, [link('#/fees/' + r.student_id, r.student_name), h('span', { class: 'sub', text: r.student_id })]); } },
          { label: 'Date', render: function (r) { return UI.fmtDate(r.payment_date); } },
          { label: 'Method', render: function (r) { return sub(r.method, r.reference_no); } },
          { label: 'Amount', cls: 'num', render: function (r) { return UI.money(r.amount); } },
          { label: 'Status', render: function (r) { return UI.badge(r.status, r.status === 'Valid' ? 'ok' : 'bad'); } }
        ], d.items));
        if (d.pages > 1) results.appendChild(UI.pager(d, function (p) { state.rpage = p; load(); }));
      }).catch(function (e) { if (mine === seq) results.replaceChildren(UI.errorState(e.message, load)); });
    }
    search.addEventListener('input', UI.debounce(function () { state.rq = search.value.trim(); state.rpage = 1; load(); }, 300));
    status.addEventListener('change', function () { state.rstatus = status.value; state.rpage = 1; load(); });
    method.addEventListener('change', function () { state.rmethod = method.value; state.rpage = 1; load(); });
    function dates() {
      if (from.value && to.value && from.value > to.value) { UI.toast('The From date must be on or before the To date', 'error'); from.value = state.rfrom; to.value = state.rto; return; }
      state.rfrom = from.value; state.rto = to.value; state.rpage = 1; load();
    }
    from.addEventListener('change', dates); to.addEventListener('change', dates);
    load();
  }

  // ------------------------------------------------------------ list page
  function renderMain() {
    var root = h('div');
    root.appendChild(h('div', { class: 'page-head' }, [
      h('div', null, [h('h2', { text: 'Fees' }), h('div', { class: 'muted', text: 'Dues, payments and receipts' })]),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: openStudentFinder }, [UI.icon('plus', 18), 'Find student'])
    ]));
    var content = h('div');
    function show(tab) { state.tab = tab; content.replaceChildren(); (tab === 'receipts' ? renderReceipts : renderDues)(content); }
    root.appendChild(UI.tabs([{ id: 'dues', label: 'Dues' }, { id: 'receipts', label: 'Receipts' }], state.tab, show));
    root.appendChild(content);
    show(state.tab);
    return root;
  }

  // ------------------------------------------------------------ one student's fees
  function renderStudent(id) {
    return API.call('fees.student', { student_id: id }).then(function (d) {
      var s = d.student, sm = d.summary;
      var again = function () { Router.reload(); };
      var root = h('div');
      root.appendChild(h('a', { class: 'back-link', href: '#/fees' }, [UI.icon('back', 18), 'All dues']));
      var actions = [];
      if (sm.balance > 0) actions.push(h('button', { class: 'btn btn-primary', type: 'button', text: 'Collect payment', onclick: function () { openPayForm(s, { balance: sm.balance }, again); } }));
      actions.push(h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { openPlanForm(s, again); }, text: 'Add fee plan' }));
      root.appendChild(h('div', { class: 'profile-head' }, [
        h('div', null, [h('h2', { text: s.full_name }), h('div', { class: 'muted' }, [h('span', { text: s.student_id }), s.course_name ? h('span', { text: s.course_name }) : null, s.status === 'Archived' ? UI.badge('Archived', 'muted') : null, link('#/students/' + s.student_id, 'Student profile')])]),
        h('div', { class: 'head-actions' }, actions)
      ]));
      root.appendChild(h('div', { class: 'grid-stats' }, [
        h('div', { class: 'stat' }, [h('div', { class: 'stat-label', text: 'Total fees' }), h('div', { class: 'stat-value', text: UI.money(sm.net) })]),
        h('div', { class: 'stat ok' }, [h('div', { class: 'stat-label', text: 'Paid' }), h('div', { class: 'stat-value', text: UI.money(sm.paid) })]),
        h('div', { class: 'stat warn' }, [h('div', { class: 'stat-label', text: 'Balance' }), h('div', { class: 'stat-value', text: UI.money(sm.balance) })]),
        h('div', { class: 'stat bad' }, [h('div', { class: 'stat-label', text: 'Overdue' }), h('div', { class: 'stat-value', text: UI.money(sm.overdue) })])
      ]));

      root.appendChild(h('section', { class: 'section' }, [
        h('div', { class: 'section-head' }, h('h3', { text: 'Installments' })),
        d.fees.length
          ? UI.table([
              { label: '#', render: function (f) { return sub('#' + f.installment_no, f.course_name); } },
              { label: 'Due date', render: function (f) { return h('span', null, [UI.fmtDate(f.due_date), f.overdue ? h('span', { class: 'sub bad-text', text: 'Overdue' }) : null]); } },
              { label: 'Amount', cls: 'num', render: function (f) { return sub(UI.money(f.net), f.discount ? 'after ' + UI.money(f.discount) + ' discount' : ''); } },
              { label: 'Paid', cls: 'num hide-sm', render: function (f) { return UI.money(f.paid); } },
              { label: 'Balance', cls: 'num', render: function (f) { return UI.money(f.balance); } },
              { label: 'Status', render: function (f) { return sub(UI.badge(f.status, FEE_KIND[f.status]), f.status === 'Cancelled' ? f.notes : ''); } },
              { label: 'Actions', cls: 'actions', render: function (f) {
                  if (f.status === 'Cancelled') return '';
                  var btns = [];
                  if (f.balance > 0) btns.push(h('button', { class: 'btn btn-primary btn-small', type: 'button', text: 'Pay', onclick: function () { openPayForm(s, { balance: f.balance, fee: f }, again); } }));
                  btns.push(h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Edit', onclick: function () { openFeeEdit(f, again); } }));
                  if (f.paid === 0) btns.push(h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Cancel', onclick: function () { openFeeCancel(f, again); } }));
                  return h('span', null, btns);
                } }
            ], d.fees)
          : h('div', { class: 'card' }, UI.empty('No fee plan yet', 'Use "Add fee plan" to set up this student\'s fees.'))
      ]));

      if (d.receipts.length) {
        root.appendChild(h('section', { class: 'section' }, [
          h('div', { class: 'section-head' }, h('h3', { text: 'Receipts' })),
          UI.table([
            { label: 'Receipt', render: function (r) { return h('button', { class: 'link-btn', type: 'button', text: r.receipt_no, onclick: function () { showReceipt(r.receipt_no); } }); } },
            { label: 'Date', render: function (r) { return UI.fmtDate(r.payment_date); } },
            { label: 'Method', render: function (r) { return sub(r.method, r.reference_no); } },
            { label: 'Amount', cls: 'num', render: function (r) { return UI.money(r.amount); } },
            { label: 'Status', render: function (r) { return sub(UI.badge(r.status, r.status === 'Valid' ? 'ok' : 'bad'), r.status === 'Reversed' ? r.reversed_reason : ''); } },
            { label: 'Actions', cls: 'actions', render: function (r) {
                return h('span', null, [
                  h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'View', onclick: function () { showReceipt(r.receipt_no); } }),
                  r.status === 'Valid' ? h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Reverse', onclick: function () { openReverseForm(r, again); } }) : null
                ]);
              } }
          ], d.receipts)
        ]));
      }
      return root;
    });
  }

  Router.register({ id: 'fees', title: 'Fees', label: 'Fees', icon: 'rupee', primary: true, render: function (ctx) {
    var param = ctx && ctx.param;
    return /^STU-/.test(param || '') ? renderStudent(param) : renderMain();
  } });
})();
