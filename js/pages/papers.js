/* pages/papers.js - question papers: build by hand or draft with AI (optional), edit, save, preview and print.
   AI only produces a DRAFT. Nothing is saved until you press Save. */
(function () {
  'use strict';
  var h = UI.h;
  var TYPE_LABEL = { mcq: 'Multiple choice questions', true_false: 'True or False', short: 'Short answer questions', long: 'Long answer questions' };
  var TYPES = ['mcq', 'true_false', 'short', 'long'];
  var LEVELS = ['Easy', 'Medium', 'Hard', 'Mixed'];
  var LANGS = ['English', 'Bengali', 'Hindi'];
  var state = { q: '', page: 1 };
  var draft = null;          // { paper, paper_id, warnings, request }  (kept in memory only)
  var aiInfo = null;

  function toast(e) { UI.toast(e.message || String(e), 'error'); }
  function num(v) { return String(Math.round(Number(v) * 100) / 100); }
  function blankPaper() {
    return { title: '', subject: '', class_level: '', duration_minutes: '', instructions: 'Answer all questions.', difficulty: 'Mixed', language: 'English', source: 'manual', sections: [] };
  }
  function blankQuestion(type) {
    var q = { text: '', answer: type === 'mcq' ? 'A' : type === 'true_false' ? 'True' : '', explanation: '' };
    if (type === 'mcq') q.options = ['', '', '', ''];
    return q;
  }
  function totals(p) {
    var n = 0, cents = 0;
    p.sections.forEach(function (s) { n += s.questions.length; cents += s.questions.length * Math.round(Number(s.marks_each || 0) * 100); });
    return { questions: n, marks: cents / 100 };
  }

  // ------------------------------------------------------------ printable paper
  function buildSheet(d, showKey) {
    var p = d.paper, inst = d.institute || {}, t = totals(p);
    var sheet = h('div', { class: 'card report-sheet paper-sheet' });
    sheet.appendChild(h('div', { class: 'report-head' }, [
      h('div', { class: 'report-inst', text: inst.name || '' }),
      h('h2', { class: 'report-title', text: p.title }),
      h('div', { class: 'report-lines' }, [
        h('div', { text: [p.subject, p.class_level].filter(Boolean).join(' · ') }),
        h('div', { text: ['Total marks: ' + num(t.marks), p.duration_minutes ? 'Time: ' + p.duration_minutes + ' minutes' : ''].filter(Boolean).join(' · ') })
      ])
    ]));
    if (p.instructions) sheet.appendChild(h('p', { class: 'paper-instr', text: 'Instructions: ' + p.instructions }));
    var n = 0, keyRows = [];
    p.sections.forEach(function (s) {
      sheet.appendChild(h('h3', { class: 'report-sub', text: s.heading + '  (' + s.questions.length + ' × ' + num(s.marks_each) + ' = ' + num(s.questions.length * s.marks_each) + ' marks)' }));
      var ol = h('ol', { class: 'paper-q', start: n + 1 });
      s.questions.forEach(function (q) {
        n++;
        var li = h('li', null, [h('div', { class: 'paper-qtext', text: q.text })]);
        if (s.type === 'mcq') li.appendChild(h('ol', { class: 'paper-opts', type: 'A' }, q.options.map(function (o) { return h('li', { text: o }); })));
        if (s.type === 'true_false') li.appendChild(h('div', { class: 'muted', text: 'True / False' }));
        if (s.type === 'short') li.appendChild(h('div', { class: 'paper-space short' }));
        if (s.type === 'long') li.appendChild(h('div', { class: 'paper-space long' }));
        ol.appendChild(li);
        keyRows.push({ n: n, q: q, type: s.type });
      });
      sheet.appendChild(ol);
    });
    if (showKey) {
      sheet.appendChild(h('h3', { class: 'report-sub paper-key', text: 'Answer key' }));
      sheet.appendChild(h('ul', { class: 'paper-keylist' }, keyRows.map(function (r) {
        var a = r.type === 'mcq' ? r.q.answer + '. ' + r.q.options['ABCD'.indexOf(r.q.answer)] : r.q.answer;
        return h('li', null, [h('strong', { text: r.n + '. ' }), a || '(no model answer)', r.q.explanation ? h('div', { class: 'muted', text: r.q.explanation }) : null]);
      })));
    }
    return sheet;
  }

  // ------------------------------------------------------------ list
  function renderList() {
    var root = h('div');
    var newAi = h('button', { class: 'btn btn-outline', type: 'button' }, [UI.icon('refresh', 18), 'Draft with AI']);
    newAi.addEventListener('click', function () { openGenerator(null); });
    root.appendChild(h('div', { class: 'page-head' }, [
      h('div', null, [h('h2', { text: 'Question papers' }), h('div', { class: 'muted', text: 'Build a paper by hand, or draft one with AI and edit it' })]),
      h('div', { class: 'head-actions' }, [newAi, h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { draft = { paper: blankPaper(), paper_id: '', warnings: [] }; location.hash = '#/papers/new'; } }, [UI.icon('plus', 18), 'New paper'])])
    ]));
    var aiNote = h('div');
    root.appendChild(aiNote);
    API.call('ai.status').then(function (s) {
      aiInfo = s;
      if (!s.available) {
        newAi.disabled = true;
        var why = { not_configured: 'AI is not set up. Everything else works; you can build papers by hand. (Setup steps are in the Phase 7 guide.)', no_model: 'AI is half set up: the model name is missing in Script Properties.', disabled: 'AI is turned off in Settings (AI papers per day is 0).', limit_reached: 'Today\'s AI limit (' + s.daily_limit + ') has been reached. It resets tomorrow, or raise the limit in Settings.' }[s.reason] || 'AI is not available.';
        aiNote.appendChild(h('div', { class: 'notice warn', role: 'status', text: why }));
      } else aiNote.appendChild(h('div', { class: 'muted', text: 'AI drafts today: ' + s.used_today + ' of ' + s.daily_limit + '. AI can make mistakes: always read and correct a draft before using it.' }));
    }).catch(function () { newAi.disabled = true; });

    var search = h('input', { type: 'search', 'aria-label': 'Search papers', placeholder: 'Search title or subject', maxlength: 60, autocomplete: 'off', value: state.q });
    root.appendChild(h('div', { class: 'toolbar' }, h('div', { class: 'search' }, search)));
    var results = h('div'); root.appendChild(results);
    var seq = 0;
    function load() {
      var mine = ++seq;
      results.replaceChildren(UI.loading());
      API.call('papers.list', { q: state.q, page: state.page, pageSize: 25 }).then(function (d) {
        if (mine !== seq) return;
        results.replaceChildren();
        if (!d.items.length) { results.appendChild(h('div', { class: 'card' }, UI.empty(state.q ? 'No papers match' : 'No question papers yet', 'Use "New paper" to build one, or "Draft with AI" if AI is set up.'))); return; }
        results.appendChild(UI.table([
          { label: 'Paper', render: function (x) { return h('span', null, [h('a', { href: '#/papers/' + x.paper_id, text: x.title }), h('span', { class: 'sub', text: [x.subject, x.class_level].filter(Boolean).join(' · ') })]); } },
          { label: 'Questions', cls: 'hide-sm', render: function (x) { return String(x.questions); } },
          { label: 'Marks', render: function (x) { return num(x.total_marks); } },
          { label: 'Made by', cls: 'hide-sm', render: function (x) { return UI.badge(x.source === 'ai' ? 'AI draft, edited' : 'By hand', x.source === 'ai' ? 'warn' : 'muted'); } },
          { label: 'Saved', cls: 'hide-sm', render: function (x) { return UI.fmtDate(x.updated_at); } }
        ], d.items));
        if (d.pages > 1) results.appendChild(UI.pager(d, function (p) { state.page = p; load(); }));
      }).catch(function (e) { if (mine === seq) results.replaceChildren(UI.errorState(e.message, load)); });
    }
    search.addEventListener('input', UI.debounce(function () { state.q = search.value.trim(); state.page = 1; load(); }, 300));
    load();
    return Promise.resolve(root);
  }

  // ------------------------------------------------------------ AI generator
  function openGenerator(prev) {
    var r = prev || { subject: '', class_level: '', topic: '', difficulty: 'Medium', language: 'English', include_answers: true, include_explanations: false, sections: [{ type: 'mcq', count: 5, marks_each: 1 }, { type: 'short', count: 3, marks_each: 3 }] };
    var requestId = null;
    var fields = [
      { name: 'subject', label: 'Subject', required: true, maxlength: 60, value: r.subject },
      { name: 'class_level', label: 'Class or level', required: true, maxlength: 40, value: r.class_level, placeholder: 'e.g. Class 9' },
      { name: 'difficulty', label: 'Difficulty', type: 'select', value: r.difficulty, options: LEVELS.map(function (x) { return { value: x, label: x }; }) },
      { name: 'language', label: 'Language', type: 'select', value: r.language, options: LANGS.map(function (x) { return { value: x, label: x }; }) },
      { name: 'topic', label: 'Topic or syllabus', type: 'textarea', required: true, maxlength: 3000, value: r.topic, wide: true, hint: 'Only this text, the subject and the level are sent to the AI. Do not paste student names or personal details.' }
    ];
    TYPES.forEach(function (t) {
      var cur = r.sections.filter(function (s) { return s.type === t; })[0];
      fields.push({ name: 'count_' + t, label: TYPE_LABEL[t] + ': how many', type: 'number', min: 0, max: 20, step: 1, value: cur ? cur.count : 0 });
      fields.push({ name: 'marks_' + t, label: 'Marks each', type: 'number', min: 0.5, max: 20, step: 'any', value: cur ? cur.marks_each : (t === 'long' ? 5 : t === 'short' ? 3 : 1) });
    });
    fields.push({ name: 'include_answers', label: 'Include model answers for short and long questions', type: 'select', value: r.include_answers ? 'yes' : 'no', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], wide: true });
    fields.push({ name: 'include_explanations', label: 'Include explanations in the answer key', type: 'select', value: r.include_explanations ? 'yes' : 'no', options: [{ value: 'no', label: 'No (shorter, faster)' }, { value: 'yes', label: 'Yes' }], wide: true });
    UI.formModal({
      title: 'Draft a question paper with AI',
      submitLabel: 'Generate draft',
      intro: 'This can take up to a minute. The result is only a draft: you review and edit it before saving.',
      fields: fields,
      onSubmit: function (v) {
        var sections = [];
        TYPES.forEach(function (t) { var c = Number(v['count_' + t]); if (c > 0) sections.push({ type: t, count: c, marks_each: Number(v['marks_' + t]) }); });
        if (!sections.length) return Promise.reject(new Error('Choose how many questions you want for at least one type.'));
        var req = { subject: v.subject, class_level: v.class_level, topic: v.topic, difficulty: v.difficulty, language: v.language, include_answers: v.include_answers === 'yes', include_explanations: v.include_explanations === 'yes', sections: sections };
        return API.call('ai.generate', req, { timeout: 120000 }).then(function (res) {
          draft = { paper: res.paper, paper_id: '', warnings: res.warnings || [], request: req };
          UI.toast('Draft ready. Please review it.', 'success');
          if (location.hash === '#/papers/new') Router.reload(); else location.hash = '#/papers/new';
        });
      }
    });
  }

  // ------------------------------------------------------------ editor
  function renderEditor() {
    if (!draft) { draft = { paper: blankPaper(), paper_id: '', warnings: [] }; }
    var p = draft.paper, root = h('div');
    root.appendChild(h('a', { class: 'back-link', href: draft.paper_id ? '#/papers/' + draft.paper_id : '#/papers' }, [UI.icon('back', 18), draft.paper_id ? 'Back to paper' : 'All papers']));
    root.appendChild(h('div', { class: 'page-head' }, [h('div', null, [h('h2', { text: draft.paper_id ? 'Edit paper' : 'New paper' }), h('div', { class: 'muted', text: p.source === 'ai' ? 'AI draft: check every question and answer before you use it.' : 'Build your paper below.' })])]));
    (draft.warnings || []).forEach(function (w) { root.appendChild(h('div', { class: 'notice warn', role: 'status', text: w })); });

    function bind(el, obj, key, number) { el.addEventListener('input', function () { obj[key] = number ? el.value : el.value; refreshTotal(); }); return el; }
    var totalBox = h('div', { class: 'paper-total', 'aria-live': 'polite' });
    function refreshTotal() { var t = totals(p); totalBox.textContent = t.questions + ' questions · ' + num(t.marks) + ' marks'; }

    var head = [
      UI.field({ name: 'title', label: 'Title', required: true, maxlength: 120, value: p.title, wide: true }),
      UI.field({ name: 'subject', label: 'Subject', required: true, maxlength: 60, value: p.subject }),
      UI.field({ name: 'class_level', label: 'Class or level', maxlength: 40, value: p.class_level }),
      UI.field({ name: 'duration_minutes', label: 'Time (minutes)', type: 'number', min: 1, max: 600, step: 1, value: p.duration_minutes }),
      UI.field({ name: 'instructions', label: 'Instructions', maxlength: 600, value: p.instructions, wide: true })
    ];
    head.forEach(function (f) { bind(f.control, p, f.spec.name); });
    root.appendChild(h('section', { class: 'card section' }, h('div', { class: 'form-grid' }, head.map(function (f) { return f.el; }))));

    var secBox = h('div');
    root.appendChild(secBox);
    function drawSections() {
      secBox.replaceChildren();
      p.sections.forEach(function (s, si) {
        var qBox = h('div', { class: 'paper-edit-qs' });
        s.questions.forEach(function (q, qi) { qBox.appendChild(editQuestion(s, q, qi)); });
        var heading = h('input', { type: 'text', 'aria-label': 'Section heading', maxlength: 100, value: s.heading || '' });
        bind(heading, s, 'heading');
        var marks = h('input', { type: 'number', 'aria-label': 'Marks per question', min: 0, max: 100, step: 'any', value: s.marks_each, class: 'marks-input' });
        bind(marks, s, 'marks_each');
        secBox.appendChild(h('section', { class: 'card section paper-edit-sec' }, [
          h('div', { class: 'section-head' }, [h('h3', { text: TYPE_LABEL[s.type] }), h('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Remove section', onclick: function () {
            UI.confirmDialog({ title: 'Remove section', okLabel: 'Remove', danger: true, message: 'Remove this whole section and its ' + s.questions.length + ' question(s)?' }).then(function (y) { if (y) { p.sections.splice(si, 1); drawSections(); refreshTotal(); } });
          } })]),
          h('div', { class: 'form-grid' }, [h('div', { class: 'field' }, [h('label', { text: 'Section heading' }), heading]), h('div', { class: 'field' }, [h('label', { text: 'Marks per question' }), marks])]),
          qBox,
          h('button', { class: 'btn btn-outline btn-small', type: 'button', onclick: function () { s.questions.push(blankQuestion(s.type)); drawSections(); refreshTotal(); } }, [UI.icon('plus', 16), 'Add question'])
        ]));
      });
      refreshTotal();
    }
    function editQuestion(s, q, qi) {
      var text = h('textarea', { rows: 2, maxlength: 1000, 'aria-label': 'Question ' + (qi + 1) }); text.value = q.text; bind(text, q, 'text');
      var wrap = h('div', { class: 'paper-edit-q' }, [h('div', { class: 'section-head' }, [h('strong', { text: 'Question ' + (qi + 1) }), h('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Remove', onclick: function () { s.questions.splice(qi, 1); drawSections(); refreshTotal(); } })]), text]);
      if (s.type === 'mcq') {
        q.options.forEach(function (o, oi) {
          var inp = h('input', { type: 'text', maxlength: 300, 'aria-label': 'Option ' + 'ABCD'.charAt(oi), value: o });
          inp.addEventListener('input', function () { q.options[oi] = inp.value; });
          var radio = h('input', { type: 'radio', name: 'ans-' + qi + '-' + s.type + '-' + p.sections.indexOf(s), value: 'ABCD'.charAt(oi), 'aria-label': 'Option ' + 'ABCD'.charAt(oi) + ' is correct' });
          if (q.answer === 'ABCD'.charAt(oi)) radio.checked = true;
          radio.addEventListener('change', function () { q.answer = 'ABCD'.charAt(oi); });
          wrap.appendChild(h('label', { class: 'paper-opt-row' }, [radio, h('span', { class: 'paper-opt-letter', text: 'ABCD'.charAt(oi) }), inp]));
        });
        wrap.appendChild(h('div', { class: 'muted', text: 'Select the circle next to the correct option.' }));
      } else if (s.type === 'true_false') {
        var sel = UI.select([{ value: 'True', label: 'True' }, { value: 'False', label: 'False' }], q.answer, { 'aria-label': 'Correct answer' });
        sel.addEventListener('change', function () { q.answer = sel.value; });
        wrap.appendChild(h('div', { class: 'field' }, [h('label', { text: 'Correct answer' }), sel]));
      } else {
        var ans = h('textarea', { rows: 2, maxlength: 1500, 'aria-label': 'Model answer', placeholder: 'Model answer (optional)' }); ans.value = q.answer; bind(ans, q, 'answer');
        wrap.appendChild(ans);
      }
      var ex = h('input', { type: 'text', maxlength: 600, 'aria-label': 'Explanation', placeholder: 'Explanation (optional)', value: q.explanation || '' }); bind(ex, q, 'explanation');
      wrap.appendChild(ex);
      return wrap;
    }
    drawSections();

    var addBtns = TYPES.map(function (t) {
      return h('button', { class: 'btn btn-outline btn-small', type: 'button', onclick: function () { p.sections.push({ type: t, heading: TYPE_LABEL[t], marks_each: t === 'long' ? 5 : t === 'short' ? 3 : 1, questions: [blankQuestion(t)] }); drawSections(); } }, [UI.icon('plus', 16), TYPE_LABEL[t]]);
    });
    root.appendChild(h('section', { class: 'section' }, [h('div', { class: 'muted', text: 'Add a section:' }), h('div', { class: 'head-actions' }, addBtns)]));

    var saveBtn = h('button', { class: 'btn btn-primary', type: 'button' }, [UI.icon('check', 18), 'Save paper']);
    var previewBtn = h('button', { class: 'btn btn-outline', type: 'button', text: 'Preview' });
    var regen = draft.request && aiInfo && aiInfo.available ? h('button', { class: 'btn btn-outline', type: 'button', text: 'Regenerate', onclick: function () {
      UI.confirmDialog({ title: 'Regenerate', okLabel: 'Continue', message: 'Generating again replaces this draft and counts as another AI use today. Your edits here will be lost.' }).then(function (y) { if (y) openGenerator(draft.request); });
    } }) : null;
    var requestId = API.newRequestId(), saving = false;
    function cleanForSave() {
      return {
        title: p.title, subject: p.subject, class_level: p.class_level, duration_minutes: p.duration_minutes, instructions: p.instructions, difficulty: p.difficulty, language: p.language, source: p.source,
        sections: p.sections.map(function (s) { return { type: s.type, heading: s.heading, marks_each: s.marks_each, questions: s.questions.map(function (q) { var o = { text: q.text, answer: q.answer, explanation: q.explanation }; if (s.type === 'mcq') o.options = q.options; return o; }) }; })
      };
    }
    saveBtn.addEventListener('click', function () {
      if (saving) return;
      saving = true; saveBtn.disabled = true; saveBtn.lastChild.textContent = 'Saving…';
      API.call('papers.save', { paper_id: draft.paper_id || undefined, paper: cleanForSave() }, { requestId: requestId }).then(function (r) {
        UI.toast('Paper saved', 'success');
        draft = null;
        location.hash = '#/papers/' + r.paper_id;
      }).catch(function (e) { toast(e); saving = false; saveBtn.disabled = false; saveBtn.lastChild.textContent = 'Save paper'; requestId = API.newRequestId(); });
    });
    previewBtn.addEventListener('click', function () {
      try {
        var clean = cleanForSave();
        if (!clean.sections.length) throw new Error('Add at least one section first.');
        UI.modal('Preview', [buildSheet({ paper: clean, institute: {} }, false)]);
      } catch (e) { toast(e); }
    });
    root.appendChild(h('div', { class: 'att-save' }, [totalBox, h('div', { class: 'head-actions' }, [regen, previewBtn, saveBtn])]));
    refreshTotal();
    return Promise.resolve(root);
  }

  // ------------------------------------------------------------ view
  function renderView(id) {
    return API.call('papers.get', { paper_id: id }).then(function (d) {
      var root = h('div'), showKey = false;
      root.appendChild(h('a', { class: 'back-link no-print', href: '#/papers' }, [UI.icon('back', 18), 'All papers']));
      var sheetBox = h('div');
      function draw() { sheetBox.replaceChildren(buildSheet(d, showKey)); }
      var keyChk = h('input', { type: 'checkbox', 'aria-label': 'Show answer key' });
      keyChk.addEventListener('change', function () { showKey = keyChk.checked; draw(); });
      root.appendChild(h('div', { class: 'page-head no-print' }, [
        h('div', null, [h('h2', { text: d.paper.title }), h('div', { class: 'muted' }, [UI.badge(d.paper.source === 'ai' ? 'AI draft, edited' : 'By hand', d.paper.source === 'ai' ? 'warn' : 'muted'), ' ' + d.questions + ' questions · ' + num(d.total_marks) + ' marks'])]),
        h('div', { class: 'head-actions' }, [
          h('label', { class: 'absent-check' }, [keyChk, 'Include answer key']),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { window.print(); } }, [UI.icon('print', 18), 'Print']),
          h('button', { class: 'btn btn-outline', type: 'button', text: 'Edit', onclick: function () { draft = { paper: JSON.parse(JSON.stringify(d.paper)), paper_id: d.paper_id, warnings: [] }; location.hash = '#/papers/new'; } }),
          h('button', { class: 'btn btn-outline', type: 'button', text: 'Archive', onclick: function () {
            UI.confirmDialog({ title: 'Archive paper', okLabel: 'Archive', danger: true, message: 'Move "' + d.paper.title + '" to the Drive trash? It can be restored from Drive for 30 days.' }).then(function (y) {
              if (!y) return;
              API.call('papers.archive', { paper_id: d.paper_id }, { requestId: API.newRequestId() }).then(function () { UI.toast('Paper archived', 'success'); location.hash = '#/papers'; }).catch(toast);
            });
          } })
        ])
      ]));
      root.appendChild(h('div', { class: 'muted no-print', text: 'To print the answer key for yourself, tick "Include answer key". Untick it before printing copies for students.' }));
      root.appendChild(sheetBox);
      draw();
      return root;
    });
  }

  Router.register({ id: 'papers', title: 'Question papers', label: 'Papers', icon: 'file', render: function (ctx) {
    var p = ctx && ctx.param;
    if (!p) return renderList();
    if (p === 'new') return renderEditor();
    return renderView(p);
  } });
})();
