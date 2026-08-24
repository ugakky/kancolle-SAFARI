// ==UserScript==
// @name         艦これ Safari Safety Bridge
// @namespace    https://github.com/ugakky/kancolle-SAFARI
// @version      0.1.2
// @description  艦これ本体ページ側でkcsapi通信を監視し、Safety本体へ転送する診断用Bridge
// @match        *://*.dmm.com/*
// @match        *://*.kancolle-server.com/*
// @include      *://203.104.209.*/*
// @include      /^https?:\/\/203\.104\.209\.\d+\//
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const FRAME_MESSAGE = '__KCS_SAFETY_FRAME_API__';
  if (window.__KCS_SAFETY_PAGE_BRIDGE__) return;
  window.__KCS_SAFETY_PAGE_BRIDGE__ = true;

  const post = (detail) => {
    try {
      window.top.postMessage({ [FRAME_MESSAGE]: detail }, '*');
    } catch (_) {}
  };

  // Bridgeがどのframeで起動したか確認するためのハートビート。
  post({
    url: `${location.origin}/kcsapi/__bridge_heartbeat__`,
    body: '',
    text: 'svdata={"api_result":1,"api_data":{}}'
  });

  const emit = (url, body, text) => {
    const u = String(url || '');
    if (!u.includes('/kcsapi/')) return;
    post({
      url: u,
      body: typeof body === 'string' ? body : String(body || ''),
      text: typeof text === 'string' ? text : String(text || '')
    });
  };

  try {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__kcsSafetyBridge = { method, url };
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function(body) {
      const meta = this.__kcsSafetyBridge || {};
      this.addEventListener('load', () => {
        try {
          let text = '';
          if (!this.responseType || this.responseType === 'text') text = this.responseText || '';
          else if (this.responseType === 'json') text = JSON.stringify(this.response || {});
          emit(meta.url, body, text);
        } catch (_) {}
      }, { once: true });
      return originalSend.call(this, body);
    };
  } catch (e) {
    console.warn('[KCS Safety Bridge] XHR hook failed', e);
  }

  try {
    if (window.fetch) {
      const originalFetch = window.fetch;
      window.fetch = async function(input, init = {}) {
        const response = await originalFetch.apply(this, arguments);
        try {
          const url = typeof input === 'string' ? input : input?.url;
          if (String(url || '').includes('/kcsapi/')) {
            response.clone().text().then((text) => emit(url, init.body || '', text)).catch(() => {});
          }
        } catch (_) {}
        return response;
      };
    }
  } catch (e) {
    console.warn('[KCS Safety Bridge] fetch hook failed', e);
  }

  console.info('[KCS Safety Bridge] loaded v0.1.2', location.href);
})();
