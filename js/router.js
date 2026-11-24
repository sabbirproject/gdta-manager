/* router.js - hash router (#/dashboard). Pages register themselves; navigation is built only from registered pages,
   so a menu item or button never points at a screen that does not exist. */
var Router = (function () {
  'use strict';
  var pages = {};
  var order = [];
  var started = false;
  var renderToken = 0;
  var navEls = [];

  /** def = { id, title, label, icon, render: function({param}) -> Promise<Node> }   param = 2nd part of #/id/param */
  function register(def) {
    if (!pages[def.id]) order.push(def.id);
    pages[def.id] = def;
  }

  function has(id) { return Object.prototype.hasOwnProperty.call(pages, id); }
  function items() { return order.map(function (id) { return pages[id]; }); }
  function parts() { return location.hash.replace(/^#\/?/, '').split('/'); }
  function currentId() { return parts()[0] || ''; }
  function currentParam() { var p = parts()[1] || ''; return /^[A-Za-z0-9_-]{1,100}$/.test(p) ? p : ''; }
  function go(id) { location.hash = '#/' + id; }

  var moreIds = [];
  var moreBtn = null;

  function navLink(p) {
    var a = UI.h('a', { href: '#/' + p.id, 'data-route': p.id }, [UI.icon(p.icon, 20), UI.h('span', { text: p.label || p.title })]);
    navEls.push(a);
    return a;
  }

  /**
   * Sidebar lists every page. The phone bottom bar shows up to 4 pages flagged `primary: true`, plus a "More" button
   * for the rest. With 5 pages or fewer, the bottom bar simply shows them all.
   */
  function buildNav(sideEl, bottomEl) {
    navEls = []; moreIds = []; moreBtn = null;
    sideEl.replaceChildren(); bottomEl.replaceChildren();
    var all = items();
    all.forEach(function (p) { sideEl.appendChild(navLink(p)); });

    var needMore = all.length > 5;
    var shown = needMore ? all.filter(function (p) { return p.primary; }).slice(0, 4) : all;
    var rest = needMore ? all.filter(function (p) { return shown.indexOf(p) < 0; }) : [];
    shown.forEach(function (p) { bottomEl.appendChild(navLink(p)); });
    if (rest.length) {
      moreIds = rest.map(function (p) { return p.id; });
      moreBtn = UI.h('button', { class: 'more-btn', type: 'button', 'aria-haspopup': 'dialog' }, [UI.icon('menu', 20), UI.h('span', { text: 'More' })]);
      moreBtn.addEventListener('click', function () {
        var m = UI.modal('More', UI.h('ul', { class: 'more-list' }, rest.map(function (p) {
          return UI.h('li', null, UI.h('a', { href: '#/' + p.id, onclick: function () { m.close(); } }, [UI.icon(p.icon, 20), p.label || p.title]));
        })));
      });
      bottomEl.appendChild(moreBtn);
    }
  }

  function markActive(id) {
    navEls.forEach(function (a) {
      if (a.getAttribute('data-route') === id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (moreBtn) {
      if (moreIds.indexOf(id) >= 0) moreBtn.setAttribute('aria-current', 'page');
      else moreBtn.removeAttribute('aria-current');
    }
  }

  function render() {
    var main = document.getElementById('main');
    var id = currentId();
    if (!has(id)) {
      if (order.length) { location.replace('#/' + order[0]); }
      return;
    }
    var def = pages[id];
    var token = ++renderToken;
    markActive(id);
    document.getElementById('page-title').textContent = def.title;
    document.title = def.title + ' · Institute Manager';
    main.replaceChildren(UI.loading());
    var p;
    try { p = Promise.resolve(def.render({ param: currentParam() })); } catch (e) { p = Promise.reject(e); }
    p.then(function (node) {
      if (token !== renderToken) return;
      main.replaceChildren(node);
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
    }).catch(function (err) {
      if (token !== renderToken) return;
      if (err && err.code === 'UNAUTHORIZED') return;   // the app shows the login screen
      main.replaceChildren(UI.errorState(err && err.message, render));
    });
  }

  function start() {
    if (!started) { window.addEventListener('hashchange', render); started = true; }
    if (!has(currentId()) && order.length) location.replace('#/' + order[0]);
    render();
  }

  function stop() { renderToken++; }

  return { register: register, has: has, items: items, go: go, buildNav: buildNav, start: start, stop: stop, reload: render };
})();
