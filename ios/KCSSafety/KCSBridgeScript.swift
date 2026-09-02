import Foundation

enum KCSBridgeScript {
    static let source = #"""
(() => {
  'use strict';

  if (window.__KCS_NATIVE_BRIDGE__) return;
  window.__KCS_NATIVE_BRIDGE__ = true;

  const GAME_ASPECT = 1200 / 720;
  const S = {
    masterShips: new Map(),
    ships: new Map(),
    decks: new Map(),
    combined: 0,
    sortieDeck: 1,
    fleet1: [],
    fleet2: [],
    hpAfter: new Map(),
    uncertain: false,
    uncertainReason: '',
    choice: false,
    planeLoss: null,
    apiCount: 0,
    lastApi: ''
  };

  function post(message) {
    try {
      window.webkit.messageHandlers.kcsBridge.postMessage(JSON.stringify(message));
    } catch (_) {}
  }

  function parse(text) {
    if (typeof text !== 'string') return null;
    try { return JSON.parse(text.trim().replace(/^svdata=/, '')); }
    catch (_) { return null; }
  }

  function pathOf(url) {
    try { return new URL(url, location.href).pathname; }
    catch (_) { return String(url || '').split('?')[0]; }
  }

  function bodyText(body) {
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    return '';
  }

  function params(body) {
    try { return new URLSearchParams(bodyText(body)); }
    catch (_) { return new URLSearchParams(); }
  }

  function hpArray(a) {
    return Array.isArray(a) ? ((a[0] < 0 ? a.slice(1) : a).map(Number)) : [];
  }

  function deckIds(a) {
    return Array.isArray(a) ? a.filter(x => Number.isFinite(x) && x > 0) : [];
  }

  function ingestShips(list) {
    if (!Array.isArray(list)) return;
    for (const x of list) {
      if (x?.api_id > 0) S.ships.set(x.api_id, { ...S.ships.get(x.api_id), ...x });
    }
  }

  function ingestDecks(list) {
    if (!Array.isArray(list)) return;
    for (const x of list) if (x?.api_id > 0) S.decks.set(x.api_id, x);
  }

  function fleetIds(deckId) {
    return deckIds(S.decks.get(Number(deckId))?.api_ship);
  }

  function refreshSortieFleets() {
    S.fleet1 = fleetIds(S.sortieDeck);
    S.fleet2 = S.sortieDeck === 1 && S.combined > 0 ? fleetIds(2) : [];
  }

  function hp(id) {
    if (S.hpAfter.has(id)) return S.hpAfter.get(id);
    const x = S.ships.get(id);
    if (!Number.isFinite(x?.api_nowhp) || !Number.isFinite(x?.api_maxhp)) return null;
    return { now: x.api_nowhp, max: x.api_maxhp, source: 'last' };
  }

  function damageState(h) {
    if (!h || !Number.isFinite(h.now) || !Number.isFinite(h.max)) return 'unknown';
    if (h.now <= 0 || h.now * 4 <= h.max) return 'danger';
    if (h.now * 2 <= h.max) return 'warn';
    if (h.now * 4 <= h.max * 3) return 'minor';
    return 'ok';
  }

  function shipRow(id) {
    const x = S.ships.get(id);
    const mst = x && S.masterShips.get(x.api_ship_id);
    const h = hp(id);
    return {
      id,
      name: mst?.api_name || `艦ID ${id}`,
      lv: Number.isFinite(x?.api_lv) ? x.api_lv : null,
      hpNow: Number.isFinite(h?.now) ? h.now : null,
      hpMax: Number.isFinite(h?.max) ? h.max : null,
      hpSource: h?.source || null,
      cond: Number.isFinite(x?.api_cond) ? x.api_cond : null,
      fuel: Number.isFinite(x?.api_fuel) ? x.api_fuel : null,
      ammo: Number.isFinite(x?.api_bull) ? x.api_bull : null,
      onslot: Array.isArray(x?.api_onslot) ? x.api_onslot.map(Number) : [],
      damage: damageState(h)
    };
  }

  function heavyIds() {
    refreshSortieFleets();
    return [...S.fleet1, ...S.fleet2].filter(id => damageState(hp(id)) === 'danger');
  }

  function snapshot() {
    const fleets = [1, 2, 3, 4].map(id => ({
      id,
      isSortie: Number(id) === Number(S.sortieDeck),
      ships: fleetIds(id).map(shipRow)
    }));

    post({
      type: 'snapshot',
      snapshot: {
        apiCount: S.apiCount,
        lastApi: S.lastApi,
        sortieDeck: S.sortieDeck,
        combined: S.combined,
        choice: S.choice,
        uncertain: S.uncertain,
        uncertainReason: S.uncertainReason,
        heavyCount: heavyIds().length,
        fleets,
        planeLoss: S.planeLoss
      }
    });
  }

  function indexed(hpValues, a, off = 0) {
    if (!Array.isArray(a)) return;
    a.forEach((v, i) => {
      const n = Number(v), k = i + off;
      if (Number.isFinite(n) && n > 0 && k < hpValues.length) hpValues[k] -= Math.trunc(n);
    });
  }

  function shell(hpValues, h) {
    if (!h || !Array.isArray(h.api_df_list) || !Array.isArray(h.api_damage)) return;
    const ef = h.api_at_eflag;
    for (let i = 0; i < Math.min(h.api_df_list.length, h.api_damage.length); i++) {
      if (Array.isArray(ef) && Number(ef[i]) !== 1) continue;
      const targets = Array.isArray(h.api_df_list[i]) ? h.api_df_list[i] : [];
      const damages = Array.isArray(h.api_damage[i]) ? h.api_damage[i] : [];
      for (let z = 0; z < Math.min(targets.length, damages.length); z++) {
        let k = Number(targets[z]);
        const n = Number(damages[z]);
        if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0) continue;
        if (!Array.isArray(ef)) {
          if (k < 1 || k > 6) continue;
          k--;
        }
        if (k >= 0 && k < hpValues.length) hpValues[k] -= Math.trunc(n);
      }
    }
  }

  function readBattle(path, d) {
    if (!Array.isArray(d?.api_f_nowhps) || !Array.isArray(d?.api_f_maxhps)) {
      S.uncertain = true;
      S.uncertainReason = `HP配列なし: ${path.split('/').pop()}`;
      return;
    }

    const n1 = hpArray(d.api_f_nowhps), m1 = hpArray(d.api_f_maxhps);
    const n2 = hpArray(d.api_f_nowhps_combined), m2 = hpArray(d.api_f_maxhps_combined);
    const hpValues = [...n1, ...n2].map(x => Math.max(0, x || 0));
    const maxValues = [...m1, ...m2];

    refreshSortieFleets();
    const order = [...S.fleet1, ...S.fleet2];
    if (order.length < Math.min(hpValues.length, 6)) {
      S.uncertain = true;
      S.uncertainReason = '艦隊とHPの対応失敗';
      return;
    }

    indexed(hpValues, d.api_kouku?.api_stage3?.api_fdam, 0);
    indexed(hpValues, d.api_kouku?.api_stage3_combined?.api_fdam, 6);
    indexed(hpValues, d.api_kouku_combined?.api_stage3?.api_fdam, 6);
    indexed(hpValues, d.api_opening_atack?.api_fdam, 0);
    shell(hpValues, d.api_opening_taisen);
    shell(hpValues, d.api_hougeki1);
    shell(hpValues, d.api_hougeki2);
    shell(hpValues, d.api_hougeki3);
    shell(hpValues, d.api_hougeki);
    shell(hpValues, d.api_n_hougeki1);
    shell(hpValues, d.api_n_hougeki2);
    indexed(hpValues, d.api_raigeki?.api_fdam, 0);
    indexed(hpValues, d.api_raigeki_combined?.api_fdam, 6);

    for (let i = 0; i < Math.min(order.length, hpValues.length, maxValues.length); i++) {
      S.hpAfter.set(order[i], {
        now: Math.max(0, Math.trunc(hpValues[i])),
        max: Math.max(1, Math.trunc(maxValues[i])),
        source: 'battle'
      });
    }

    const stage1 = d.api_kouku?.api_stage1;
    if (Number.isFinite(stage1?.api_f_count) && Number.isFinite(stage1?.api_f_lostcount)) {
      S.planeLoss = { before: stage1.api_f_count, lost: stage1.api_f_lostcount };
    }

    S.uncertain = false;
    S.uncertainReason = '';
  }

  function isBattle(path) {
    return /\/api_req_(sortie|combined_battle|battle_midnight)\//.test(path) &&
      !path.endsWith('/battleresult') && !path.includes('/goback_port');
  }

  function onApi(url, body, rawText) {
    const j = parse(rawText);
    if (!j || j.api_result !== 1) return;

    const path = pathOf(url), data = j.api_data;
    S.apiCount++;
    S.lastApi = path.split('/').pop() || path;

    try {
      if (path.includes('/api_start2/getData')) {
        for (const m of data?.api_mst_ship || []) {
          if (m?.api_id > 0) S.masterShips.set(m.api_id, { api_id: m.api_id, api_name: m.api_name });
        }
      } else if (path.endsWith('/api_port/port')) {
        ingestShips(data?.api_ship || []);
        ingestDecks(data?.api_deck_port || []);
        if (Number.isFinite(data?.api_combined_flag)) S.combined = data.api_combined_flag;
        S.hpAfter.clear();
        S.uncertain = false;
        S.uncertainReason = '';
        S.choice = false;
        refreshSortieFleets();
      } else if (path.includes('/api_get_member/ship_deck') || path.includes('/api_get_member/ship2') || path.includes('/api_get_member/ship3')) {
        ingestShips(Array.isArray(data) ? data : data?.api_ship_data || data?.api_ship || []);
        ingestDecks(data?.api_deck_data || data?.api_deck_port || []);
        refreshSortieFleets();
      } else if (path.includes('/api_get_member/deck')) {
        ingestDecks(Array.isArray(data) ? data : data?.api_deck_data || []);
        refreshSortieFleets();
      } else if (path.endsWith('/api_req_map/start')) {
        S.sortieDeck = Number(params(body).get('api_deck_id') || 1);
        S.hpAfter.clear();
        S.uncertain = false;
        S.uncertainReason = '';
        S.choice = false;
        refreshSortieFleets();
      } else if (path.endsWith('/api_req_map/next')) {
        S.choice = false;
      } else if (isBattle(path)) {
        readBattle(path, data);
      } else if (path.endsWith('/battleresult')) {
        S.choice = true;
      } else if (path.includes('/goback_port')) {
        S.choice = false;
        S.hpAfter.clear();
        S.uncertain = false;
        S.uncertainReason = '';
      }
      snapshot();
    } catch (error) {
      S.uncertain = true;
      S.uncertainReason = 'API解析エラー';
      snapshot();
    }
  }

  function relevant(url) {
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
  }

  try {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__kcsNative = { method, url };
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function(body) {
      const meta = this.__kcsNative || {};
      if (relevant(meta.url)) {
        this.addEventListener('load', () => {
          try {
            let text = '';
            if (!this.responseType || this.responseType === 'text') text = this.responseText || '';
            else if (this.responseType === 'json') text = 'svdata=' + JSON.stringify(this.response || {});
            onApi(meta.url, body, text);
          } catch (_) {}
        }, { once: true });
      }
      return originalSend.call(this, body);
    };
  } catch (_) {}

  try {
    if (window.fetch) {
      const originalFetch = window.fetch;
      window.fetch = async function(input, init = {}) {
        const response = await originalFetch.apply(this, arguments);
        try {
          const url = typeof input === 'string' ? input : input?.url;
          if (relevant(url)) {
            response.clone().text().then(text => onApi(url, init.body || '', text)).catch(() => {});
          }
        } catch (_) {}
        return response;
      };
    }
  } catch (_) {}

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, Number(v)));
  }

  function clipRect(rect) {
    if (!rect) return null;
    const left = clamp(rect.left, 0, innerWidth);
    const top = clamp(rect.top, 0, innerHeight);
    const right = clamp(rect.right, 0, innerWidth);
    const bottom = clamp(rect.bottom, 0, innerHeight);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    if (width < 200 || height < 120) return null;
    return { left, top, right, bottom, width, height };
  }

  function emitGeometry() {
    if (window.top !== window) return;

    const frames = [...document.querySelectorAll('iframe')].map(el => {
      const r = clipRect(el.getBoundingClientRect());
      const src = String(el.getAttribute('src') || '');
      const hint = /kancolle|kcs|osapi|gadgets|dmm/i.test(src) ? 1.8 : 1;
      const aspect = r?.height ? r.width / r.height : 0;
      const score = r ? (r.width * r.height * hint) / (1 + Math.abs(aspect - GAME_ASPECT) * 5) : 0;
      return { r, score };
    }).filter(x => x.r);

    if (!frames.length) return;
    frames.sort((a, b) => b.score - a.score);
    const raw = frames[0].r;
    const height = Math.min(raw.height, raw.width / GAME_ASPECT);
    if (height < 120) return;

    post({
      type: 'geometry',
      rect: { x: raw.left, y: raw.top, width: raw.width, height }
    });
  }

  if (window.top === window) {
    addEventListener('load', () => setTimeout(emitGeometry, 250), { once: true });
    addEventListener('resize', emitGeometry, { passive: true });
    addEventListener('orientationchange', () => setTimeout(emitGeometry, 120), { passive: true });
    addEventListener('scroll', emitGeometry, { passive: true, capture: true });
    setInterval(emitGeometry, 3000);
  }
})();
"""#
}
