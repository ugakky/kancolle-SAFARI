// ==UserScript==
// @name         艦これ Safety v2.5 (Chrome)
// @namespace    https://github.com/ugakky/kancolle-SAFARI
// @version      2.5.0
// @description  Chrome/Tampermonkey用。v2.5 Safety UIを固定commitから読み込む
// @match        *://*.dmm.com/*
// @run-at       document-start
// @sandbox      raw
// @noframes
// @require      https://raw.githubusercontent.com/ugakky/kancolle-SAFARI/c742e8dbc1cbb1cf05fc6bd3cefcf2875f140c5e/kancolle-safety.user.js
// @grant        none
// ==/UserScript==

// The implementation is pinned by commit SHA. Tampermonkey fetches @require at install/update;
// it does not add requests to the Kancolle game server during play.
