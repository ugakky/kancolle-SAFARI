// ==UserScript==
// @name         艦これ Safari Safety
// @namespace    https://github.com/ugakky/kancolle-SAFARI
// @version      0.1.0
// @description  艦隊状態表示・大破警告・進撃3タップロック（Safari/Userscripts向け試作）
// @match        *://*.dmm.com/*
// @include      /^https?:\/\/203\.104\.209\.\d+\//
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '0.1.0';
  const API_EVENT = '__KCS_SAFETY_API__';
  // 1200x720ゲーム画面に対する進撃ボタン付近の初期推定位置。
  // 実機でずれる場合はこの4値を調整する。
  const GUARD = { x: 0.285, y: 0.585, w: 0.205, h: 0.17 };
  const TRIPLE_TAP_MS = 2400;
  const UNLOCK_MS = 5000;

  const S = {
    masterShips: new Map(),
    ships: new Map(),
    decks: new Map(),
    combined: 0,
    sortieDeck: 1,
    fleet1: [], fleet2: [],
    hpAfter: new Map(),
    uncertain: false,
    uncertainReason: '',
    choice: false,
    planeLoss: null,
    ui: null, guard: null,
    taps: [], audio: null,
    notification: false,
  };

  const parse = (text) => {
    if (typeof text !== 'string') return null;
    const s = text.trim().replace(/^svdata=/, '');
    try { return JSON.parse(s); } catch (_) { return null; }
  };
  const pathOf = (u) => { try { return new URL(u, location.href).pathname; } catch (_) { return String(u || '').split('?')[0]; } };
  const params = (b) => { try { return new URLSearchParams(typeof b === 'string' ? b : ''); } catch (_) { return new URLSearchParams(); } };
  const hpArray = (a) => Array.isArray(a) ? ((a[0] < 0 ? a.slice(1) : a).map(Number)) : [];
  const deckIds = (a) => Array.isArray(a) ? a.filter(x => Number.isFinite(x) && x > 0) : [];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // 艦これ本体が通常どおり受信したAPIレスポンスを読むだけ。通信は変更しない。
  function installNetworkHook() {
    if (window.__KCS_SAFETY_HOOK__) return;
    window.__KCS_SAFETY_HOOK__ = true;
    const emit = (url, body, text) => {
      if (!String(url || '').includes('/kcsapi/')) return;
      try { window.dispatchEvent(new CustomEvent(API_EVENT, { detail: { url: String(url), body: typeof body === 'string' ? body : '', text: String(text || '') } })); } catch (_) {}
    };
    try {
      const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) { this.__kcsSafety = { method, url }; return open.call(this, method, url, ...rest); };
      XMLHttpRequest.prototype.send = function(body) {
        const m = this.__kcsSafety || {};
        this.addEventListener('load', () => { try { if (!this.responseType || this.responseType === 'text') emit(m.url, body, this.responseText); } catch (_) {} }, { once: true });
        return send.call(this, body);
      };
    } catch (e) { console.warn('[KCS Safety] XHR hook failed', e); }
    try {
      if (window.fetch) {
        const f = window.fetch;
        window.fetch = async function(input, init = {}) {
          const r = await f.apply(this, arguments);
          try {
            const u = typeof input === 'string' ? input : input?.url;
            if (String(u || '').includes('/kcsapi/')) r.clone().text().then(t => emit(u, init.body || '', t)).catch(() => {});
          } catch (_) {}
          return r;
        };
      }
    } catch (e) { console.warn('[KCS Safety] fetch hook failed', e); }
  }

  window.addEventListener(API_EVENT, e => onApi(e.detail));
  installNetworkHook();

  function onApi(d) {
    const j = parse(d?.text);
    if (!j || j.api_result !== 1) return;
    const p = pathOf(d.url), data = j.api_data;
    ensureUi();
    try {
      if (p.includes('/api_start2/getData')) {
        for (const m of data?.api_mst_ship || []) if (m?.api_id > 0) S.masterShips.set(m.api_id, m);
      } else if (p.endsWith('/api_port/port')) {
        ingestShips(data?.api_ship || []); ingestDecks(data?.api_deck_port || []);
        if (Number.isFinite(data?.api_combined_flag)) S.combined = data.api_combined_flag;
        S.hpAfter.clear(); S.uncertain = false; S.choice = false; refreshFleets(); hideGuard();
      } else if (p.includes('/api_get_member/ship_deck') || p.includes('/api_get_member/ship2') || p.includes('/api_get_member/ship3')) {
        ingestShips(Array.isArray(data) ? data : data?.api_ship_data || data?.api_ship || []);
        ingestDecks(data?.api_deck_data || data?.api_deck_port || []); refreshFleets();
      } else if (p.includes('/api_get_member/deck')) {
        ingestDecks(Array.isArray(data) ? data : data?.api_deck_data || []); refreshFleets();
      } else if (p.endsWith('/api_req_map/start')) {
        S.sortieDeck = Number(params(d.body).get('api_deck_id') || 1); S.hpAfter.clear(); S.uncertain = false; S.choice = false; refreshFleets(); hideGuard();
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
    for (const x of list) if (x?.api_id > 0) S.ships.set(x.api_id, { ...S.ships.get(x.api_id), ...x, __at: Date.now() });
  }
  function ingestDecks(list) {
    if (!Array.isArray(list)) return;
    for (const x of list) if (x?.api_id > 0) S.decks.set(x.api_id, x);
  }
  function refreshFleets() {
    S.fleet1 = deckIds(S.decks.get(S.sortieDeck)?.api_ship);
    S.fleet2 = S.sortieDeck === 1 && S.combined > 0 ? deckIds(S.decks.get(2)?.api_ship) : [];
  }
  function isBattle(p) {
    return /\/api_req_(sortie|combined_battle|battle_midnight)\//.test(p) && !p.endsWith('/battleresult') && !p.includes('/goback_port');
  }

  // 戦闘開始HPから、味方が受けたダメージだけを各フェーズ分減算する。
  function readBattle(p, d) {
    if (!Array.isArray(d?.api_f_nowhps) || !Array.isArray(d?.api_f_maxhps)) {
      S.uncertain = true; S.uncertainReason = `HP配列なし: ${p.split('/').pop()}`; return;
    }
    const n1 = hpArray(d.api_f_nowhps), m1 = hpArray(d.api_f_maxhps);
    const n2 = hpArray(d.api_f_nowhps_combined), m2 = hpArray(d.api_f_maxhps_combined);
    const now = [...n1, ...n2], max = [...m1, ...m2], hp = now.map(x => Math.max(0, x || 0));
    refreshFleets();
    const order = [...S.fleet1, ...S.fleet2];
    if (order.length < Math.min(hp.length, 6)) { S.uncertain = true; S.uncertainReason = '艦隊とHPの対応失敗'; return; }

    air(hp, d.api_kouku?.api_stage3?.api_fdam, 0);
    air(hp, d.api_kouku?.api_stage3_combined?.api_fdam, 6);
    air(hp, d.api_kouku_combined?.api_stage3?.api_fdam, 6);
    indexed(hp, d.api_opening_atack?.api_fdam, 0);
    shell(hp, d.api_opening_taisen); shell(hp, d.api_hougeki1); shell(hp, d.api_hougeki2); shell(hp, d.api_hougeki3);
    shell(hp, d.api_hougeki); shell(hp, d.api_n_hougeki1); shell(hp, d.api_n_hougeki2);
    indexed(hp, d.api_raigeki?.api_fdam, 0); indexed(hp, d.api_raigeki_combined?.api_fdam, 6);

    for (let i = 0; i < Math.min(order.length, hp.length, max.length); i++)
      S.hpAfter.set(order[i], { now: Math.max(0, Math.trunc(hp[i])), max: Math.max(1, Math.trunc(max[i])), source: 'battle' });

    const st1 = d.api_kouku?.api_stage1;
    if (Number.isFinite(st1?.api_f_count) && Number.isFinite(st1?.api_f_lostcount)) S.planeLoss = { before: st1.api_f_count, lost: st1.api_f_lostcount };
    S.uncertain = false; S.uncertainReason = '';
  }
  function air(hp, a, off) { indexed(hp, a, off); }
  function indexed(hp, a, off = 0) {
    if (!Array.isArray(a)) return;
    a.forEach((v, i) => { const n = Number(v), k = i + off; if (Number.isFinite(n) && n > 0 && k < hp.length) hp[k] -= Math.trunc(n); });
  }
  function shell(hp, h) {
    if (!h || !Array.isArray(h.api_df_list) || !Array.isArray(h.api_damage)) return;
    const ef = h.api_at_eflag;
    for (let i = 0; i < Math.min(h.api_df_list.length, h.api_damage.length); i++) {
      if (Array.isArray(ef) && Number(ef[i]) !== 1) continue; // 敵→味方だけ
      const ts = Array.isArray(h.api_df_list[i]) ? h.api_df_list[i] : [], ds = Array.isArray(h.api_damage[i]) ? h.api_damage[i] : [];
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
    return { id, raw:x, name:mst?.api_name || `艦ID ${id}`, lv:x?.api_lv ?? '?', fuel:x?.api_fuel ?? '?', ammo:x?.api_bull ?? '?', onslot:Array.isArray(x?.api_onslot)?x.api_onslot:[] };
  }
  function hp(id) {
    if (S.hpAfter.has(id)) return S.hpAfter.get(id);
    const x = S.ships.get(id); return Number.isFinite(x?.api_nowhp) ? { now:x.api_nowhp, max:x.api_maxhp, source:'last' } : null;
  }
  function damage(h) {
    if (!h || !Number.isFinite(h.now) || !Number.isFinite(h.max)) return ['不明','unknown'];
    if (h.now <= 0 || h.now * 4 <= h.max) return ['大破','danger'];
    if (h.now * 2 <= h.max) return ['中破','warn'];
    if (h.now * 4 <= h.max * 3) return ['小破','minor'];
    return ['健在','ok'];
  }
  function heavies() {
    return [...S.fleet1, ...S.fleet2].filter(id => damage(hp(id))[1] === 'danger').map(id => ({ ...ship(id), hp:hp(id) }));
  }

  function battleResult() {
    S.choice = true;
    const bad = heavies();
    if (bad.length || S.uncertain) { showGuard(bad); alertUser(bad); }
    else hideGuard();
    openPanel(true);
  }

  function ensureUi() {
    if (S.ui || !document.documentElement) return;
    const host = document.createElement('div'); host.id = '__kcs_safety_ui';
    host.style.cssText = 'position:fixed;z-index:2147483645;right:8px;top:8px;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif';
    const root = host.attachShadow({mode:'open'});
    root.innerHTML = `<style>*{box-sizing:border-box}button{font:inherit}.chip{border:0;border-radius:999px;background:#17191f;color:#fff;padding:8px 12px;font-weight:800}.p{display:none;position:fixed;right:8px;top:48px;width:min(94vw,560px);max-height:80vh;overflow:auto;background:#15171def;color:#fff;border:1px solid #ffffff33;border-radius:14px;padding:12px;box-shadow:0 10px 30px #0009;font-size:12px}.p.open{display:block}.top{display:flex;gap:8px;align-items:center}.top b{flex:1;font-size:15px}.btn{border:1px solid #ffffff33;border-radius:8px;background:#2a2d36;color:#fff;padding:6px 9px}.tabs{display:flex;gap:6px;margin:8px 0}.tabs .on{background:#fff;color:#111}.note{padding:8px;border-radius:8px;background:#272a33;margin:7px 0;line-height:1.45}.red{background:#641726;border:1px solid #ff7484}.yellow{background:#584515;border:1px solid #e3b840}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:6px 4px;border-bottom:1px solid #ffffff18;text-align:left;white-space:nowrap}tr.danger{background:#651729}tr.warn{background:#554313}tr.unknown{background:#463e55}.muted{opacity:.62}.name{max-width:130px;overflow:hidden;text-overflow:ellipsis}</style><button class="chip" id="chip">⚓ 状態</button><section class="p" id="panel"><div class="top"><b>⚓ 艦隊状態 v${VERSION}</b><button class="btn" id="notify">通知テスト</button><button class="btn" id="close">閉じる</button></div><div id="summary"></div><div class="tabs"><button class="btn on" id="f1">第1/出撃</button><button class="btn" id="f2">第2艦隊</button></div><div id="fleet"></div><div id="planes"></div></section>`;
    document.documentElement.appendChild(host); S.ui = root; let tab=1;
    const q=x=>root.querySelector(x); q('#chip').onclick=()=>openPanel(); q('#close').onclick=()=>openPanel(false);
    q('#f1').onclick=()=>{tab=1;q('#f1').classList.add('on');q('#f2').classList.remove('on');renderFleet(tab)};
    q('#f2').onclick=()=>{tab=2;q('#f2').classList.add('on');q('#f1').classList.remove('on');renderFleet(tab)};
    q('#notify').onclick=requestNotify; root.__tab=()=>tab;
  }
  function openPanel(v) { if (!S.ui) return; const p=S.ui.querySelector('#panel'); p.classList.toggle('open', typeof v==='boolean'?v:!p.classList.contains('open')); }
  function render() {
    if (!S.ui) return; const q=x=>S.ui.querySelector(x), bad=heavies();
    q('#chip').textContent = bad.length ? `🚨 大破 ${bad.length}` : S.uncertain ? '⚠️ 判定不明' : '⚓ 状態';
    q('#chip').style.background = bad.length?'#a4142c':S.uncertain?'#6b5418':'#17191f';
    q('#summary').innerHTML = (bad.length?`<div class="note red">🚨 大破：${bad.map(x=>esc(x.name)).join(' / ')}<br>進撃ガードを有効化。</div>`:'') + (S.uncertain?`<div class="note yellow">⚠️ HP判定不明：${esc(S.uncertainReason)}</div>`:'') + `<div class="note">HPの <b>*</b> は戦闘APIからの戦闘後計算値。<br>燃料・弾薬・各スロ搭載数は <b>最終取得値</b> で、戦闘後の厳密な現在値とは限りません。</div>`;
    q('#f2').style.display=S.fleet2.length?'':'none'; renderFleet(S.ui.__tab());
    q('#planes').innerHTML=S.planeLoss?`<div class="note">✈️ 直近航空戦：総搭載 ${S.planeLoss.before} / 総損失 ${S.planeLoss.lost}<br><span class="muted">各スロットの損失には按分していません。</span></div>`:'';
  }
  function renderFleet(tab) {
    if (!S.ui) return; const ids=tab===2?S.fleet2:S.fleet1, box=S.ui.querySelector('#fleet');
    if (!ids.length) { box.innerHTML='<div class="note">母港データ待ち。母港を一度表示してから出撃してね。</div>'; return; }
    const rows=ids.map(id=>{const x=ship(id),h=hp(id),[label,cls]=damage(h);return `<tr class="${cls}"><td>${label}</td><td class="name">${esc(x.name)} Lv${x.lv}</td><td>${h?`${h.now}/${h.max}${h.source==='battle'?'*':''}`:'?'}</td><td>${x.fuel}</td><td>${x.ammo}</td><td>${x.onslot.length?x.onslot.join('/'):'-'}</td></tr>`}).join('');
    box.innerHTML=`<table><thead><tr><th>状態</th><th>艦</th><th>HP</th><th>燃</th><th>弾</th><th>搭載</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function gameRect() {
    const cs=[...document.querySelectorAll('canvas')].filter(c=>{const r=c.getBoundingClientRect();return r.width>300&&r.height>180});
    if(cs.length){cs.sort((a,b)=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return y.width*y.height-x.width*x.height});return cs[0].getBoundingClientRect()}
    return {left:0,top:0,width:innerWidth,height:innerHeight};
  }
  function ensureGuard() {
    if (S.guard?.isConnected) return S.guard;
    const g=document.createElement('div'); g.style.cssText='position:fixed;z-index:2147483646;display:none;align-items:center;justify-content:center;text-align:center;background:rgba(180,0,25,.84);border:3px solid #ff9cab;border-radius:12px;color:white;font:900 clamp(12px,2.5vw,22px)/1.35 -apple-system,BlinkMacSystemFont,sans-serif;touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent';
    g.addEventListener('pointerdown',guardTap,{passive:false}); g.addEventListener('click',e=>{e.preventDefault();e.stopPropagation()},true); document.documentElement.appendChild(g); S.guard=g;
    addEventListener('resize',positionGuard,{passive:true}); addEventListener('scroll',positionGuard,{passive:true}); return g;
  }
  function showGuard(bad) { const g=ensureGuard();S.taps=[];g.style.pointerEvents='auto';g.style.background='rgba(180,0,25,.84)';g.innerHTML=`<div>🚨 ${bad.length?'大破艦あり':'HP判定不明'}<br><small>進撃するならここを3連続タップ</small><br><span id="gc">0 / 3</span></div>`;g.style.display='flex';positionGuard(); }
  function hideGuard(){if(S.guard)S.guard.style.display='none';S.taps=[]}
  function positionGuard(){if(!S.guard||S.guard.style.display==='none')return;const r=gameRect();S.guard.style.left=`${r.left+r.width*GUARD.x}px`;S.guard.style.top=`${r.top+r.height*GUARD.y}px`;S.guard.style.width=`${r.width*GUARD.w}px`;S.guard.style.height=`${r.height*GUARD.h}px`}
  function guardTap(e){e.preventDefault();e.stopPropagation();const n=Date.now();S.taps=S.taps.filter(t=>n-t<=TRIPLE_TAP_MS);S.taps.push(n);const c=S.guard.querySelector('#gc');if(c)c.textContent=`${Math.min(3,S.taps.length)} / 3`;if(S.taps.length>=3){S.guard.style.pointerEvents='none';S.guard.style.background='rgba(20,125,60,.76)';S.guard.innerHTML='<div>一時解除中<br><small>5秒以内に実際の「進撃」をタップ</small></div>';setTimeout(()=>{if(S.choice)showGuard(heavies())},UNLOCK_MS)}}

  async function requestNotify(){
    try{
      if(!('Notification'in window))throw new Error('このSafariではWeb通知APIを利用できません');
      let p=Notification.permission;if(p!=='granted')p=await Notification.requestPermission();if(p!=='granted')throw new Error(`通知権限: ${p}`);
      S.notification=true;new Notification('艦これ Safari Safety',{body:'通知テスト。大破時に警告します。'});
      try{const C=window.AudioContext||window.webkitAudioContext;S.audio=S.audio||new C();await S.audio.resume();beep()}catch(_){}
    }catch(e){alert(`通知テスト失敗：${e.message}\niPhoneの通常SafariではネイティブWeb通知が使えない場合があります。画面警告は動作します。`)}
  }
  function beep(){try{if(!S.audio)return;const o=S.audio.createOscillator(),g=S.audio.createGain();o.frequency.value=880;g.gain.value=.22;o.connect(g).connect(S.audio.destination);o.start();o.stop(S.audio.currentTime+.35)}catch(_){}}
  function alertUser(bad){
    beep(); if(S.notification&&'Notification'in window&&Notification.permission==='granted'){try{new Notification('🚨 艦これ 大破警告',{body:bad.length?`${bad.map(x=>x.name).join('、')} が大破。進撃ロック中。`:'HP判定不明。安全側で進撃ロック中。'})}catch(_){}}
    try{navigator.vibrate?.([180,90,180,90,300])}catch(_){}
  }

  console.info(`[KCS Safety] loaded v${VERSION}`);
})();
