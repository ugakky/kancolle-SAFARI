// ==UserScript==
// @name         艦これ Safari Safety v2.5
// @namespace    https://github.com/ugakky/kancolle-SAFARI
// @version      2.5.4
// @description  受動API表示・大破警告・ダメコン判定・画面端ブロッカー・艦これDB書き出し・ローカルスクショ
// @match        *://*.dmm.com/*
// @run-at       document-start
// @inject-into  content
// @noframes
// @grant        none
// ==/UserScript==

(() => {
'use strict';

const VERSION='2.5.4';
const API_MSG='__KCS_SAFE25_API__', SHOT_REQ='__KCS_SAFE25_SCREENSHOT_REQ__', SHOT_RES='__KCS_SAFE25_SCREENSHOT_RES__';
const CFG_KEY='__KCS_SAFE25_CONFIG__';
const DEFAULT_CFG={guardRight:0.58,guardTop:0.08,guardBottom:0.96};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)));
const arr=v=>Array.isArray(v)?v:[];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hpArray=a=>Array.isArray(a)?((a[0]<0?a.slice(1):a).map(Number)):[];
const deckIds=a=>arr(a).map(Number).filter(x=>x>0);
const pathTail=p=>String(p||'').split('/').filter(Boolean).pop()||'';

function loadCfg(){try{return {...DEFAULT_CFG,...JSON.parse(localStorage.getItem(CFG_KEY)||'{}')};}catch(_){return {...DEFAULT_CFG};}}
const C=loadCfg();
function saveCfg(){try{localStorage.setItem(CFG_KEY,JSON.stringify(C));}catch(_){}}

const S={
  master:{raw:{},ships:new Map(),slots:new Map()},
  ships:new Map(),slots:new Map(),decks:new Map(),memberRaw:new Map(),latestRaw:new Map(),capturedAt:new Map(),
  quests:new Map(),questPages:new Set(),questViews:new Map(),questMeta:{},
  airBases:new Map(),airExpanded:new Map(),airAreas:new Set(),
  combined:0,sortieDeck:1,fleet1:[],fleet2:[],hpAfter:new Map(),dcUncertain:new Set(),
  sortie:null,completedSorties:[],apiCount:0,lastApi:'',bridge:false,
  uncertain:false,uncertainReason:'',choice:false,guard:null,guardActive:false,taps:[],
  ui:null,tab:'fleet',screenshotPending:new Map(),gameWindow:null,
  material:[],useitems:[],basic:{},ndocks:[],kdocks:[],missions:{},mapinfo:[]
};

window.addEventListener('message',e=>{
  const d=e?.data?.[API_MSG];
  if(d){
    try{
      const h=new URL(e.origin).hostname;
      if(!/(^|\.)kancolle-server\.com$/i.test(h)&&!/^203\.104\.209\.\d+$/.test(h))return;
    }catch(_){return;}
    S.gameWindow=e.source||S.gameWindow;
    onApi(d);
    return;
  }
  const shot=e?.data?.[SHOT_RES];
  if(shot){
    const p=S.screenshotPending.get(String(shot.requestId||''));
    if(!p)return;
    S.screenshotPending.delete(String(shot.requestId));
    clearTimeout(p.timer);
    if(shot.error)p.reject(new Error(shot.error));else p.resolve(shot.blob);
  }
});

boot();

function onApi(d){
  const p=String(d.path||'');
  if(!p.startsWith('/kcsapi/'))return;
  S.bridge=true;S.apiCount++;S.lastApi=pathTail(p);
  S.latestRaw.set(p,d.data);S.capturedAt.set(p,d.captured_at||new Date().toISOString());
  if(p==='/kcsapi/__safe25_heartbeat__'){render();return;}
  try{
    if(p==='/kcsapi/api_start2/getData')ingestMaster(d.data);
    if(p==='/kcsapi/api_port/port')ingestPort(d.data);
    if(p.startsWith('/kcsapi/api_get_member/'))ingestMember(p,d.data,d.request||{});
    ingestStateFragments(d.data);
    if(p==='/kcsapi/api_req_map/start')startSortie(d);
    else if(p==='/kcsapi/api_req_map/next')mapNext(d.data);
    else if(isBattle(p))readBattle(p,d.data);
    else if(p.endsWith('/battleresult'))battleResult(p,d.data);
    else if(p.includes('/goback_port')){finishSortie('goback_port');endChoice();}
    if(p.endsWith('/base_air_corps')||p.startsWith('/kcsapi/api_req_air_corps/'))mergeBases(d.data,d.request||{});
    if(p.endsWith('/mapinfo'))mergeMapInfo(d.data);
    if(p.endsWith('/questlist'))mergeQuests(d.data,d.request||{});
    refreshFleets();render();
  }catch(err){
    S.uncertain=true;S.uncertainReason=`解析エラー: ${pathTail(p)}`;
    console.error('[KCS Safe25]',err);render();
  }
}

function ingestMaster(d){
  S.master.raw=d||{};S.master.ships.clear();S.master.slots.clear();
  for(const x of arr(d?.api_mst_ship))if(Number(x?.api_id)>0)S.master.ships.set(Number(x.api_id),x);
  for(const x of arr(d?.api_mst_slotitem))if(Number(x?.api_id)>0)S.master.slots.set(Number(x.api_id),x);
}
function ingestPort(d){
  if(S.sortie)finishSortie('port');
  ingestShips(d?.api_ship);ingestDecks(d?.api_deck_port);
  S.material=arr(d?.api_material);S.ndocks=arr(d?.api_ndock);S.basic=d?.api_basic||S.basic;
  if(Number.isFinite(d?.api_combined_flag))S.combined=Number(d.api_combined_flag);
  S.hpAfter.clear();S.dcUncertain.clear();S.uncertain=false;S.uncertainReason='';S.choice=false;hideGuard();
}
function ingestMember(p,d,request={}){
  const key=p.replace('/kcsapi/api_get_member/','');S.memberRaw.set(key,d);
  if(key==='ship2'||key==='ship3'||key==='ship_deck'){
    ingestShips(Array.isArray(d)?d:(d?.api_ship_data||d?.api_ship));ingestDecks(d?.api_deck_data||d?.api_deck_port);
  }else if(key==='slot_item')ingestSlots(d);
  else if(key==='deck')ingestDecks(Array.isArray(d)?d:d?.api_deck_data);
  else if(key==='material')S.material=arr(d);
  else if(key==='useitem')S.useitems=arr(d);
  else if(key==='basic')S.basic=d||{};
  else if(key==='ndock')S.ndocks=arr(d);
  else if(key==='kdock')S.kdocks=arr(d);
  else if(key==='mission')S.missions=d||{};
  else if(key==='mapinfo')mergeMapInfo(d);
  else if(key==='base_air_corps')mergeBases(d,request);
  else if(key==='questlist')mergeQuests(d,request);
  else if(key==='require_info'){
    ingestSlots(d?.api_slot_item);
    S.useitems=arr(d?.api_useitem).length?arr(d.api_useitem):S.useitems;
    S.kdocks=arr(d?.api_kdock).length?arr(d.api_kdock):S.kdocks;
    if(d?.api_basic)S.basic=d.api_basic;
  }
}
function ingestStateFragments(d){
  if(!d||typeof d!=='object')return;
  if(Array.isArray(d.api_ship_data))ingestShips(d.api_ship_data);
  if(Array.isArray(d.api_ship))ingestShips(d.api_ship);
  if(Array.isArray(d.api_deck_data))ingestDecks(d.api_deck_data);
  if(Array.isArray(d.api_deck_port))ingestDecks(d.api_deck_port);
  if(Array.isArray(d.api_slot_data))ingestSlots(d.api_slot_data);
  if(Array.isArray(d.api_material))S.material=d.api_material;
}
function ingestShips(list){if(!Array.isArray(list))return;for(const x of list)if(Number(x?.api_id)>0){S.ships.set(Number(x.api_id),{...S.ships.get(Number(x.api_id)),...x});S.dcUncertain.delete(Number(x.api_id));}}
function ingestSlots(list){if(!Array.isArray(list))return;for(const x of list)if(Number(x?.api_id)>0)S.slots.set(Number(x.api_id),x);}
function ingestDecks(list){if(!Array.isArray(list))return;for(const x of list)if(Number(x?.api_id)>0)S.decks.set(Number(x.api_id),x);}

function mergeMapInfo(d){
  const list=Array.isArray(d)?d:arr(d?.api_map_info||d?.api_mapinfo);
  if(list.length)S.mapinfo=list;
  // mapinfo itself carries api_air_base on current Kancolle. Capture it passively here too.
  mergeBases(d?.api_air_base||d?.api_air_base_corps||[],{});
  for(const x of arr(d?.api_air_base_expanded_info)){
    const area=Number(x?.api_area_id||x?.api_maparea_id||0),rid=Number(x?.api_rid||x?.api_id||0);
    if(area>0)S.airAreas.add(area);
    S.airExpanded.set(`${area}:${rid}`,x);
  }
}
function baseList(d){
  if(Array.isArray(d))return d;
  if(Array.isArray(d?.api_base_air_corps))return d.api_base_air_corps;
  if(Array.isArray(d?.api_air_base_corps))return d.api_air_base_corps;
  if(Array.isArray(d?.api_air_base))return d.api_air_base;
  if(Array.isArray(d?.api_list))return d.api_list;
  if(d&&typeof d==='object'&&(d.api_area_id||d.api_rid)&&d.api_plane_info)return[d];
  return[];
}
function mergeBases(d,request={}){
  const requestArea=Number(request?.api_area_id||0);
  if(requestArea>0)S.airAreas.add(requestArea);
  baseList(d).forEach((x,i)=>{
    const area=Number(x?.api_area_id||x?.api_maparea_id||requestArea||0);
    const rid=Number(x?.api_rid||x?.api_id||i+1);
    if(area>0)S.airAreas.add(area);
    S.airBases.set(`${area}:${rid}`,{...x,__safe25_area_id:area,__safe25_rid:rid});
  });
}
function mergeQuests(d,request={}){
  const pg=Number(request?.api_page_no||d?.api_disp_page||0);
  const tab=Number.isFinite(Number(request?.api_tab_id))?Number(request.api_tab_id):-1;
  if(pg>0)S.questPages.add(pg);
  const list=arr(d?.api_list).filter(q=>q&&typeof q==='object');
  for(const q of list)if(Number(q?.api_no)>0)S.quests.set(Number(q.api_no),q);
  const count=Number(d?.api_count??list.length);
  const pageCount=Number(d?.api_page_count||0);
  if(tab>=0||pg>0){
    const key=`${tab}:${pg||0}`;
    S.questViews.set(key,{tab_id:tab,page_no:pg||0,api_count:count,list_count:list.length,captured_at:new Date().toISOString()});
  }
  S.questMeta={
    count:Number.isFinite(count)?count:(S.questMeta.count||S.quests.size),
    page_count:pageCount||S.questMeta.page_count||0,
    disp_page:pg||S.questMeta.disp_page||0,
    exec_count:Number(d?.api_exec_count||S.questMeta.exec_count||0)
  };
}
function questsComplete(){
  const pageCount=Number(S.questMeta.page_count||0);
  if(pageCount>0)return S.questPages.size>=pageCount;
  // 現行APIではtab 0=全て。全タブ応答のapi_count件が一度に揃った場合を完全取得とみなす。
  return [...S.questViews.values()].some(v=>v.tab_id===0&&v.api_count>=0&&v.list_count>=v.api_count);
}

function fleetIds(id){return deckIds(S.decks.get(Number(id))?.api_ship);}
function refreshFleets(){S.fleet1=fleetIds(S.sortieDeck);S.fleet2=(S.sortieDeck===1&&S.combined>0)?fleetIds(2):[];}
function finishSortie(reason){
  if(!S.sortie)return;
  S.sortie.ended_at=new Date().toISOString();S.sortie.ended_reason=reason;
  S.completedSorties.unshift(S.sortie);S.completedSorties=S.completedSorties.slice(0,20);S.sortie=null;
}
function startSortie(d){
  if(S.sortie)finishSortie('superseded_by_new_sortie');
  S.sortieDeck=Number(d?.request?.api_deck_id||1);refreshFleets();
  S.hpAfter.clear();S.dcUncertain.clear();S.uncertain=false;S.uncertainReason='';S.choice=false;hideGuard();
  S.sortie={
    started_at:new Date().toISOString(),deck_id:S.sortieDeck,
    maparea_id:Number(d?.request?.api_maparea_id||d?.data?.api_maparea_id||0),
    mapinfo_no:Number(d?.request?.api_mapinfo_no||d?.data?.api_mapinfo_no||0),
    nodes:[nodeLite(d.data)],events:[eventLite(d.path,d.data)]
  };
}
function mapNext(d){S.choice=false;hideGuard();if(S.sortie){S.sortie.nodes.push(nodeLite(d));S.sortie.events.push(eventLite('/kcsapi/api_req_map/next',d));}}
function nodeLite(d){return{at:new Date().toISOString(),no:Number(d?.api_no||0),next:Number(d?.api_next||0),color:Number(d?.api_color_no||0),event_id:Number(d?.api_event_id||0),event_kind:Number(d?.api_event_kind||0),boss:Number(d?.api_bosscell_no||0)};}
function eventLite(path,d){return{at:new Date().toISOString(),path,data:d};}
function isBattle(p){return /\/api_req_(sortie|combined_battle|battle_midnight)\//.test(p)&&!p.endsWith('/battleresult')&&!p.includes('/goback_port');}

function applyAir(hp,k){
  if(!k||typeof k!=='object')return;
  indexed(hp,k?.api_stage3?.api_fdam,0);
  indexed(hp,k?.api_stage3_combined?.api_fdam,6);
}
function hasFriendlyDamage(v){
  if(!v||typeof v!=='object')return false;
  if(Array.isArray(v.api_fdam)&&v.api_fdam.some(x=>Number(x)>0))return true;
  if(Array.isArray(v))return v.some(hasFriendlyDamage);
  return Object.values(v).some(x=>x&&typeof x==='object'&&hasFriendlyDamage(x));
}
function unhandledFriendlyDamage(d){
  const handled=new Set(['api_kouku','api_kouku2','api_injection_kouku','api_injection_kouku2','api_opening_atack','api_opening_taisen','api_hougeki1','api_hougeki2','api_hougeki3','api_hougeki','api_n_hougeki1','api_n_hougeki2','api_raigeki','api_raigeki_combined']);
  const safeEnemyOnly=new Set(['api_air_base_attack','api_support_info','api_friendly_info','api_friendly_battle']);
  for(const [k,v] of Object.entries(d||{})){
    if(handled.has(k)||safeEnemyOnly.has(k)||v==null)continue;
    if(hasFriendlyDamage(v))return k;
  }
  return '';
}
function readBattle(p,d){
  refreshFleets();
  const order=[...S.fleet1,...S.fleet2];
  for(const id of order)if(damage(hp(id)).kind==='danger'&&damageControl(id).protected)S.dcUncertain.add(id);
  if(!Array.isArray(d?.api_f_nowhps)||!Array.isArray(d?.api_f_maxhps)){
    S.uncertain=true;S.uncertainReason=`HP配列なし: ${pathTail(p)}`;if(S.sortie)S.sortie.events.push(eventLite(p,d));return;
  }
  const n1=hpArray(d.api_f_nowhps),m1=hpArray(d.api_f_maxhps),n2=hpArray(d.api_f_nowhps_combined),m2=hpArray(d.api_f_maxhps_combined);
  const now=[...n1,...n2].map(x=>Math.max(0,Number(x)||0)),max=[...m1,...m2];
  if(order.length<Math.min(now.length,6)){
    S.uncertain=true;S.uncertainReason='艦隊とHPの対応を確認できません';if(S.sortie)S.sortie.events.push(eventLite(p,d));return;
  }

  applyAir(now,d.api_injection_kouku);applyAir(now,d.api_injection_kouku2);
  applyAir(now,d.api_kouku);applyAir(now,d.api_kouku2);
  indexed(now,d.api_opening_atack?.api_fdam,0);
  shell(now,d.api_opening_taisen);shell(now,d.api_hougeki1);shell(now,d.api_hougeki2);shell(now,d.api_hougeki3);
  shell(now,d.api_hougeki);shell(now,d.api_n_hougeki1);shell(now,d.api_n_hougeki2);
  indexed(now,d.api_raigeki?.api_fdam,0);indexed(now,d.api_raigeki_combined?.api_fdam,6);

  const unknown=unhandledFriendlyDamage(d);
  if(unknown){
    S.uncertain=true;S.uncertainReason=`未対応ダメージフェーズ: ${unknown}`;
  }else{
    S.uncertain=false;S.uncertainReason='';
  }

  for(let i=0;i<Math.min(order.length,now.length,max.length);i++){
    const value=Math.max(0,Math.trunc(now[i]));
    S.hpAfter.set(order[i],{now:value,max:Math.max(1,Math.trunc(max[i])),source:'battle-calc'});
    if(value<=0){
      S.dcUncertain.add(order[i]);
      S.uncertain=true;S.uncertainReason='轟沈/ダメコン発動の可能性があるため艦データ再受信まで確認不能';
    }
  }
  if(S.sortie)S.sortie.events.push(eventLite(p,d));
}
function indexed(hp,a,off=0){
  if(!Array.isArray(a))return;
  const values=a[0]<0?a.slice(1):a;
  values.forEach((v,i)=>{const n=Number(v),k=i+off;if(Number.isFinite(n)&&n>0&&k<hp.length)hp[k]-=Math.trunc(n);});
}
function shell(hp,h){
  if(!h||!Array.isArray(h.api_df_list)||!Array.isArray(h.api_damage))return;
  const ef=h.api_at_eflag;
  for(let i=0;i<Math.min(h.api_df_list.length,h.api_damage.length);i++){
    if(Array.isArray(ef)&&Number(ef[i])!==1)continue;
    const ts=arr(h.api_df_list[i]),ds=arr(h.api_damage[i]);
    for(let z=0;z<Math.min(ts.length,ds.length);z++){
      let k=Number(ts[z]),n=Number(ds[z]);
      if(!Number.isFinite(k)||!Number.isFinite(n)||n<=0)continue;
      if(!Array.isArray(ef)){if(k<1||k>6)continue;k--;}
      if(k>=0&&k<hp.length)hp[k]-=Math.trunc(n);
    }
  }
}
function battleResult(p,d){S.choice=true;if(S.sortie)S.sortie.events.push(eventLite(p,d));applyGuardDecision();}
function endChoice(){S.choice=false;S.hpAfter.clear();S.dcUncertain.clear();hideGuard();}

function hp(id){if(S.hpAfter.has(id))return S.hpAfter.get(id);const x=S.ships.get(Number(id));return Number.isFinite(x?.api_nowhp)?{now:Number(x.api_nowhp),max:Number(x.api_maxhp),source:'server'}:null;}
function damage(h){if(!h||!Number.isFinite(h.now)||!Number.isFinite(h.max))return{text:'不明',kind:'unknown'};if(h.now<=0||h.now*4<=h.max)return{text:'大破',kind:'danger'};if(h.now*2<=h.max)return{text:'中破',kind:'warn'};if(h.now*4<=h.max*3)return{text:'小破',kind:'minor'};return{text:'健在',kind:'ok'};}
function slotMasterId(instanceId){return Number(S.slots.get(Number(instanceId))?.api_slotitem_id||0);}
function damageControl(id){
  const x=S.ships.get(Number(id));if(!x)return{protected:false,verified:false,label:'艦データなし'};
  if(S.dcUncertain.has(Number(id)))return{protected:false,verified:false,label:'ダメコン発動有無の再確認必要'};
  const ids=[...arr(x.api_slot),Number(x.api_slot_ex||-1)].map(Number).filter(v=>v>0);
  if(!ids.length)return{protected:false,verified:true,label:'なし'};
  let unresolved=false;
  for(const iid of ids){
    const mid=slotMasterId(iid);if(!mid){unresolved=true;continue;}
    const name=S.master.slots.get(mid)?.api_name||'';
    if(mid===42||mid===43||name==='応急修理要員'||name==='応急修理女神')return{protected:true,verified:true,label:mid===43||name==='応急修理女神'?'女神':'修理要員'};
  }
  return unresolved?{protected:false,verified:false,label:'装備照合不可'}:{protected:false,verified:true,label:'なし'};
}
function shipView(id){
  const x=S.ships.get(Number(id))||{},m=S.master.ships.get(Number(x.api_ship_id))||{},h=hp(id),d=damage(h),dc=damageControl(id);
  const fuelMax=Number(m.api_fuel_max||0),ammoMax=Number(m.api_bull_max||0),fuel=Number(x.api_fuel),ammo=Number(x.api_bull);
  const fr=fuelMax>0&&Number.isFinite(fuel)?fuel/fuelMax:null,ar=ammoMax>0&&Number.isFinite(ammo)?ammo/ammoMax:null;
  return{id:Number(id),ship_id:Number(x.api_ship_id||0),name:m.api_name||`艦ID ${id}`,lv:x.api_lv??'?',cond:Number.isFinite(x.api_cond)?Number(x.api_cond):null,hp:h,damage:d,damage_control:dc,fuel:Number.isFinite(fuel)?fuel:null,fuel_max:fuelMax||null,fuel_ratio:fr,ammo:Number.isFinite(ammo)?ammo:null,ammo_max:ammoMax||null,ammo_ratio:ar,ammo_damage_modifier:ar===null?null:Math.min(1,Math.max(0,ar*2)),fuel_penalty:fr===null?null:fr<0.6,slots:arr(x.api_slot),slot_ex:Number(x.api_slot_ex||-1)};
}
function currentFleet(){return[...S.fleet1,...S.fleet2].map(shipView);}
function guardState(){
  const heavy=currentFleet().filter(x=>x.damage.kind==='danger');
  if(S.uncertain)return{level:'red',heavy,block:true,text:`判定不明: ${S.uncertainReason}`};
  if(!heavy.length)return{level:'ok',heavy,block:false,text:'大破なし'};
  const unsafe=heavy.filter(x=>!x.damage_control.protected);
  if(unsafe.length)return{level:'red',heavy,block:true,text:`大破 ${unsafe.length}隻：ダメコン未確認`};
  return{level:'yellow',heavy,block:false,text:`大破 ${heavy.length}隻：ダメコン確認済`};
}
function applyGuardDecision(){const g=guardState();if(g.block)showGuard(g);else hideGuard();render();}

function gameRect(){
  const frames=[...document.querySelectorAll('iframe')];
  let f=frames.find(x=>/kancolle-server|203\.104\.209\./i.test(x.src||''))||frames.sort((a,b)=>{const A=a.getBoundingClientRect(),B=b.getBoundingClientRect();return(B.width*B.height)-(A.width*A.height);})[0];
  if(!f)return null;
  const r=f.getBoundingClientRect();if(r.width<100||r.height<60)return null;
  const aspect=1200/720;let w=r.width,h=r.height,left=r.left,top=r.top;
  if(w/h>aspect){w=h*aspect;left=r.left+(r.width-w)/2;}else{h=w/aspect;top=r.top+(r.height-h)/2;}
  return{left,top,width:w,height:h,right:left+w,bottom:top+h};
}
function ensureGuard(){
  if(S.guard?.isConnected)return S.guard;
  const g=document.createElement('div');g.id='__kcs_safe25_guard';
  g.style.cssText='position:fixed;z-index:2147483646;display:none;align-items:center;justify-content:center;text-align:center;background:rgba(176,0,32,.48);border:3px solid rgba(255,255,255,.9);color:white;font:900 clamp(15px,2.5vw,28px)/1.4 -apple-system,BlinkMacSystemFont,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none;';
  const st=document.createElement('style');st.textContent='#__kcs_safe25_guard .guard-dismiss{position:absolute;right:0;top:50%;transform:translate(50%,-50%);z-index:2;border:2px solid #fff;border-radius:999px;background:#2a2d36;color:#fff;padding:10px 12px;font:800 13px/1 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 2px 10px #0009;white-space:nowrap;touch-action:manipulation}';
  document.documentElement.appendChild(st);
  const stop=e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();if(e.target?.closest?.('[data-guard-dismiss]')){dismissGuard();return;}guardTap();};
  g.addEventListener('pointerdown',stop,{capture:true});g.addEventListener('click',stop,{capture:true});
  document.documentElement.appendChild(g);S.guard=g;return g;
}
function showGuard(gs){const g=ensureGuard();S.guardActive=true;S.taps=[];g.innerHTML=`<div>🚨 大破進撃ブロック<br><small>${esc(gs.text)}<br>赤い範囲では進撃操作を遮断します</small></div><button type="button" class="guard-dismiss" data-guard-dismiss>解除</button>`;positionGuard();}
function hideGuard(){S.guardActive=false;S.taps=[];if(S.guard)S.guard.style.display='none';}
function positionGuard(){
  if(!S.guard||!S.guardActive)return;const r=gameRect();if(!r){S.guard.style.display='none';return;}
  const right=clamp(r.left+r.width*C.guardRight,120,window.innerWidth),top=clamp(r.top+r.height*C.guardTop,0,window.innerHeight-80),bottom=clamp(r.top+r.height*C.guardBottom,top+80,window.innerHeight);
  S.guard.style.left='0px';S.guard.style.top=`${Math.round(top)}px`;S.guard.style.width=`${Math.round(right)}px`;S.guard.style.height=`${Math.round(bottom-top)}px`;S.guard.style.display='flex';
}
function temporarilyHideGuard(){if(!S.guardActive||!S.guard)return;S.guard.style.display='none';S.taps=[];setTimeout(()=>{if(S.guardActive)positionGuard();},5000);}
function dismissGuard(){S.guardActive=false;S.taps=[];if(S.guard)S.guard.style.display='none';}
function guardTap(){const now=Date.now();S.taps=S.taps.filter(t=>now-t<2400);S.taps.push(now);if(S.taps.length>=3)temporarilyHideGuard();}
window.addEventListener('resize',positionGuard,{passive:true});visualViewport?.addEventListener('resize',positionGuard,{passive:true});visualViewport?.addEventListener('scroll',positionGuard,{passive:true});

function condText(c){if(c==null)return'?';if(c>=50)return`✨${c}`;if(c>=40)return`${c}`;if(c>=30)return`△${c}`;if(c>=20)return`🟠${c}`;return`🔴${c}`;}
function pct(v){return v==null?'?':`${Math.round(v*100)}%`;}
function fleetHtml(){
  const rows=currentFleet().map(x=>`<tr class="${x.damage.kind}"><td>${esc(x.name)} Lv${x.lv}</td><td>${x.hp?`${x.hp.now}/${x.hp.max}`:'?'} ${x.damage.text}</td><td>${condText(x.cond)}</td><td>${x.fuel??'?'} / ${x.fuel_max??'?'} (${pct(x.fuel_ratio)})${x.fuel_penalty?' ⚠燃料':''}</td><td>${x.ammo??'?'} / ${x.ammo_max??'?'} (${pct(x.ammo_ratio)})${x.ammo_damage_modifier!=null&&x.ammo_damage_modifier<1?` ⚠与ダメ目安${Math.round(x.ammo_damage_modifier*100)}%`:''}</td><td>${x.damage_control.verified?(x.damage_control.protected?'🟡'+x.damage_control.label:'—'):'⚠'+x.damage_control.label}</td></tr>`).join('');
  return`<div class="note">燃料/弾薬は最後にサーバーから受信した艦データ基準。推測値で現在値を偽装しません。</div><table><thead><tr><th>艦</th><th>HP</th><th>Cond</th><th>燃料</th><th>弾薬</th><th>ダメコン</th></tr></thead><tbody>${rows||'<tr><td colspan="6">母港→編成を表示してください</td></tr>'}</tbody></table>`;
}
function coverage(){
  return[
    ['マスター',S.master.ships.size>0],['提督',Object.keys(S.basic||{}).length>0],['艦娘',S.ships.size>0],['装備',S.slots.size>0],
    ['艦隊',S.decks.size>0],['資源',S.material.length>0],['資材/アイテム',S.useitems.length>0],['入渠',S.ndocks.length>0],
    ['建造',S.kdocks.length>0],['遠征',Object.keys(S.missions||{}).length>0],['任務全件',questsComplete()],['海域',S.mapinfo.length>0],
    ['基地航空隊',S.airBases.size>0],['出撃ログ',!!S.sortie||S.completedSorties.length>0]
  ];
}
function dataHtml(){
  const c=coverage(),done=c.filter(x=>x[1]).length;
  return`<div class="big">取得 ${done}/${c.length}</div><div class="badges">${c.map(([n,o])=>`<span>${o?'✅':'❌'}${n}</span>`).join('')}</div><div class="note">基地 ${S.airBases.size} (方面 ${[...S.airAreas].sort((a,b)=>a-b).join(',')||'未取得'}) / 任務 ${S.quests.size}件・表示 ${S.questViews.size} / API ${S.apiCount}<br>任務は「全て」タブ、基地航空隊は基地のある各方面を通常操作で表示してください。追加APIは送信しません。</div>`;
}
function settingsHtml(){return`<div class="set"><label>ブロッカー右端 <input data-c="guardRight" type="range" min="0.25" max="1" step="0.01" value="${C.guardRight}"> ${Math.round(C.guardRight*100)}%</label><label>上端 <input data-c="guardTop" type="range" min="0" max="0.7" step="0.01" value="${C.guardTop}"></label><label>下端 <input data-c="guardBottom" type="range" min="0.3" max="1" step="0.01" value="${C.guardBottom}"></label><div class="note">ブロッカー上を3回タップすると5秒だけ一時解除。右端の「解除」はその警告中のブロッカーを解除します。</div><button data-a="preview">ブロッカー確認</button><div class="note">左端は常にブラウザ画面端(0px)固定。拡大率やゲーム表示位置に関係なく左側へ隙間を作りません。</div></div>`;}

function ensureUi(){
  if(S.ui||!document.documentElement)return;
  const host=document.createElement('div');host.id='__kcs_safe25_ui';host.style.cssText='position:fixed;right:8px;top:52px;z-index:2147483645;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif';
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>*{box-sizing:border-box}button{font:inherit}.chip{border:2px solid #fff;border-radius:999px;padding:9px 13px;font-weight:900;min-height:42px;box-shadow:0 3px 12px #0008}.chip.ok{background:#254d34;color:#fff}.chip.yellow{background:#f4c430;color:#111}.chip.red{background:#b00020;color:#fff;animation:blink .75s steps(2,end) infinite}@keyframes blink{50%{background:#fff;color:#b00020;border-color:#b00020}}.panel{display:none;position:fixed;right:8px;top:98px;width:min(96vw,760px);max-height:82vh;overflow:auto;background:#15171df5;color:#fff;border:1px solid #ffffff44;border-radius:14px;padding:12px;box-shadow:0 10px 30px #0009;font-size:12px}.panel.open{display:block}.top{display:flex;gap:6px;align-items:center;position:sticky;top:-12px;background:#15171df8;padding:8px 0;z-index:2}.top b{flex:1;font-size:15px}.btn,.set button{border:1px solid #ffffff44;border-radius:8px;background:#2a2d36;color:#fff;padding:8px 10px}.tabs{display:flex;gap:6px;margin:6px 0}.tabs button.on{background:#fff;color:#111}table{width:100%;border-collapse:collapse}th,td{padding:6px;border-bottom:1px solid #ffffff22;text-align:left;white-space:nowrap}.danger td{background:#5d1420}.warn td{background:#59451b}.note{opacity:.8;line-height:1.55;margin:7px 0}.badges{display:flex;flex-wrap:wrap;gap:7px;line-height:1.8}.big{font-size:18px;font-weight:900}.set{display:grid;gap:12px}.set label{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center}</style><button class="chip ok" data-a="toggle">⚓ 待機</button><div class="panel"><div class="top"><b>艦これ Safety v${VERSION}</b><button class="btn" data-a="shot">📷スクショ</button><button class="btn" data-a="export">💾書き出し</button><button class="btn" data-a="close">閉じる</button></div><div class="tabs"><button class="btn" data-tab="fleet">艦隊</button><button class="btn" data-tab="data">取得状況</button><button class="btn" data-tab="settings">ブロッカー調整</button></div><div class="body"></div></div>`;
  (document.body||document.documentElement).appendChild(host);S.ui={host,root};root.addEventListener('click',uiClick);root.addEventListener('input',uiInput);render();
}
function openPanel(on=true){ensureUi();S.ui?.root.querySelector('.panel')?.classList.toggle('open',on);}
function uiClick(e){
  const a=e.target?.dataset?.a,t=e.target?.dataset?.tab;
  if(t){S.tab=t;render();return;}
  if(a==='toggle')S.ui.root.querySelector('.panel').classList.toggle('open');
  else if(a==='close')openPanel(false);
  else if(a==='export')exportDb();
  else if(a==='shot')takeScreenshot();
  else if(a==='preview'){
    S.guardActive=true;ensureGuard().innerHTML='<div>ブロッカー範囲プレビュー<br><small>左端は常に画面端</small></div><button type="button" class="guard-dismiss" data-guard-dismiss>解除</button>';
    positionGuard();setTimeout(()=>{if(!S.choice)hideGuard();else applyGuardDecision();},3000);
  }
}
function uiInput(e){const k=e.target?.dataset?.c;if(!k)return;C[k]=Number(e.target.value);saveCfg();positionGuard();render();}
function render(){
  ensureUi();if(!S.ui)return;const gs=guardState(),chip=S.ui.root.querySelector('.chip');
  chip.className=`chip ${gs.level==='red'?'red':gs.level==='yellow'?'yellow':'ok'}`;
  chip.textContent=gs.level==='red'?'🚨 大破':gs.level==='yellow'?'⚠ 大破(ダメコン)':'⚓ '+(S.sortie?'出撃中':'待機');
  S.ui.root.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('on',b.dataset.tab===S.tab));
  S.ui.root.querySelector('.body').innerHTML=S.tab==='fleet'?fleetHtml():S.tab==='data'?dataHtml():settingsHtml();
}
function boot(){const f=()=>{ensureUi();render();};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',f,{once:true});else f();}

function materialObject(){
  const names={1:'fuel',2:'ammo',3:'steel',4:'bauxite',5:'instant_build',6:'bucket',7:'dev_material',8:'screw'},o={};
  for(const x of S.material)o[names[Number(x?.api_id)]||String(x?.api_id)]=Number(x?.api_value||0);return o;
}
function buildDb(){
  const memberRaw=Object.fromEntries([...S.memberRaw.entries()].sort(([a],[b])=>a.localeCompare(b)));
  const latest=Object.fromEntries([...S.latestRaw.entries()].filter(([p])=>p!=='/kcsapi/api_start2/getData').sort(([a],[b])=>a.localeCompare(b)));
  return{
    generated_at:new Date().toISOString(),
    meta:{name:'かんこれDB',version:VERSION,source:'passive observer',passive_only:true,no_extra_requests:true,no_automation:true,request_body_saved:false,api_token_saved:false,cookie_saved:false},
    status:{ships:S.ships.size,equipment:S.slots.size,decks:S.decks.size,quests:S.quests.size,quests_complete:questsComplete(),air_bases:S.airBases.size,air_base_areas:[...S.airAreas].sort((a,b)=>a-b),maps:S.mapinfo.length,coverage:coverage().map(([name,ok])=>({name,ok})),battle_uncertain:S.uncertain,battle_uncertain_reason:S.uncertainReason},
    master:S.master.raw||{},
    member:{
      basic:S.basic,ships:[...S.ships.values()],slot_items:[...S.slots.values()],decks:[...S.decks.values()],
      material:S.material,material_named:materialObject(),useitems:S.useitems,ndocks:S.ndocks,kdocks:S.kdocks,missions:S.missions,mapinfo:S.mapinfo,
      air_bases:[...S.airBases.values()],air_base_expanded_info:[...S.airExpanded.values()],air_base_areas_captured:[...S.airAreas].sort((a,b)=>a-b),
      quests:[...S.quests.values()].sort((a,b)=>Number(a.api_no)-Number(b.api_no)),
      quest_meta:{...S.questMeta,pages_captured:[...S.questPages].sort((a,b)=>a-b),views_captured:[...S.questViews.values()]},
      raw_get_member:memberRaw
    },
    fleet_snapshot:{sortie_deck:S.sortieDeck,combined:S.combined,ships:currentFleet()},
    sortie:{active:S.sortie,completed_this_session:S.completedSorties},
    session:{api_count:S.apiCount,latest_responses:latest,captured_at:Object.fromEntries([...S.capturedAt.entries()].sort(([a],[b])=>a.localeCompare(b)))},
    security:{note:'No request body, api_token or Cookie is exported. Only allowlisted non-secret request metadata is retained in derived state. The tool does not create game-server requests or automate gameplay.'}
  };
}
function stamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;}
function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.style.display='none';document.documentElement.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);}
function exportDb(){downloadBlob(new Blob([JSON.stringify(buildDb(),null,2)],{type:'application/json'}),`かんこれDB_${stamp()}.json`);}
async function takeScreenshot(){
  const requestId=`${Date.now()}_${Math.random().toString(36).slice(2)}`;
  // Use the exact Window that sent the passive API heartbeat/response. On iOS Safari the
  // visible DMM iframe src can be a wrapper URL, so searching iframe.src may target the wrong frame.
  const target=S.gameWindow||[...document.querySelectorAll('iframe')].find(x=>/kancolle-server|203\.104\.209\./i.test(x.src||''))?.contentWindow;
  if(!target){alert('艦これゲームframeを確認できません。ページを再読込してから試してください。');return;}
  try{
    const blob=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{S.screenshotPending.delete(requestId);reject(new Error('timeout'));},4000);S.screenshotPending.set(requestId,{resolve,reject,timer});target.postMessage({[SHOT_REQ]:{requestId}},'*');});
    downloadBlob(blob,`かんこれSS_${stamp()}.png`);
  }catch(e){alert(`スクショ取得失敗: ${e.message}\nブラウザのCanvas保護により取得できない場合があります。`);}
}
})();
