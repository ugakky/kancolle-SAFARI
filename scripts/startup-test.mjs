import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('kancolle-safety.user.js','utf8');
for(const readyState of ['complete','interactive','loading']){
 const nodes={'.chip':{},'.body':{},'.panel':{classList:{toggle(){}}}};
 const root={set innerHTML(v){},querySelector:s=>nodes[s],querySelectorAll:()=>[],addEventListener(){}};
 const docListeners={},winListeners={};
 const doc={readyState,documentElement:{appendChild(){}},body:{appendChild(){}},createElement:()=>({style:{},attachShadow:()=>root}),addEventListener:(k,f)=>docListeners[k]=f,querySelectorAll:()=>[]};
 const window={addEventListener:(k,f)=>winListeners[k]=f};
 vm.runInNewContext(source,{window,document:doc,localStorage:{getItem:()=>null},URL,console,setTimeout:()=>0,clearTimeout(){}});
 if(readyState==='loading')docListeners.DOMContentLoaded();
 assert.ok(nodes['.body'].innerHTML.includes('第4艦隊'),readyState+': totals must render on first startup');
 winListeners.message({origin:'https://example.kancolle-server.com',data:{__KCS_SAFE25_API__:{path:'/kcsapi/api_port/port',data:{api_ship:[{api_id:1,api_lv:10,api_nowhp:20,api_maxhp:20,api_slot:[],api_taiku:[10],api_karyoku:[20],api_taisen:[30],api_sakuteki:[40]}],api_deck_port:[{api_id:1,api_ship:[1]}]}}}});
 assert.ok(nodes['.chip'].textContent.includes('待機'));
 assert.ok(nodes['.body'].innerHTML.includes('<td>10</td>'));
}
console.log('PASS: actual startup and port-message rendering in complete/interactive/loading documents');
