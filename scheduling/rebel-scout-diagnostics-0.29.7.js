(function(){
'use strict';
const VERSION='0.29.7-dev';
const ENDPOINT='https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
const PAIR_KEY='vectorStaffingCollectorPairing_v1';
const STATE_KEY='rebelScoutAutoDiagnostics0297';
if(window.top!==window.self||window.MVCI_SCOUT_DIAGNOSTICS_0297)return;
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const clip=(v,n=1200)=>clean(v).slice(0,n);
const visible=el=>{if(!el||!(el instanceof Element))return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
const all=(sel,root=document)=>{try{return[...root.querySelectorAll(sel)].filter(visible)}catch(_){return[]}};
function pairing(){try{const p=JSON.parse(localStorage.getItem(PAIR_KEY)||'{}');return{deviceId:clean(p.deviceId),token:clean(p.token),endpoint:clean(p.endpoint)||ENDPOINT}}catch(_){return{deviceId:'',token:'',endpoint:ENDPOINT}}}
function state(){try{return JSON.parse(localStorage.getItem(STATE_KEY)||'{}')}catch(_){return{}}}
function save(v){try{localStorage.setItem(STATE_KEY,JSON.stringify(v))}catch(_){}}
function renderedDate(){const d=clean(window.MVCI_VECTOR_BRIDGE_0290?.status?.()?.renderedDate||'');if(/^\d{4}-\d{2}-\d{2}$/.test(d))return d;const h=location.hash.match(/#(?:\d{4}\/|)(\d{4})?[-\/]?(\d{2})[-\/](\d{2})/);if(h&&h[1])return`${h[1]}-${h[2]}-${h[3]}`;return''}
function dialog(){return all('.modal,[role="dialog"],.modal-dialog,.modal-content').sort((a,b)=>clip(a.textContent).length-clip(b.textContent).length)[0]||null}
function controlSnapshot(root=document){return all('select,input,textarea,button,[role="button"],[role="option"]',root).slice(0,120).map((el,i)=>({
  i,tag:el.tagName.toLowerCase(),type:clip(el.getAttribute('type')||'',40),id:clip(el.id||'',100),name:clip(el.getAttribute('name')||'',100),cls:clip(el.className||'',220),
  text:clip(el.textContent||'',300),value:clip(el.value||'',300),checked:'checked'in el?!!el.checked:undefined,disabled:!!el.disabled,
  ariaLabel:clip(el.getAttribute('aria-label')||'',180),ariaExpanded:clip(el.getAttribute('aria-expanded')||'',30),role:clip(el.getAttribute('role')||'',60),
  options:el.tagName==='SELECT'?[...el.options].slice(0,80).map(o=>({text:clip(o.textContent||'',160),value:clip(o.value||'',120),selected:o.selected})):undefined
}))}
function nearbyField(label){const want=label.toUpperCase();const labels=all('label,div,span').filter(x=>clip(x.textContent,120).toUpperCase()===want).slice(0,5);return labels.map(x=>{let n=x;for(let i=0;i<4&&n;i++,n=n.parentElement){const t=clip(n.textContent,1800);if(n.querySelector?.('select,input,[role="option"],button')||t.length>label.length+5)return{tag:n.tagName?.toLowerCase(),text:t,html:clip(n.outerHTML,4500)}}return{tag:x.tagName?.toLowerCase(),text:clip(x.textContent,800),html:clip(x.outerHTML,2000)}})}
function snapshot(){const dlg=dialog(),root=dlg||document;const truck=all('div,section,table,tbody').filter(x=>/Truck 504/i.test(clip(x.textContent,2200))&&/Michael Brion|Jerry Weems|Robert Brooks|Jared Weston|Michael Baldree/i.test(clip(x.textContent,2200))).sort((a,b)=>clip(a.textContent,2200).length-clip(b.textContent,2200).length)[0];return{
  title:clip(document.title,300),bodyText:clip(document.body?.innerText||'',6500),dialogText:dlg?clip(dlg.innerText||dlg.textContent||'',6500):'',dialogHtml:dlg?clip(dlg.outerHTML,12000):'',
  controls:controlSnapshot(root),qualifiers:nearbyField('QUALIFIERS'),labels:nearbyField('LABELS'),workSubtype:nearbyField('WORK SUBTYPE'),workType:nearbyField('WORK TYPE'),
  truckText:truck?clip(truck.innerText||truck.textContent||'',5000):'',bridgeStatus:window.MVCI_VECTOR_BRIDGE_0290?.status?.()||null,
  loaderVersion:clean(document.documentElement.dataset.mvciLoaderVersion||''),runtimeVersion:clean(document.documentElement.dataset.mvciRuntimeVersion||''),
  lastIntent:state().lastIntent||null
}}
async function send(kind='checkpoint',stage='manual',message=''){const p=pairing();if(!p.deviceId||!p.token)return false;const s=state(),intent=s.lastIntent||{};const payload={version:VERSION,scoutDiagnostic:{diagnosticId:`scoutdiag:${p.deviceId}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,runtimeVersion:VERSION,kind,actionType:intent.actionType||'',targetDate:intent.targetDate||renderedDate()||'',personName:intent.personName||'',requestedRole:intent.requestedRole||'',message:clip(message,1500),pageUrl:location.href,pagePath:location.pathname,pageHash:location.hash,renderedDate:renderedDate(),stage,occurredAt:new Date().toISOString(),snapshot:snapshot()}};try{const r=await fetch(`${p.endpoint||ENDPOINT}`,{method:'POST',cache:'no-store',credentials:'omit',headers:{Authorization:`Bearer ${p.token}`,'X-Rebel-Device-ID':p.deviceId,'Content-Type':'application/json'},body:JSON.stringify(payload)});return r.ok}catch(_){return false}}
function rememberIntent(btn){const box=btn.closest('#rebel-scout-live-test-0294,#rebel-scout-live-test-0296')||document;const date=box.querySelector('input[type="date"]')?.value||renderedDate()||'';const person=box.querySelector('select[id*="person"]')?.value||'';const roleSel=box.querySelector('select[id*="role"]');const role=roleSel?.value||'';let actionType='';if(/schedule-save|296-save/i.test(btn.id))actionType='schedule';else if(/ot-sign|296-sign/i.test(btn.id))actionType='overtime_signup';else if(/ot-unsign|296-unsign/i.test(btn.id))actionType='overtime_unsign';const next={...state(),lastIntent:{actionType,targetDate:date,personName:person,requestedRole:role,buttonId:btn.id,at:Date.now()}};save(next);send('interaction','button_clicked',`${btn.textContent||btn.id} clicked`).catch(()=>{});if(actionType==='schedule'){setTimeout(()=>send('checkpoint','schedule_after_400ms','Automatic snapshot 400ms after scheduling action started'),400);setTimeout(()=>send('checkpoint','schedule_after_1400ms','Automatic snapshot 1400ms after scheduling action started'),1400)}}
document.addEventListener('click',ev=>{const b=ev.target?.closest?.('button');if(!b)return;if(/rs-(schedule-save|ot-sign|ot-unsign)|rs296-(save|sign|unsign)/i.test(b.id))rememberIntent(b)},true);
const origError=console.error.bind(console);console.error=function(...args){try{const msg=args.map(x=>typeof x==='string'?x:(x?.message||String(x))).join(' ');if(/Rebel Scout|STOPPED|CrewSense|Tillerman|Qualifier/i.test(msg))send('error','console_error',msg).catch(()=>{})}catch(_){}return origError(...args)};
window.addEventListener('error',e=>{send('error','window_error',e?.message||'window error').catch(()=>{})});
window.addEventListener('unhandledrejection',e=>{send('error','unhandled_rejection',e?.reason?.message||String(e?.reason||'unhandled rejection')).catch(()=>{})});
window.MVCI_SCOUT_DIAGNOSTICS_0297={version:VERSION,sendNow:(message='manual diagnostic')=>send('checkpoint','manual',message),snapshot,state};
try{document.documentElement.dataset.mvciDiagnosticVersion=VERSION}catch(_){}
})();
