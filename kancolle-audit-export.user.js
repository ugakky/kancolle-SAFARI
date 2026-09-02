// ==UserScript==
// @name         艦これ Safari Audit Export
// @namespace    https://github.com/ugakky/kancolle-SAFARI
// @version      0.1.0
// @description  艦これが通常操作で受信したAPIレスポンスだけを受動収集し、監査用JSONを書き出す
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

  const VERSION = '0.1.0';
  const MESSAGE = '__KCS_AUDIT_FRAME_API__';
  const GAME_HOST = /(^|\.)kancolle-server\.com$/i.test(location.hostname) || /^203\.104\.209\.\d+$/.test(location.hostname);
  const DMM_TOP = /(^|\.)dmm\.com$/i.test(location.hostname) && window.top === window;

  // 重要: このスクリプトは艦これサーバーへ独自リクエストを一切送らない。
  // ゲーム本体が通常操作で発行した XHR/fetch の「レスポンスを読むだけ」。
  // request body / api_token は保存・転送しない。

  if (GAME_HOST) installPassiveBridge();
  if (DMM_TOP) installExporter();

  function auditKey(url) {
    const u = String(url || '');
    if (u.includes('/kcsapi/api_start2/getData')) return 'start2';
    if (u.includes('/kcsapi/api_port/port')) return 'port';
    if (u.includes('/kcsapi/api_get_member/ship_deck')) return 'ship_deck';
    if (u.includes('/kcsapi/api_get_member/ship2')) return 'ship2';
    if (u.includes('/kcsapi/api_get_member/ship3')) return 'ship3';
    if (u.includes('/kcsapi/api_get_member/slot_item')) return 'slot_item';
    if (u.includes('/kcsapi/api_get_member/require_info')) return 'require_info';
    if (u.includes('/kcsapi/api_get_member/basic')) return 'basic';
    if (u.includes('/kcsapi/api_get_member/material')) return 'material';
    if (u.includes('/kcsapi/api_get_member/useitem')) return 'useitem';
    if (u.includes('/kcsapi/api_get_member/deck')) return 'deck';
    if (u.includes('/kcsapi/api_get_member/ndock')) return 'ndock';
    if (u.includes('/kcsapi/api_get_member/mission')) return 'mission';
    if (u.includes('/kcsapi/api_get_member/mapinfo')) return 'mapinfo';
    if (u.includes('/kcsapi/api_get_member/questlist')) return 'questlist';
    if (u.includes('/kcsapi/api_get_member/base_air_corps')) return 'air_bases';
    return '';
  }

  function installPassiveBridge() {
    if (window.__KCS_AUDIT_PASSIVE_BRIDGE__) return;
    window.__KCS_AUDIT_PASSIVE_BRIDGE__ = true;

    const parse = raw => {
      try { return JSON.parse(String(raw || '').replace(/^svdata=/, '')); }
      catch (_) { return null; }
    };

    const emit = (url, raw) => {
      const key = auditKey(url);
      if (!key) return;
      const json = parse(raw);
      if (!json || json.api_result !== 1) return;
      let path = '';
      try { path = new URL(String(url), location.href).pathname; } catch (_) {}
      try {
        window.top.postMessage({
          [MESSAGE]: {
            key,
            path,
            captured_at: new Date().toISOString(),
            data: json.api_data,
          }
        }, '*');
      } catch (_) {}
    };

    try {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__kcsAuditUrl = url;
        return originalOpen.call(this, method, url, ...rest);
      };

      XMLHttpRequest.prototype.send = function(body) {
        const url = this.__kcsAuditUrl;
        if (auditKey(url)) {
          this.addEventListener('load', () => {
            try {
              let text = '';
              if (!this.responseType || this.responseType === 'text') text = this.responseText || '';
              else if (this.responseType === 'json') text = JSON.stringify(this.response || {});
              emit(url, text);
            } catch (_) {}
          }, { once: true });
        }
        return originalSend.call(this, body);
      };
    } catch (err) {
      console.warn('[KCS Audit] XHR observer install failed', err);
    }

    try {
      if (window.fetch) {
        const originalFetch = window.fetch;
        window.fetch = async function(input, init) {
          const response = await originalFetch.apply(this, arguments);
          try {
            const url = typeof input === 'string' ? input : input?.url;
            if (auditKey(url)) {
              response.clone().text().then(text => emit(url, text)).catch(() => {});
            }
          } catch (_) {}
          return response;
        };
      }
    } catch (err) {
      console.warn('[KCS Audit] fetch observer install failed', err);
    }

    console.info(`[KCS Audit] passive bridge loaded v${VERSION}`);
  }

  function installExporter() {
    if (window.__KCS_AUDIT_EXPORTER__) return;
    window.__KCS_AUDIT_EXPORTER__ = true;

    const KEYS = [
      'start2','port','ship2','ship3','ship_deck','slot_item','require_info','basic',
      'material','useitem','deck','ndock','mission','mapinfo','questlist','air_bases'
    ];
    const latest = Object.create(null);
    const times = Object.create(null);
    const quests = new Map();
    let questMeta = { count: 0, page_count: 0, disp_page: 0, exec_count: 0 };
    let standaloneHost = null;

    const trustedOrigin = origin => {
      try {
        const h = new URL(origin).hostname;
        return /(^|\.)kancolle-server\.com$/i.test(h) || /^203\.104\.209\.\d+$/.test(h);
      } catch (_) { return false; }
    };

    window.addEventListener('message', event => {
      const payload = event?.data?.[MESSAGE];
      if (!payload || !trustedOrigin(event.origin)) return;
      const key = String(payload.key || '');
      if (!KEYS.includes(key)) return;

      if (key === 'questlist') mergeQuestPage(payload.data);
      latest[key] = payload.data;
      times[key] = payload.captured_at || new Date().toISOString();
      renderUi();
    });

    function mergeQuestPage(data) {
      const list = Array.isArray(data?.api_list) ? data.api_list : [];
      for (const q of list) {
        if (!q || Number(q.api_no) <= 0) continue;
        quests.set(Number(q.api_no), normalizeQuest(q));
      }
      questMeta = {
        count: Number(data?.api_count || questMeta.count || quests.size),
        page_count: Number(data?.api_page_count || questMeta.page_count || 0),
        disp_page: Number(data?.api_disp_page || questMeta.disp_page || 0),
        exec_count: Number(data?.api_exec_count || questMeta.exec_count || 0),
      };
    }

    function normalizeQuest(q) {
      return {
        id: Number(q.api_no || 0),
        title: q.api_title || '',
        detail: q.api_detail || '',
        category: Number(q.api_category || 0),
        type: Number(q.api_type || 0),
        label_type: Number(q.api_label_type || 0),
        state: Number(q.api_state || 0),
        progress: Number(q.api_progress_flag || 0),
        bonus_flag: Number(q.api_bonus_flag || 0),
        invalid_flag: Number(q.api_invalid_flag || 0),
        reward_material: Array.isArray(q.api_get_material) ? q.api_get_material : [],
      };
    }

    function asArray(v) {
      return Array.isArray(v) ? v : [];
    }

    function latestShips() {
      const sd = latest.ship_deck;
      if (Array.isArray(sd?.api_ship_data) && sd.api_ship_data.length) return sd.api_ship_data;
      if (Array.isArray(sd?.api_ship) && sd.api_ship.length) return sd.api_ship;
      if (Array.isArray(latest.ship3) && latest.ship3.length) return latest.ship3;
      if (Array.isArray(latest.ship3?.api_ship) && latest.ship3.api_ship.length) return latest.ship3.api_ship;
      if (Array.isArray(latest.ship2) && latest.ship2.length) return latest.ship2;
      if (Array.isArray(latest.ship2?.api_ship) && latest.ship2.api_ship.length) return latest.ship2.api_ship;
      return asArray(latest.port?.api_ship);
    }

    function latestDecks() {
      const sd = latest.ship_deck;
      if (Array.isArray(sd?.api_deck_data) && sd.api_deck_data.length) return sd.api_deck_data;
      if (Array.isArray(sd?.api_deck_port) && sd.api_deck_port.length) return sd.api_deck_port;
      if (Array.isArray(latest.deck) && latest.deck.length) return latest.deck;
      if (Array.isArray(latest.deck?.api_deck_data) && latest.deck.api_deck_data.length) return latest.deck.api_deck_data;
      return asArray(latest.port?.api_deck_port);
    }

    function mapInfoParts() {
      const d = latest.mapinfo;
      if (Array.isArray(d)) return { maps: d, expanded: [] };
      return {
        maps: asArray(d?.api_map_info || d?.api_mapinfo),
        expanded: asArray(d?.api_air_base_expanded_info),
      };
    }

    function airBases() {
      const d = latest.air_bases;
      if (Array.isArray(d)) return d;
      return asArray(d?.api_base_air_corps || d?.api_air_base_corps || d?.api_list);
    }

    function buildAudit() {
      const start2 = latest.start2 || {};
      const port = latest.port || {};
      const req = latest.require_info || {};
      const maps = mapInfoParts();
      const ships = latestShips();
      const slotItems = Array.isArray(latest.slot_item) ? latest.slot_item : asArray(req?.api_slot_item);
      const decks = latestDecks();
      const ndocks = Array.isArray(latest.ndock) ? latest.ndock : asArray(port?.api_ndock);
      const material = Array.isArray(latest.material) ? latest.material : asArray(port?.api_material);
      const useitems = Array.isArray(latest.useitem) ? latest.useitem : asArray(req?.api_useitem);
      const basic = latest.basic || port?.api_basic || req?.api_basic || {};
      const missions = latest.mission || {};
      const bases = airBases();
      const questList = [...quests.values()].sort((a, b) => a.id - b.id);

      const master = {
        ships: asArray(start2.api_mst_ship),
        ship_graph: asArray(start2.api_mst_shipgraph),
        slotitems: asArray(start2.api_mst_slotitem),
        slotitem_equiptype: asArray(start2.api_mst_slotitem_equiptype),
        stypes: asArray(start2.api_mst_stype),
        useitems: asArray(start2.api_mst_useitem),
        missions: asArray(start2.api_mst_mission),
        mapareas: asArray(start2.api_mst_maparea),
        mapinfo: asArray(start2.api_mst_mapinfo),
        furniture: asArray(start2.api_mst_furniture),
        equip_exslot: asArray(start2.api_mst_equip_exslot),
        equip_exslot_ship: start2.api_mst_equip_exslot_ship || {},
      };

      return {
        generated_at: new Date().toISOString(),
        meta: {
          source: 'kancolle final audit (Safari passive export)',
          script_version: VERSION,
          passive_only: true,
          api_token_saved: false,
          note: 'No extra requests are generated. Only responses from normal game operations are observed.',
        },
        status: {
          ships: ships.length,
          equipment: slotItems.length,
          quests: questList.length,
          air_bases: bases.length,
          maps: maps.maps.length,
          errors: 0,
        },
        master,
        member: {
          ships,
          slot_items: slotItems,
          decks,
          ndocks,
          material,
          useitems,
          basic,
          missions,
          mapinfo: maps.maps,
          air_bases: bases,
          air_base_expanded_info: maps.expanded,
          require_info: req,
          quest_meta: { ...questMeta, captured: questList.length },
        },
        quests: questList,
        captures: Object.fromEntries(KEYS.map(k => [k, !!latest[k]])),
        captured_at: Object.fromEntries(KEYS.filter(k => times[k]).map(k => [k, times[k]])),
        errors: [],
      };
    }

    function safeStamp() {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    }

    function makeFile() {
      const json = JSON.stringify(buildAudit(), null, 2);
      return new File([json], `kancolle_final_audit_${safeStamp()}.json`, { type: 'application/json' });
    }

    function downloadAudit() {
      const file = makeFile();
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.style.display = 'none';
      document.documentElement.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    async function shareAudit() {
      const file = makeFile();
      try {
        if (navigator.canShare?.({ files: [file] }) && navigator.share) {
          await navigator.share({ files: [file], title: '艦これ Audit JSON' });
        } else {
          downloadAudit();
        }
      } catch (err) {
        if (err?.name !== 'AbortError') downloadAudit();
      }
    }

    function statsText() {
      const a = buildAudit();
      const got = KEYS.filter(k => latest[k]).length;
      const qTotal = Number(questMeta.count || 0);
      const qText = qTotal ? `${a.status.quests}/${qTotal}` : String(a.status.quests);
      return `取得 ${got}/${KEYS.length} ｜ 艦 ${a.status.ships} ｜ 装備 ${a.status.equipment} ｜ 任務 ${qText} ｜ 基地 ${a.status.air_bases}`;
    }

    function missingText() {
      const missing = KEYS.filter(k => !latest[k]);
      if (!missing.length) return '主要データ取得済み。任務は全ページを手動表示した分だけ蓄積します。';
      const labels = {
        start2:'マスター', port:'母港', ship2:'艦娘一覧', ship3:'艦娘詳細', ship_deck:'艦隊更新',
        slot_item:'装備一覧', require_info:'保有情報', basic:'提督情報', material:'資材', useitem:'アイテム',
        deck:'艦隊', ndock:'入渠', mission:'遠征', mapinfo:'海域', questlist:'任務', air_bases:'基地航空隊'
      };
      return `未取得: ${missing.map(k => labels[k] || k).join(' / ')}。必要な画面をゲーム内で手動表示すると取得されます。`;
    }

    function ensureStandalone() {
      if (standaloneHost?.isConnected) return standaloneHost;
      const host = document.createElement('div');
      host.id = '__kcs_audit_standalone';
      host.style.cssText = 'position:fixed;z-index:2147483644;right:8px;top:106px;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif';
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        button{border:0;border-radius:999px;background:#27445d;color:#fff;padding:9px 12px;font:800 12px -apple-system,BlinkMacSystemFont,sans-serif;min-height:40px}
      </style><button id="open">📦 Audit</button>`;
      root.querySelector('#open').onclick = () => showStandalonePanel();
      document.documentElement.appendChild(host);
      standaloneHost = host;
      return host;
    }

    function showStandalonePanel() {
      let panel = document.querySelector('#__kcs_audit_panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = '__kcs_audit_panel';
        panel.style.cssText = 'position:fixed;z-index:2147483647;right:8px;top:152px;width:min(94vw,520px);background:#15171df5;color:#fff;border:1px solid #ffffff33;border-radius:14px;padding:12px;font:12px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 10px 30px #0009';
        panel.innerHTML = `<b>📦 Audit JSON</b><div id="s" style="margin:8px 0"></div><div id="m" style="opacity:.8;margin:8px 0"></div><button id="d">JSON書き出し</button> <button id="sh">共有</button> <button id="c">閉じる</button>`;
        for (const b of panel.querySelectorAll('button')) b.style.cssText = 'border:1px solid #ffffff33;border-radius:9px;background:#2a2d36;color:#fff;padding:8px 10px;min-height:40px';
        panel.querySelector('#d').onclick = downloadAudit;
        panel.querySelector('#sh').onclick = shareAudit;
        panel.querySelector('#c').onclick = () => panel.remove();
        document.documentElement.appendChild(panel);
      }
      panel.querySelector('#s').textContent = statsText();
      panel.querySelector('#m').textContent = missingText();
    }

    function injectIntoSafety() {
      const safety = document.querySelector('#__kcs_safety_ui');
      const root = safety?.shadowRoot;
      const panel = root?.querySelector('#panel');
      if (!panel || root.querySelector('#__kcs_audit_box')) return false;

      const box = document.createElement('div');
      box.id = '__kcs_audit_box';
      box.className = 'note';
      box.innerHTML = `<b>📦 完全JSON書き出し</b>
        <div id="auditStats" style="margin-top:6px"></div>
        <div id="auditMissing" class="muted" style="margin:6px 0"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="auditDownload">JSON書き出し</button>
          <button class="btn" id="auditShare">共有</button>
        </div>
        <div class="muted" style="margin-top:6px">受動監視のみ。ゲームサーバーへの追加リクエストは0件です。APIトークンも保存しません。</div>`;
      const tabs = root.querySelector('.tabs');
      if (tabs) panel.insertBefore(box, tabs);
      else panel.appendChild(box);
      root.querySelector('#auditDownload').onclick = downloadAudit;
      root.querySelector('#auditShare').onclick = shareAudit;
      renderUi();
      return true;
    }

    function renderUi() {
      const safety = document.querySelector('#__kcs_safety_ui')?.shadowRoot;
      if (safety?.querySelector('#auditStats')) {
        safety.querySelector('#auditStats').textContent = statsText();
        safety.querySelector('#auditMissing').textContent = missingText();
      }
      const panel = document.querySelector('#__kcs_audit_panel');
      if (panel) {
        panel.querySelector('#s').textContent = statsText();
        panel.querySelector('#m').textContent = missingText();
      }
    }

    const boot = () => {
      let tries = 0;
      const timer = setInterval(() => {
        tries++;
        if (injectIntoSafety()) {
          if (standaloneHost) standaloneHost.remove();
          clearInterval(timer);
        } else if (tries >= 12) {
          ensureStandalone();
          clearInterval(timer);
        }
      }, 500);
      renderUi();
    };

    if (document.documentElement) boot();
    else document.addEventListener('DOMContentLoaded', boot, { once: true });

    console.info(`[KCS Audit] exporter loaded v${VERSION} (passive-only)`);
  }
})();
