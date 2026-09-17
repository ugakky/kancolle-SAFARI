// ==UserScript==
// @name         艦これ Audit Export compatibility stub
// @namespace    https://github.com/ugakky/kancolle-SAFARI
// @version      2.5.0
// @description  v2.5ではDB書き出しをkancolle-safety.user.jsへ統合。二重APIフックを避けるため旧Auditは何もしません
// @match        *://*.dmm.com/*
// @match        *://*.kancolle-server.com/*
// @include      *://203.104.209.*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(() => {
  'use strict';
  // Safety v2.5 design: one observer only (kancolle-page-bridge.user.js).
  // Keeping this file as a no-op prevents old installations from adding a second interceptor.
  console.info('[KCS Safe25] legacy audit exporter disabled; export is integrated into kancolle-safety.user.js');
})();
