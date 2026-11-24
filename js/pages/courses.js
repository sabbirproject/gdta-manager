/* pages/courses.js - course list, add/edit, archive/restore */
(function () {
  'use strict';
  var h = UI.h;
  var state = { status: 'Active' };

  var SCHEDULES = ['One-time', 'Monthly', 'Quarterly', 'Custom'].map(function (s) { return { value: s, label: s }; });

  function openForm(course) {
    var c = course || {};
    var requestId = API.newRequestId();   // same id on retry, so a double tap saves once
    UI.formModal({
      title: course ? 'Edit course' : 'Add course',
      submitLabel: 'Save course',
      intro: course ? 'Changing the fee does not change fees already created for students.' : null,
      fields: [
        { name: 'course_name', label: 'Course name', required: true, maxlength: 80, value: c.course_name, wide: true },
        { name: 'description', label: 'Description', type: 'textarea', maxlength: 300, value: c.description, wide: true },
        { name: 'duration_months', label: 'Duration (months)', type: 'number', required: true, min: 1, max: 60, step: 1, value: c.duration_months },
        { name: 'total_fee', label: 'Total fee (₹)', type: 'number', required: true, min: 0, max: 1000000, step: '0.01', value: c.total_fee },
        { name: 'fee_schedule', label: 'Fee schedule', type: 'select', required: true, value: c.fee_schedule || 'One-time', options: SCHEDULES },
        { name: 'installments', label: 'Number of installments', type: 'number', min: 1, max: 60, step: 1, value: c.installments || 1, hint: 'Not used for One-time' }
      ],
      onSubmit: function (v) {
        if (course) v.course_id = course.course_id;
        return API.call('courses.save', v, { requestId: requestId }).then(function () {
          UI.toast('Course saved', 'success');
          Router.reload();
        });
      }
    });
  }

  function setStatus(course, status) {
    var go = function () {
      return API.call('courses.setStatus', { course_id: course.course_id, status: status }, { requestId: API.newRequestId() })
        .then(function () { UI.toast(status === 'Archived' ? 'Course archived' : 'Course restored', 'success'); Router.reload(); })
        .catch(function (e) { UI.toast(e.message, 'error'); });
    };
    if (status === 'Active') return go();
    return UI.confirmDialog({
      title: 'Archive course', okLabel: 'Archive', danger: true,
      message: 'Archive "' + course.course_name + '"? It will be hidden from new admissions and batches. Existing records are kept and you can restore it later.'
    }).then(function (yes) { if (yes) return go(); });
  }

  function render() {
    var root = h('div');
    var filter = UI.select([{ value: 'Active', label: 'Active courses' }, { value: 'Archived', label: 'Archived courses' }, { value: 'All', label: 'All courses' }],
      state.status, { 'aria-label': 'Filter by status' });
    root.appendChild(h('div', { class: 'page-head' }, [
      h('div', null, [h('h2', { text: 'Courses' }), h('div', { class: 'muted', text: 'What your institute teaches and its fee plan' })]),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { openForm(null); } }, [UI.icon('plus', 18), 'Add course'])
    ]));
    root.appendChild(h('div', { class: 'toolbar' }, h('div', null, filter)));
    var results = h('div');
    root.appendChild(results);
    filter.addEventListener('change', function () { state.status = filter.value; Router.reload(); });

    return API.call('courses.list', { status: state.status }).then(function (d) {
      if (!d.items.length) {
        results.appendChild(h('div', { class: 'card' }, UI.empty(state.status === 'Archived' ? 'No archived courses' : 'No courses yet',
          state.status === 'Archived' ? '' : 'Use "Add course" to create your first course. You need a course before you can create batches.')));
        return root;
      }
      results.appendChild(UI.table([
        { label: 'Course', render: function (c) { return h('span', null, [c.course_name, c.description ? h('span', { class: 'sub', text: c.description }) : null]); } },
        { label: 'Duration', render: function (c) { return c.duration_months + (c.duration_months === 1 ? ' month' : ' months'); } },
        { label: 'Fee', render: function (c) {
            return h('span', null, [UI.money(c.total_fee), h('span', { class: 'sub', text: c.fee_schedule + (c.fee_schedule !== 'One-time' ? ' × ' + c.installments : '') })]);
          } },
        { label: 'In use', render: function (c) { return c.activeBatches + ' batches · ' + c.activeStudents + ' students'; } },
        { label: 'Status', render: function (c) { return UI.badge(c.status, c.status === 'Active' ? 'ok' : 'muted'); } },
        { label: 'Actions', cls: 'actions', render: function (c) {
            return h('span', null, [
              h('button', { class: 'btn btn-outline btn-small', type: 'button', onclick: function () { openForm(c); }, text: 'Edit' }),
              c.status === 'Active'
                ? h('button', { class: 'btn btn-outline btn-small', type: 'button', onclick: function () { setStatus(c, 'Archived'); }, text: 'Archive' })
                : h('button', { class: 'btn btn-outline btn-small', type: 'button', onclick: function () { setStatus(c, 'Active'); }, text: 'Restore' })
            ]);
          } }
      ], d.items));
      return root;
    });
  }

  Router.register({ id: 'courses', title: 'Courses', label: 'Courses', icon: 'book', render: render });
})();
