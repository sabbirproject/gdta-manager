/* api.js - talks to the Apps Script web app. Only the session token is kept (sessionStorage, cleared when the tab closes). */
var API = (function () {
  'use strict';
  var TOKEN_KEY = 'cim_token';
  var TIMEOUT_MS = 30000;

  function configured() {
    return typeof APP_CONFIG !== 'undefined' && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(APP_CONFIG.API_URL || ''));
  }

  function getToken() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* storage blocked */ } }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function ApiError(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  /** call('dashboard.summary', {}, {requestId}) -> Promise<data>. Pass the SAME requestId when a form is re-submitted so a double tap saves once. Rejects with an Error that has .code and a readable .message */
  function call(action, payload, opts) {
    if (!configured()) return Promise.reject(ApiError('NOT_CONFIGURED', 'The server URL is not set in js/config.js'));
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, (opts && opts.timeout) || TIMEOUT_MS);
    var body = JSON.stringify({ action: action, token: getToken(), payload: payload || {}, requestId: (opts && opts.requestId) || uuid() });

    return fetch(APP_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // avoids a CORS preflight request
      body: body,
      redirect: 'follow',
      credentials: 'omit',
      signal: controller.signal
    }).then(function (res) {
      if (!res.ok) throw ApiError('HTTP_' + res.status, 'The server returned an error (' + res.status + '). Please try again.');
      return res.text();
    }).then(function (text) {
      var json;
      try { json = JSON.parse(text); } catch (e) {
        throw ApiError('BAD_RESPONSE', 'The server sent an unexpected reply. Check that the web app is deployed for "Anyone" and the URL is the latest deployment.');
      }
      if (!json.ok) {
        var err = json.error || {};
        if (err.code === 'UNAUTHORIZED' && action !== 'auth.login') {
          setToken('');
          document.dispatchEvent(new CustomEvent('session-expired'));
        }
        throw ApiError(err.code || 'SERVER_ERROR', err.message || 'Request failed');
      }
      return json.data;
    }).catch(function (e) {
      if (e && e.code) throw e;
      if (e && e.name === 'AbortError') throw ApiError('TIMEOUT', 'The server took too long to respond. Please try again.');
      throw ApiError('NETWORK', 'Cannot reach the server. Check your internet connection and try again.');
    }).then(function (data) { clearTimeout(timer); return data; }, function (e) { clearTimeout(timer); throw e; });
  }

  return { call: call, configured: configured, getToken: getToken, setToken: setToken, newRequestId: uuid };
})();
