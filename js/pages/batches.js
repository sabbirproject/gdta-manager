/* pages/batches.js - batch list, batch detail with enrolled students, add/edit, status changes */
(function () {
  'use strict';
  var h = UI.h;
  var state = { q: '', status: 'Active', course_id: '', page: 1 };
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (d) { return { value: d, label: d }; });
  var STATUS_KIND = { Active: 'ok', Completed: 'warn', Archived: 'muted' };

  function schedule(b) {
    var t = b.start_time ? UI.fmtTime(b.start_time) + ' – ' + UI.fmtTime(b.end_time) : '';
    return [b.days ? b.days.split(',').join(', ') : '', t].filter(Boolean).join(' · ') || '—';
  }

  function toast(e) { UI.toast(e.message, 'error'); }

  // ------------------------------------------------------------ add / edit
  function openForm(batch) {
    var b = batch || {};
    var requestId = API.newRequestId();
    API.call('courses.list', { status: 'All' }).then(function (cd) {
      var courses = cd.items.filter(function (c) { return c.status === 'Active' || c.course_id === b.course_id; });
      if (!courses.length) { UI.toast('Add a course first, then create batches for it.', 'error'); return; }
      var opts = [{ value: '', label: 'Select a course' }].concat(courses.map(function (c) { return { value: c.course_id, label: c.course_name }; }));
      UI.formModal({
        title: batch ? 'Edit batch' : 'Add batch',
        submitLabel: 'Save batch',
        fields: [
          { name: 'batch_name', label: 'Batch name', required: true, maxlength: 80, value: b.batch_name, wide: true, placeholder: 'e.g. Morning 8 AM' },
          { name: 'course_id', label: 'Course', type: 'select', required: true, value: b.course_id || '', options: opts },
          { name: 'teacher_name', label: 'Teacher', maxlength: 60, value: b.teacher_name },
          { name: 'days', label: 'Class days', type: 'checks', options: DAYS, value: b.days ? b.days.split(',') : [], wide: true },
          { name: 'start_time', label: 'Start time', type: 'time', value: b.start_time },
          { name: 'end_time', label: 'End time', type: 'time', value: b.end_time },
          { name: 'start_date', label: 'Batch starts', type: 'date', value: b.start_date },
          { name: 'end_date', label: 'Batch ends', type: 'date', value: b.end_date },
          { name: 'capacity', label: 'Capacity (students)', type: 'number', required: true, min: 1, max: 500, step: 1, value: b.capacity || 30 }
        ],
        onSubmit: function (v) {
          if (batch) v.batch_id = batch.batch_id;
          return API.call('batches.save', v, { requestId: requestId }).then(function () {
            UI.toast('Batch saved', 'success');
            Router.reload();
          });
        }
      });
    }).catch(toast);
  }

  function changeStatus(batch, status, enrolled) {
    var go = function () {
      return API.call('batches.setStatus', { batch_id: batch.batch_id, status: status }, { requestId: API.newRequestId() })
        .then(function (r) {
          UI.toast(status === 'Active' ? 'Batch reopened' : status === 'Completed' ? 'Batch marked completed' : 'Batch archived', 'success');
          Router.reload();
        }).catch(toast);
    };
    if (status === 'Active') return go();
    var msg = status === 'Completed'
      ? 'Mark "' + batch.batch_name + '" as completed?' + (enrolled ? ' The ' + enrolled + ' enrolled student(s) will be marked as having completed it.' : '') + ' History is kept.'
      : 'Archive "' + batch.batch_name + '"? It will be hidden from the default list.';
    return UI.confirmDialog({ title: status === 'Completed' ? 'Complete batch' : 'Archive batch', message: msg, okLabel: status === 'Completed' ? 'Mark completed' : 'Archive', danger: status === 'Archived' })
      .then(function (yes) { if (yes) return go(); });
  }

  // ------------------------------------------------------------ list
  function renderList() {
    var root = h('div');
    root.appendChild(h('div', { class: 'page-head' }, [
      h('div', null, [h('h2', { text: 'Batches' }), h('div', { class: 'muted', text: 'Groups of students taught together' })]),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { openForm(null); } }, [UI.icon('plus', 18), 'Add batch'])
    ]));

    var search = h('input', { type: 'search', 'aria-label': 'Search batches', placeholder: 'Search batch or teacher', maxlength: 60, autocomplete: 'off', value: state.q });
    var status = UI.select([{ value: 'Active', label: 'Active' }, { value: 'Completed', label: 'Completed' }, { value: 'Archived', label: 'Archived' }, { value: 'All', label: 'All statuses' }],
      state.status, { 'aria-label': 'Filter by status' });
    var course = UI.select([{ value: '', label: 'All courses' }], state.course_id, { 'aria-label': 'Filter by course' });
    root.appendChild(h('div', { class: 'toolbar' }, [h('div', { class: 'search' }, search), h('div', null, status), h('div', null, course)]));
    var results = h('div');
    root.appendChild(results);

    var seq = 0;
    function load() {
      var mine = ++seq;
      results.replaceChildren(UI.loading());
      API.call('batches.list', { q: state.q, status: state.status, course_id: state.course_id, page: state.page, pageSize: 25 }).then(function (d) {
        if (mine !== seq) return;
        results.replaceChildren();
        if (!d.items.length) {
          var filtered = state.q || state.course_id || state.status !== 'Active';
          results.appendChild(h('div', { class: 'card' }, UI.empty(filtered ? 'No batches match' : 'No batches yet',
            filtered ? 'Try a different search or filter.' : 'Use "Add batch" to create one. Students are added to a batch from its page.')));
          return;
        }
        results.appendChild(UI.table([
          { label: 'Batch', render: function (b) { return h('span', null, [h('a', { href: '#/batches/' + b.batch_id, text: b.batch_name }), h('span', { class: 'sub', text: b.course_name })]); } },
          { label: 'Teacher', render: function (b) { return b.teacher_name; } },
          { label: 'Schedule', render: schedule },
          { label: 'Students', render: function (b) { return b.enrolled + ' / ' + b.capacity; } },
          { label: 'Status', render: function (b) { return UI.badge(b.status, STATUS_KIND[b.status]); } }
        ], d.items));
        if (d.pages > 1) results.appendChild(UI.pager(d, function (p) { state.page = p; load(); }));
      }).catch(function (e) { if (mine === seq) results.replaceChildren(UI.errorState(e.message, load)); });
    }

    search.addEventListener('input', UI.debounce(function () { state.q = search.value.trim(); state.page = 1; load(); }, 300));
    status.addEventListener('change', function () { state.status = status.value; state.page = 1; load(); });
    course.addEventListener('change', function () { state.course_id = course.value; state.page = 1; load(); });
    API.call('courses.list', { status: 'All' }).then(function (cd) {
      course.replaceChildren.apply(course, [h('option', { value: '', text: 'All courses' })].concat(cd.items.map(function (c) {
        var o = h('option', { value: c.course_id, text: c.course_name + (c.status === 'Archived' ? ' (archived)' : '') });
        if (c.course_id === state.course_id) o.selected = true;
        return o;
      })));
    }).catch(function () { /* filter stays "All courses" */ });
    load();
    return root;
  }

  // ------------------------------------------------------------ detail
  function openStudentPicker(batch) {
    var input = h('input', { type: 'search', 'aria-label': 'Search students', placeholder: 'Type a name, ID or phone', maxlength: 60, autocomplete: 'off' });
    var list = h('ul', { class: 'picker-results' });
    var note = h('p', { class: 'muted', text: 'Only active students who are not already in this batch are shown.' });
    var m = UI.modal('Add student to ' + batch.batch_name, [input, note, list], { static: true });
    var seq = 0;
    function search() {
      var mine = ++seq;
      API.call('students.options', { q: input.value.trim(), batch_id: batch.batch_id }).then(function (d) {
        if (mine !== seq) return;
        list.replaceChildren();
        if (!d.items.length) { list.appendChild(h('li', null, UI.empty('No matching students'))); return; }
        d.items.forEach(function (s) {
          list.appendChild(h('li', null, h('button', { type: 'button', onclick: function () { choose(s); } }, [
            h('span', { text: s.full_name }), h('span', { class: 'muted', text: s.student_id + (s.phone ? ' · ' + s.phone : '') })
          ])));
        });
      }).catch(function (e) { if (mine === seq) { list.replaceChildren(); list.appendChild(h('li', { class: 'form-error', text: e.message })); } });
    }
    function choose(s) {
      API.call('enrollments.add', { student_id: s.student_id, batch_id: batch.batch_id }, { requestId: API.newRequestId() })
        .then(function () { m.close(); UI.toast(s.full_name + ' added to the batch', 'success'); Router.reload(); })
        .catch(function (e) { UI.toast(e.message, 'error'); });
    }
    input.addEventListener('input', UI.debounce(search, 250));
    search();
  }

  function removeStudent(batch, s) {
    UI.confirmDialog({ title: 'Remove from batch', okLabel: 'Remove', danger: true,
      message: 'Remove ' + s.full_name + ' from "' + batch.batch_name + '"? The history is kept and you can add them again later.' })
      .then(function (yes) {
        if (!yes) return;
        return API.call('enrollments.end', { enrollment_id: s.enrollment_id, outcome: 'Left' }, { requestId: API.newRequestId() })
          .then(function () { UI.toast('Student removed from the batch', 'success'); Router.reload(); }).catch(toast);
      });
  }

  function renderDetail(id) {
    return API.call('batches.get', { batch_id: id }).then(function (d) {
      var b = d.batch, students = d.students;
      var root = h('div');
      root.appendChild(h('a', { class: 'back-link', href: '#/batches' }, [UI.icon('back', 18), 'All batches']));
      var actions = [h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { openForm(b); }, text: 'Edit' })];
      if (b.status === 'Active') {
        actions.push(h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { changeStatus(b, 'Completed', b.enrolled); }, text: 'Mark completed' }));
        if (!b.enrolled) actions.push(h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { changeStatus(b, 'Archived', 0); }, text: 'Archive' }));
      } else {
        actions.push(h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { changeStatus(b, 'Active', 0); }, text: 'Reopen' }));
        if (b.status === 'Completed') actions.push(h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { changeStatus(b, 'Archived', 0); }, text: 'Archive' }));
      }
      root.appendChild(h('div', { class: 'profile-head' }, [
        h('div', null, [h('h2', { text: b.batch_name }), h('div', { class: 'muted' }, [UI.badge(b.status, STATUS_KIND[b.status]), h('span', { text: b.batch_id }), b.course_name ? h('span', { text: b.course_name }) : null])]),
        h('div', { class: 'head-actions' }, actions)
      ]));

      var cap = Number(b.capacity) || 0, pct = cap ? Math.min(100, Math.round(b.enrolled / cap * 100)) : 0;
      var meterFill = h('span');
      meterFill.style.width = pct + '%';
      root.appendChild(h('section', { class: 'card section' }, [
        UI.details([
          ['Course', b.course_name], ['Teacher', b.teacher_name], ['Class days', b.days ? b.days.split(',').join(', ') : ''],
          ['Time', b.start_time ? UI.fmtTime(b.start_time) + ' – ' + UI.fmtTime(b.end_time) : ''],
          ['Starts', b.start_date ? UI.fmtDate(b.start_date) : ''], ['Ends', b.end_date ? UI.fmtDate(b.end_date) : '']
        ]),
        h('div', { class: 'section' }, [
          h('div', { text: b.enrolled + ' of ' + cap + ' seats filled' }),
          h('div', { class: 'meter' + (b.enrolled >= cap ? ' full' : ''), role: 'img', 'aria-label': pct + ' percent full' }, meterFill)
        ])
      ]));

      var addBtn = null;
      if (b.status === 'Active') {
        addBtn = b.enrolled >= cap
          ? h('span', { class: 'muted', text: 'Batch is full' })
          : h('button', { class: 'btn btn-primary btn-small', type: 'button', onclick: function () { openStudentPicker(b); } }, [UI.icon('plus', 16), 'Add student']);
      }
      root.appendChild(h('section', { class: 'section' }, [
        h('div', { class: 'section-head' }, [h('h3', { text: 'Students in this batch (' + students.length + ')' }), addBtn]),
        students.length
          ? UI.table([
              { label: 'Student', render: function (s) { return h('span', null, [h('a', { href: '#/students/' + s.student_id, text: s.full_name }), h('span', { class: 'sub', text: s.student_id })]); } },
              { label: 'Phone', render: function (s) { return s.phone ? h('a', { href: 'tel:' + s.phone.replace(/[^0-9+]/g, ''), text: s.phone }) : ''; } },
              { label: 'Joined', render: function (s) { return UI.fmtDate(s.enrolled_on); } },
              { label: 'Actions', cls: 'actions', render: function (s) {
                  return h('button', { class: 'btn btn-outline btn-small', type: 'button', onclick: function () { removeStudent(b, s); }, text: 'Remove' });
                } }
            ], students)
          : h('div', { class: 'card' }, UI.empty('No students yet', b.status === 'Active' ? 'Use "Add student" to put students in this batch.' : 'This batch has no active students.'))
      ]));
      return root;
    });
  }

  Router.register({ id: 'batches', title: 'Batches', label: 'Batches', icon: 'layers', render: function (ctx) { return ctx && ctx.param ? renderDetail(ctx.param) : renderList(); } });
})();
