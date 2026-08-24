// ==UserScript==
// @name         艦これ Safari Safety Bridge
// @namespace    https://github.com/ugakky/kancolle-SAFARI
// @version      0.1.4
// @description  艦これ本体ページ側で必要なkcsapiだけ軽量転送するBridge
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

  const relevant = url => {
    const u = String(url || '');
    return u.includes('/kcsapi/api_start2/getData') ||
      u.includes('/kcsapi/api_port/port') ||
      u.includes('/kcsapi/api_get_member/ship_deck') ||
      u.includes('/kcsapi/api_get_member/ship2') ||
      u.includes('/kcsapi/api_get_member/ship3') ||
      u.includes('/kcsapi/api_get_member/deck') ||
      u.includes('/kcsapi/api_req_map/start') ||
      u.includes('/kcsapi/api_req_map/next') ||
      /\/kcsapi\/api_req_(sortie|combined_battle|battle_midnight)\//.test(u) ||
      u.includes('/battleresult') ||
      u.includes('/goback_port');
  };

  const post = detail => {
    try { window.top.postMessage({ [FRAME_MESSAGE]: detail }, '*'); } catch (_) {}
  };

  const shipLite = x => x ? ({
    api_id:x.api_id,
    api_ship_id:x.api_ship_id,
    api_lv:x.api_lv,
    api_fuel:x.api_fuel,
    api_bull:x.api_bull,
    api_onslot:x.api_onslot,
    api_nowhp:x.api_nowhp,
    api_maxhp:x.api_maxhp,
  }) : x;
  const deckLite = x => x ? ({ api_id:x.api_id, api_ship:x.api_ship }) : x;
  const shellLite = h => h ? ({ api_df_list:h.api_df_list, api_damage:h.api_damage, api_at_eflag:h.api_at_eflag }) : h;

  function compact(url, rawText) {
    let j;
    try { j = JSON.parse(String(rawText || '').replace(/^svdata=/, '')); }
    catch (_) { return null; }
    if (!j || j.api_result !== 1) return null;

    const d = j.api_data;
    let out = d;

    if (String(url).includes('/api_start2/getData')) {
      out = { api_mst_ship:(d?.api_mst_ship || []).map(x => ({ api_id:x.api_id, api_name:x.api_name })) };
    } else if (String(url).includes('/api_port/port')) {
      out = {
        api_ship:(d?.api_ship || []).map(shipLite),
        api_deck_port:(d?.api_deck_port || []).map(deckLite),
        api_combined_flag:d?.api_combined_flag,
      };
    } else if (String(url).includes('/api_get_member/ship_deck')) {
      out = {
        api_ship_data:(d?.api_ship_data || d?.api_ship || []).map(shipLite),
        api_deck_data:(d?.api_deck_data || d?.api_deck_port || []).map(deckLite),
      };
    } else if (String(url).includes('/api_get_member/ship2') || String(url).includes('/api_get_member/ship3')) {
      if (Array.isArray(d)) out = d.map(shipLite);
      else out = { api_ship:(d?.api_ship || d?.api_ship_data || []).map(shipLite) };
    } else if (String(url).includes('/api_get_member/deck')) {
      out = Array.isArray(d) ? d.map(deckLite) : { api_deck_data:(d?.api_deck_data || []).map(deckLite) };
    } else if (/\/api_req_(sortie|combined_battle|battle_midnight)\//.test(String(url)) && !String(url).includes('/battleresult')) {
      out = {
        api_f_nowhps:d?.api_f_nowhps,
        api_f_maxhps:d?.api_f_maxhps,
        api_f_nowhps_combined:d?.api_f_nowhps_combined,
        api_f_maxhps_combined:d?.api_f_maxhps_combined,
        api_kouku:d?.api_kouku ? {
          api_stage1:d.api_kouku.api_stage1 ? { api_f_count:d.api_kouku.api_stage1.api_f_count, api_f_lostcount:d.api_kouku.api_stage1.api_f_lostcount } : undefined,
          api_stage3:d.api_kouku.api_stage3 ? { api_fdam:d.api_kouku.api_stage3.api_fdam } : undefined,
          api_stage3_combined:d.api_kouku.api_stage3_combined ? { api_fdam:d.api_kouku.api_stage3_combined.api_fdam } : undefined,
        } : undefined,
        api_kouku_combined:d?.api_kouku_combined ? { api_stage3:d.api_kouku_combined.api_stage3 ? { api_fdam:d.api_kouku_combined.api_stage3.api_fdam } : undefined } : undefined,
        api_opening_atack:d?.api_opening_atack ? { api_fdam:d.api_opening_atack.api_fdam } : undefined,
        api_opening_taisen:shellLite(d?.api_opening_taisen),
        api_hougeki1:shellLite(d?.api_hougeki1),
        api_hougeki2:shellLite(d?.api_hougeki2),
        api_hougeki3:shellLite(d?.api_hougeki3),
        api_hougeki:shellLite(d?.api_hougeki),
        api_n_hougeki1:shellLite(d?.api_n_hougeki1),
        api_n_hougeki2:shellLite(d?.api_n_hougeki2),
        api_raigeki:d?.api_raigeki ? { api_fdam:d.api_raigeki.api_fdam } : undefined,
        api_raigeki_combined:d?.api_raigeki_combined ? { api_fdam:d.api_raigeki_combined.api_fdam } : undefined,
      };
    } else if (String(url).includes('/api_req_map/start') || String(url).includes('/api_req_map/next') || String(url).includes('/battleresult') || String(url).includes('/goback_port')) {
      out = {};
    }

    return 'svdata=' + JSON.stringify({ api_result:1, api_data:out });
  }

  const emit = (url, body, rawText) => {
    if (!relevant(url)) return;
    const text = compact(url, rawText);
    if (!text) return;
    post({ url:String(url), body:typeof body === 'string' ? body : String(body || ''), text });
  };

  // 起動確認。非常に小さいメッセージだけ送る。
  post({
    url:`${location.origin}/kcsapi/__bridge_heartbeat__`,
    body:'',
    text:'svdata={"api_result":1,"api_data":{}}'
  });

  try {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__kcsSafetyBridge = { method, url };
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function(body) {
      const meta = this.__kcsSafetyBridge || {};
      if (relevant(meta.url)) {
        this.addEventListener('load', () => {
          try {
            let text = '';
            if (!this.responseType || this.responseType === 'text') text = this.responseText || '';
            else if (this.responseType === 'json') text = JSON.stringify(this.response || {});
            emit(meta.url, body, text);
          } catch (_) {}
        }, { once:true });
      }
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
          if (relevant(url)) response.clone().text().then(text => emit(url, init.body || '', text)).catch(() => {});
        } catch (_) {}
        return response;
      };
    }
  } catch (e) {
    console.warn('[KCS Safety Bridge] fetch hook failed', e);
  }

  console.info('[KCS Safety Bridge] loaded v0.1.4 lightweight', location.href);
})();