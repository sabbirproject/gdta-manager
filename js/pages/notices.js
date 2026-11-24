/* pages/notices.js - notices: start from a template, edit the draft, approve, then copy / print to share.
   The app never sends a message. "Approved" means the administrator has checked the text and it may be shared by hand. */
(function () {
  'use strict';
  var h = UI.h;
  var state = { q: '', status: 'Open', page: 1 };
  var STATUS_KIND = { Draft: 'warn', Approved: 'ok', Archived: 'muted' };

  function toast(e) { UI.toast(e.message, 'error'); }

  var TEMPLATES = [
    { id: 'general', label: 'Blank notice', params: [] },
    { id: 'holiday', label: 'Holiday / closure', params: ['date', 'reason', 'batch_optional'] },
    { id: 'class_reminder', label: 'Next class reminder (batch)', params: ['batch'] },
    { id: 'fee_reminder', label: 'Fee reminder (one student)', params: ['student'] },
    { id: 'attendance_summary', label: 'Attendance summary (batch)', params: ['batch', 'period'] },
    { id: 'student_attendance', label: 'Attendance of one student', params: ['student', 'period'] },
    { id: 'exam_result', label: 'Exam result summary (batch)', params: ['exam'] },
    { id: 'student_result', label: 'Result of one student', params: ['exam', 'student'] }
  ];

  function addDays(ymd, n) {
    var p = ymd.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }

  /** Student search box + result list. get() returns the chosen student_id ('' if none). */
  function studentPicker(label, initialId, initialName) {
    var chosen = initialId || '';
    var input = h('input', { type: 'search', 'aria-label': label + ' search', placeholder: 'Type a name, ID or phone', maxlength: 60, autocomplete: 'off' });
    var sel = h('select', { 'aria-label': label });
    var note = h('div', { class: 'hint', text: chosen ? 'Selected: ' + (initialName || chosen) : 'Search, then pick a student from the list.' });
    if (chosen) sel.appendChild(h('option', { value: chosen, text: initialName || chosen }));
    var seq = 0;
    function search() {
      var mine = ++seq;
      API.call('students.options', { q: input.value.trim() }).then(function (d) {
        if (mine !== seq) return;
        sel.replaceChildren(h('option', { value: '', text: d.items.length ? 'Select a student (' + d.items.length + ' shown)' : 'No matching students' }));
        d.items.forEach(function (s) {
          var o = h('option', { value: s.student_id, text: s.full_name + ' (' + s.student_id + ')' });
          if (s.student_id === chosen) o.selected = true;
          sel.appendChild(o);
        });
      }).catch(function () { /* the list stays as it was */ });
    }
    input.addEventListener('input', UI.debounce(search, 250));
    sel.addEventListener('change', function () { chosen = sel.value; note.textContent = chosen ? 'Selected: ' + sel.options[sel.selectedIndex].text : 'Search, then pick a student from the list.'; });
    var el = h('div', { class: 'field wide' }, [h('label', { text: label }), input, sel, note]);
    return { el: el, get: function () { return chosen; } };
  }

  function selectField(label, name, options, value, wide) {
    return UI.field({ name: name, label: label, type: 'select', options: options, value: value || '', required: false, wide: wide });
  }

  // ------------------------------------------------------------ step 2: edit and save the draft
  function openEditor(initial, existing, lookups) {
    var n = initial || {};
    var requestId = API.newRequestId();
    var title = UI.field({ name: 'title', label: 'Title', required: true, maxlength: 100, value: n.title, wide: true });
    var typeF = selectField('Send to', 'audience_type', [{ value: 'All', label: 'All active students' }, { value: 'Batch', label: 'One batch' }, { value: 'Student', label: 'One student' }], n.audience_type || 'All');
    var body = UI.field({ name: 'body', label: 'Message', type: 'textarea', required: true, maxlength: 1000, value: n.body, wide: true });
    body.control.rows = 9;
    var counter = h('div', { class: 'hint', 'aria-live': 'polite' });
    function count() { counter.textContent = body.control.value.length + ' / 1000 characters'; }
    body.control.addEventListener('input', count); count();

    var areaBox = h('div', { class: 'wide' });
    var batchSel = null, studentPick = null;
    function drawArea() {
      areaBox.replaceChildren(); batchSel = null; studentPick = null;
      var t = typeF.control.value;
      if (t === 'Batch') {
        batchSel = selectField('Batch', 'audience_id', [{ value: '', label: 'Select a batch' }].concat(lookups.batches.map(function (b) { return { value: b.batch_id, label: b.batch_name }; })), n.audience_type === 'Batch' ? n.audience_id : '', true);
        batchSel.control.required = true;
        areaBox.appendChild(batchSel.el);
      } else if (t === 'Student') {
        studentPick = studentPicker('Student', n.audience_type === 'Student' ? n.audience_id : '', n.audience_label ? n.audience_label.replace(/^Student: /, '') : '');
        areaBox.appendChild(studentPick.el);
      }
    }
    typeF.control.addEventListener('change', drawArea); drawArea();

    var errBox = h('div', { class: 'form-error', role: 'alert', hidden: true });
    var save = h('button', { class: 'btn btn-primary', type: 'submit', text: 'Save draft' });
    var form = h('form', { class: 'form' }, [
      h('p', { class: 'muted', text: 'This saves a draft. Nothing is shared until you approve it, and the app never sends messages by itself.' }),
      errBox,
      h('div', { class: 'form-grid' }, [title.el, typeF.el, areaBox, body.el, h('div', { class: 'wide' }, counter)]),
      h('div', { class: 'modal-actions' }, [h('button', { class: 'btn btn-outline', type: 'button', text: 'Cancel', onclick: function () { m.close(); } }), save])
    ]);
    var m = UI.modal(existing ? 'Edit draft' : 'New notice', form, { static: true });
    var busy = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      errBox.hidden = true;
      var v = { title: title.control.value.trim(), body: body.control.value.trim(), audience_type: typeF.control.value, audience_id: '' };
      if (v.audience_type === 'Batch') v.audience_id = batchSel.control.value;
      if (v.audience_type === 'Student') v.audience_id = studentPick.get();
      if (v.audience_type !== 'All' && !v.audience_id) { errBox.textContent = v.audience_type === 'Batch' ? 'Choose a batch.' : 'Choose a student.'; errBox.hidden = false; return; }
      if (!form.reportValidity()) return;
      if (existing) v.notice_id = existing.notice_id;
      busy = true; save.disabled = true; save.textContent = 'Saving…';
      API.call('notices.save', v, { requestId: requestId }).then(function () {
        m.close(); UI.toast('Draft saved. Review it and approve when it is ready.', 'success'); Router.reload();
      }).catch(function (err) {
        errBox.textContent = err.message; errBox.hidden = false; busy = false; save.disabled = false; save.textContent = 'Save draft';
      });
    });
  }

  // ------------------------------------------------------------ step 1: choose a template
  function loadLookups() {
    return Promise.all([
      API.call('batches.list', { status: 'Active', pageSize: 100 }),
      API.call('exams.list', { status: 'Active', pageSize: 100 })
    ]).then(function (r) { return { batches: r[0].items, exams: r[1].items }; });
  }

  function openStart() {
    loadLookups().then(function (lookups) {
      var today = UI.todayStr();
      var tplSel = UI.select(TEMPLATES.map(function (t) { return { value: t.id, label: t.label }; }), 'general', { 'aria-label': 'Template', id: 'tpl-select' });
      var paramBox = h('div', { class: 'form-grid' });
      var errBox = h('div', { class: 'form-error', role: 'alert', hidden: true });
      var parts = {};

      function drawParams() {
        paramBox.replaceChildren(); parts = {};
        var tpl = TEMPLATES.filter(function (t) { return t.id === tplSel.value; })[0];
        tpl.params.forEach(function (p) {
          if (p === 'date') parts.date = UI.field({ name: 'date', label: 'Date', type: 'date', required: true, value: addDays(today, 1) });
          if (p === 'reason') parts.reason = UI.field({ name: 'reason', label: 'Reason (optional)', maxlength: 100, placeholder: 'e.g. Diwali' });
          if (p === 'batch_optional') parts.batch_id = selectField('For', 'batch_id', [{ value: '', label: 'All students' }].concat(lookups.batches.map(function (b) { return { value: b.batch_id, label: b.batch_name }; })), '', true);
          if (p === 'batch') { parts.batch_id = selectField('Batch', 'batch_id', [{ value: '', label: 'Select a batch' }].concat(lookups.batches.map(function (b) { return { value: b.batch_id, label: b.batch_name }; })), '', true); parts.batch_id.control.required = true; }
          if (p === 'exam') { parts.exam_id = selectField('Exam', 'exam_id', [{ value: '', label: 'Select an exam' }].concat(lookups.exams.map(function (x) { return { value: x.exam_id, label: x.exam_name + ' — ' + x.subject + ' (' + x.batch_name + ')' }; })), '', true); parts.exam_id.control.required = true; }
          if (p === 'student') parts.student = studentPicker('Student');
          if (p === 'period') {
            parts.from = UI.field({ name: 'from', label: 'From date', type: 'date', value: addDays(today, -29) });
            parts.to = UI.field({ name: 'to', label: 'To date', type: 'date', value: today });
          }
        });
        Object.keys(parts).forEach(function (k) { paramBox.appendChild((parts[k].el)); });
        if (!tpl.params.length) paramBox.appendChild(h('p', { class: 'muted wide', text: 'You will write the whole message yourself on the next screen.' }));
        else paramBox.appendChild(h('p', { class: 'muted wide', text: 'The text is filled in from your records. You can change anything on the next screen before saving.' }));
      }
      tplSel.addEventListener('change', drawParams); drawParams();

      var go = h('button', { class: 'btn btn-primary', type: 'submit', text: 'Continue' });
      var form = h('form', { class: 'form' }, [
        errBox,
        h('div', { class: 'field' }, [h('label', { for: 'tpl-select', text: 'Start from' }), tplSel]),
        paramBox,
        h('div', { class: 'modal-actions' }, [h('button', { class: 'btn btn-outline', type: 'button', text: 'Cancel', onclick: function () { m.close(); } }), go])
      ]);
      var m = UI.modal('New notice', form, { static: true });
      var busy = false;
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (busy) return;
        errBox.hidden = true;
        if (!form.reportValidity()) return;
        var payload = { kind: tplSel.value };
        Object.keys(parts).forEach(function (k) {
          if (k === 'student') payload.student_id = parts.student.get();
          else payload[k] = parts[k].control.value.trim();
        });
        var tpl = TEMPLATES.filter(function (t) { return t.id === tplSel.value; })[0];
        if (tpl.params.indexOf('student') >= 0 && !payload.student_id) { errBox.textContent = 'Choose a student.'; errBox.hidden = false; return; }
        busy = true; go.disabled = true; go.textContent = 'Preparing…';
        API.call('notices.generate', payload).then(function (t) {
          m.close(); openEditor(t, null, lookups);
        }).catch(function (err) {
          errBox.textContent = err.message; errBox.hidden = false; busy = false; go.disabled = false; go.textContent = 'Continue';
        });
      });
    }).catch(toast);
  }

  // ------------------------------------------------------------ view / approve / share
  function changeState(n, action, okText) {
    return API.call('notices.' + action, { notice_id: n.notice_id }, { requestId: API.newRequestId() })
      .then(function () { UI.toast(okText, 'success'); Router.reload(); }).catch(toast);
  }

  function openShare(n) {
    API.call('notices.recipients', { notice_id: n.notice_id }).then(function (d) {
      var paper = h('div', { class: 'notice-paper receipt' }, [
        h('div', { class: 'report-inst', text: d.institute.name }),
        d.institute.address || d.institute.phone ? h('div', { class: 'muted', text: [d.institute.address, d.institute.phone ? 'Phone: ' + d.institute.phone : ''].filter(Boolean).join(' · ') }) : null,
        h('h3', { class: 'notice-title', text: d.notice.title }),
        h('div', { class: 'muted', text: 'To: ' + d.notice.audience_label + ' · Approved ' + UI.fmtDate(d.notice.approved_at) }),
        h('pre', { class: 'notice-text', text: d.notice.body })
      ]);
      var phones = d.recipients.map(function (r) { return r.phone; }).filter(Boolean);
      var recip = h('div', { class: 'no-print' }, [
        h('h3', { class: 'report-sub', text: 'Recipients (' + d.recipients.length + ')' }),
        d.recipients.length ? UI.table([
          { label: 'Student', render: function (r) { return r.full_name; } },
          { label: 'Phone', render: function (r) { return r.phone ? h('a', { href: 'tel:' + r.phone.replace(/[^0-9+]/g, ''), text: r.phone }) : ''; } },
          { label: 'Guardian', render: function (r) { return [r.guardian_name, r.guardian_phone].filter(Boolean).join(' · '); } }
        ], d.recipients) : UI.empty('No active students match this audience right now'),
      ]);
      var m = UI.modal('Share notice', [
        h('div', { class: 'notice warn no-print', role: 'status', text: 'This app does not send messages. Copy the text and share it yourself (WhatsApp, SMS, notice board), or print it.' }),
        paper, recip,
        h('div', { class: 'modal-actions no-print' }, [
          h('button', { class: 'btn btn-outline', type: 'button', onclick: function () {
            UI.copyText(d.message).then(function (ok) { UI.toast(ok ? 'Message copied' : 'Could not copy. Select the text and copy it by hand.', ok ? 'success' : 'error'); });
          }, text: 'Copy message' }),
          phones.length ? h('button', { class: 'btn btn-outline', type: 'button', onclick: function () {
            UI.copyText(phones.join(', ')).then(function (ok) { UI.toast(ok ? phones.length + ' phone numbers copied' : 'Could not copy the numbers', ok ? 'success' : 'error'); });
          }, text: 'Copy phone numbers' }) : null,
          h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { window.print(); } }, [UI.icon('print', 18), 'Print notice']),
          h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { m.close(); }, text: 'Close' })
        ])
      ]);
    }).catch(toast);
  }

  function openNotice(n) {
    var actions = [];
    var close = function () { m.close(); };
    if (n.status === 'Draft') {
      actions.push(h('button', { class: 'btn btn-outline', type: 'button', text: 'Edit', onclick: function () { close(); loadLookups().then(function (l) { openEditor(n, n, l); }).catch(toast); } }));
      actions.push(h('button', { class: 'btn btn-primary', type: 'button', text: 'Approve', onclick: function () {
        UI.confirmDialog({ title: 'Approve notice', okLabel: 'Approve', message: 'Approve "' + n.title + '" for ' + n.audience_label + '? After approval the text is frozen. The app will not send it: you share it yourself.' })
          .then(function (yes) { if (yes) { close(); changeState(n, 'approve', 'Notice approved'); } });
      } }));
    }
    if (n.status === 'Approved') actions.push(h('button', { class: 'btn btn-primary', type: 'button', text: 'Share…', onclick: function () { close(); openShare(n); } }));
    if (n.status !== 'Archived') actions.push(h('button', { class: 'btn btn-outline', type: 'button', text: 'Archive', onclick: function () {
      UI.confirmDialog({ title: 'Archive notice', okLabel: 'Archive', danger: true, message: 'Archive "' + n.title + '"? It moves out of the main list.' })
        .then(function (yes) { if (yes) { close(); changeState(n, 'archive', 'Notice archived'); } });
    } }));
    actions.push(h('button', { class: 'btn btn-outline', type: 'button', text: 'Close', onclick: close }));
    var m = UI.modal(n.title, [
      h('div', { class: 'muted' }, [UI.badge(n.status, STATUS_KIND[n.status]), h('span', { text: ' ' + n.audience_label + ' · ' + n.recipient_count + ' recipient(s)' })]),
      h('pre', { class: 'notice-text', text: n.body }),
      n.status !== 'Draft' && n.approved_by ? h('div', { class: 'muted', text: 'Approved by ' + n.approved_by + ' on ' + UI.fmtDate(n.approved_at) }) : null,
      h('div', { class: 'modal-actions' }, actions)
    ]);
  }

  // ------------------------------------------------------------ list
  function render() {
    var root = h('div');
    root.appendChild(h('div', { class: 'page-head' }, [
      h('div', null, [h('h2', { text: 'Notices' }), h('div', { class: 'muted', text: 'Write, approve, then share by hand' })]),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: openStart }, [UI.icon('plus', 18), 'New notice'])
    ]));
    var search = h('input', { type: 'search', 'aria-label': 'Search notices', placeholder: 'Search title or text', maxlength: 60, autocomplete: 'off', value: state.q });
    var status = UI.select([{ value: 'Open', label: 'Drafts and approved' }, { value: 'Draft', label: 'Drafts' }, { value: 'Approved', label: 'Approved' }, { value: 'Archived', label: 'Archived' }, { value: 'All', label: 'Everything' }], state.status, { 'aria-label': 'Filter by status' });
    root.appendChild(h('div', { class: 'toolbar' }, [h('div', { class: 'search' }, search), h('div', null, status)]));
    var results = h('div');
    root.appendChild(results);
    var seq = 0;
    function load() {
      var mine = ++seq;
      results.replaceChildren(UI.loading());
      API.call('notices.list', { q: state.q, status: state.status, page: state.page, pageSize: 25 }).then(function (d) {
        if (mine !== seq) return;
        results.replaceChildren();
        if (!d.items.length) {
          results.appendChild(h('div', { class: 'card' }, UI.empty(state.q || state.status !== 'Open' ? 'No notices match' : 'No notices yet', 'Use "New notice" to start from a template, such as a fee reminder or a holiday.')));
          return;
        }
        results.appendChild(UI.table([
          { label: 'Notice', render: function (n) {
              return h('span', null, [h('a', { href: '#/notices', text: n.title, onclick: function (e) { e.preventDefault(); openNotice(n); } }), h('span', { class: 'sub', text: n.audience_label })]);
            } },
          { label: 'Status', render: function (n) { return UI.badge(n.status, STATUS_KIND[n.status]); } },
          { label: 'Recipients', cls: 'hide-sm', render: function (n) { return String(n.recipient_count); } },
          { label: 'Created', cls: 'hide-sm', render: function (n) { return UI.fmtDate(n.created_at); } }
        ], d.items));
        if (d.pages > 1) results.appendChild(UI.pager(d, function (p) { state.page = p; load(); }));
      }).catch(function (e) { if (mine === seq) results.replaceChildren(UI.errorState(e.message, load)); });
    }
    search.addEventListener('input', UI.debounce(function () { state.q = search.value.trim(); state.page = 1; load(); }, 300));
    status.addEventListener('change', function () { state.status = status.value; state.page = 1; load(); });
    load();
    return Promise.resolve(root);
  }

  Router.register({ id: 'notices', title: 'Notices', label: 'Notices', icon: 'bell', render: render });
})();
