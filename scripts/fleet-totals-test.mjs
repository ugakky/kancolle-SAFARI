import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Load the actual userscript; defer DOM startup and expose only test subjects.
let source=fs.readFileSync('kancolle-safety.user.js','utf8').replace('\nboot();','\n');
source=source.replace(/\}\)\(\);\s*$/, 'globalThis.test={S,fleetTotals,fleetTotalsHtml,ingestShips,ingestDecks,refreshFleets,guardState};})();');
const context={console,URL,localStorage:{getItem:()=>null},window:{addEventListener(){}},visualViewport:{addEventListener(){}}};
vm.runInNewContext(source,context);
const {S,fleetTotals,fleetTotalsHtml,ingestShips,ingestDecks,refreshFleets,guardState}=context.test;
assert.equal(fleetTotals(1),null);
assert.ok(fleetTotalsHtml().includes('未取得'));
for(let id=1;id<=4;id++){
 ingestShips([{api_id:id,api_lv:10*id,api_taiku:[11*id,999],api_karyoku:[12*id,999],api_taisen:[13*id,999],api_sakuteki:[14*id,999],api_nowhp:20,api_maxhp:20,api_slot:[]}]);
 ingestDecks([{api_id:id,api_ship:[id,-1,-1,-1,-1,-1]}]);
 const t=fleetTotals(id);
 assert.equal(t.api_lv,10*id);assert.equal(t.api_taiku,11*id);assert.equal(t.api_karyoku,12*id);assert.equal(t.api_taisen,13*id);assert.equal(t.api_sakuteki,14*id);
}
ingestDecks([{api_id:4,api_ship:[3,4,-1]}]);
assert.equal(fleetTotals(4).api_lv,70);
assert.equal(fleetTotals(4).api_taiku,77);
// Updating received data updates totals, without an additional equipment sum.
ingestShips([{api_id:4,api_karyoku:[100,999]}]);
assert.equal(fleetTotals(4).api_karyoku,136);
delete S.ships.get(3).api_taisen;
assert.equal(fleetTotals(4).api_taisen,null);
assert.equal(fleetTotals(4).api_lv,70);
ingestDecks([{api_id:3,api_ship:[999,-1]}]);assert.equal(fleetTotals(3).api_lv,null);
ingestDecks([{api_id:2,api_ship:[-1,-1]}]);assert.equal(fleetTotals(2).api_lv,0);
for(const bad of [null,NaN,Infinity,'10',-1]){ingestShips([{api_id:1,api_lv:bad}]);assert.equal(fleetTotals(1).api_lv,null);}
S.bridge=true;S.sortieDeck=1;refreshFleets();S.hpAfter.set(1,{now:1,max:20});
const before=JSON.stringify(S.fleet1);fleetTotalsHtml();
assert.equal(JSON.stringify(S.fleet1),before);assert.equal(guardState().block,true);
const html=fleetTotalsHtml();for(let id=1;id<=4;id++)assert.ok(html.includes(`第${id}艦隊`));
console.log('PASS: four fleets, five stats, updates, missing/invalid values, empty fleets, sortie isolation');
