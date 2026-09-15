// ==UserScript==
// @name         艦これ Complete Passive Audit Export (Chrome)
// @namespace    https://github.com/ugakky/kancolle-SAFARI
// @version      0.2.0
// @description  Chrome/Tampermonkey用。通常プレイで受信した艦これAPIレスポンスだけを受動収集して監査JSONを書き出す
// @match        *://*.dmm.com/*
// @match        *://*.kancolle-server.com/*
// @include      *://203.104.209.*/*
// @include      /^https?:\/\/203\.104\.209\.\d+\//
// @run-at       document-start
// @sandbox      raw
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  const VERSION='0.2.0', FLAVOR='Chrome', MESSAGE='__KCS_COMPLETE_AUDIT_V2__';
  const GAME_HOST=/(^|\.)kancolle-server\.com$/i.test(location.hostname)||/^203\.104\.209\.\d+$/.test(location.hostname);
  const DMM_TOP=/(^|\.)dmm\.com$/i.test(location.hostname)&&window.top===window;

  // SAFETY: 独自のXHR/fetchを一切発行しない。ゲーム本体が通常操作で受信した
  // レスポンスだけを読む。request body / api_token / Cookie は保存・転送しない。
  if(GAME_HOST) installObserver();
  if(DMM_TOP) installCollector();

  function wantedPath(url){
    try{
      const p=new URL(String(url||''),location.href).pathname;
      if(!p.startsWith('/kcsapi/')) return '';
      if(p==='/kcsapi/api_start2/getData'||p==='/kcsapi/api_port/port') return p;
      if(p.startsWith('/kcsapi/api_get_member/')) return p;
      if(p.startsWith('/kcsapi/api_req_air_corps/')) return p;
      if(p==='/kcsapi/api_req_hokyu/charge') return p;
      return '';
    }catch(_){return '';}
  }

  function installObserver(){
    if(window.__KCS_COMPLETE_AUDIT_OBSERVER__) return;
    window.__KCS_COMPLETE_AUDIT_OBSERVER__=true;
    const parse=raw=>{try{return JSON.parse(String(raw||'').replace(/^svdata=/,''));}catch(_){return null;}};
    const emit=(url,raw)=>{
      const path=wantedPath(url); if(!path) return;
      const json=parse(raw); if(!json||Number(json.api_result)!==1) return;
      try{window.top.postMessage({[MESSAGE]:{path,captured_at:new Date().toISOString(),data:json.api_data}},'*');}catch(_){}
    };
    try{
      const open=XMLHttpRequest.prototype.open, send=XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open=function(method,url,...rest){this.__kcsAuditUrl=url;return open.call(this,method,url,...rest);};
      XMLHttpRequest.prototype.send=function(body){
        const url=this.__kcsAuditUrl;
        if(wantedPath(url)) this.addEventListener('load',()=>{try{
          let text='';if(!this.responseType||this.responseType==='text') text=this.responseText||'';else if(this.responseType==='json') text=JSON.stringify(this.response||{});emit(url,text);
        }catch(_){}},{once:true});
        return send.call(this,body);
      };
    }catch(e){console.warn('[KCS Audit] XHR observer failed',e);}
    try{
      if(window.fetch){const f=window.fetch;window.fetch=async function(input,init){const r=await f.apply(this,arguments);try{const url=typeof input==='string'?input:input?.url;if(wantedPath(url)) r.clone().text().then(t=>emit(url,t)).catch(()=>{});}catch(_){}return r;};}
    }catch(e){console.warn('[KCS Audit] fetch observer failed',e);}
    console.info(`[KCS Audit] ${FLAVOR} passive observer v${VERSION}`);
  }

  function installCollector(){
    if(window.__KCS_COMPLETE_AUDIT_COLLECTOR__) return;
    window.__KCS_COMPLETE_AUDIT_COLLECTOR__=true;
    const byPath=new Map(), capturedAt=new Map(), quests=new Map(), questPages=new Set(), airBases=new Map(), airExpanded=new Map();
    let questMeta={count:0,page_count:0,disp_page:0,exec_count:0}, host=null;
    const arr=v=>Array.isArray(v)?v:[];
    const trusted=origin=>{try{const h=new URL(origin).hostname;return /(^|\.)kancolle-server\.com$/i.test(h)||/^203\.104\.209\.\d+$/.test(h);}catch(_){return false;}};
    const get=s=>byPath.get(`/kcsapi/${s}`), has=s=>byPath.has(`/kcsapi/${s}`);

    window.addEventListener('message',e=>{
      const p=e?.data?.[MESSAGE];if(!p||!trusted(e.origin)||!String(p.path||'').startsWith('/kcsapi/')) return;
      const path=String(p.path);byPath.set(path,p.data);capturedAt.set(path,p.captured_at||new Date().toISOString());
      if(path.endsWith('/questlist')) mergeQuest(p.data);
      if(path.endsWith('/base_air_corps')||path.startsWith('/kcsapi/api_req_air_corps/')) mergeBases(p.data);
      if(path.endsWith('/mapinfo')) mergeExpanded(p.data);
      render();
    });

    function mergeQuest(d){
      const page=Number(d?.api_disp_page||0);if(page>0) questPages.add(page);
      for(const q of arr(d?.api_list)) if(q&&Number(q.api_no)>0) quests.set(Number(q.api_no),{id:Number(q.api_no||0),title:q.api_title||'',detail:q.api_detail||'',category:Number(q.api_category||0),type:Number(q.api_type||0),label_type:Number(q.api_label_type||0),state:Number(q.api_state||0),progress:Number(q.api_progress_flag||0),bonus_flag:Number(q.api_bonus_flag||0),invalid_flag:Number(q.api_invalid_flag||0),reward_material:arr(q.api_get_material)});
      questMeta={count:Number(d?.api_count||questMeta.count||quests.size),page_count:Number(d?.api_page_count||questMeta.page_count||0),disp_page:page||questMeta.disp_page,exec_count:Number(d?.api_exec_count||questMeta.exec_count||0)};
    }
    function baseList(d){if(Array.isArray(d)) return d;if(Array.isArray(d?.api_base_air_corps)) return d.api_base_air_corps;if(Array.isArray(d?.api_air_base_corps)) return d.api_air_base_corps;if(Array.isArray(d?.api_list)) return d.api_list;if(d&&typeof d==='object'&&(d.api_area_id||d.api_rid)&&d.api_plane_info) return [d];return [];}
    function baseKey(b,i){return `${Number(b?.api_area_id||b?.api_maparea_id||0)}:${Number(b?.api_rid||b?.api_id||i+1)}`;}
    function mergeBases(d){baseList(d).forEach((b,i)=>airBases.set(baseKey(b,i),b));}
    function mergeExpanded(d){arr(d?.api_air_base_expanded_info).forEach((x,i)=>airExpanded.set(`${Number(x?.api_area_id||x?.api_maparea_id||0)}:${Number(x?.api_rid||x?.api_id||i+1)}`,x));}

    function ships(){const sd=get('api_get_member/ship_deck');if(arr(sd?.api_ship_data).length)return sd.api_ship_data;if(arr(sd?.api_ship).length)return sd.api_ship;const s3=get('api_get_member/ship3');if(Array.isArray(s3))return s3;if(arr(s3?.api_ship).length)return s3.api_ship;const s2=get('api_get_member/ship2');if(Array.isArray(s2))return s2;if(arr(s2?.api_ship).length)return s2.api_ship;return arr(get('api_port/port')?.api_ship);}
    function decks(){const sd=get('api_get_member/ship_deck');if(arr(sd?.api_deck_data).length)return sd.api_deck_data;if(arr(sd?.api_deck_port).length)return sd.api_deck_port;const d=get('api_get_member/deck');if(Array.isArray(d))return d;if(arr(d?.api_deck_data).length)return d.api_deck_data;return arr(get('api_port/port')?.api_deck_port);}
    function maps(){const d=get('api_get_member/mapinfo');return Array.isArray(d)?d:arr(d?.api_map_info||d?.api_mapinfo);}

    function coverage(){
      const port=get('api_port/port'),req=get('api_get_member/require_info'),pages=Number(questMeta.page_count||0);
      return [['master','マスター',has('api_start2/getData')],['port','母港',!!port],['profile','提督',has('api_get_member/basic')||!!port?.api_basic||!!req?.api_basic],['ships','艦娘',ships().length>0],['equipment','装備',has('api_get_member/slot_item')||arr(req?.api_slot_item).length>0],['decks','艦隊',decks().length>0],['material','資源',has('api_get_member/material')||arr(port?.api_material).length>0],['useitems','アイテム',has('api_get_member/useitem')||arr(req?.api_useitem).length>0],['ndocks','入渠',has('api_get_member/ndock')||arr(port?.api_ndock).length>0],['kdocks','建造',has('api_get_member/kdock')||arr(req?.api_kdock).length>0],['missions','遠征',has('api_get_member/mission')],['quests','任務全頁',pages>0&&questPages.size>=pages],['maps','海域',has('api_get_member/mapinfo')],['air_bases','基地航空隊',airBases.size>0]].map(([id,label,ok])=>({id,label,ok}));
    }

    function build(){
      const start=get('api_start2/getData')||{},port=get('api_port/port')||{},req=get('api_get_member/require_info')||{},s=ships(),d=decks(),m=maps();
      const slots=Array.isArray(get('api_get_member/slot_item'))?get('api_get_member/slot_item'):arr(req?.api_slot_item),nd=Array.isArray(get('api_get_member/ndock'))?get('api_get_member/ndock'):arr(port?.api_ndock),kd=Array.isArray(get('api_get_member/kdock'))?get('api_get_member/kdock'):arr(req?.api_kdock),mat=Array.isArray(get('api_get_member/material'))?get('api_get_member/material'):arr(port?.api_material),items=Array.isArray(get('api_get_member/useitem'))?get('api_get_member/useitem'):arr(req?.api_useitem),basic=get('api_get_member/basic')||port?.api_basic||req?.api_basic||{},missions=get('api_get_member/mission')||{},q=[...quests.values()].sort((a,b)=>a.id-b.id),bases=[...airBases.values()],checks=coverage();
      const raw={};for(const [p,v] of byPath)if(p.startsWith('/kcsapi/api_get_member/'))raw[p.replace('/kcsapi/api_get_member/','')]=v;
      return {generated_at:new Date().toISOString(),meta:{source:`kancolle complete audit (${FLAVOR} passive export)`,script_version:VERSION,passive_only:true,api_token_saved:false,request_body_saved:false,note:'No extra requests are generated. Only responses from normal game operations are observed.'},status:{ships:s.length,equipment:slots.length,quests:q.length,air_bases:bases.length,maps:m.length,errors:0,coverage_done:checks.filter(x=>x.ok).length,coverage_total:checks.length},coverage:checks,master:{ships:arr(start.api_mst_ship),ship_graph:arr(start.api_mst_shipgraph),slotitems:arr(start.api_mst_slotitem),slotitem_equiptype:arr(start.api_mst_slotitem_equiptype),stypes:arr(start.api_mst_stype),useitems:arr(start.api_mst_useitem),missions:arr(start.api_mst_mission),mapareas:arr(start.api_mst_maparea),mapinfo:arr(start.api_mst_mapinfo),furniture:arr(start.api_mst_furniture),equip_exslot:arr(start.api_mst_equip_exslot),equip_exslot_ship:start.api_mst_equip_exslot_ship||{}},member:{ships:s,slot_items:slots,decks:d,ndocks:nd,kdocks:kd,material:mat,useitems:items,basic,missions,mapinfo:m,air_bases:bases,air_base_expanded_info:[...airExpanded.values()],require_info:req,quest_meta:{...questMeta,captured:q.length,pages_captured:[...questPages].sort((a,b)=>a-b)},raw_get_member:raw},quests:q,captures:Object.fromEntries([...byPath.keys()].sort().map(p=>[p,true])),captured_at:Object.fromEntries([...capturedAt.entries()].sort(([a],[b])=>a.localeCompare(b))),errors:[]};
    }

    function stamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;}
    function file(){return new File([JSON.stringify(build(),null,2)],`kancolle_final_audit_${stamp()}.json`,{type:'application/json'});}
    function download(){const f=file(),u=URL.createObjectURL(f),a=document.createElement('a');a.href=u;a.download=f.name;a.style.display='none';document.documentElement.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);}
    async function share(){const f=file();try{if(navigator.canShare?.({files:[f]})&&navigator.share)await navigator.share({files:[f],title:'艦これ Audit JSON'});else download();}catch(e){if(e?.name!=='AbortError')download();}}
    function guide(){const miss=coverage().filter(x=>!x.ok).map(x=>x.id),g=[];if(!miss.length)return '主要項目取得済み。基地は表示した方面ごとに蓄積します。';if(miss.includes('master')||miss.includes('port'))g.push('再読込→母港');if(miss.some(x=>['ships','equipment','decks'].includes(x)))g.push('編成→改装/装備');if(miss.includes('ndocks'))g.push('入渠');if(miss.includes('kdocks'))g.push('工廠');if(miss.includes('missions'))g.push('遠征');if(miss.includes('quests'))g.push(`任務全ページ(${questPages.size}/${questMeta.page_count||'?'})`);if(miss.includes('maps'))g.push('出撃→海域選択');if(miss.includes('air_bases'))g.push('基地航空隊のある各方面→基地画面');return g.join(' → ');}
    function render(){
      if(!document.documentElement)return;if(!host){host=document.createElement('div');host.id='kcs-complete-audit-v2';host.style.cssText='position:fixed;right:12px;bottom:12px;z-index:2147483647;font:12px -apple-system,BlinkMacSystemFont,sans-serif;color:#fff;background:rgba(18,22,28,.94);border:1px solid rgba(255,255,255,.22);border-radius:10px;padding:10px;width:min(390px,calc(100vw - 44px));box-shadow:0 4px 18px rgba(0,0,0,.35)';(document.body||document.documentElement).appendChild(host);}const c=coverage(),done=c.filter(x=>x.ok).length,badges=c.map(x=>`<span style="white-space:nowrap;margin-right:6px">${x.ok?'✅':'❌'}${x.label}</span>`).join(' ');host.innerHTML=`<div style="font-weight:700;margin-bottom:5px">📦 艦これ完全監査 ${done}/${c.length}</div><div style="line-height:1.65">${badges}</div><div style="margin-top:5px;color:#ffd58a;line-height:1.45">${guide()}</div><div style="margin-top:7px;display:flex;gap:6px"><button data-a="d">JSON書き出し</button><button data-a="s">共有</button><button data-a="h">隠す</button></div><div style="margin-top:5px;opacity:.7">v${VERSION} ${FLAVOR} / passive-only / 追加API送信なし</div>`;host.querySelectorAll('button').forEach(b=>b.style.cssText='font:inherit;padding:5px 8px;border-radius:6px;border:1px solid #888;background:#f4f4f4;color:#111');host.querySelector('[data-a="d"]').onclick=download;host.querySelector('[data-a="s"]').onclick=share;host.querySelector('[data-a="h"]').onclick=()=>{host.remove();host=null;};
    }
    const boot=()=>{render();console.info(`[KCS Audit] ${FLAVOR} collector v${VERSION} passive-only`);};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }
})();
