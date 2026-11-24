/* app.js - boot, login, logout, install button, offline banner, service worker. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var VIEWS = ['boot', 'setup-view', 'login-view', 'app-view'];

  function show(id) { VIEWS.forEach(function (v) { $(v).hidden = (v !== id); }); }

  function showLogin(message) {
    Router.stop();
    $('main').replaceChildren();
    $('login-form').reset();
    $('login-error').hidden = true;
    show('login-view');
    if (message) UI.toast(message, 'error');
    $('login-username').focus();
  }

  function enterApp(user) {
    $('user-name').textContent = user.username;
    var items = Router.items();
    Router.buildNav($('nav-side'), $('nav-bottom'));
    $('app-view').classList.toggle('has-bottom-nav', items.length >= 2);
    show('app-view');
    Router.start();
  }

  function submitLogin(ev) {
    ev.preventDefault();
    var u = $('login-username').value.trim();
    var p = $('login-password').value;
    var err = $('login-error');
    err.hidden = true;
    if (!u || !p) { err.textContent = 'Enter your username and password.'; err.hidden = false; return; }
    var btn = $('login-submit');
    btn.disabled = true; btn.textContent = 'Signing in…';
    API.call('auth.login', { username: u, password: p }).then(function (r) {
      API.setToken(r.token);
      $('login-password').value = '';
      enterApp(r.user);
    }).catch(function (e) {
      err.textContent = e.message; err.hidden = false;
      $('login-password').value = '';
      $('login-password').focus();
    }).then(function () {
      btn.disabled = false; btn.textContent = 'Sign in';
    });
  }

  function logout() {
    var btn = $('logout-btn');
    btn.disabled = true;
    API.call('auth.logout').catch(function () { /* token is cleared below either way */ }).then(function () {
      API.setToken('');
      btn.disabled = false;
      showLogin();
    });
  }

  function boot() {
    $('logout-btn').appendChild(UI.icon('logout', 18));
    $('logout-btn').appendChild(UI.h('span', { class: 'btn-label', text: 'Sign out' }));
    $('logout-btn').setAttribute('aria-label', 'Sign out');
    $('login-form').addEventListener('submit', submitLogin);
    $('logout-btn').addEventListener('click', logout);
    $('login-show').addEventListener('change', function (e) { $('login-password').type = e.target.checked ? 'text' : 'password'; });
    document.addEventListener('session-expired', function () { showLogin('Your session has expired. Please sign in again.'); });

    window.addEventListener('online', function () { $('offline-banner').hidden = true; });
    window.addEventListener('offline', function () { $('offline-banner').hidden = false; });
    if (!navigator.onLine) $('offline-banner').hidden = false;

    // Install button (shown only when the browser says the app can be installed)
    var deferred = null;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); deferred = e;
      var b = $('install-btn');
      b.replaceChildren(UI.icon('download', 18), UI.h('span', { class: 'btn-label', text: 'Install' }));
      b.setAttribute('aria-label', 'Install app');
      b.hidden = false;
    });
    $('install-btn').addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; $('install-btn').hidden = true; });
    });
    window.addEventListener('appinstalled', function () { $('install-btn').hidden = true; });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* optional */ }); });
    }

    if (!API.configured()) { show('setup-view'); return; }
    if (!API.getToken()) { showLogin(); return; }
    API.call('auth.me').then(enterApp).catch(function () { API.setToken(''); showLogin(); });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
