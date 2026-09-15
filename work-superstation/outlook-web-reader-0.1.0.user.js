// ==UserScript==
// @name         Mission Vector Check It - Work Email Reader (Discovery)
// @namespace    mission-vector-check-it-work-email
// @version      0.1.1
// @description  Read-only Outlook Web discovery collector for Rebel Command Work Email. Never modifies mailbox state.
// @match        https://outlook.office.com/*
// @match        https://outlook.office365.com/*
// @match        https://outlook.cloud.microsoft/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      base44.app
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function(){
'use strict';
if(window.top!==window.self||window.MVCI_WORK_EMAIL_READER_011)return;
const VERSION='work-email-reader-0.1.1-discovery';
const DEFAULT_ENDPOINT='https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
const ROOT_ID='mvci-work-email-reader-v011';
const CFG_KEY='mvciWorkEmailPairingV1';
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const visible=el=>{if(!(el instanceof Element))return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0&&r.width>2&&r.height>2&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth};
const attr=(el,n)=>clean(el?.getAttribute?.(n)||'');
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
const isoMaybe=v=>{const t=Date.parse(clean(v));return Number.isFinite(t)?new Date(t).toISOString():''};
function cfg(){return GM_getValue(CFG_KEY,{endpoint:DEFAULT_ENDPOINT,deviceId:'',token:''})||{endpoint:DEFAULT_ENDPOINT,deviceId:'',token:''}}
function saveCfg(x){GM_setValue(CFG_KEY,x)}
function paired(){const c=cfg();return!!(clean(c.deviceId)&&clean(c.token))}
function request(payload){const c=cfg();return new Promise((resolve,reject)=>{if(!c.deviceId||!c.token)return reject(new Error('Pairing not configured.'));GM_xmlhttpRequest({method:'POST',url:c.endpoint||DEFAULT_ENDPOINT,headers:{Authorization:`Bearer ${c.token}`,'X-Rebel-Device-ID':c.deviceId,'Content-Type':'application/json'},data:JSON.stringify(payload),timeout:25000,onload:r=>{let b={};try{b=JSON.parse(r.responseText||'{}')}catch(_){}if(r.status>=200&&r.status<300&&b?.ok!==false)resolve(b);else reject(new Error(clean(b?.error||`HTTP ${r.status}`)))},onerror:()=>reject(new Error('Network error')),ontimeout:()=>reject(new Error('Network timeout'))})})}

function candidateRows(){
  const found=[...document.querySelectorAll('[role="option"],[data-convid],[data-itemid],[data-item-id]')].filter(visible);
  const out=[],seen=new Set();
  for(const el of found){
    if(seen.has(el))continue;seen.add(el);
    const txt=clean(el.innerText||el.textContent||''),aria=attr(el,'aria-label');
    if((txt||aria).length<8)continue;
    const inMail=!!el.closest('[role="listbox"],[role="grid"],[aria-label*="message" i],[aria-label*="mail" i]');
    const hasId=!!(attr(el,'data-convid')||attr(el,'data-itemid')||attr(el,'data-item-id'));
    if(!inMail&&!hasId)continue;
    out.push(el);
  }
  return out.slice(0,150);
}
function parseRow(el,index){
  const raw=(el.innerText||el.textContent||'').trim();
  const text=clean(raw),aria=attr(el,'aria-label'),title=attr(el,'title');
  const dataId=attr(el,'data-itemid')||attr(el,'data-item-id')||attr(el,'data-convid')||attr(el,'data-conversation-id')||attr(el,'id');
  const lines=raw.split(/\n+/).map(clean).filter(Boolean);
  const sender=lines[0]||'';
  const subject=lines[1]||'';
  const preview=lines.slice(2,6).join(' ');
  const timeEl=el.querySelector('time,[datetime]');
  const dt=attr(timeEl,'datetime')||attr(timeEl,'title')||attr(timeEl,'aria-label');
  const receivedAt=isoMaybe(dt);
  const unread=/\bunread\b/i.test(`${aria} ${el.className||''}`);
  const flagged=/\bflagged\b/i.test(`${aria} ${title}`)||!!el.querySelector('[aria-label*="flag" i][aria-pressed="true"],[title*="flagged" i]');
  const attachments=!!el.querySelector('[aria-label*="attachment" i],[title*="attachment" i],svg[data-icon-name*="Attach" i]')||/\battachment\b/i.test(aria);
  const rawKey=dataId||hash(`${sender}|${subject}|${aria}|${text.slice(0,500)}|${index}`);
  return{messageKey:`outlook:${rawKey}`,senderName:sender,subject,previewText:preview||text.slice(0,1800),receivedAt:receivedAt||undefined,isUnread:!!unread,isFlagged:!!flagged,hasAttachments:!!attachments,webUrl:location.href,captureLevel:'list',_diag:{tag:el.tagName,id:attr(el,'id'),role:attr(el,'role'),aria:aria.slice(0,500),classes:clean(el.className).slice(0,500),dataId:dataId.slice(0,300),rawLines:lines.slice(0,8)}}
}
function folderName(){const s=[...document.querySelectorAll('[aria-current="page"],[aria-selected="true"]')].filter(visible).map(x=>clean(attr(x,'aria-label')||x.textContent||'')).find(x=>/inbox|sent|draft|deleted|archive|junk|mail/i.test(x));return s||'Outlook Web'}
function mailboxHint(){const a=[...document.querySelectorAll('[aria-label*="account" i],[aria-label*="profile" i]')].filter(visible).map(x=>attr(x,'aria-label')).find(Boolean);return(a||document.title||'').slice(0,220)}
function snapshot(){const rows=candidateRows(),messages=rows.map(parseRow);return{rows,messages,folder:folderName(),mailbox:mailboxHint(),summary:{url:location.href,title:document.title,visibleCandidates:rows.length,listboxes:document.querySelectorAll('[role="listbox"]').length,grids:document.querySelectorAll('[role="grid"]').length,firstThree:messages.slice(0,3).map(m=>({sender:m.senderName,subject:m.subject,preview:m.previewText.slice(0,120)}))}}}

let state={open:false,busy:false,msg:'Discovery mode: nothing is uploaded until you press Capture visible list.',last:null};
function add(parent,tag,text,cls){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;parent.appendChild(el);return el}
function style(){if(document.getElementById(`${ROOT_ID}-style`))return;const s=document.createElement('style');s.id=`${ROOT_ID}-style`;s.textContent=`#${ROOT_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483647;font-family:Arial,sans-serif;color:#263746}#${ROOT_ID} *{box-sizing:border-box}#${ROOT_ID} .orb{width:48px;height:48px;border-radius:50%;border:2px solid #204f6d;background:#fff;box-shadow:0 6px 20px #0004;font-weight:900;cursor:pointer}#${ROOT_ID} .p{width:390px;max-width:calc(100vw - 24px);margin-bottom:8px;background:#f6f8f9;border:1px solid #cbd8df;border-radius:10px;box-shadow:0 10px 30px #0005;overflow:hidden}#${ROOT_ID} .h{background:#173e63;color:#fff;padding:12px 14px;display:flex;justify-content:space-between;gap:10px}#${ROOT_ID} .b{padding:12px}#${ROOT_ID} button.a{width:100%;padding:10px;border-radius:8px;border:1px solid #173e63;background:#173e63;color:#fff;font-weight:700;cursor:pointer;margin-top:8px}#${ROOT_ID} button.s{padding:8px;border-radius:8px;border:1px solid #cbd8df;background:#fff;cursor:pointer}#${ROOT_ID} .m{margin-top:8px;padding:8px;border:1px solid #dce5ea;border-radius:8px;background:#fff;font-size:11px;line-height:1.4}#${ROOT_ID} .warn{margin-top:8px;padding:8px;border:1px solid #f0c36b;border-radius:8px;background:#fff8e7;font-size:10px;line-height:1.35}#${ROOT_ID} pre{font-size:9px;white-space:pre-wrap;max-height:180px;overflow:auto}`;document.documentElement.appendChild(s)}
function render(){
  style();let r=document.getElementById(ROOT_ID);if(!r){r=document.createElement('div');r.id=ROOT_ID;document.documentElement.appendChild(r)}
  while(r.firstChild)r.removeChild(r.firstChild);
  const snap=state.last;
  if(state.open){
    const p=add(r,'div',null,'p'),h=add(p,'div',null,'h'),title=add(h,'div');add(title,'b','WORK EMAIL READER');const sub=add(title,'div',`${VERSION} · read-only discovery`);sub.style.fontSize='10px';sub.style.opacity='.75';
    const close=add(h,'button','−','s');close.addEventListener('click',()=>{state.open=false;render()});
    const b=add(p,'div',null,'b');const info=add(b,'div');info.style.fontSize='11px';info.textContent=`Pairing: ${paired()?'configured':'needed'} · Visible candidates: ${snap?.messages?.length??'not scanned'}`;
    const scan=add(b,'button','SCAN VISIBLE LIST · NO UPLOAD','a');scan.addEventListener('click',()=>{state.last=snapshot();state.msg=`Discovery found ${state.last.messages.length} candidate message rows. Nothing uploaded.`;render()});
    const send=add(b,'button','CAPTURE VISIBLE LIST','a');send.disabled=state.busy||!paired();send.addEventListener('click',capture);
    const config=add(b,'button','Configure pairing','s');config.style.marginTop='8px';config.addEventListener('click',configure);
    add(b,'div',state.msg,'m');add(b,'div','Safety: This script never clicks a message, never sends/replies, never deletes/archives/moves, and never changes read/flag state. Discovery captures list text only. Full message bodies are not implemented in 0.1.1.','warn');
    if(snap){const d=add(b,'details');d.style.marginTop='8px';const sum=add(d,'summary','Discovery details');sum.style.fontSize='11px';sum.style.cursor='pointer';add(d,'pre',JSON.stringify(snap.summary,null,2));}
  }
  const orb=add(r,'button','MAIL','orb');orb.title='Mission Vector Work Email';orb.addEventListener('click',()=>{state.open=!state.open;render()});
}
function configure(){const old=cfg();const endpoint=prompt('Rebel Command telemetry endpoint',old.endpoint||DEFAULT_ENDPOINT);if(endpoint==null)return;const deviceId=prompt('Rebel Command device ID',old.deviceId||'');if(deviceId==null)return;const token=prompt('Private device token (stored only in Tampermonkey userscript storage)',old.token||'');if(token==null)return;saveCfg({endpoint:clean(endpoint)||DEFAULT_ENDPOINT,deviceId:clean(deviceId),token:clean(token)});state.msg='Pairing saved in Tampermonkey storage for this Outlook reader.';render()}
async function capture(){state.busy=true;render();try{const snap=snapshot();state.last=snap;if(!snap.messages.length)throw new Error('No credible visible message rows were found. Discovery must be tuned before capture.');const capturedAt=new Date().toISOString(),captureId=`workmail:${Date.now()}:${Math.random().toString(36).slice(2,9)}`;const payload={version:VERSION,workEmailCapture:{captureId,capturedAt,source:'Outlook Web rendered UI',sourceVersion:VERSION,mailboxHint:snap.mailbox,folderName:snap.folder,visibleCount:snap.messages.length,quality:'partial',notes:'Discovery collector 0.1.1. List-only evidence; DOM mapping live-validated on outlook.cloud.microsoft. No mailbox mutations performed.',messages:snap.messages.map(({_diag,...m})=>m)}};const res=await request(payload);if(!res?.workEmail?.accepted)throw new Error(res?.workEmail?.error||res?.workEmail?.reason||'Rebel Command did not accept the capture.');state.msg=`Captured ${res.workEmail.messages??snap.messages.length} list rows to Rebel Command as PARTIAL discovery evidence. No mailbox state changed.`}catch(e){state.msg=`STOPPED: ${clean(e?.message||e)} No mailbox changes were made.`}finally{state.busy=false;render()}}

state.last=snapshot();render();
window.MVCI_WORK_EMAIL_READER_011={version:VERSION,snapshot,capture,configure,status:()=>({paired:paired(),messages:state.last?.messages?.length||0,url:location.href})};
})();
