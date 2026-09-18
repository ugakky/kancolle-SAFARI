import fs from 'node:fs';

const bridge = fs.readFileSync('kancolle-page-bridge.user.js', 'utf8');
const ui = fs.readFileSync('kancolle-safety.user.js', 'utf8');

const failures = [];
const must = (ok, msg) => { if (!ok) failures.push(msg); };
const count = (s, needle) => s.split(needle).length - 1;

must(/@version\s+2\.5\.4/.test(bridge), 'bridge version is not 2.5.3');
must(/@version\s+2\.5\.4/.test(ui), 'UI version is not 2.5.3');
must(!bridge.includes('new XMLHttpRequest'), 'bridge creates a new XMLHttpRequest');
must(!bridge.includes('GM_xmlhttpRequest'), 'bridge uses GM_xmlhttpRequest');
must(!bridge.includes('GM_cookie'), 'bridge accesses GM_cookie');
must(!bridge.includes('document.cookie'), 'bridge accesses document.cookie');
must(!bridge.includes('.click('), 'bridge contains click automation');
must(!bridge.includes('setInterval('), 'bridge contains polling interval');
must(count(bridge, 'originalSend.call(this,body)') === 1, 'XHR pass-through is not exactly once in source');
must(count(bridge, 'originalFetch.apply(this,arguments)') === 1, 'fetch pass-through is not exactly once in source');
must(!/\.get\(['"]api_token['"]\)/.test(bridge), 'bridge reads api_token from request body');
must(!/api_token\s*:/.test(bridge), 'bridge constructs an api_token field');
must(bridge.includes("'/kcsapi/api_get_member/questlist':['api_page_no','api_tab_id']"), 'quest request metadata allowlist missing');
must(bridge.includes("'/kcsapi/api_get_member/base_air_corps':['api_area_id']"), 'airbase area metadata allowlist missing');

must(!ui.includes('new XMLHttpRequest'), 'UI creates XMLHttpRequest');
must(!ui.includes('GM_xmlhttpRequest'), 'UI uses GM_xmlhttpRequest');
must(!ui.includes('document.cookie'), 'UI accesses document.cookie');
must(!ui.includes('GM_cookie'), 'UI accesses GM_cookie');
must(!/\bfetch\s*\(/.test(ui), 'UI performs fetch');
must(!/\bWebSocket\s*\(/.test(ui), 'UI opens WebSocket');
must(ui.includes('function questsComplete()'), 'quest completeness logic missing');
must(ui.includes('tab_id===0'), 'all-quest tab completeness check missing');
must(ui.includes('__safe25_area_id'), 'airbase area preservation missing');
must(ui.includes('mergeBases(d?.api_air_base'), 'mapinfo api_air_base passive capture missing');
must(ui.includes('S.gameWindow=e.source'), 'screenshot source-window handshake missing');
must(ui.includes('target.postMessage'), 'screenshot does not target observed game window');
must(ui.includes('function dismissGuard()'), 'explicit blocker release missing');
must(ui.includes('data-guard-dismiss>解除'), 'blocker release button label missing');
must(ui.includes("finishSortie('goback_port')"), 'goback_port sortie finalization missing');
must(ui.includes("finishSortie('superseded_by_new_sortie')"), 'new-sortie finalization missing');
must(ui.includes('unhandledFriendlyDamage'), 'fail-closed unknown damage phase check missing');
must(ui.includes('轟沈/ダメコン発動の可能性'), 'damage-control activation fail-closed check missing');
must(!ui.includes('openPanel(true)'), 'battle result must not force-open the panel');

if (failures.length) {
  console.error('Safety audit FAILED:');
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log('Safety audit PASS: v2.5.4 passive-only and completeness invariants satisfied.');
