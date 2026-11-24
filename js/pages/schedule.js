/* pages/schedule.js - class schedule: list by date, add one class, add repeating classes, mark held / cancelled */
(function () {
  'use strict';
  var h = UI.h;
  var state = { batch_id: '', status: 'All', from: '', to: '' };
  var STATUS_KIND = { Scheduled: 'ok', Held: 'muted', Cancelled: 'bad' };
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (d) { return { value: d, label: d }; });
  var WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function toast(e) { UI.toast(e.message, 'error'); }
  function addDays(ymd, n) {
    var p = ymd.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }
  function weekday(ymd) { var p = ymd.split('-'); return WEEKDAY[new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()]; }

  function batchOptions(batches, current) {
    var list = batches.filter(function (b) { return b.status === 'Active' || b.batch_id === current; });
    return [{ value: '', label: 'Select a batch' }].concat(list.map(function (b) { return { value: b.batch_id, label: b.batch_name }; }));
  }

  // ------------------------------------------------------------ forms
  function openForm(batches, cls) {
    var c = cls || {};
    var requestId = API.newRequestId();
    var opts = batchOptions(batches, c.batch_id);
    if (opts.length < 2) { UI.toast('Add an active batch first.', 'error'); return; }
    UI.formModal({
      title: cls ? 'Edit class' : 'Add class',
      submitLabel: 'Save class',
      fields: [
        { name: 'batch_id', label: 'Batch', type: 'select', required: true, value: c.batch_id || state.batch_id || '', options: opts },
        { name: 'subject', label: 'Subject', required: true, maxlength: 60, value: c.subject },
        { name: 'class_date', label: 'Date', type: 'date', required: true, value: c.class_date || UI.todayStr() },
        { name: 'start_time', label: 'Start time', type: 'time', required: true, value: c.start_time || '09:00' },
        { name: 'end_time', label: 'End time', type: 'time', required: true, value: c.end_time || '10:00' },
        { name: 'teacher_name', label: 'Teacher', maxlength: 60, value: c.teacher_name },
        { name: 'room', label: 'Room', maxlength: 30, value: c.room },
        { name: 'notes', label: 'Notes', maxlength: 200, value: c.notes, wide: true }
      ],
      onSubmit: function (v) {
        if (cls) v.schedule_id = cls.schedule_id;
        return API.call('schedule.save', v, { requestId: requestId }).then(function () { UI.toast('Class saved', 'success'); Router.reload(); });
      }
    });
  }

  function openGenerate(batches) {
    var requestId = API.newRequestId();
    var opts = batchOptions(batches, '');
    if (opts.length < 2) { UI.toast('Add an active batch first.', 'error'); return; }
    var today = UI.todayStr();
    UI.formModal({
      title: 'Add repeating classes',
      submitLabel: 'Create classes',
      intro: 'Creates one class on each chosen weekday between the two dates. A day that clashes with another class is skipped, never overwritten.',
      fields: [
        { name: 'batch_id', label: 'Batch', type: 'select', required: true, value: state.batch_id || '', options: opts },
        { name: 'subject', label: 'Subject', required: true, maxlength: 60 },
        { name: 'days', label: 'Class days', type: 'checks', options: DAYS, value: [], wide: true },
        { name: 'start_date', label: 'From date', type: 'date', required: true, value: today },
        { name: 'end_date', label: 'Until date', type: 'date', required: true, value: addDays(today, 27) },
        { name: 'start_time', label: 'Start time', type: 'time', required: true, value: '09:00' },
        { name: 'end_time', label: 'End time', type: 'time', required: true, value: '10:00' },
        { name: 'teacher_name', label: 'Teacher', maxlength: 60 },
        { name: 'room', label: 'Room', maxlength: 30 }
      ],
      onSubmit: function (v) {
        return API.call('schedule.generate', v, { requestId: requestId }).then(function (r) {
          if (r.skipped) {
            var info = UI.modal('Classes created', [
              h('p', { text: r.created + ' class(es) were created. ' + r.skipped + ' day(s) were skipped because of a clash:' }),
              h('ul', { class: 'plain-list' }, r.skippedDetails.map(function (s) { return h('li', { text: UI.fmtDate(s.date) + ': ' + s.reason }); })),
              h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { info.close(); }, text: 'OK' }))
            ]);
          } else {
            UI.toast(r.created + ' class(es) created', 'success');
          }
          Router.reload();
        });
      }
    });
  }

  function setStatus(c, status) {
    var go = function () {
      return API.call('schedule.setStatus', { schedule_id: c.schedule_id, status: status }, { requestId: API.newRequestId() })
        .then(function () { UI.toast('Class marked ' + status.toLowerCase(), 'success'); Router.reload(); }).catch(toast);
    };
    if (status !== 'Cancelled') return go();
    return UI.confirmDialog({ title: 'Cancel class', okLabel: 'Cancel class', danger: true,
      message: 'Cancel the ' + c.subject + ' class of ' + c.batch_name + ' on ' + UI.fmtDate(c.class_date) + '? You can restore it later. Students are not notified automatically.' })
      .then(function (yes) { if (yes) return go(); });
  }

  // ------------------------------------------------------------ page
  function render() {
    var today = UI.todayStr();
    if (!state.from) state.from = today;
    if (!state.to) state.to = addDays(state.from, 13);
    var root = h('div');
    return API.call('batches.list', { status: 'All', pageSize: 100 }).then(function (bd) {
      var batches = bd.items;
      root.appendChild(h('div', { class: 'page-head' }, [
        h('div', null, [h('h2', { text: 'Class schedule' }), h('div', { class: 'muted', text: 'Plan classes and see what is coming up' })]),
        h('div', { class: 'head-actions' }, [
          h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { openGenerate(batches); } }, [UI.icon('refresh', 18), 'Repeat weekly']),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { openForm(batches, null); } }, [UI.icon('plus', 18), 'Add class'])
        ])
      ]));

      var batchSel = UI.select([{ value: '', label: 'All batches' }].concat(batches.map(function (b) { return { value: b.batch_id, label: b.batch_name }; })), state.batch_id, { 'aria-label': 'Batch' });
      var statusSel = UI.select([{ value: 'All', label: 'All statuses' }, { value: 'Scheduled', label: 'Scheduled' }, { value: 'Held', label: 'Held' }, { value: 'Cancelled', label: 'Cancelled' }], state.status, { 'aria-label': 'Status' });
      var fromIn = h('input', { type: 'date', 'aria-label': 'From date', value: state.from });
      var toIn = h('input', { type: 'date', 'aria-label': 'To date', value: state.to });
      root.appendChild(h('div', { class: 'toolbar toolbar-4' }, [
        h('div', null, [h('label', { text: 'Batch' }), batchSel]), h('div', null, [h('label', { text: 'Status' }), statusSel]),
        h('div', null, [h('label', { text: 'From' }), fromIn]), h('div', null, [h('label', { text: 'To' }), toIn])
      ]));
      var out = h('div');
      root.appendChild(out);
      var seq = 0;

      function load() {
        var mine = ++seq;
        out.replaceChildren(UI.loading());
        API.call('schedule.list', { batch_id: state.batch_id, status: state.status, from: state.from, to: state.to }).then(function (d) {
          if (mine !== seq) return;
          out.replaceChildren();
          if (!d.items.length) {
            out.appendChild(h('div', { class: 'card' }, UI.empty('No classes in this period', 'Use "Add class" for one class, or "Repeat weekly" for a regular timetable.')));
            return;
          }
          if (d.capped) out.appendChild(h('div', { class: 'notice warn', role: 'status', text: 'Showing the first 500 of ' + d.total + ' classes. Choose a shorter period.' }));
          var groups = {}, order = [];
          d.items.forEach(function (c) { if (!groups[c.class_date]) { groups[c.class_date] = []; order.push(c.class_date); } groups[c.class_date].push(c); });
          order.forEach(function (date) {
            var sec = h('section', { class: 'sched-day' }, [
              h('h3', { class: 'sched-date' + (date === today ? ' is-today' : ''), text: weekday(date) + ', ' + UI.fmtDate(date) + (date === today ? ' (today)' : '') })
            ]);
            groups[date].forEach(function (c) {
              var actions = [];
              if (c.status === 'Scheduled') {
                actions.push(h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Edit', onclick: function () { openForm(batches, c); } }));
                if (c.class_date <= today) actions.push(h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Mark held', onclick: function () { setStatus(c, 'Held'); } }));
                actions.push(h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Cancel', onclick: function () { setStatus(c, 'Cancelled'); } }));
              } else {
                actions.push(h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Set back to scheduled', onclick: function () { setStatus(c, 'Scheduled'); } }));
              }
              sec.appendChild(h('div', { class: 'card sched-item' + (c.status === 'Cancelled' ? ' is-cancelled' : '') }, [
                h('div', { class: 'sched-time', text: UI.fmtTime(c.start_time) + ' – ' + UI.fmtTime(c.end_time) }),
                h('div', { class: 'sched-main' }, [
                  h('strong', { text: c.subject }), h('span', { class: 'sub', text: [c.batch_name, c.teacher_name, c.room ? 'Room ' + c.room : ''].filter(Boolean).join(' · ') }),
                  c.notes ? h('span', { class: 'sub', text: c.notes }) : null
                ]),
                h('div', { class: 'sched-side' }, [UI.badge(c.status, STATUS_KIND[c.status]), h('div', { class: 'sched-actions' }, actions)])
              ]));
            });
            out.appendChild(sec);
          });
        }).catch(function (e) { if (mine === seq) out.replaceChildren(UI.errorState(e.message, load)); });
      }
      batchSel.addEventListener('change', function () { state.batch_id = batchSel.value; load(); });
      statusSel.addEventListener('change', function () { state.status = statusSel.value; load(); });
      function dates() {
        if (!fromIn.value || !toIn.value) return;
        if (fromIn.value > toIn.value) { UI.toast('The From date must be on or before the To date', 'error'); fromIn.value = state.from; toIn.value = state.to; return; }
        state.from = fromIn.value; state.to = toIn.value; load();
      }
      fromIn.addEventListener('change', dates); toIn.addEventListener('change', dates);
      load();
      return root;
    });
  }

  Router.register({ id: 'schedule', title: 'Class schedule', label: 'Schedule', icon: 'clock', render: render });
})();
