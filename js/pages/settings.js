/* pages/settings.js - institute details (shown on receipts) and a few rules */
(function () {
  'use strict';
  var h = UI.h;


  function ageDays(iso) { return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null; }

  function backupCard(bk) {
    var card = h('section', { class: 'card section' });
    if (!bk) { card.appendChild(h('h3', { text: 'Backups' })); card.appendChild(h('p', { class: 'muted', text: 'Backups could not be loaded. Update the server files (Backup.gs) and deploy a new version.' })); return card; }
    var days = ageDays(bk.last_at);
    var status = h('p', { class: days === null || days > 7 ? 'form-error' : 'muted' });
    var list = h('div');
    function draw(data) {
      var d = ageDays(data.last_at);
      status.className = d === null || d > 7 ? 'form-error' : 'muted';
      status.textContent = data.last_at ? 'Last backup: ' + data.last_at.slice(0, 16).replace('T', ' ') + (d > 7 ? ' (more than 7 days ago, please back up now)' : '') : 'No backup yet. Please make one now.';
      list.textContent = '';
      if (data.items.length) {
        list.appendChild(UI.table([
          { label: 'Made on', render: function (r) { return r.created_at.slice(0, 16).replace('T', ' '); } },
          { label: 'Sheets', cls: 'hide-sm', render: function (r) { return String(r.sheets); } },
          { label: 'Rows', cls: 'hide-sm', render: function (r) { return String(r.rows); } },
          { label: 'By', render: function (r) { return r.by; } }
        ], data.items));
      }
    }
    var btn = h('button', { class: 'btn btn-primary', type: 'button', text: 'Back up now' });
    var busy = false;
    btn.addEventListener('click', function () {
      if (busy) return;
      busy = true; btn.disabled = true; btn.textContent = 'Backing up…';
      API.call('backup.run', {}, { requestId: API.newRequestId(), timeout: 120000 }).then(function (res) {
        UI.toast('Backup saved (' + res.sheets + ' sheets, ' + res.rows + ' rows)', 'success');
        return API.call('backup.list').then(draw);
      }).catch(function (err) { UI.toast(err.message, 'error'); })
        .then(function () { busy = false; btn.disabled = false; btn.textContent = 'Back up now'; });
    });
    card.appendChild(h('h3', { text: 'Backups' }));
    card.appendChild(h('p', { class: 'muted', text: 'A full copy of your database is saved to a private Drive folder (Backups). The newest ' + bk.keep + ' are kept. Backups contain student data: never share that folder. To restore, follow the Backup guide.' }));
    card.appendChild(status);
    card.appendChild(h('div', { class: 'modal-actions' }, btn));
    card.appendChild(list);
    draw(bk);
    return card;
  }

  function render() {
    return Promise.all([API.call('settings.get'), API.call('system.ping').catch(function () { return null; }), API.call('backup.list').catch(function () { return null; })]).then(function (r) {
      var s = r[0], ping = r[1], bk = r[2];
      var fields = [
        UI.field({ name: 'institute_name', label: 'Institute name', required: true, maxlength: 80, value: s.institute_name, wide: true, hint: 'Printed at the top of receipts' }),
        UI.field({ name: 'institute_phone', label: 'Phone', type: 'tel', maxlength: 30, value: s.institute_phone }),
        UI.field({ name: 'receipt_prefix', label: 'Receipt prefix', required: true, maxlength: 6, pattern: '[A-Za-z0-9]{2,6}', value: s.receipt_prefix, hint: '2-6 letters or digits, e.g. GDTA. Receipts look like GDTA-2026-000001' }),
        UI.field({ name: 'institute_address', label: 'Address', maxlength: 200, value: s.institute_address, wide: true }),
        UI.field({ name: 'attendance_edit_days', label: 'Attendance can be edited for (days)', type: 'number', required: true, min: 0, max: 3650, step: 1, value: s.attendance_edit_days, hint: 'Attendance older than this is locked' }),
        UI.field({ name: 'pass_percent_default', label: 'Default pass percentage', type: 'number', required: true, min: 0, max: 100, step: 1, value: s.pass_percent_default, hint: 'Used when you add an exam. Each exam can have its own.' }),
        UI.field({ name: 'ai_daily_limit', label: 'AI question papers per day', type: 'number', required: true, min: 0, max: 500, step: 1, value: s.ai_daily_limit, hint: 'Optional AI feature. 0 turns it off. Free AI plans have their own limits too.' })
      ];
      var errBox = h('div', { class: 'form-error', role: 'alert', hidden: true });
      var save = h('button', { class: 'btn btn-primary', type: 'submit', text: 'Save settings' });
      var form = h('form', { class: 'form' }, [errBox, h('div', { class: 'form-grid' }, fields.map(function (f) { return f.el; })), h('div', { class: 'modal-actions' }, save)]);
      var busy = false;
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (busy) return;
        errBox.hidden = true;
        if (!form.reportValidity()) return;
        busy = true; save.disabled = true; save.textContent = 'Saving…';
        var v = {};
        fields.forEach(function (f) { v[f.spec.name] = f.control.value.trim(); });
        API.call('settings.save', v, { requestId: API.newRequestId() }).then(function (res) {
          UI.toast(res.changed.length ? 'Settings saved' : 'No changes to save', 'success');
        }).catch(function (err) {
          errBox.textContent = err.message; errBox.hidden = false;
        }).then(function () { busy = false; save.disabled = false; save.textContent = 'Save settings'; });
      });

      var root = h('div');
      root.appendChild(h('div', { class: 'page-head' }, [h('div', null, [h('h2', { text: 'Settings' }), h('div', { class: 'muted', text: 'Institute details and rules' })])]));
      root.appendChild(h('section', { class: 'card section' }, form));
      root.appendChild(backupCard(bk));
      root.appendChild(h('section', { class: 'card section' }, [
        h('h3', { text: 'About this installation' }),
        UI.details([['Server version', ping ? ping.version : 'Unavailable'], ['Server time', ping ? ping.time : '']]),
        h('p', { class: 'muted', text: 'Passwords and API keys are never stored here. They live in Apps Script Script Properties.' })
      ]));
      return root;
    });
  }

  Router.register({ id: 'settings', title: 'Settings', label: 'Settings', icon: 'sliders', render: render });
})();
