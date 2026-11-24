/* pages/students.js - student list (search, filters, paging), add/edit form, profile with batch history */
(function () {
  'use strict';
  var h = UI.h;
  var state = { q: '', status: 'Active', course_id: '', batch_id: '', page: 1 };
  var STATUS_KIND = { Active: 'ok', Archived: 'muted', Left: 'muted', Completed: 'warn' };

  function toast(e) { UI.toast(e.message, 'error'); }
  function phoneLink(p) { return p ? h('a', { href: 'tel:' + String(p).replace(/[^0-9+]/g, ''), text: p }) : ''; }

  /** Courses and active batches (with free seats) for the pickers. */
  function loadOptions() {
    return Promise.all([
      API.call('courses.list', { status: 'All' }),
      API.call('batches.list', { status: 'Active', pageSize: 100 })
    ]).then(function (r) { return { courses: r[0].items, batches: r[1].items }; });
  }

  // ------------------------------------------------------------ add / edit
  function openForm(student, done) {
    var s = student || {};
    var requestId = API.newRequestId();
    loadOptions().then(function (o) {
      var courseOpts = [{ value: '', label: 'Not chosen' }].concat(o.courses
        .filter(function (c) { return c.status === 'Active' || c.course_id === s.course_id; })
        .map(function (c) { return { value: c.course_id, label: c.course_name }; }));
      var fields = [
        { name: 'full_name', label: 'Full name', required: true, maxlength: 80, value: s.full_name, wide: true, autocomplete: 'name' },
        { name: 'gender', label: 'Gender', type: 'select', value: s.gender || '', options: [{ value: '', label: 'Not stated' }, { value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }] },
        { name: 'dob', label: 'Date of birth', type: 'date', value: s.dob, max: UI.todayStr() },
        { name: 'phone', label: 'Phone', type: 'tel', required: true, maxlength: 15, pattern: '[0-9 +\\-]{7,15}', value: s.phone, hint: '7-15 digits' },
        { name: 'alt_phone', label: 'Alternate phone', type: 'tel', maxlength: 15, pattern: '[0-9 +\\-]{7,15}', value: s.alt_phone },
        { name: 'email', label: 'Email', type: 'email', maxlength: 120, value: s.email, wide: true },
        { name: 'guardian_name', label: 'Guardian name', maxlength: 80, value: s.guardian_name },
        { name: 'guardian_relation', label: 'Relation', maxlength: 30, value: s.guardian_relation, placeholder: 'Father, Mother…' },
        { name: 'guardian_phone', label: 'Guardian phone', type: 'tel', maxlength: 15, pattern: '[0-9 +\\-]{7,15}', value: s.guardian_phone },
        { name: 'admission_date', label: 'Admission date', type: 'date', required: true, value: s.admission_date || UI.todayStr() },
        { name: 'course_id', label: 'Course', type: 'select', value: s.course_id || '', options: courseOpts }
      ];
      if (!student) {
        var open = o.batches.filter(function (b) { return b.enrolled < b.capacity; });
        fields.push({ name: 'batch_id', label: 'Batch (optional)', type: 'select', value: '', hint: open.length ? 'Only batches with free seats are listed' : 'No batch has free seats yet',
          options: [{ value: '', label: 'Add to a batch later' }].concat(open.map(function (b) {
            return { value: b.batch_id, label: b.batch_name + ' — ' + b.course_name + ' (' + b.enrolled + '/' + b.capacity + ')' };
          })) });
      }
      fields.push({ name: 'address', label: 'Address', maxlength: 200, value: s.address, wide: true });
      fields.push({ name: 'notes', label: 'Notes', type: 'textarea', maxlength: 500, value: s.notes, wide: true });

      UI.formModal({
        title: student ? 'Edit student' : 'Add student',
        submitLabel: 'Save student',
        fields: fields,
        onSubmit: function (v) {
          if (student) v.student_id = student.student_id;
          function send(extra) {
            return API.call('students.save', Object.assign({}, v, extra || {}), { requestId: requestId });
          }
          return send().catch(function (err) {
            if (err.code !== 'DUPLICATE') throw err;
            return UI.confirmDialog({ title: 'Possible duplicate', okLabel: 'Save anyway', message: err.message + ' Save this student anyway?' }).then(function (yes) {
              if (!yes) throw new Error('Not saved. Check whether this student already exists.');
              return send({ allowDuplicate: true });
            });
          }).then(function (r) {
            UI.toast(student ? 'Student updated' : 'Student added (' + r.student_id + ')', 'success');
            done(r);
          });
        }
      });
    }).catch(toast);
  }

  // ------------------------------------------------------------ list
  function renderList(param) {
    var root = h('div');
    function afterSave(r) {
      if (!r || !r.student_id) return;
      state.q = ''; state.status = 'Active';
      Router.reload();
    }
    root.appendChild(h('div', { class: 'page-head' }, [
      h('div', null, [h('h2', { text: 'Students' }), h('div', { class: 'muted', text: 'Admissions and student records' })]),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { openForm(null, afterSave); } }, [UI.icon('plus', 18), 'Add student'])
    ]));

    var search = h('input', { type: 'search', 'aria-label': 'Search students', placeholder: 'Search name, ID, phone or guardian', maxlength: 60, autocomplete: 'off', value: state.q });
    var status = UI.select([{ value: 'Active', label: 'Active' }, { value: 'Archived', label: 'Archived' }, { value: 'All', label: 'All students' }], state.status, { 'aria-label': 'Filter by status' });
    var course = UI.select([{ value: '', label: 'All courses' }], state.course_id, { 'aria-label': 'Filter by course' });
    var batch = UI.select([{ value: '', label: 'All batches' }], state.batch_id, { 'aria-label': 'Filter by batch' });
    root.appendChild(h('div', { class: 'toolbar' }, [h('div', { class: 'search' }, search), h('div', null, status), h('div', null, course), h('div', null, batch)]));
    var results = h('div');
    root.appendChild(results);

    var seq = 0;
    function load() {
      var mine = ++seq;
      results.replaceChildren(UI.loading());
      API.call('students.list', { q: state.q, status: state.status, course_id: state.course_id, batch_id: state.batch_id, page: state.page, pageSize: 25 }).then(function (d) {
        if (mine !== seq) return;
        results.replaceChildren();
        if (!d.items.length) {
          var filtered = state.q || state.course_id || state.batch_id || state.status !== 'Active';
          results.appendChild(h('div', { class: 'card' }, UI.empty(filtered ? 'No students match' : 'No students yet',
            filtered ? 'Try a different search or filter.' : 'Use "Add student" to record your first admission.')));
          return;
        }
        results.appendChild(h('p', { class: 'muted result-note', text: d.total + (d.total === 1 ? ' student' : ' students') }));
        results.appendChild(UI.table([
          { label: 'Student', render: function (s) {
              return h('span', null, [h('a', { href: '#/students/' + s.student_id, text: s.full_name }), h('span', { class: 'sub', text: s.student_id + (s.guardian_name ? ' · Guardian: ' + s.guardian_name : '') })]);
            } },
          { label: 'Phone', render: function (s) { return phoneLink(s.phone); } },
          { label: 'Course / Batch', render: function (s) {
              var b = s.batches.map(function (x) { return x.batch_name; }).join(', ');
              return h('span', null, [s.course_name, b ? h('span', { class: 'sub', text: b }) : null]);
            } },
          { label: 'Admitted', render: function (s) { return UI.fmtDate(s.admission_date); } },
          { label: 'Status', render: function (s) { return UI.badge(s.status, STATUS_KIND[s.status]); } }
        ], d.items));
        if (d.pages > 1) results.appendChild(UI.pager(d, function (p) { state.page = p; load(); }));
      }).catch(function (e) { if (mine === seq) results.replaceChildren(UI.errorState(e.message, load)); });
    }

    search.addEventListener('input', UI.debounce(function () { state.q = search.value.trim(); state.page = 1; load(); }, 300));
    [[status, 'status'], [course, 'course_id'], [batch, 'batch_id']].forEach(function (p) {
      p[0].addEventListener('change', function () { state[p[1]] = p[0].value; state.page = 1; load(); });
    });
    loadOptions().then(function (o) {
      function fill(sel, first, rows, key, label, cur) {
        sel.replaceChildren.apply(sel, [h('option', { value: '', text: first })].concat(rows.map(function (r) {
          var opt = h('option', { value: r[key], text: label(r) });
          if (r[key] === cur) opt.selected = true;
          return opt;
        })));
      }
      fill(course, 'All courses', o.courses, 'course_id', function (c) { return c.course_name + (c.status === 'Archived' ? ' (archived)' : ''); }, state.course_id);
      fill(batch, 'All batches', o.batches, 'batch_id', function (b) { return b.batch_name; }, state.batch_id);
    }).catch(function () { /* filters stay on "All" */ });

    load();
    if (param === 'new') {
      history.replaceState(null, '', '#/students');   // so a refresh does not reopen the form
      openForm(null, afterSave);
    }
    return root;
  }

  // ------------------------------------------------------------ profile
  function pickBatch(title, student, excludeBatchIds, onPick) {
    API.call('batches.list', { status: 'Active', pageSize: 100 }).then(function (d) {
      var open = d.items.filter(function (b) { return b.enrolled < b.capacity && excludeBatchIds.indexOf(b.batch_id) < 0; });
      if (!open.length) { UI.toast('No other active batch has free seats.', 'error'); return; }
      var requestId = API.newRequestId();
      UI.formModal({
        title: title,
        submitLabel: 'Confirm',
        fields: [
          { name: 'batch_id', label: 'Batch', type: 'select', required: true, value: '', options: [{ value: '', label: 'Select a batch' }].concat(open.map(function (b) {
            return { value: b.batch_id, label: b.batch_name + ' — ' + b.course_name + ' (' + b.enrolled + '/' + b.capacity + ')' };
          })) },
          { name: 'date', label: 'Date', type: 'date', required: true, value: UI.todayStr() }
        ],
        onSubmit: function (v) { return onPick(v, requestId); }
      });
    }).catch(toast);
  }

  function renderProfile(id) {
    return API.call('students.get', { student_id: id }).then(function (d) {
      var s = d.student, enr = d.enrollments;
      var activeEnr = enr.filter(function (e) { return e.status === 'Active'; });
      var root = h('div');
      root.appendChild(h('a', { class: 'back-link', href: '#/students' }, [UI.icon('back', 18), 'All students']));

      var actions = [h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { openForm(s, function () { Router.reload(); }); }, text: 'Edit' })];
      if (s.status === 'Active') {
        actions.push(h('button', { class: 'btn btn-outline', type: 'button', text: 'Archive', onclick: function () {
          UI.confirmDialog({ title: 'Archive student', okLabel: 'Archive', danger: true,
            message: 'Archive ' + s.full_name + '? ' + (activeEnr.length ? 'Their ' + activeEnr.length + ' active batch enrolment(s) will end. ' : '') + 'All records are kept and you can restore the student later.' })
            .then(function (yes) {
              if (!yes) return;
              return API.call('students.setStatus', { student_id: s.student_id, status: 'Archived' }, { requestId: API.newRequestId() })
                .then(function () { UI.toast('Student archived', 'success'); Router.reload(); }).catch(toast);
            });
        } }));
      } else {
        actions.push(h('button', { class: 'btn btn-outline', type: 'button', text: 'Restore', onclick: function () {
          API.call('students.setStatus', { student_id: s.student_id, status: 'Active' }, { requestId: API.newRequestId() })
            .then(function () { UI.toast('Student restored', 'success'); Router.reload(); }).catch(toast);
        } }));
      }
      root.appendChild(h('div', { class: 'profile-head' }, [
        h('div', null, [h('h2', { text: s.full_name }), h('div', { class: 'muted' }, [UI.badge(s.status, STATUS_KIND[s.status]), h('span', { text: s.student_id }), s.course_name ? h('span', { text: s.course_name }) : null])]),
        h('div', { class: 'head-actions' }, actions)
      ]));

      root.appendChild(h('section', { class: 'card section' }, UI.details([
        ['Phone', phoneLink(s.phone)], ['Alternate phone', phoneLink(s.alt_phone)], ['Email', s.email],
        ['Gender', s.gender], ['Date of birth', s.dob ? UI.fmtDate(s.dob) : ''], ['Admission date', UI.fmtDate(s.admission_date)],
        ['Guardian', [s.guardian_name, s.guardian_relation ? '(' + s.guardian_relation + ')' : ''].filter(Boolean).join(' ')], ['Guardian phone', phoneLink(s.guardian_phone)],
        ['Course', s.course_name], ['Address', s.address], ['Notes', s.notes]
      ])));

      // Fees and attendance summary: filled in after the profile is shown, and a failure here never breaks the page
      var feeBox = h('div', { class: 'summary-tile' }, h('span', { class: 'muted', text: 'Loading fees…' }));
      var attBox = h('div', { class: 'summary-tile' }, h('span', { class: 'muted', text: 'Loading attendance…' }));
      root.appendChild(h('section', { class: 'card section summary-grid' }, [feeBox, attBox]));
      if (Router.has('progress')) {
        root.appendChild(h('div', { class: 'section' }, h('a', { class: 'btn btn-outline', href: '#/progress/' + s.student_id }, [UI.icon('chart', 18), 'Progress report (marks and attendance)'])));
      }
      API.call('fees.student', { student_id: s.student_id }).then(function (f) {
        feeBox.replaceChildren(h('h3', { text: 'Fees' }),
          h('div', { text: UI.money(f.summary.paid) + ' paid of ' + UI.money(f.summary.net) }),
          h('div', { class: f.summary.balance > 0 ? 'bad-text' : 'muted', text: f.summary.balance > 0 ? UI.money(f.summary.balance) + ' due' + (f.summary.overdue > 0 ? ' (' + UI.money(f.summary.overdue) + ' overdue)' : '') : (f.fees.length ? 'Nothing due' : 'No fee plan yet') }),
          h('a', { class: 'btn btn-outline btn-small', href: '#/fees/' + s.student_id, text: 'Open fees' }));
      }).catch(function () { feeBox.replaceChildren(h('h3', { text: 'Fees' }), h('span', { class: 'muted', text: 'Not available right now' })); });
      API.call('attendance.report', { student_id: s.student_id }).then(function (a) {
        attBox.replaceChildren(h('h3', { text: 'Attendance (last 30 days)' }),
          a.total ? h('div', null, [h('strong', { text: a.percent + '%' }), ' present · ' + a.present + ' present, ' + a.absent + ' absent, ' + a.leave + ' leave']) : h('div', { class: 'muted', text: 'No attendance marked yet' }));
      }).catch(function () { attBox.replaceChildren(h('h3', { text: 'Attendance' }), h('span', { class: 'muted', text: 'Not available right now' })); });

      var assign = s.status === 'Active'
        ? h('button', { class: 'btn btn-primary btn-small', type: 'button', onclick: function () {
            pickBatch('Add to a batch', s, activeEnr.map(function (e) { return e.batch_id; }), function (v, rid) {
              return API.call('enrollments.add', { student_id: s.student_id, batch_id: v.batch_id, enrolled_on: v.date }, { requestId: rid })
                .then(function () { UI.toast('Added to the batch', 'success'); Router.reload(); });
            });
          } }, [UI.icon('plus', 16), 'Add to batch'])
        : null;
      root.appendChild(h('section', { class: 'section' }, [
        h('div', { class: 'section-head' }, [h('h3', { text: 'Batches' }), assign]),
        enr.length
          ? UI.table([
              { label: 'Batch', render: function (e) { return h('span', null, [h('a', { href: '#/batches/' + e.batch_id, text: e.batch_name }), h('span', { class: 'sub', text: e.course_name })]); } },
              { label: 'Joined', render: function (e) { return UI.fmtDate(e.enrolled_on); } },
              { label: 'Ended', render: function (e) { return e.left_on ? UI.fmtDate(e.left_on) : ''; } },
              { label: 'Status', render: function (e) { return UI.badge(e.status, STATUS_KIND[e.status]); } },
              { label: 'Actions', cls: 'actions', render: function (e) {
                  if (e.status !== 'Active') return '';
                  return h('span', null, [
                    h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Transfer', onclick: function () {
                      pickBatch('Transfer to another batch', s, [e.batch_id], function (v, rid) {
                        return API.call('enrollments.transfer', { student_id: s.student_id, from_batch_id: e.batch_id, to_batch_id: v.batch_id, date: v.date }, { requestId: rid })
                          .then(function () { UI.toast('Student transferred', 'success'); Router.reload(); });
                      });
                    } }),
                    h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Remove', onclick: function () {
                      UI.confirmDialog({ title: 'Remove from batch', okLabel: 'Remove', danger: true, message: 'Remove ' + s.full_name + ' from "' + e.batch_name + '"? The history is kept.' }).then(function (yes) {
                        if (!yes) return;
                        return API.call('enrollments.end', { enrollment_id: e.enrollment_id, outcome: 'Left' }, { requestId: API.newRequestId() })
                          .then(function () { UI.toast('Removed from the batch', 'success'); Router.reload(); }).catch(toast);
                      });
                    } })
                  ]);
                } }
            ], enr)
          : h('div', { class: 'card' }, UI.empty('Not in any batch', s.status === 'Active' ? 'Use "Add to batch" to place this student in a batch.' : ''))
      ]));
      return root;
    });
  }

  Router.register({ id: 'students', title: 'Students', label: 'Students', icon: 'users', primary: true, render: function (ctx) {
    var param = ctx && ctx.param;
    return /^STU-/.test(param || '') ? renderProfile(param) : renderList(param);
  } });
})();
