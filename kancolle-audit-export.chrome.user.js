// ==UserScript==
// @name         艦これ Chrome Audit compatibility stub
// @namespace    https://github.com/ugakky/kancolle-SAFARI
// @version      2.5.0
// @description  v2.5ではDB書き出しをSafety本体へ統合。旧Chrome Auditは二重フック防止のため何もしません
// @match        *://*.dmm.com/*
// @match        *://*.kancolle-server.com/*
// @include      *://203.104.209.*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(() => {
  'use strict';
  console.info('[KCS Safe25] legacy Chrome audit exporter disabled; use kancolle-page-bridge.chrome.user.js + kancolle-safety.chrome.user.js');
})();
