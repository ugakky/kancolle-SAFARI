// ==UserScript==
// @name         艦これ Safety Bridge v2.5
// @namespace    https://github.com/ugakky/kancolle-SAFARI
// @version      2.5.0
// @description  通常プレイで受信した状態データだけをローカル転送する受動Bridge。追加通信・自動操作なし
// @match        *://*.kancolle-server.com/*
// @include      *://203.104.209.*/*
// @include      /^https?:\/\/203\.104\.209\.\d+\//
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  const VERSION='2.5.0';
  const API_MSG='__KCS_SAFE25_API__';
  const SHOT_REQ='__KCS_SAFE25_SCREENSHOT_REQ__';
  const SHOT_RES='__KCS_SAFE25_SCREENSHOT_RES__';
  if(window.__KCS_SAFE25_BRIDGE__) return;
  window.__KCS_SAFE25_BRIDGE__=true;

  // SECURITY INVARIANTS
  // 1) このスクリプト自身は XMLHttpRequest/fetch を一度も新規発行しない。
  // 2) ゲームのリクエスト/レスポンスを書き換えない。
  // 3) request body は保存・転送しない。api_token/api_verno等の認証情報は上位frameへ出さない。
  // 4) 自動クリック・自動出撃・自動進撃・自動撤退をしない。

  const pathOf=url=>{try{return new URL(String(url||''),location.href).pathname;}catch(_){return '';}};
  function relevant(path){
    if(path==='/kcsapi/api_start2/getData'||path==='/kcsapi/api_port/port') return true;
    return [
      '/kcsapi/api_get_member/',
      '/kcsapi/api_req_map/',
      '/kcsapi/api_req_sortie/',
      '/kcsapi/api_req_combined_battle/',
      '/kcsapi/api_req_battle_midnight/',
      '/kcsapi/api_req_hokyu/',
      '/kcsapi/api_req_hensei/',
      '/kcsapi/api_req_kaisou/',
      '/kcsapi/api_req_kousyou/',
      '/kcsapi/api_req_nyukyo/',
      '/kcsapi/api_req_mission/',
      '/kcsapi/api_req_quest/',
      '/kcsapi/api_req_air_corps/'
    ].some(x=>path.startsWith(x));
  }
  function parse(raw){try{return JSON.parse(String(raw||'').replace(/^svdata=/,''));}catch(_){return null;}}
  function safeMeta(path,body){
    // 必要最小限。api_token等はallowlistに存在しないため転送不能。
    if(path!=='/kcsapi/api_req_map/start') return {};
    try{
      const p=new URLSearchParams(typeof body==='string'?body:'');
      const out={};
      for(const k of ['api_deck_id','api_maparea_id','api_mapinfo_no','api_formation_id']) if(p.has(k)) out[k]=Number(p.get(k));
      return out;
    }catch(_){return {};}
  }
  function emit(url,body,raw){
    const path=pathOf(url); if(!relevant(path)) return;
    const j=parse(raw); if(!j||Number(j.api_result)!==1) return;
    try{window.top.postMessage({[API_MSG]:{path,captured_at:new Date().toISOString(),request:safeMeta(path,body),data:j.api_data}},'*');}catch(_){}
  }

  try{
    const originalOpen=XMLHttpRequest.prototype.open;
    const originalSend=XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open=function(method,url,...rest){this.__kcsSafe25={url};return originalOpen.call(this,method,url,...rest);};
    XMLHttpRequest.prototype.send=function(body){
      const url=this.__kcsSafe25?.url;
      if(relevant(pathOf(url))) this.addEventListener('load',()=>{try{
        let text='';
        if(!this.responseType||this.responseType==='text') text=this.responseText||'';
        else if(this.responseType==='json') text=JSON.stringify(this.response||{});
        emit(url,body,text);
      }catch(_){}},{once:true});
      return originalSend.call(this,body);
    };
  }catch(e){console.warn('[KCS Safe25] XHR observer install failed',e);}

  try{
    if(window.fetch){
      const originalFetch=window.fetch;
      window.fetch=async function(input,init={}){
        const response=await originalFetch.apply(this,arguments);
        try{const url=typeof input==='string'?input:input?.url;if(relevant(pathOf(url))) response.clone().text().then(t=>emit(url,init?.body,t)).catch(()=>{});}catch(_){}
        return response;
      };
    }
  }catch(e){console.warn('[KCS Safe25] fetch observer install failed',e);}

  // Screenshot is entirely local. No image is uploaded anywhere.
  window.addEventListener('message',e=>{
    if(!e?.data?.[SHOT_REQ]) return;
    try{const h=new URL(e.origin).hostname;if(!/(^|\.)dmm\.com$/i.test(h)) return;}catch(_){return;}
    const requestId=String(e.data[SHOT_REQ].requestId||'');
    try{
      const canvases=[...document.querySelectorAll('canvas')].filter(c=>c.width>0&&c.height>0).sort((a,b)=>(b.width*b.height)-(a.width*a.height));
      const canvas=canvases[0];
      if(!canvas) throw new Error('game canvas not found');
      canvas.toBlob(blob=>{
        if(!blob){window.top.postMessage({[SHOT_RES]:{requestId,error:'canvas capture failed'}},'*');return;}
        window.top.postMessage({[SHOT_RES]:{requestId,blob,width:canvas.width,height:canvas.height}},'*');
      },'image/png');
    }catch(err){window.top.postMessage({[SHOT_RES]:{requestId,error:String(err?.message||err)}},'*');}
  });

  try{window.top.postMessage({[API_MSG]:{path:'/kcsapi/__safe25_heartbeat__',captured_at:new Date().toISOString(),request:{},data:{version:VERSION}}},'*');}catch(_){}
  console.info(`[KCS Safe25] passive bridge ${VERSION}: no extra requests / no automation / request secrets redacted`);
})();
