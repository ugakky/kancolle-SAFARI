import fs from 'node:fs';

const bridge = fs.readFileSync('kancolle-page-bridge.user.js', 'utf8');
const ui = fs.readFileSync('kancolle-safety.user.js', 'utf8');

const failures = [];
const must = (ok, msg) => { if (!ok) failures.push(msg); };
const count = (s, needle) => s.split(needle).length - 1;

must(/@version\s+2\.5\.2/.test(bridge), 'bridge version is not 2.5.0');
must(/@version\s+2\.5\.2/.test(ui), 'UI version is not 2.5.0');
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

must(!ui.includes('new XMLHttpRequest'), 'UI creates XMLHttpRequest');
must(!ui.includes('GM_xmlhttpRequest'), 'UI uses GM_xmlhttpRequest');
must(!ui.includes('document.cookie'), 'UI accesses document.cookie');
must(!ui.includes('GM_cookie'), 'UI accesses GM_cookie');
must(!/\bfetch\s*\(/.test(ui), 'UI performs fetch');
must(!/\bWebSocket\s*\(/.test(ui), 'UI opens WebSocket');

if (failures.length) {
  console.error('Safety audit FAILED:');
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log('Safety audit PASS: v2.5.2 passive-only invariants satisfied.');
