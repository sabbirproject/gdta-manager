/* pages/dashboard.js */
(function () {
  'use strict';
  var h = UI.h;

  // Quick actions appear only when the page they open has been registered (added in later phases).
  var QUICK = [
    { label: 'Add student', route: 'students', href: '#/students/new' },
    { label: 'Mark attendance', route: 'attendance' },
    { label: 'Record payment', route: 'fees' },
    { label: 'New exam', route: 'exams' },
    { label: 'Add class', route: 'schedule' },
    { label: 'New notice', route: 'notices' }
  ];

  function greeting() {
    var hr = new Date().getHours();
    return hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  }

  function stat(label, value, note, cls) {
    return h('div', { class: 'stat ' + (cls || '') }, [
      h('div', { class: 'stat-label', text: label }),
      h('div', { class: 'stat-value', text: value }),
      note ? h('div', { class: 'stat-note', text: note }) : null
    ]);
  }

  function listCard(title, rows, emptyText) {
    var body = rows.length
      ? h('ul', { class: 'list' }, rows.map(function (r) {
          return h('li', null, [
            h('div', null, [h('div', { class: 'main-text', text: r.main }), r.sub ? h('div', { class: 'sub-text', text: r.sub }) : null]),
            r.right ? h('div', { class: 'right', text: r.right }) : null
          ]);
        }))
      : UI.empty(emptyText);
    return h('section', { class: 'card' }, [h('h3', { text: title }), body]);
  }

  function attendanceCard(a) {
    var body;
    if (!a.marked) {
      body = UI.empty('Not marked yet', 'No attendance has been recorded for today.');
    } else {
      var seg = h('div', { class: 'seg', role: 'img', 'aria-label': a.present + ' present, ' + a.absent + ' absent, ' + a.leave + ' on leave' });
      [['p', a.present], ['a', a.absent], ['l', a.leave]].forEach(function (x) {
        var s = h('span', { class: x[0] });
        s.style.width = (x[1] / a.marked * 100) + '%';
        seg.appendChild(s);
      });
      body = h('div', null, [
        seg,
        h('div', { class: 'legend' }, [
          h('span', null, [h('i', { class: 'dot p' }), 'Present ' + a.present]),
          h('span', null, [h('i', { class: 'dot a' }), 'Absent ' + a.absent]),
          h('span', null, [h('i', { class: 'dot l' }), 'Leave ' + a.leave])
        ]),
        h('p', { class: 'muted', text: a.marked + ' records across ' + a.batchesMarked + (a.batchesMarked === 1 ? ' batch' : ' batches') })
      ]);
    }
    return h('section', { class: 'card' }, [h('h3', { text: "Today's attendance" }), body]);
  }

  function render() {
    return API.call('dashboard.summary').then(function (d) {
      var root = h('div');
      root.appendChild(h('div', { class: 'page-head' }, [
        h('div', null, [h('h2', { text: greeting() }), h('div', { class: 'muted', text: UI.fmtDate(d.today) })]),
        h('button', { class: 'btn btn-ghost', type: 'button', 'aria-label': 'Refresh', onclick: function () { Router.reload(); } },
          [UI.icon('refresh', 18), h('span', { class: 'btn-label', text: 'Refresh' })])
      ]));

      var c = d.counts, f = d.fees;
      root.appendChild(h('div', { class: 'grid-stats' }, [
        stat('Total students', String(c.totalStudents)),
        stat('Active students', String(c.activeStudents), null, 'ok'),
        stat('Active batches', String(c.activeBatches)),
        stat('Pending fees', UI.money(f.pendingAmount),
          f.pendingStudents + (f.pendingStudents === 1 ? ' student' : ' students') +
          (f.overdueAmount > 0 ? ' · ' + UI.money(f.overdueAmount) + ' overdue' : ''), 'warn')
      ]));

      var quick = QUICK.filter(function (q) { return Router.has(q.route); });
      if (quick.length) {
        root.appendChild(h('section', { class: 'card welcome' }, [
          h('h3', { text: 'Quick actions' }),
          h('div', { class: 'quick' }, quick.map(function (q) {
            return h('a', { class: 'btn btn-outline', href: q.href || ('#/' + q.route), text: q.label });
          }))
        ]));
      }

      if (!c.totalStudents && !c.activeBatches) {
        root.appendChild(h('section', { class: 'card welcome' }, UI.empty('Welcome', 'Nothing has been added yet. Your students, batches and fees will appear here.')));
      }

      root.appendChild(h('div', { class: 'grid-cards' }, [
        listCard("Today's classes", d.todayClasses.map(function (x) {
          return {
            main: x.subject + ' · ' + x.batch_name,
            sub: [x.teacher_name, x.room].filter(Boolean).join(' · '),
            right: UI.fmtTime(x.start_time) + (x.end_time ? ' – ' + UI.fmtTime(x.end_time) : '')
          };
        }), 'No classes scheduled for today.'),
        listCard('Upcoming classes (7 days)', (d.upcomingClasses || []).map(function (x) {
          return { main: x.subject + ' · ' + x.batch_name, sub: UI.fmtDate(x.class_date) + (x.room ? ' · ' + x.room : ''), right: UI.fmtTime(x.start_time) };
        }), 'No classes scheduled in the next 7 days.'),
        attendanceCard(d.attendanceToday),
        listCard('Recent payments', d.recentPayments.map(function (p) {
          return { main: p.student_name, sub: [UI.fmtDate(p.payment_date), p.method, p.receipt_no].filter(Boolean).join(' · '), right: UI.money(p.amount) };
        }), 'No payments recorded yet.'),
        listCard('Upcoming exams (30 days)', d.upcomingExams.map(function (x) {
          return { main: x.exam_name, sub: [x.subject, x.batch_name].filter(Boolean).join(' · '), right: UI.fmtDate(x.exam_date) };
        }), 'No exams scheduled in the next 30 days.')
      ]));

      root.appendChild(h('p', { class: 'muted', text: 'Collected this month: ' + UI.money(f.collectedThisMonth) }));
      return root;
    });
  }

  Router.register({ id: 'dashboard', title: 'Dashboard', label: 'Dashboard', icon: 'home', primary: true, render: render });
})();
