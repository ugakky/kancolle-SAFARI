// ==UserScript==
// @name         艦これ Safari Safety
// @namespace    https://github.com/ugakky/kancolle-SAFARI
// @version      0.2.0
// @description  艦隊状態・Cond表示・大破警告・進撃3タップロック（Safari軽量版）
// @match        *://*.dmm.com/*
// @run-at       document-start
// @inject-into  content
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '0.2.0';
  const FRAME_MESSAGE = '__KCS_SAFETY_FRAME_API__';
  const GUARD = { x: 0.08, y: 0.16, w: 0.48, h: 0.74 };
  const TRIPLE_TAP_MS = 2400;
  const UNLOCK_MS = 5000;

  const S = {
    masterShips: new Map(), ships: new Map(), decks: new Map(),
    combined: 0, sortieDeck: 1,
    fleet1: [], fleet2: [], hpAfter: new Map(),
    uncertain: false, uncertainReason: '', choice: false,
    planeLoss: null, ui: null, guard: null,
    taps: [], apiCount: 0, lastApi: '',
  };

  const parse = text => {
    if (typeof text !== 'string') return null;
    try { return JSON.parse(text.trim().replace(/^svdata=/, '')); } catch (_) { return null; }
  };
  const pathOf = u => { try { return new URL(u, location.href).pathname; } catch (_) { return String(u || '').split('?')[0]; } };
  const params = b => { try { return new URLSearchParams(typeof b === 'string' ? b : ''); } catch (_) { return new URLSearchParams(); } };
  const hpArray = a => Array.isArray(a) ? ((a[0] < 0 ? a.slice(1) : a).map(Number)) : [];
  const deckIds = a => Array.isArray(a) ? a.filter(x => Number.isFinite(x) && x > 0) : [];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function bootUi() {
    const boot = () => { ensureUi(); render(); };
    if (document.documentElement) boot();
    else document.addEventListener('DOMContentLoaded', boot, { once: true });
  }

  // 通信監視はBridgeだけに任せる。Safety本体は受信・表示だけ。
  window.addEventListener('message', e => {
    const d = e?.data?.[FRAME_MESSAGE];
    if (d && String(d.url || '').includes('/kcsapi/')) onApi(d);
  });
  bootUi();

  function onApi(d) {
    const j = parse(d?.text);
    if (!j || j.api_result !== 1) return;
    const p = pathOf(d.url), data = j.api_data;
    S.apiCount++;
    S.lastApi = p.split('/').pop() || p;
    try {
      if (p.includes('/api_start2/getData')) {
        for (const m of data?.api_mst_ship || []) if (m?.api_id > 0) S.masterShips.set(m.api_id, m);
      } else if (p.endsWith('/api_port/port')) {
        ingestShips(data?.api_ship || []);
        ingestDecks(data?.api_deck_port || []);
        if (Number.isFinite(data?.api_combined_flag)) S.combined = data.api_combined_flag;
        S.hpAfter.clear(); S.uncertain = false; S.choice = false;
        refreshFleets(); hideGuard();
      } else if (p.includes('/api_get_member/ship_deck') || p.includes('/api_get_member/ship2') || p.includes('/api_get_member/ship3')) {
        ingestShips(Array.isArray(data) ? data : data?.api_ship_data || data?.api_ship || []);
        ingestDecks(data?.api_deck_data || data?.api_deck_port || []);
        refreshFleets();
      } else if (p.includes('/api_get_member/deck')) {
        ingestDecks(Array.isArray(data) ? data : data?.api_deck_data || []);
        refreshFleets();
      } else if (p.endsWith('/api_req_map/start')) {
        S.sortieDeck = Number(params(d.body).get('api_deck_id') || 1);
        S.hpAfter.clear(); S.uncertain = false; S.choice = false;
        refreshFleets(); hideGuard();
      } else if (p.endsWith('/api_req_map/next')) {
        S.choice = false; S.taps = []; hideGuard();
      } else if (isBattle(p)) {
        readBattle(p, data);
      } else if (p.endsWith('/battleresult')) {
        battleResult();
      } else if (p.includes('/goback_port')) {
        S.choice = false; S.hpAfter.clear(); S.uncertain = false; hideGuard();
      }
      render();
    } catch (err) {
      console.error('[KCS Safety]', err);
      S.uncertain = true; S.uncertainReason = 'API解析エラー'; render();
    }
  }

  function ingestShips(list) {
    if (!Array.isArray(list)) return;
    for (const x of list) if (x?.api_id > 0) S.ships.set(x.api_id, { ...S.ships.get(x.api_id), ...x });
  }
  function ingestDecks(list) {
    if (!Array.isArray(list)) return;
    for (const x of list) if (x?.api_id > 0) S.decks.set(x.api_id, x);
  }
  function fleetIds(deckId) {
    return deckIds(S.decks.get(Number(deckId))?.api_ship);
  }
  function refreshFleets() {
    S.fleet1 = fleetIds(S.sortieDeck);
    S.fleet2 = S.sortieDeck === 1 && S.combined > 0 ? fleetIds(2) : [];
  }
  function isBattle(p) {
    return /\/api_req_(sortie|combined_battle|battle_midnight)\//.test(p) && !p.endsWith('/battleresult') && !p.includes('/goback_port');
  }

  function readBattle(p, d) {
    if (!Array.isArray(d?.api_f_nowhps) || !Array.isArray(d?.api_f_maxhps)) {
      S.uncertain = true; S.uncertainReason = `HP配列なし: ${p.split('/').pop()}`; return;
    }
    const n1 = hpArray(d.api_f_nowhps), m1 = hpArray(d.api_f_maxhps);
    const n2 = hpArray(d.api_f_nowhps_combined), m2 = hpArray(d.api_f_maxhps_combined);
    const hp = [...n1, ...n2].map(x => Math.max(0, x || 0));
    const max = [...m1, ...m2];
    refreshFleets();
    const order = [...S.fleet1, ...S.fleet2];
    if (order.length < Math.min(hp.length, 6)) {
      S.uncertain = true; S.uncertainReason = '艦隊とHPの対応失敗'; return;
    }
    indexed(hp, d.api_kouku?.api_stage3?.api_fdam, 0);
    indexed(hp, d.api_kouku?.api_stage3_combined?.api_fdam, 6);
    indexed(hp, d.api_kouku_combined?.api_stage3?.api_fdam, 6);
    indexed(hp, d.api_opening_atack?.api_fdam, 0);
    shell(hp, d.api_opening_taisen); shell(hp, d.api_hougeki1); shell(hp, d.api_hougeki2); shell(hp, d.api_hougeki3);
    shell(hp, d.api_hougeki); shell(hp, d.api_n_hougeki1); shell(hp, d.api_n_hougeki2);
    indexed(hp, d.api_raigeki?.api_fdam, 0);
    indexed(hp, d.api_raigeki_combined?.api_fdam, 6);
    for (let i = 0; i < Math.min(order.length, hp.length, max.length); i++) {
      S.hpAfter.set(order[i], { now: Math.max(0, Math.trunc(hp[i])), max: Math.max(1, Math.trunc(max[i])), source: 'battle' });
    }
    const st1 = d.api_kouku?.api_stage1;
    if (Number.isFinite(st1?.api_f_count) && Number.isFinite(st1?.api_f_lostcount)) {
      S.planeLoss = { before: st1.api_f_count, lost: st1.api_f_lostcount };
    }
    S.uncertain = false; S.uncertainReason = '';
  }
  function indexed(hp, a, off = 0) {
    if (!Array.isArray(a)) return;
    a.forEach((v, i) => {
      const n = Number(v), k = i + off;
      if (Number.isFinite(n) && n > 0 && k < hp.length) hp[k] -= Math.trunc(n);
    });
  }
  function shell(hp, h) {
    if (!h || !Array.isArray(h.api_df_list) || !Array.isArray(h.api_damage)) return;
    const ef = h.api_at_eflag;
    for (let i = 0; i < Math.min(h.api_df_list.length, h.api_damage.length); i++) {
      if (Array.isArray(ef) && Number(ef[i]) !== 1) continue;
      const ts = Array.isArray(h.api_df_list[i]) ? h.api_df_list[i] : [];
      const ds = Array.isArray(h.api_damage[i]) ? h.api_damage[i] : [];
      for (let z = 0; z < Math.min(ts.length, ds.length); z++) {
        let k = Number(ts[z]), n = Number(ds[z]);
        if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0) continue;
        if (!Array.isArray(ef)) { if (k < 1 || k > 6) continue; k--; }
        if (k >= 0 && k < hp.length) hp[k] -= Math.trunc(n);
      }
    }
  }

  function ship(id) {
    const x = S.ships.get(id), mst = x && S.masterShips.get(x.api_ship_id);
    return {
      id,
      name: mst?.api_name || `艦ID ${id}`,
      lv: x?.api_lv ?? '?',
      cond: Number.isFinite(x?.api_cond) ? x.api_cond : null,
      fuel: x?.api_fuel ?? '?',
      ammo: x?.api_bull ?? '?',
      onslot: Array.isArray(x?.api_onslot) ? x.api_onslot : []
    };
  }
  function hp(id) {
    if (S.hpAfter.has(id)) return S.hpAfter.get(id);
    const x = S.ships.get(id);
    return Number.isFinite(x?.api_nowhp) ? { now:x.api_nowhp, max:x.api_maxhp, source:'last' } : null;
  }
  function damage(h) {
    if (!h || !Number.isFinite(h.now) || !Number.isFinite(h.max)) return ['不明','unknown'];
    if (h.now <= 0 || h.now * 4 <= h.max) return ['大破','danger'];
    if (h.now * 2 <= h.max) return ['中破','warn'];
    if (h.now * 4 <= h.max * 3) return ['小破','minor'];
    return ['健在','ok'];
  }
  function condInfo(value) {
    const c = Number(value);
    if (!Number.isFinite(c)) return { text:'? 不明', cls:'cond-unknown' };
    if (c >= 50) return { text:`✨ ${c} キラ`, cls:'cond-kira' };
    if (c >= 40) return { text:`${c} 通常`, cls:'cond-normal' };
    if (c >= 30) return { text:`${c} 軽疲労`, cls:'cond-light' };
    if (c >= 20) return { text:`🟠 ${c}`, cls:'cond-orange' };
    return { text:`🔴 ${c}`, cls:'cond-red' };
  }
  function heavies() {
    return [...S.fleet1, ...S.fleet2].filter(id => damage(hp(id))[1] === 'danger').map(id => ({ ...ship(id), hp:hp(id) }));
  }

  function battleResult() {
    S.choice = true;
    const bad = heavies();
    if (bad.length || S.uncertain) showGuard(bad);
    else hideGuard();
    openPanel(true);
  }

  function ensureUi() {
    if (S.ui || !document.documentElement) return;
    const host = document.createElement('div');
    host.id = '__kcs_safety_ui';
    host.style.cssText = 'position:fixed;z-index:2147483645;right:8px;top:56px;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif';
    const root = host.attachShadow({mode:'open'});
    root.innerHTML = `<style>
*{box-sizing:border-box}
button{font:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.chip{border:0;border-radius:999px;background:#5b4c14;color:#fff;padding:10px 14px;font-weight:800;min-height:42px}
.p{display:none;position:fixed;right:8px;top:96px;width:min(96vw,660px);max-height:82vh;overflow:auto;background:#15171df2;color:#fff;border:1px solid #ffffff33;border-radius:14px;padding:12px;box-shadow:0 10px 30px #0009;font-size:12px}
.p.open{display:block}
.top{display:flex;gap:10px;align-items:center;position:sticky;top:-12px;z-index:2;background:#15171df7;padding:10px 0 8px}
.top b{flex:1;font-size:15px}
.btn{border:1px solid #ffffff33;border-radius:9px;background:#2a2d36;color:#fff;padding:8px 10px;min-height:40px}
.close{min-width:112px;min-height:50px;padding:10px 16px;border:2px solid #ff9cab;background:#5b2330;font-size:16px;font-weight:900}
.tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:8px 0}
.tabs .btn{font-weight:800;min-width:0}
.tabs .on{background:#fff;color:#111;border-color:#fff}
.note{padding:8px;border-radius:8px;background:#272a33;margin:7px 0;line-height:1.45}
.red{background:#641726;border:1px solid #ff7484}
.yellow{background:#584515;border:1px solid #e3b840}
.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;font-size:11px}
th,td{padding:7px 4px;border-bottom:1px solid #ffffff18;text-align:left;white-space:nowrap}
tr.danger{background:#651729}
tr.warn{background:#554313}
tr.unknown{background:#463e55}
.muted{opacity:.62}
.name{max-width:142px;overflow:hidden;text-overflow:ellipsis}
.cond{font-weight:800}
.cond-kira{color:#ffe783}
.cond-normal{color:#d9f7df}
.cond-light{color:#ffe39a}
.cond-orange{color:#ffb35c}
.cond-red{color:#ff7f8e}
.cond-unknown{color:#c8c8d0}
</style>
<button class="chip" id="chip">⚓ 待機</button>
<section class="p" id="panel">
  <div class="top">
    <b>⚓ 艦隊状態 v${VERSION}</b>
    <button class="btn close" id="close">✕ 閉じる</button>
  </div>
  <div id="debug"></div>
  <div id="summary"></div>
  <div class="tabs">
    <button class="btn on" data-fleet="1">第1</button>
    <button class="btn" data-fleet="2">第2</button>
    <button class="btn" data-fleet="3">第3</button>
    <button class="btn" data-fleet="4">第4</button>
  </div>
  <div id="fleet"></div>
  <div id="planes"></div>
</section>`;
    document.documentElement.appendChild(host);
    S.ui = root;
    let tab = 1;
    const q = x => root.querySelector(x);
    q('#chip').onclick = () => openPanel();
    q('#close').onclick = () => openPanel(false);
    for (const b of root.querySelectorAll('[data-fleet]')) {
      b.onclick = () => {
        tab = Number(b.dataset.fleet || 1);
        for (const x of root.querySelectorAll('[data-fleet]')) x.classList.toggle('on', x === b);
        renderFleet(tab);
      };
    }
    root.__tab = () => tab;
  }
  function openPanel(v) {
    if (!S.ui) return;
    const p = S.ui.querySelector('#panel');
    p.classList.toggle('open', typeof v === 'boolean' ? v : !p.classList.contains('open'));
  }
  function render() {
    if (!S.ui) return;
    const q = x => S.ui.querySelector(x), bad = heavies();
    q('#chip').textContent = bad.length ? `🚨 大破 ${bad.length}` : S.uncertain ? '⚠️ 判定不明' : S.apiCount ? '⚓ 状態' : '⚓ 待機';
    q('#chip').style.background = bad.length?'#a4142c':S.uncertain?'#6b5418':S.apiCount?'#17191f':'#5b4c14';
    q('#debug').innerHTML = `<div class="note">🔧 v${VERSION} / API ${S.apiCount}${S.lastApi?` / 最終: ${esc(S.lastApi)}`:''}<br><span class="muted">軽量モード：通信監視はBridgeだけで実行。</span></div>`;
    q('#summary').innerHTML =
      (bad.length?`<div class="note red">🚨 大破：${bad.map(x=>esc(x.name)).join(' / ')}<br>進撃系ゾーンをロック中。</div>`:'') +
      (S.uncertain?`<div class="note yellow">⚠️ HP判定不明：${esc(S.uncertainReason)}</div>`:'') +
      `<div class="note">HPの <b>*</b> は戦闘APIからの戦闘後計算値。燃料・弾薬・搭載数・Condは最終取得値です。Cond：50以上=キラ / 40〜49=通常 / 30〜39=軽疲労 / 20〜29=橙 / 0〜19=赤。</div>`;
    renderFleet(S.ui.__tab());
    q('#planes').innerHTML = S.planeLoss ? `<div class="note">✈️ 直近航空戦：総搭載 ${S.planeLoss.before} / 総損失 ${S.planeLoss.lost}</div>` : '';
  }
  function renderFleet(tab) {
    if (!S.ui) return;
    const ids = fleetIds(tab), box = S.ui.querySelector('#fleet');
    if (!ids.length) {
      box.innerHTML = `<div class="note">第${tab}艦隊のデータ待ち。母港を一度表示すると更新されます。</div>`;
      return;
    }
    const rows = ids.map(id => {
      const x = ship(id), h = hp(id), [label, cls] = damage(h), ci = condInfo(x.cond);
      return `<tr class="${cls}"><td>${label}</td><td class="name">${esc(x.name)} Lv${x.lv}</td><td>${h?`${h.now}/${h.max}${h.source==='battle'?'*':''}`:'?'}</td><td class="cond ${ci.cls}">${ci.text}</td><td>${x.fuel}</td><td>${x.ammo}</td><td>${x.onslot.length?x.onslot.join('/'):'-'}</td></tr>`;
    }).join('');
    box.innerHTML = `<div class="note">第${tab}艦隊${Number(tab) === Number(S.sortieDeck) ? '（出撃艦隊）' : ''}</div><div class="tablewrap"><table><thead><tr><th>状態</th><th>艦</th><th>HP</th><th>Cond</th><th>燃</th><th>弾</th><th>搭載</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function validRect(r) { return r && r.width > 300 && r.height > 180 && r.bottom > 0 && r.right > 0; }
  function gameRect() {
    const frames = [...document.querySelectorAll('iframe')].map(el => el.getBoundingClientRect()).filter(validRect);
    if (frames.length) {
      const targetAspect = 1200 / 720;
      frames.sort((a,b) => {
        const sa = a.width*a.height/(1+Math.abs(a.width/a.height-targetAspect)*4);
        const sb = b.width*b.height/(1+Math.abs(b.width/b.height-targetAspect)*4);
        return sb-sa;
      });
      return frames[0];
    }
    return { left:0, top:0, width:innerWidth, height:innerHeight, right:innerWidth, bottom:innerHeight };
  }

  function ensureGuard() {
    if (S.guard?.isConnected) return S.guard;
    const g = document.createElement('div');
    g.style.cssText = 'position:fixed;z-index:2147483646;display:none;align-items:center;justify-content:center;text-align:center;background:rgba(180,0,25,.88);border:4px solid #ff9cab;border-radius:16px;color:white;font:900 clamp(12px,2.5vw,24px)/1.35 -apple-system,BlinkMacSystemFont,sans-serif;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent';
    const stop = e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); };
    g.addEventListener('touchstart', e => { stop(e); guardTap(); }, { passive:false, capture:true });
    g.addEventListener('touchend', stop, { passive:false, capture:true });
    g.addEventListener('pointerdown', e => { stop(e); if (e.pointerType !== 'touch') guardTap(); }, { passive:false, capture:true });
    g.addEventListener('pointerup', stop, { passive:false, capture:true });
    g.addEventListener('click', stop, true);
    document.documentElement.appendChild(g);
    S.guard = g;
    addEventListener('resize', positionGuard, {passive:true});
    addEventListener('orientationchange', () => setTimeout(positionGuard, 100), {passive:true});
    return g;
  }
  function showGuard(bad) {
    const g = ensureGuard();
    S.taps = [];
    g.style.pointerEvents = 'auto';
    g.style.background = 'rgba(180,0,25,.88)';
    g.innerHTML = `<div>🚨 ${bad.length?'大破艦あり':'HP判定不明'}<br><small>進撃系ボタンをロック中</small><br><small>進撃するなら赤枠を3連続タップ</small><br><span id="gc">0 / 3</span></div>`;
    g.style.display = 'flex';
    positionGuard();
  }
  function hideGuard() { if (S.guard) S.guard.style.display = 'none'; S.taps = []; }
  function positionGuard() {
    if (!S.guard || S.guard.style.display === 'none') return;
    const r = gameRect();
    S.guard.style.left = `${r.left + r.width * GUARD.x}px`;
    S.guard.style.top = `${r.top + r.height * GUARD.y}px`;
    S.guard.style.width = `${r.width * GUARD.w}px`;
    S.guard.style.height = `${r.height * GUARD.h}px`;
  }
  function guardTap() {
    const n = Date.now();
    S.taps = S.taps.filter(t => n - t <= TRIPLE_TAP_MS);
    S.taps.push(n);
    const c = S.guard?.querySelector('#gc');
    if (c) c.textContent = `${Math.min(3,S.taps.length)} / 3`;
    if (S.taps.length >= 3) {
      S.guard.style.pointerEvents = 'none';
      S.guard.style.background = 'rgba(20,125,60,.76)';
      S.guard.innerHTML = '<div>一時解除中<br><small>5秒以内に実際の「進撃」をタップ</small></div>';
      setTimeout(() => { if (S.choice) showGuard(heavies()); }, UNLOCK_MS);
    }
  }

  console.info(`[KCS Safety] loaded v${VERSION} (bridge-only)`);
})();