// ==UserScript==
// @name         Rebel Scout
// @namespace    mission-vector-check-it-rebel-scout
// @version      1.1.39
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/rebel-scout.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/rebel-scout.user.js
// @description  Read-only CrewSense staffing and overtime collector for Mission Vector Check It.
// @match        https://crewsense.com/*
// @match        https://www.crewsense.com/*
// @match        https://*.crewsense.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      base44.app
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function(){
'use strict';
if (window.top !== window.self || window.MVCI_REBEL_SCOUT_CORE) return;
const VERSION='1.1.39';
const ENDPOINT='https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
const PAIR_KEY='rebelScoutPairingV1';
const LEGACY_PAIR_KEYS=['vectorStaffingCollectorPairing_v1','vectorOvertimeCollectorPairing_v1'];
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
function normalizePair(raw){const p=raw&&typeof raw==='object'?raw:{};return{deviceId:clean(p.deviceId),token:clean(p.token),endpoint:clean(p.endpoint)||ENDPOINT}}
function migrateLegacy(){let current=normalizePair(GM_getValue(PAIR_KEY,{}));if(current.deviceId&&current.token)return current;for(const k of LEGACY_PAIR_KEYS){try{const raw=localStorage.getItem(k);if(!raw)continue;const p=normalizePair(JSON.parse(raw));if(p.deviceId&&p.token){GM_setValue(PAIR_KEY,p);return p}}catch(_){}}return current}
function pairing(){return normalizePair(GM_getValue(PAIR_KEY,migrateLegacy()))}
function paired(){const p=pairing();return!!(p.deviceId&&p.token)}
function gmRequest(method,url,headers={},body=null,timeout=30000){return new Promise((resolve,reject)=>GM_xmlhttpRequest({method,url,headers,data:body==null?undefined:JSON.stringify(body),timeout,onload:r=>{let parsed={};try{parsed=JSON.parse(r.responseText||'{}')}catch(_){}if(r.status>=200&&r.status<300&&parsed?.ok!==false)resolve(parsed);else reject(new Error(clean(parsed?.error||`HTTP ${r.status}`)))},onerror:()=>reject(new Error('Network error')),ontimeout:()=>reject(new Error('Network timeout'))}))}
async function request(path='',options={}){const p=pairing();if(!p.deviceId||!p.token)throw new Error('Rebel Scout is not paired with Rebel Command.');const method=options.method||'GET';const headers={Authorization:`Bearer ${p.token}`,'X-Rebel-Device-ID':p.deviceId,...(options.body?{'Content-Type':'application/json'}:{})};return gmRequest(method,`${p.endpoint||ENDPOINT}${path}`,headers,options.body??null,options.timeout||30000)}
async function verify(p=pairing()){p=normalizePair(p);if(!p.deviceId||!p.token)throw new Error('Device ID and token are required.');const headers={Authorization:`Bearer ${p.token}`,'X-Rebel-Device-ID':p.deviceId};return gmRequest('GET',p.endpoint||ENDPOINT,headers,null,25000)}
async function configure(){const cur=pairing();if(cur.deviceId&&cur.token){const a=prompt('Rebel Scout is paired. Type TEST to test, REPAIR to replace credentials, CLEAR to remove pairing, or leave blank to cancel.','TEST');if(a==null||!clean(a))return false;const u=clean(a).toUpperCase();if(u==='TEST'){await verify(cur);alert('Rebel Scout pairing is working.');return true}if(u==='CLEAR'){GM_deleteValue(PAIR_KEY);alert('Rebel Scout pairing cleared.');return false}if(u!=='REPAIR')return false}const deviceId=clean(prompt('Paste the Rebel Command Device ID:',cur.deviceId||'')||'');if(!deviceId)return false;const token=clean(prompt('Paste the private device token from Rebel Command:','')||'');if(!token)return false;const next={deviceId,token,endpoint:ENDPOINT};await verify(next);GM_setValue(PAIR_KEY,next);alert('Rebel Scout paired with Rebel Command.');return true}
window.MVCI_REBEL_SCOUT_CORE={version:VERSION,endpoint:ENDPOINT,clean,pairing,paired,request,post:body=>request('',{method:'POST',body}),verify,configure,migrateLegacy};
migrateLegacy();
})();

/* --- Staffing collector: consolidated from verified vector-staffing-bridge 0.29.0 --- */
(function(){
'use strict';
const VERSION='1.1.39';
const ENDPOINT='https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
const PAIR_KEY='vectorStaffingCollectorPairing_v1';
const STABLE_MS=900;
const MIN_ROWS=24;
const MIN_REGULAR=20;
const MIN_GROUPS=6;
if(window.top!==window.self||window.MVCI_REBEL_SCOUT_STAFFING)return;

const state={lastMutationAt:Date.now(),running:false,currentPromise:null,status:'idle',lastCapture:null,lastError:''};
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function pairing(){return window.MVCI_REBEL_SCOUT_CORE.pairing()}
function paired(){return window.MVCI_REBEL_SCOUT_CORE.paired()}
function parseDate(value){const t=clean(value);let m=t.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);if(m)return`${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`;m=t.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);if(m)return`${m[3]}-${String(+m[1]).padStart(2,'0')}-${String(+m[2]).padStart(2,'0')}`;const months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};m=t.match(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*,?\s*(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),\s*(20\d{2})\b/i);return m?`${m[3]}-${String(months[m[1].toLowerCase()]).padStart(2,'0')}-${String(+m[2]).padStart(2,'0')}`:''}
function rendered(el){if(!el||!(el instanceof Element))return false;const s=getComputedStyle(el);if(s.display==='none'||s.visibility==='hidden')return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0}
function ownElement(el){return!!el?.closest?.('[id^="mvci-"],#mvci-vs-panel,#mvci-vs-open,[id^="vs-"],#vector-staffing-collector-status,#vector-overtime-collector-status')}
function domDisplayedDate(){
  const reader=window.MVCI_VECTOR_READER_0120;
  const rd=clean(reader?.visibleDisplayedDate?.()||'');
  if(/^\d{4}-\d{2}-\d{2}$/.test(rd))return rd;
  const candidates=[];
  for(const el of document.querySelectorAll('h1,h2,h3,time,input[type="date"],[data-date],[datetime],[class*="date"],[id*="date"],span,div')){
    if(ownElement(el)||!rendered(el))continue;
    const values=[el.value,el.getAttribute?.('data-date'),el.getAttribute?.('datetime'),el.textContent];
    for(const v of values){if(!v||clean(v).length>120)continue;const d=parseDate(v);if(!d)continue;let score=0;const tag=(el.tagName||'').toLowerCase();if(/^h[1-3]$/.test(tag))score+=10;if(tag==='time')score+=8;if(el.matches?.('input[type="date"],[data-date],[datetime]'))score+=7;const cls=clean(el.className||'').toLowerCase();if(/date|day/.test(cls))score+=4;candidates.push({d,score})}
  }
  const hm=location.hash.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/),hashDate=hm?[hm[1],String(+hm[2]).padStart(2,'0'),String(+hm[3]).padStart(2,'0')].join('-'):'';
  if(hashDate&&candidates.some(x=>x.d===hashDate))return hashDate;
  candidates.sort((a,b)=>b.score-a.score);return candidates[0]?.d||'';
}
function loadingVisible(){return[...document.querySelectorAll('[aria-busy="true"],.loading,.spinner,[class*="loading"],[class*="spinner"]')].some(el=>rendered(el)&&!ownElement(el))}
function rowMarker(t){return/Salary Step\s*\[1010\]|\bSub\s*\[1010\]|Additional Time|Disaster Relief|Overtime|OT Sign|Force Hire|Backfill|Trade|Swap|Open Slot|Vacation|Sick|Leave|Time Off/i.test(t)}
function looksLikeScheduleRow(t){t=clean(t);return/\b\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\b/.test(t)&&(rowMarker(t)||/^Open Slot\b/i.test(t))}
function candidateElements(root=document){const pool=[...root.querySelectorAll('tr,[role="row"],li,article,section,div')].filter(el=>rendered(el)&&!ownElement(el)).map(el=>({el,text:clean(el.textContent)})).filter(x=>x.text.length>=8&&x.text.length<=900&&looksLikeScheduleRow(x.text));const selected=[];for(const item of pool.sort((a,b)=>a.text.length-b.text.length)){if(selected.some(x=>item.el.contains(x.el)))continue;selected.push(item)}return selected}
const GROUP_RE=/\b(Engine|Truck|Medic|Quint|Rescue|Battalion|Brush|Squad|Tower|Ladder|Ambulance|Station)\s+\d{1,4}\b/i;
function groupFor(el){let n=el;for(let d=0;n&&d<10;d++,n=n.parentElement){if(ownElement(n))continue;const text=clean(n.textContent).slice(0,5000),m=[...text.matchAll(new RegExp(GROUP_RE.source,'ig'))];if(m.length===1)return clean(m[0][0]);if(m.length>1&&d<=2)return clean(m[m.length-1][0])}let p=el.previousElementSibling;for(let i=0;p&&i<8;i++,p=p.previousElementSibling){const m=clean(p.textContent).match(GROUP_RE);if(m)return clean(m[0])}return''}
function hoursFrom(t){t=clean(t);let m=t.match(/\b(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)(?:\s+(\d+)\s*min)?\b/i);if(m)return Math.round((+m[1]+ +(m[2]||0)/60)*100)/100;m=t.match(/\b(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\b/);if(!m)return null;let a=+m[1]+ +m[2]/60,b=+m[3]+ +m[4]/60;if(b<=a)b+=24;return Math.round((b-a)*100)/100}
function scheduleType(t){t=clean(t);for(const re of[/Salary Step\s*\[1010\](?:\s*-\s*[^\[]+\[[^\]]+\])?/i,/\bSub\s*\[1010\]/i,/Additional Time[^\[]*(?:\[[^\]]+\])?/i,/Salary Disaster Relief[^\[]*(?:\[[^\]]+\])?/i,/Overtime[^\[]*(?:\[[^\]]+\])?/i]){const m=t.match(re);if(m)return clean(m[0])}return''}
function personAndDuty(t){t=clean(t);if(/^Open Slot\b/i.test(t))return{personName:'Open Slot',dutyCode:''};const marker=t.search(/\s+(?=Salary Step\s*\[1010\]|Sub\s*\[1010\]|Additional Time|Salary Disaster Relief|Overtime|OT Sign|Force Hire|Backfill|Trade|Swap|Vacation|Sick|Leave|Time Off)/i),prefix=clean(marker>0?t.slice(0,marker):t),tokens=prefix.split(' ').filter(Boolean),status=new Set(['S','A','O','V']),duties=new Set(['CAPT','CAPTAIN','BC','CHIEF','DE','DE-A','DE-B','DE-C','FF','FFA','FFB','FFC','TM','TILLER','TADE','TAC','SWING','FTO']);while(tokens.length&&status.has(tokens[tokens.length-1].toUpperCase()))tokens.pop();while(tokens.length&&tokens[tokens.length-1]==='-')tokens.pop();const out=[];while(tokens.length&&duties.has(tokens[tokens.length-1].toUpperCase()))out.unshift(tokens.pop());while(tokens.length&&tokens[tokens.length-1]==='-')tokens.pop();if(tokens.length>2&&/^\d+$/.test(tokens[tokens.length-1]))tokens.pop();return{personName:clean(tokens.join(' ')).slice(0,180),dutyCode:clean(out.join(' '))}}
function hash32(t){let h=0x811c9dc5;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,0x01000193)}return(h>>>0).toString(36)}
function makeRow(item){const rawText=clean(item.text),group=groupFor(item.el),pd=personAndDuty(rawText),lengthHours=hoursFrom(rawText);return{personId:`dom-${hash32((pd.personName||rawText).toLowerCase())}`,personName:pd.personName,activity:'Work Shift',assignment:group,assignmentGroup:group,dutyCode:pd.dutyCode,scheduleType:scheduleType(rawText),...(Number.isFinite(lengthHours)?{lengthHours}:{}),captureQuality:group?'row+group':'row-only',rawText}}
function findScroller(el){let n=el?.parentElement||null;for(let d=0;n&&d<12;d++,n=n.parentElement){const s=getComputedStyle(n);if(n.scrollHeight>n.clientHeight+80&&/(auto|scroll)/i.test(s.overflowY||''))return n}return null}
function merge(target,items){for(const item of items){const r=makeRow(item);if(!r.personName||!r.rawText)continue;const k=`${r.assignmentGroup}|${r.rawText}`;if(!target.has(k))target.set(k,r)}}
async function sweep(){const found=new Map(),initial=candidateElements();merge(found,initial);const scroller=findScroller(initial[0]?.el);if(!scroller)return{rows:[...found.values()],scrollSweepComplete:true,scroller:'none'};const original=scroller.scrollTop,max=Math.max(0,scroller.scrollHeight-scroller.clientHeight),step=Math.max(180,Math.floor(scroller.clientHeight*.7));let bottom=false;try{for(let pos=0,loops=0;pos<=max+step&&loops<120;pos+=step,loops++){scroller.scrollTop=Math.min(pos,max);await wait(document.hidden?180:90);merge(found,candidateElements(scroller));if(scroller.scrollTop>=max-3){bottom=true;merge(found,candidateElements(scroller));break}}}finally{scroller.scrollTop=original;await wait(160)}return{rows:[...found.values()],scrollSweepComplete:bottom,scroller:'element'}}
async function waitStable(max=10000){const start=Date.now();while(Date.now()-start<max){if(Date.now()-state.lastMutationAt>=STABLE_MS&&!loadingVisible())return true;await wait(document.hidden?250:100)}return false}
async function verifyPair(p){return window.MVCI_REBEL_SCOUT_CORE.verify(p)}
async function configure(){return window.MVCI_REBEL_SCOUT_CORE.configure()}
async function sendCapture(payload){return window.MVCI_REBEL_SCOUT_CORE.post({version:`rebel-scout-${VERSION}`,staffingCapture:payload})}
async function performScrape(options={}){state.running=true;state.status='reading';state.lastError='';const expected=clean(options.expectedDate||'');try{startObservation();const stableBefore=await waitStable();const before=domDisplayedDate();if(!before)throw new Error('Could not identify the rendered ListView date.');if(expected&&before!==expected)throw new Error(`CrewSense rendered ${before}, not requested ${expected}.`);const result=await sweep();const stableAfter=await waitStable(6000);const after=domDisplayedDate();if(!after||before!==after)throw new Error(`Rendered date changed during scrape (${before||'unknown'} → ${after||'unknown'}).`);if(expected&&after!==expected)throw new Error(`CrewSense rendered ${after}, not requested ${expected}.`);const rows=result.rows,regular=rows.filter(r=>/Salary Step\s*\[1010\]/i.test(r.scheduleType||r.rawText)&&Number(r.lengthHours)===24&&!/Sub\s*\[1010\]|Additional Time|Overtime|OT Sign|Force Hire|Backfill|Disaster Relief|Trade|Swap|Vacation|Sick|Leave|Time Off/i.test(r.rawText)).length,groups=new Set(rows.map(r=>r.assignmentGroup).filter(Boolean)).size,noLoading=!loadingVisible(),full=stableBefore&&stableAfter&&noLoading&&result.scrollSweepComplete&&rows.length>=MIN_ROWS&&regular>=MIN_REGULAR&&groups>=MIN_GROUPS,digest=hash32(JSON.stringify(rows.map(r=>[r.personId,r.assignmentGroup,r.rawText]).sort())),capturedAt=new Date().toISOString(),payload={batchId:`unified:${before}:${Date.now()}:${digest}`,capturedAt,sourceVersion:`vector-bridge-${VERSION}`,pageMode:'ListView',captureComplete:full,diagnostics:{pageStableBefore:stableBefore,pageStableAfter:stableAfter,pageStable:stableBefore&&stableAfter,allVisibleGroupsScanned:result.scrollSweepComplete,scrollSweepComplete:result.scrollSweepComplete,noLoadingIndicator:noLoading,dateConfidence:'high',dateSource:'rendered-dom',expectedDate:expected||null,visibleScheduleRows:rows.length,candidateRegularRows:regular,groupCount:groups,scroller:result.scroller},days:[{workDate:before,shiftLabel:'',rows}]};const body=await sendCapture(payload);state.status=body?.staffing?.quality==='good'?'sent-good':'sent-partial';state.lastCapture={date:before,rows:rows.length,regular,groups,full,quality:body?.staffing?.quality||'unknown',at:capturedAt,sourceVersion:`vector-bridge-${VERSION}`};return status()}catch(e){state.status='error';state.lastError=clean(e?.message||e);throw e}finally{stopObservation();state.running=false;state.currentPromise=null}}
function scrapeNow(options={}){if(state.currentPromise)return state.currentPromise;state.currentPromise=performScrape(options);return state.currentPromise}
function status(){return{paired:paired(),running:state.running,status:state.status,lastCapture:state.lastCapture,lastError:state.lastError,renderedDate:domDisplayedDate(),version:VERSION}}
function mutationRelevant(m){const target=m.target?.nodeType===1?m.target:m.target?.parentElement;if(target&&ownElement(target))return false;if(m.type==='childList'){const nodes=[...m.addedNodes,...m.removedNodes];if(nodes.length&&nodes.every(n=>{const el=n.nodeType===1?n:n.parentElement;return el?ownElement(el):false}))return false}return true}
let observer=null;
function startObservation(){if(observer)return;state.lastMutationAt=Date.now();observer=new MutationObserver(ms=>{if(ms.some(mutationRelevant))state.lastMutationAt=Date.now()});observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});}
function stopObservation(){observer?.disconnect();observer=null;}
async function captureSignupNow(options={}){
  state.running=true;state.status='reading-signup';state.lastError='';
  const expected=clean(options.expectedDate||'');
  try{
    startObservation();
    const stableBefore=await waitStable();
    const before=domDisplayedDate();
    if(!before)throw new Error('Could not identify the rendered ListView date for OT signup refresh.');
    if(expected&&before!==expected)throw new Error('CrewSense rendered '+before+', not requested '+expected+'.');
    const result=await sweep();
    const stableAfter=await waitStable(6000);
    const after=domDisplayedDate();
    if(!after||before!==after)throw new Error('Rendered date changed during OT signup refresh ('+(before||'unknown')+' -> '+(after||'unknown')+').');
    if(expected&&after!==expected)throw new Error('CrewSense rendered '+after+', not requested '+expected+'.');
    const signupRows=result.rows.filter(r=>/\bovertime\s+sign\s*up\b|\bot\s*sign[- ]?up\b/i.test(String((r.assignment||'')+' '+(r.assignmentGroup||'')+' '+(r.scheduleType||'')+' '+(r.rawText||'')))&&!/^open slot\b/i.test(clean(r.personName)));
    const noLoading=!loadingVisible();
    const complete=stableBefore&&stableAfter&&noLoading&&result.scrollSweepComplete;
    const capturedAt=new Date().toISOString();
    const batchId='signup-direct:'+before+':'+Date.now()+':'+hash32(JSON.stringify(signupRows.map(r=>[r.personName,r.rawText])));
    const payload={batchId,workDate:before,capturedAt,sourceVersion:'rebel-scout-'+VERSION,source:'Vector Scheduling ListView / OT Sign-up',pageUrl:location.href,captureComplete:complete,diagnostics:{pageStable:stableBefore&&stableAfter,noLoadingIndicator:noLoading,dateConfidence:'high',listContainerFound:true,emptyStateConfirmed:complete&&signupRows.length===0,directSignupRefresh:true,scrollSweepComplete:result.scrollSweepComplete},rows:signupRows.map((r,index)=>({personName:r.personName,personId:r.personId,signupOrder:index+1,signupTimeText:'',rawText:r.rawText}))};
    const body=await window.MVCI_REBEL_SCOUT_CORE.post({version:'rebel-scout-'+VERSION,signupCapture:payload});
    const resultBody=body?.signup||body?.results?.signup||body?.signupCapture||body;
    state.status=resultBody?.quality==='good'?'sent-good-signup':'sent-signup';
    state.lastCapture={date:before,rows:signupRows.length,regular:0,groups:0,full:complete,quality:resultBody?.quality||'unknown',at:capturedAt,sourceVersion:'rebel-scout-'+VERSION,signupOnly:true,batchId};
    return{...status(),signupCapture:resultBody,batchId,signupRows:signupRows.length};
  }catch(e){state.status='error';state.lastError=clean(e?.message||e);throw e}
  finally{stopObservation();state.running=false;state.currentPromise=null}
}
window.MVCI_REBEL_SCOUT_STAFFING={version:VERSION,configure,scrapeNow,captureSignupNow,status,renderedDate:domDisplayedDate};
})();
/* --- Overtime collector: consolidated from verified collector 0.3.0 --- */
(function () {
  'use strict';

  if (window.MVCI_REBEL_SCOUT_OT) return;

  const VERSION = '1.1.38';
  const ENDPOINT = 'https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
  const PAIR_KEY = 'vectorOvertimeCollectorPairing_v1';
  const SHARED_PAIR_KEY = 'vectorStaffingCollectorPairing_v1';
  const STATE_KEY = 'vectorOvertimeCollectorState_v1';
  const UI_ID = 'vector-overtime-collector-status';
  const STABLE_MS = 900;
  const COOLDOWN_MS = 12000;
  const MIN_COMPLETE_ROWS = 80;

  const state = {
    lastMutationAt: Date.now(),
    running: false,
    lastDigest: '',
    lastSentAt: 0,
    status: 'idle',
    lastError: '',
  };

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const wait = ms => new Promise(r => setTimeout(r, ms));

  function loadJSON(key, fallback = {}) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } }
  function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function pairing(){ return window.MVCI_REBEL_SCOUT_CORE.pairing(); }
  function isPaired(){ return window.MVCI_REBEL_SCOUT_CORE.paired(); }

  function rendered(el) {
    if (!el || !(el instanceof Element)) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function isRankingPage() {
    return /\/Application\/ControlPanel\/CallbackModule\/Rankings/i.test(location.pathname)
      || (/rankings/i.test(clean(document.body?.textContent)) && /overtime list/i.test(clean(document.body?.textContent)));
  }

  function parseDateString(value) {
    const text = clean(value);
    let m = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if (m) return `${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`;
    m = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
    if (m) return `${m[3]}-${String(Number(m[1])).padStart(2,'0')}-${String(Number(m[2])).padStart(2,'0')}`;
    return '';
  }

  function findForecastControls() {
    const labels = [...document.querySelectorAll('label,div,span,p')]
      .filter(rendered)
      .filter(el => /select date to forecast rankings/i.test(clean(el.textContent)));
    const label = labels.sort((a,b) => clean(a.textContent).length - clean(b.textContent).length)[0];
    if (!label) return null;

    let scope = label.parentElement;
    for (let depth = 0; scope && depth < 8; depth += 1, scope = scope.parentElement) {
      const inputs = [...scope.querySelectorAll('input')]
        .filter(rendered)
        .filter(el => parseDateString(el.value));
      if (!inputs.length) continue;
      const input = inputs[0];
      const buttons = [...scope.querySelectorAll('button')].filter(rendered);
      if (!buttons.length) continue;
      return { label, scope, input, buttons };
    }
    return null;
  }

  function detectForecastDate() {
    const controls = findForecastControls();
    if (controls) {
      const date = parseDateString(controls.input.value);
      if (date) return { date, confidence: 'high', source: 'forecast-date-input' };
    }
    const dates = [...document.querySelectorAll('input')]
      .filter(rendered)
      .map(el => parseDateString(el.value))
      .filter(Boolean);
    const unique = [...new Set(dates)];
    return unique.length === 1
      ? { date: unique[0], confidence: 'high', source: 'unique-date-input' }
      : { date: '', confidence: 'none', source: 'not-found' };
  }

  function loadingVisible() {
    return [...document.querySelectorAll('[aria-busy="true"],.loading,.spinner,[class*="loading"],[class*="spinner"]')]
      .some(rendered);
  }

  function parseRankingText(text) {
    const t = clean(text);
    if (t.length < 10 || t.length > 500) return null;
    const m = t.match(/^(\d{1,3})\.\s+(.+?)\s+(-?[\d,]+(?:\.\d+)?)\s*hrs?\s*(?:\((.*?)\))?\s*$/i);
    if (!m) return null;
    const rank = Number(m[1]);
    const hours = Number(m[3].replace(/,/g, ''));
    const personName = clean(m[2]);
    if (!Number.isInteger(rank) || rank < 1 || !Number.isFinite(hours) || hours < 0 || !personName) return null;
    return { rank, personName, overtimeHours: hours, tieBreakText: clean(m[4] || ''), rawText: t };
  }

  function rankingElements(root = document) {
    const pool = [...root.querySelectorAll('tr,[role="row"],li,article,div')]
      .filter(el => el.id !== UI_ID && !el.closest(`#${UI_ID}`))
      .map(el => ({ el, parsed: parseRankingText(el.textContent) }))
      .filter(x => x.parsed);
    const selected = [];
    for (const item of pool.sort((a,b) => clean(a.el.textContent).length - clean(b.el.textContent).length)) {
      if (selected.some(x => item.el.contains(x.el))) continue;
      selected.push(item);
    }
    return selected;
  }

  function mergeRows(map, items) {
    for (const item of items) if (item.parsed) map.set(item.parsed.rank, item.parsed);
  }

  function findScroller(el) {
    let node = el?.parentElement || null;
    for (let i = 0; node && i < 14; i += 1, node = node.parentElement) {
      const s = getComputedStyle(node);
      if (node.scrollHeight > node.clientHeight + 80 && /(auto|scroll)/i.test(s.overflowY || '')) return node;
    }
    return document.scrollingElement || document.documentElement;
  }

  async function sweepRanking() {
    const rows = new Map();
    const first = rankingElements();
    mergeRows(rows, first);
    const scroller = findScroller(first[0]?.el);
    const isDoc = scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body;
    const original = isDoc ? window.scrollY : scroller.scrollTop;
    const viewport = isDoc ? window.innerHeight : scroller.clientHeight;
    const max = isDoc ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight) : Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const step = Math.max(240, Math.floor(viewport * 0.72));
    let bottom = max === 0;
    try {
      for (let pos = 0, loops = 0; pos <= max + step && loops < 180; pos += step, loops += 1) {
        const target = Math.min(pos, max);
        if (isDoc) window.scrollTo(0, target); else scroller.scrollTop = target;
        await wait(70);
        mergeRows(rows, rankingElements(isDoc ? document : scroller));
        const current = isDoc ? window.scrollY : scroller.scrollTop;
        if (current >= max - 4) { bottom = true; break; }
      }
    } finally {
      if (isDoc) window.scrollTo(0, original); else scroller.scrollTop = original;
      await wait(100);
    }
    mergeRows(rows, rankingElements());
    return { rows: [...rows.values()].sort((a,b) => a.rank - b.rank), bottom };
  }

  async function waitStable(maxWait = 6000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      if (Date.now() - state.lastMutationAt >= STABLE_MS && !loadingVisible()) return true;
      await wait(100);
    }
    return false;
  }

  function diagnostics(rows, dateInfo, bottom) {
    const sequential = rows.length > 0 && rows.every((r,i) => r.rank === i + 1);
    const uniqueNames = new Set(rows.map(r => clean(r.personName).toLowerCase())).size === rows.length;
    const michael = rows.find(r => clean(r.personName).toLowerCase() === 'michael brion');
    return {
      pageStable: Date.now() - state.lastMutationAt >= STABLE_MS,
      noLoadingIndicator: !loadingVisible(),
      dateConfidence: dateInfo.confidence,
      sequential,
      uniqueNames,
      michaelFound: !!michael,
      michaelRank: michael?.rank || null,
      michaelHours: michael?.overtimeHours ?? null,
      scrollSweepComplete: bottom,
    };
  }

  function statusText() {
    if (!isPaired()) return 'OT PRIORITY · pair Scheduling first';
    if (state.running) return 'OT PRIORITY · reading…';
    if (state.status === 'sent-good') return 'OT PRIORITY · sent ✓';
    if (state.status === 'sent-partial') return 'OT PRIORITY · sent · verify';
    if (state.status === 'error') return `OT PRIORITY · error`;
    return 'OT PRIORITY · capture';
  }

  function renderStatus() {}

  async function postRanking(payload) { return window.MVCI_REBEL_SCOUT_CORE.post({version:`rebel-scout-${VERSION}`, rankingCapture: payload}); }

  let captureObserver = null;
  function startCaptureObservation(){
    if(captureObserver)return;
    state.lastMutationAt=Date.now();
    captureObserver=new MutationObserver(()=>{state.lastMutationAt=Date.now();});
    captureObserver.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  }
  function stopCaptureObservation(){captureObserver?.disconnect();captureObserver=null;}

  async function captureRanking({ force = false } = {}) {
    if (state.running || !isRankingPage()) return { skipped: true, reason: 'busy-or-not-ranking-page' };
    if (!isPaired()) {
      state.status = 'error';
      state.lastError = 'Pair the Scheduling bridge first; this collector now reuses that pairing automatically.';
      renderStatus();
      alert(state.lastError);
      return { skipped: true, reason: 'not-paired' };
    }

    state.running = true;
    state.status = 'reading';
    startCaptureObservation();
    renderStatus();
    try {
      await waitStable();
      const before = detectForecastDate();
      if (!before.date) throw new Error('Could not identify the Global OT List forecast date.');
      const sweep = await sweepRanking();
      await waitStable(2500);
      const after = detectForecastDate();
      if (after.date !== before.date) throw new Error('Forecast date changed during capture. Try again.');

      const rows = sweep.rows;
      if (!rows.length) throw new Error('No overtime ranking rows were found.');
      const diag = diagnostics(rows, before, sweep.bottom);
      const digest = `${before.date}|${rows.length}|${rows.map(r => `${r.rank}:${r.personName}:${r.overtimeHours}:${r.tieBreakText}`).join('|')}`;
      if (!force && digest === state.lastDigest && Date.now() - state.lastSentAt < COOLDOWN_MS) return { skipped: true, reason: 'duplicate-cooldown' };

      const payload = {
        batchId: `ranking:${before.date}:${Date.now().toString(36)}`,
        forecastDate: before.date,
        capturedAt: new Date().toISOString(),
        sourceVersion: VERSION,
        tier: 'Tier 1',
        pageUrl: location.href,
        rows,
        captureComplete: rows.length >= MIN_COMPLETE_ROWS && diag.sequential && diag.uniqueNames && diag.michaelFound && diag.scrollSweepComplete,
        diagnostics: diag,
      };
      const body = await postRanking(payload);
      state.lastDigest = digest;
      state.lastSentAt = Date.now();
      state.status = body?.ranking?.quality === 'good' ? 'sent-good' : 'sent-partial';
      state.lastError = '';
      saveJSON(STATE_KEY, { lastDigest: state.lastDigest, lastSentAt: state.lastSentAt, lastDate: before.date, rows: rows.length, version: VERSION });
      renderStatus();
      return body;
    } catch (err) {
      state.status = 'error';
      state.lastError = String(err?.message || err);
      console.warn('Mission Vector Check It OT collector:', err);
      renderStatus();
      alert(`OT ranking capture failed: ${state.lastError}`);
      return { ok: false, error: state.lastError };
    } finally {
      stopCaptureObservation();
      state.running = false;
      renderStatus();
    }
  }

  const prior = loadJSON(STATE_KEY, {});
  state.lastDigest = clean(prior.lastDigest);
  state.lastSentAt = Number(prior.lastSentAt) || 0;

  window.MVCI_REBEL_SCOUT_OT = { version: VERSION, captureRanking: opts => captureRanking(opts || { force: true }), pairing, state, detectForecastDate, isRankingPage };
})();


GM_deleteValue('rebelScoutActionInputV1');
/* --- Explicit Rebel Command action input retained inert for rollback/reference; collector-only mode clears state before init. --- */
(function(){
'use strict';
if(window.top!==window.self||window.MVCI_REBEL_SCOUT_ACTIONS)return;
const VERSION='1.1.39';
const core=window.MVCI_REBEL_SCOUT_CORE;
const STATE_KEY='rebelScoutActionInputV1';
const SYNC_KEY='rebelScoutSyncQueueV1';
const ROW_MARK='data-mvci-action-target';
const BRIDGE_ID='mvci-rebel-scout-select-bridge-v110';
const ROW_BRIDGE_ID='mvci-rebel-scout-row-bridge-v118';
const OT_ROW_BRIDGE_ID='mvci-rebel-scout-ot-row-bridge-v120';
const OT_AUTOCOMPLETE_BRIDGE_ID='mvci-rebel-scout-ot-autocomplete-bridge-v133';
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const clip=(v,n=2000)=>clean(v).slice(0,n);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const iso=/^\d{4}-\d{2}-\d{2}$/;
function getState(){const x=GM_getValue(STATE_KEY,{});return x&&typeof x==='object'?x:{}}
function saveState(patch){const next={...getState(),...patch,updatedAt:Date.now()};GM_setValue(STATE_KEY,next);emit();return next}
function clearState(){GM_deleteValue(STATE_KEY);clearMarks();disarm();emit()}
function emit(){try{window.dispatchEvent(new CustomEvent('mvci-rebel-scout-action-state',{detail:status()}))}catch(_){}}
function syncActive(){return GM_getValue(SYNC_KEY,{})?.active===true}
function isSchedule(){return /\/Application\/ControlPanel\/Schedule/i.test(location.pathname)&&!/ListView/i.test(location.pathname)}
function isListView(){return /\/Application\/ControlPanel\/ListView/i.test(location.pathname)}
function targetHash(date){if(!iso.test(date||''))throw new Error('Invalid action date.');return`#${date}`}
function scheduleUrl(date){return`${location.origin}/Application/ControlPanel/Schedule/${targetHash(date)}`}
function scheduleBaseUrl(){return`${location.origin}/Application/ControlPanel/Schedule/`}
async function waitScheduleDate(target,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){if(renderedScheduleDate()===target)return true;await wait(150)}throw new Error('Crew Scheduler did not reach '+target+'.')}
function visibleDatepicker(){const p=document.querySelector('#ui-datepicker-div');return p&&visible(p)?p:null}
async function setScheduleDateLikeOperator(target){
  if(renderedScheduleDate()===target)return true;
  const trigger=[...document.querySelectorAll('img.ui-datepicker-trigger')].find(visible);
  if(!trigger)throw new Error('Crew Scheduler date-picker button was not found.');
  trigger.click();
  let picker=null;const openStart=Date.now();
  while(Date.now()-openStart<5000){picker=visibleDatepicker();if(picker)break;await wait(100)}
  if(!picker)throw new Error('Crew Scheduler date picker did not open.');
  const [ty,tm,td]=target.split('-').map(Number);let guard=0;
  while(guard++<24){
    const monthText=clean(picker.querySelector('.ui-datepicker-month')?.textContent||'');
    const yearText=clean(picker.querySelector('.ui-datepicker-year')?.textContent||'');
    const cur=new Date(monthText+' 1, '+yearText+' 12:00:00');
    if(Number.isNaN(cur.getTime()))throw new Error('Crew Scheduler date picker month/year could not be read.');
    const diff=(ty-cur.getFullYear())*12+(tm-1-cur.getMonth());
    if(diff===0)break;
    const ctl=picker.querySelector(diff>0?'.ui-datepicker-next':'.ui-datepicker-prev');
    if(!ctl)throw new Error('Crew Scheduler date picker month navigation control was not found.');
    ctl.click();await wait(220);picker=visibleDatepicker()||picker;
  }
  const day=[...picker.querySelectorAll('.ui-datepicker-calendar td:not(.ui-datepicker-other-month) a')].find(a=>clean(a.textContent)===String(td));
  if(!day)throw new Error('Crew Scheduler date picker could not find day '+td+' for '+target+'.');
  day.click();
  await waitScheduleDate(target,15000);
  return true;
}
function listViewUrl(date){const[y,m,d]=date.split('-');return`${location.origin}/Application/ControlPanel/ListView/#${y}/${m}/${d}`}
function renderedScheduleDate(){
 const title=clean(document.querySelector('#ui-dialog-title-shift-users-dialog')?.textContent||'');
 let m=title.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i);
 if(!m){const body=String(document.body?.innerText||'').slice(0,18000);m=body.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/i)}
 if(!m)return'';const d=new Date(`${m[1]} ${m[2]}, ${m[3]} 12:00:00`);return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
async function worklist(){const b=await core.request(`?action=action-worklist&sourceVersion=${encodeURIComponent(`rebel-scout-${VERSION}`)}`);return Array.isArray(b?.packages)?b.packages:[]}
async function preflight(key){return core.request(`?action=action-preflight&packageKey=${encodeURIComponent(key)}`)}
function clearMarks(){for(const el of document.querySelectorAll(`[${ROW_MARK}]`)){el.removeAttribute(ROW_MARK);el.style.outline='';el.style.outlineOffset='';el.style.boxShadow=''}}
function mark(el){clearMarks();el.setAttribute(ROW_MARK,'1');el.style.outline='4px solid #f59e0b';el.style.outlineOffset='3px';el.style.boxShadow='0 0 0 7px rgba(245,158,11,.22)';el.scrollIntoView({behavior:'smooth',block:'center'});return el}
function assignmentOf(pkg){const rows=Array.isArray(pkg?.payload?.assignments)?pkg.payload.assignments:[];if(rows.length!==1)throw new Error(`Schedule package must contain exactly one assignment; found ${rows.length}.`);return rows[0]}
function roleFor(a){const x=clean(`${a?.position_label||''} ${a?.planned_credit||''} ${a?.planned_swing_mode||''}`).toUpperCase();if(/\bTAC\b|TEMPORARY CAPTAIN/.test(x))return'TAC';if(/\bTADE\b|TEMPORARY FIRE ENGINEER/.test(x))return'TADE';if(/\bSWING\b/.test(x))return'SWING';if(/\bTILLER\b|\bTM\b/.test(x))return'TM';if(/\bFIREFIGHTER\b|\bFFB\b|\bFF\b/.test(x))return'FFB';throw new Error(`Unsupported schedule role: ${clean(a?.position_label||a?.planned_credit||'unknown')}.`)}
const ROLES={
 TM:{label:'Tiller',workType:'33965',subtypes:[],qual:/\[TM\]\s*Tillerman|\bTillerman\b/i,badge:null},
 FFB:{label:'Firefighter',workType:'33965',subtypes:[],qual:/\[FFB\]\s*Firefighter|\bFirefighter\b/i,badge:null},
 SWING:{label:'FF / Swing',workType:'33965',subtypes:[],qual:/\[FFB\]\s*Firefighter|\bFirefighter\b/i,badge:/^SWING$/i},
 TADE:{label:'TADE',workType:'33965',subtypes:['25864'],qual:/\[DE-A\]\s*Engineer-Aerial|Engineer-Aerial/i,badge:/^TADE$/i},
 TAC:{label:'TAC',workType:'33965',subtypes:['25870'],qual:/\[Capt\]\s*Captain|\bCaptain\b/i,badge:/^TAC$/i}
};
const CONTROLLED_SUBTYPES=new Set(['25864','25870']);
const CONTROLLED_LABEL_RE=/^(?:SWING|TADE|TAC)$/i;
function selectedValues(sel){return sel?[...sel.selectedOptions].map(o=>String(o.value)):[]}
function sameValues(a,b){return [...new Set((a||[]).map(String))].sort().join('|')===[...new Set((b||[]).map(String))].sort().join('|')}
function isControlledQualText(text){const t=clean(text);return Object.values(ROLES).some(r=>r.qual.test(t))}
function uniqueValues(xs){return [...new Set((xs||[]).map(String).filter(Boolean))]}
function targetSubtypeValues(sel,role){return uniqueValues([...selectedValues(sel).filter(v=>!CONTROLLED_SUBTYPES.has(v)),...role.subtypes])}
function targetQualifierValues(sel,qOpt){const keep=[...sel.selectedOptions].filter(o=>!isControlledQualText(o.textContent||'')).map(o=>String(o.value));return uniqueValues([...keep,String(qOpt.value)])}
function targetLabelValues(sel,lOpt){const keep=[...sel.selectedOptions].filter(o=>!CONTROLLED_LABEL_RE.test(clean(o.textContent||''))).map(o=>String(o.value));return uniqueValues(lOpt?[...keep,String(lOpt.value)]:keep)}
function nonWritablePackage(pkg){const p=pkg?.payload&&typeof pkg.payload==='object'?pkg.payload:{};return p.test_only===true||p.write_allowed===false}
function selectSchedulePackage(list){const all=(Array.isArray(list)?list:[]).filter(x=>x.actionType==='schedule'),recover=all.filter(x=>x.stage==='reread_verification'||x.status==='writing');if(recover.length)return recover.sort((a,b)=>String(a.targetDate||'').localeCompare(String(b.targetDate||'')))[0];const writable=all.filter(x=>!nonWritablePackage(x)),pool=writable.length?writable:all;return pool.sort((a,b)=>String(a.targetDate||'').localeCompare(String(b.targetDate||'')))[0]||null}
function selectOtPackage(list){const all=(Array.isArray(list)?list:[]).filter(x=>x.actionType==='overtime_signup'),recover=all.filter(x=>x.stage==='reread_verification'||x.status==='writing');if(recover.length)return recover.sort((a,b)=>String(a.targetDate||'').localeCompare(String(b.targetDate||'')))[0];const writable=all.filter(x=>!nonWritablePackage(x)),pool=writable.length?writable:all;return pool.sort((a,b)=>String(a.targetDate||'').localeCompare(String(b.targetDate||'')))[0]||null}
function rowInfo(row){const shift=row?.closest?.('.fc-event-shift[data-id][data-date]');return{person:clean(row?.querySelector?.('.fc-event-user-name')?.textContent||row?.textContent),userId:clean(row?.getAttribute?.('data-user-id')),shiftUserId:clean(row?.getAttribute?.('data-shift-user-id')),qualifierId:clean(row?.getAttribute?.('data-qualifierid')),date:clean(row?.getAttribute?.('data-date')),assignmentId:clean(shift?.getAttribute?.('data-id')),unitText:clip(shift?.textContent,800)}}
function scheduleRows(pkg){const a=assignmentOf(pkg),name=clean(a.person_name).toLowerCase(),unit=clean(a.unit||'Truck 504').toLowerCase();return[...document.querySelectorAll(`.fc-event-user[data-date="${CSS.escape(pkg.targetDate)}"][data-shift-user-id][data-user-id]`)].filter(row=>{const shift=row.closest('.fc-event-shift[data-id][data-date]'),n=clean(row.querySelector('.fc-event-user-name')?.textContent||row.textContent).toLowerCase(),u=clean(shift?.textContent).toLowerCase();return n===name&&u.includes(unit)})}
function markScheduleRow(pkg){const rows=scheduleRows(pkg);if(rows.length!==1)throw new Error(`Expected exactly one ${assignmentOf(pkg).person_name} row on ${assignmentOf(pkg).unit||'Truck 504'} for ${pkg.targetDate}; found ${rows.length}.`);return mark(rows[0])}
function scheduleModal(){const visible=[...document.querySelectorAll('#shift-users-dialog')].map(dlg=>{if(!dlg?.isConnected)return null;const form=dlg.querySelector('#shift-user-form'),box=dlg.closest('.ui-dialog')||dlg;if(!form)return null;const st=getComputedStyle(box),r=box.getBoundingClientRect();if(st.display==='none'||st.visibility==='hidden'||Number(st.opacity||1)===0||r.width<20||r.height<20)return null;return{dlg,form,box}}).filter(Boolean);return visible.length===1?visible[0]:null}
async function waitScheduleModal(timeout=10000){const start=Date.now();while(Date.now()-start<timeout){const m=scheduleModal();if(m)return m;await wait(125)}throw new Error('CrewSense assignment window did not open after the verified row click.')}
function selectedTexts(sel){return[...sel.selectedOptions].map(o=>clean(o.textContent||''))}
function optionBy(sel,value,re){const hasValue=value!==undefined&&value!==null&&String(value)!=='';return(hasValue?[...sel.options].find(o=>String(o.value)===String(value)):null)||[...sel.options].find(o=>re?.test(clean(o.textContent||'')))||null}
async function stableOptions(sel,timeout=10000){if(!sel)throw new Error('CrewSense select field was not found.');let last='',stable=0,start=Date.now();while(Date.now()-start<timeout){if(!sel.isConnected)throw new Error('CrewSense replaced an assignment field while loading.');const sig=[...sel.options].map(o=>`${o.value}:${clean(o.textContent)}`).join('|');if(sig&&sig===last)stable++;else stable=0;last=sig;if(stable>=3)return;await wait(200)}throw new Error(`CrewSense options for ${sel.id||sel.name||'field'} did not stabilize.`)}
function installBridge(){if(document.getElementById(BRIDGE_ID))return;const s=document.createElement('script');s.id=BRIDGE_ID;s.textContent=`(()=>{if(window.__MVCI_SELECT_BRIDGE_110)return;window.__MVCI_SELECT_BRIDGE_110=1;document.addEventListener('mvci:select-set-v110',ev=>{const d=ev.detail||{},sel=document.querySelector(d.selector);let ok=false,err='';try{if(!sel)throw new Error('select not found');const jq=window.jQuery;if(!jq)throw new Error('CrewSense page jQuery unavailable');const vals=Array.isArray(d.values)?d.values:[d.values];jq(sel).val(sel.multiple?vals:(vals[0]??'')).trigger('change');ok=true}catch(e){err=String(e&&e.message||e)}document.dispatchEvent(new CustomEvent('mvci:select-result-v110',{detail:{nonce:d.nonce,ok,err}}))})})();`;document.documentElement.appendChild(s)}
function escCss(v){return window.CSS?.escape?CSS.escape(v):String(v).replace(/[^a-zA-Z0-9_-]/g,c=>`\\${c}`)}
async function pageSet(sel,values){installBridge();if(!sel?.isConnected)throw new Error('CrewSense select field is no longer connected.');const nonce=`v110-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,attr='data-mvci-select-target';sel.setAttribute(attr,nonce);const selector=`select[${attr}="${nonce}"]`,cleanup=()=>{try{if(sel.getAttribute(attr)===nonce)sel.removeAttribute(attr)}catch(_){}};return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{document.removeEventListener('mvci:select-result-v110',fn);cleanup();reject(new Error('CrewSense select update timed out.'))},5000);const fn=ev=>{if(ev.detail?.nonce!==nonce)return;clearTimeout(timer);document.removeEventListener('mvci:select-result-v110',fn);cleanup();ev.detail?.ok?resolve(ev.detail):reject(new Error(ev.detail?.err||'CrewSense select update failed.'))};document.addEventListener('mvci:select-result-v110',fn);document.dispatchEvent(new CustomEvent('mvci:select-set-v110',{detail:{nonce,selector,values}}))})}
function installRowBridge(){if(document.getElementById(ROW_BRIDGE_ID))return;const s=document.createElement('script');s.id=ROW_BRIDGE_ID;s.textContent=`(()=>{if(window.__MVCI_ROW_BRIDGE_118)return;window.__MVCI_ROW_BRIDGE_118=1;document.addEventListener('mvci:row-click-v118',ev=>{const d=ev.detail||{};let ok=false,err='';try{const row=document.querySelector(d.selector);if(!row)throw new Error('target row not found');const jq=window.jQuery;if(!jq)throw new Error('CrewSense page jQuery unavailable');const hs=(jq._data&&jq._data(document,'events')&&jq._data(document,'events').click)||[];if(!hs.some(h=>String(h.selector||'').includes('.fc-event-user:not(.unscheduled):not(.add-open-slot):not(.rscb)')))throw new Error('CrewSense assignment click handler not found');jq(row).trigger('click');ok=true}catch(e){err=String(e&&e.message||e)}document.dispatchEvent(new CustomEvent('mvci:row-click-result-v118',{detail:{nonce:d.nonce,ok,err}}))})})();`;document.documentElement.appendChild(s)}
async function pageClickScheduleRow(row){installRowBridge();if(!row?.isConnected)throw new Error('CrewSense target row is no longer connected.');const nonce=`v118-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,attr='data-mvci-row-target';row.setAttribute(attr,nonce);const selector=`[${attr}="${nonce}"]`,cleanup=()=>{try{if(row.getAttribute(attr)===nonce)row.removeAttribute(attr)}catch(_){}};return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{document.removeEventListener('mvci:row-click-result-v118',fn);cleanup();reject(new Error('CrewSense row-open bridge timed out.'))},5000);const fn=ev=>{if(ev.detail?.nonce!==nonce)return;clearTimeout(timer);document.removeEventListener('mvci:row-click-result-v118',fn);cleanup();ev.detail?.ok?resolve(ev.detail):reject(new Error(ev.detail?.err||'CrewSense row-open bridge failed.'))};document.addEventListener('mvci:row-click-result-v118',fn);document.dispatchEvent(new CustomEvent('mvci:row-click-v118',{detail:{nonce,selector}}))})}
function installOtRowBridge(){if(document.getElementById(OT_ROW_BRIDGE_ID))return;const s=document.createElement('script');s.id=OT_ROW_BRIDGE_ID;s.textContent=`(()=>{if(window.__MVCI_OT_ROW_BRIDGE_120)return;window.__MVCI_OT_ROW_BRIDGE_120=1;document.addEventListener('mvci:ot-row-click-v120',ev=>{const d=ev.detail||{};let ok=false,err='';try{const row=document.querySelector(d.selector);if(!row)throw new Error('OT target row not found');const jq=window.jQuery;if(jq)jq(row).trigger('click');else if(typeof row.click==='function')row.click();else row.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));ok=true}catch(e){err=String(e&&e.message||e)}document.dispatchEvent(new CustomEvent('mvci:ot-row-click-result-v120',{detail:{nonce:d.nonce,ok,err}}))})})();`;document.documentElement.appendChild(s)}
async function pageClickOtRow(row){installOtRowBridge();if(!row?.isConnected)throw new Error('CrewSense OT target row is no longer connected.');const nonce=`v120-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,attr='data-mvci-ot-row-target';row.setAttribute(attr,nonce);const selector=`[${attr}="${nonce}"]`,cleanup=()=>{try{if(row.getAttribute(attr)===nonce)row.removeAttribute(attr)}catch(_){}};return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{document.removeEventListener('mvci:ot-row-click-result-v120',fn);cleanup();reject(new Error('CrewSense OT row-open bridge timed out.'))},5000);const fn=ev=>{if(ev.detail?.nonce!==nonce)return;clearTimeout(timer);document.removeEventListener('mvci:ot-row-click-result-v120',fn);cleanup();ev.detail?.ok?resolve(ev.detail):reject(new Error(ev.detail?.err||'CrewSense OT row-open bridge failed.'))};document.addEventListener('mvci:ot-row-click-result-v120',fn);document.dispatchEvent(new CustomEvent('mvci:ot-row-click-v120',{detail:{nonce,selector}}))})}
function michaelSelectedChip(dlg){
  const chips=[...dlg.querySelectorAll('li.tagedit-listelement-old,.tagedit-listelement-old')].filter(visible).filter(el=>/^Michael Brion(?:\s*x)?$/i.test(clean(el.textContent||'').replace(/×/g,'x'))||/^Michael Brion\b/i.test(clean(el.textContent||'')));
  return chips.length===1?chips[0]:null;
}
function installOtAutocompleteBridge(){
  if(document.getElementById(OT_AUTOCOMPLETE_BRIDGE_ID))return;
  const s=document.createElement('script');s.id=OT_AUTOCOMPLETE_BRIDGE_ID;
  s.textContent=`(()=>{if(window.__MVCI_OT_AUTOCOMPLETE_BRIDGE_133)return;window.__MVCI_OT_AUTOCOMPLETE_BRIDGE_133=1;
    document.addEventListener('mvci:ot-autocomplete-search-v133',ev=>{const d=ev.detail||{};let ok=false,err='';try{
      const input=document.querySelector(d.selector);if(!input)throw new Error('tag input not found');
      const jq=window.jQuery;if(!jq)throw new Error('CrewSense page jQuery unavailable');
      const q=String(d.query||'');const $i=jq(input);$i.focus();$i.val(q);
      if(typeof $i.autocomplete==='function'){$i.autocomplete('search',q)}else{$i.trigger('input').trigger('keyup')}
      ok=true
    }catch(e){err=String(e&&e.message||e)}
    document.dispatchEvent(new CustomEvent('mvci:ot-autocomplete-search-result-v133',{detail:{nonce:d.nonce,ok,err}}))
    });
    document.addEventListener('mvci:ot-autocomplete-choose-v133',ev=>{const d=ev.detail||{};let ok=false,err='';try{
      const item=document.querySelector(d.selector);if(!item)throw new Error('autocomplete result not found');
      const jq=window.jQuery;if(!jq)throw new Error('CrewSense page jQuery unavailable');
      jq(item).trigger('mouseenter').trigger('mousedown').trigger('click');ok=true
    }catch(e){err=String(e&&e.message||e)}
    document.dispatchEvent(new CustomEvent('mvci:ot-autocomplete-choose-result-v133',{detail:{nonce:d.nonce,ok,err}}))
    })
  })();`;
  document.documentElement.appendChild(s)
}
async function pageAutocompleteSearch(input,query){
  installOtAutocompleteBridge();
  const nonce='otac-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),attr='data-mvci-ot-autocomplete-input';
  input.setAttribute(attr,nonce);const selector='input['+attr+'="'+nonce+'"]';
  return new Promise((resolve,reject)=>{const cleanup=()=>{try{input.removeAttribute(attr)}catch(_){}};
    const timer=setTimeout(()=>{document.removeEventListener('mvci:ot-autocomplete-search-result-v133',fn);cleanup();reject(new Error('CrewSense autocomplete search bridge timed out.'))},5000);
    const fn=ev=>{if(ev.detail?.nonce!==nonce)return;clearTimeout(timer);document.removeEventListener('mvci:ot-autocomplete-search-result-v133',fn);cleanup();ev.detail?.ok?resolve(ev.detail):reject(new Error(ev.detail?.err||'CrewSense autocomplete search failed.'))};
    document.addEventListener('mvci:ot-autocomplete-search-result-v133',fn);
    document.dispatchEvent(new CustomEvent('mvci:ot-autocomplete-search-v133',{detail:{nonce,selector,query}}))
  })
}
async function pageAutocompleteChoose(item){
  installOtAutocompleteBridge();
  const nonce='otchoose-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),attr='data-mvci-ot-autocomplete-result';
  item.setAttribute(attr,nonce);const selector='['+attr+'="'+nonce+'"]';
  return new Promise((resolve,reject)=>{const cleanup=()=>{try{item.removeAttribute(attr)}catch(_){}};
    const timer=setTimeout(()=>{document.removeEventListener('mvci:ot-autocomplete-choose-result-v133',fn);cleanup();reject(new Error('CrewSense autocomplete selection bridge timed out.'))},5000);
    const fn=ev=>{if(ev.detail?.nonce!==nonce)return;clearTimeout(timer);document.removeEventListener('mvci:ot-autocomplete-choose-result-v133',fn);cleanup();ev.detail?.ok?resolve(ev.detail):reject(new Error(ev.detail?.err||'CrewSense autocomplete selection failed.'))};
    document.addEventListener('mvci:ot-autocomplete-choose-result-v133',fn);
    document.dispatchEvent(new CustomEvent('mvci:ot-autocomplete-choose-v133',{detail:{nonce,selector}}))
  })
}
async function selectMichaelLikeOperator(dlg,timeout=8000){
  const inputs=[...dlg.querySelectorAll('input#tagedit-input[name="users[]"]')].filter(visible);
  if(inputs.length!==1)throw new Error('CrewSense Michael tag-entry field was not uniquely identified.');
  const input=inputs[0];
  await pageAutocompleteSearch(input,'brion');
  const start=Date.now();let item=null;
  while(Date.now()-start<timeout){
    const xs=[...document.querySelectorAll('.ui-autocomplete a,#ui-active-menuitem,a.ui-corner-all')].filter(visible).filter(a=>/^Michael Brion$/i.test(clean(a.textContent||'')));
    if(xs.length===1){item=xs[0];break}
    if(xs.length>1)throw new Error('CrewSense autocomplete exposed more than one exact Michael Brion result.');
    await wait(100);
  }
  if(!item)throw new Error('CrewSense autocomplete did not expose exactly one Michael Brion result.');
  await pageAutocompleteChoose(item);
  const chipStart=Date.now();
  while(Date.now()-chipStart<timeout){const chip=michaelSelectedChip(dlg);if(chip)return{input:{id:input.id,name:input.name,typed:'brion'},result:{text:'Michael Brion'},chip:{text:clean(chip.textContent||'')}};await wait(100)}
  throw new Error('CrewSense did not create the selected Michael Brion chip after autocomplete selection.');
}

function findQual(dlg){const x=[...dlg.querySelectorAll('select')].filter(s=>[...s.options].some(o=>/\[TM\]\s*Tillerman|\[FFB\]\s*Firefighter|\[DE-A\]\s*Engineer-Aerial|\[Capt\]\s*Captain/i.test(clean(o.textContent))));if(x.length!==1)throw new Error(`Expected one CrewSense qualifier field; found ${x.length}.`);return x[0]}
function findLabels(dlg){const x=[...dlg.querySelectorAll('select')].filter(s=>[...s.options].some(o=>/^SWING$|^TADE$|^TAC$/i.test(clean(o.textContent))));if(x.length!==1)throw new Error(`Expected one CrewSense assignment-label field; found ${x.length}.`);return x[0]}
function modalIdentity(m,expected,targetDate){const date=clean(m.form.querySelector('input[name="date"]')?.value),shiftId=clean(m.form.querySelector('input[name="shift_id"]')?.value),shiftUsersId=clean(m.form.querySelector('input[name="shift_users_id"]')?.value);if(date!==targetDate)throw new Error(`CrewSense modal date is ${date||'unknown'}, expected ${targetDate}.`);if(expected?.assignmentId&&shiftId!==expected.assignmentId)throw new Error('CrewSense assignment window identity does not match the approved shift.');if(expected?.shiftUserId&&shiftUsersId!==expected.shiftUserId)throw new Error('CrewSense assignment window identity does not match the approved person/assignment row.');return{formDate:date,shiftId,shiftUsersId}}
function modalFingerprint(m,expected,pkg){const a=assignmentOf(pkg),ri=expected&&typeof expected==='object'?expected:{},identity=modalIdentity(m,ri,pkg.targetDate);if(ri.date!==pkg.targetDate)throw new Error('Highlighted CrewSense row date changed.');if(!clean(ri.unitText).toLowerCase().includes(clean(a.unit||'Truck 504').toLowerCase()))throw new Error('CrewSense assignment group does not match the approved unit.');return{...ri,...identity}}
function qualifierTags(m){const wrap=m?.dlg?.querySelector('#qualifiers-wrapper');if(!wrap)throw new Error('CrewSense qualifier tag wrapper was not found.');return[...wrap.querySelectorAll('li.tagedit-listelement-old')].map(li=>{const hidden=[...li.querySelectorAll('input[type="hidden"][name^="qualifiers["]')].find(x=>/^qualifiers\[[^\]]+\]$/.test(x.name||'')),mm=String(hidden?.name||'').match(/^qualifiers\[([^\]]+)\]$/),id=clean(mm?.[1]||''),text=clean(hidden?.value||li.querySelector('span')?.textContent||li.textContent),close=li.querySelector('a.tagedit-close');return{id,text,li,hidden,close}}).filter(x=>x.id&&x.text)}
function qualifierTagSnapshot(m){return qualifierTags(m).map(x=>({id:x.id,text:x.text}))}
function qualifierTagValues(m){return qualifierTags(m).map(x=>x.id)}
function qualifierTagTexts(m){return qualifierTags(m).map(x=>x.text)}
function snapshotSelections(m){const wt=m.dlg.querySelector('#work_type_id'),sub=m.dlg.querySelector('#work_subtype_id'),labels=findLabels(m.dlg);return{workType:clean(wt?.value),subtypeValues:sub?[...sub.selectedOptions].map(o=>String(o.value)):[],qualifierValues:qualifierTagValues(m),qualifierTexts:qualifierTagTexts(m),qualifierTags:qualifierTagSnapshot(m),labelValues:[...labels.selectedOptions].map(o=>String(o.value)),labelTexts:selectedTexts(labels)}}
function currentRoleFromPreflight(server,a){const checks=Array.isArray(server?.checks)?server.checks:[],name=clean(a?.person_name).toLowerCase(),hit=checks.find(x=>clean(x?.personName).toLowerCase()===name)||checks[0];if(!hit||Number(hit.matchCount)!==1)throw new Error('Rebel Command preflight did not resolve exactly one current assignment for the target person.');return roleFor({position_label:hit.currentPosition||'',planned_credit:'',planned_swing_mode:''})}
async function waitQualifierTags(m,pred,description,timeout=5000){const start=Date.now();while(Date.now()-start<timeout){const tags=qualifierTags(m);if(pred(tags))return tags;await wait(100)}throw new Error(`CrewSense qualifier tags did not reach ${description}.`)}
async function removeQualifierTag(m,tag){if(!tag?.close||!tag.close.isConnected)throw new Error(`CrewSense remove control for qualifier ${tag?.text||tag?.id||'unknown'} was not found.`);tag.close.click();await waitQualifierTags(m,tags=>!tags.some(x=>x.id===tag.id),`removed ${tag.text||tag.id}`)}
async function addQualifierTag(m,id){const qual=findQual(m.dlg),opt=optionBy(qual,id,null);if(!opt)throw new Error(`CrewSense qualifier ${id} is unavailable in the add-qualifier dropdown.`);if(qualifierTags(m).some(x=>x.id===String(id)))return;await pageSet(qual,[String(id)]);await waitQualifierTags(m,tags=>tags.some(x=>x.id===String(id)),`added ${clean(opt.textContent||id)}`)}
async function setQualifierTagState(m,desiredIds){const desired=uniqueValues(desiredIds),current=qualifierTags(m);for(const tag of current){if(!desired.includes(tag.id))await removeQualifierTag(m,tag)}for(const id of desired){if(!qualifierTags(m).some(x=>x.id===id))await addQualifierTag(m,id)}const finalIds=qualifierTagValues(m);if(!sameValues(finalIds,desired))throw new Error(`CrewSense qualifier tag state did not stabilize to the requested values. Current: ${finalIds.join(', ')||'none'}.`);return qualifierTagSnapshot(m)}
async function waitCurrentAssignmentHydrated(m,expected,currentRoleKey,timeout=12000){if(!expected?.assignmentId||!expected?.userId||!expected?.shiftUserId)throw new Error('CrewSense row is missing required assignment identity. Scout will not prepare this row.');const expectedRole=ROLES[currentRoleKey];if(!expectedRole)throw new Error('Rebel Command current role is not supported by the verified CrewSense mapping.');const start=Date.now();let last='',stable=0,readySince=0,lastObserved={};while(Date.now()-start<timeout){const live=scheduleModal();if(!live||live.form!==m.form)throw new Error('CrewSense assignment window changed while loading.');let snap;try{snap=snapshotSelections(m)}catch(_){await wait(250);continue}const formShiftId=clean(m.form.querySelector('input[name="shift_id"]')?.value),formShiftUserId=clean(m.form.querySelector('input[name="shift_users_id"]')?.value),identityReady=formShiftId===expected.assignmentId&&formShiftUserId===expected.shiftUserId,controlled=snap.qualifierTexts.filter(isControlledQualText),qualifierReady=controlled.length===1&&expectedRole.qual.test(controlled[0]),workTypeReady=!!snap.workType;lastObserved={formShiftId,formShiftUserId,controlledQualifierTexts:controlled,qualifierValues:snap.qualifierValues,workType:snap.workType};if(identityReady&&qualifierReady&&workTypeReady){if(!readySince)readySince=Date.now();const sig=JSON.stringify(snap);if(sig===last)stable++;else stable=0;last=sig;if(stable>=4&&Date.now()-readySince>=1000)return snap}else{readySince=0;stable=0;last=''}await wait(250)}throw new Error(`CrewSense did not finish hydrating the clicked assignment as current role ${expectedRole.label} before Scout timeout. Observed controlled qualifier(s): ${(lastObserved.controlledQualifierTexts||[]).join(', ')||'none'}; shift ${lastObserved.formShiftId||'unknown'}; shift-user ${lastObserved.formShiftUserId||'unknown'}. No fields were changed.`)}
async function waitPreparedStable(m,role,timeout=8000){const start=Date.now();let last='',stable=0,lastError='';while(Date.now()-start<timeout){try{const snap=verifyPrepared(m,role),sig=JSON.stringify(snap);if(sig===last)stable++;else stable=0;last=sig;if(stable>=4)return snap}catch(e){lastError=clean(e?.message||e);stable=0;last=''}await wait(250)}throw new Error(lastError||'CrewSense prepared fields did not stabilize.')}
async function restoreSelections(m,b){const wt=m.dlg.querySelector('#work_type_id'),sub=m.dlg.querySelector('#work_subtype_id'),labels=findLabels(m.dlg);if(wt&&String(wt.value)!==String(b.workType))await pageSet(wt,[b.workType]);if(sub&&!sameValues(selectedValues(sub),b.subtypeValues))await pageSet(sub,b.subtypeValues);if(!sameValues(qualifierTagValues(m),b.qualifierValues))await setQualifierTagState(m,b.qualifierValues);if(!sameValues(selectedValues(labels),b.labelValues))await pageSet(labels,b.labelValues);await wait(500);const restored=snapshotSelections(m);if(String(restored.workType)!==String(b.workType)||!sameValues(restored.subtypeValues,b.subtypeValues)||!sameValues(restored.qualifierValues,b.qualifierValues)||!sameValues(restored.labelValues,b.labelValues))throw new Error('CrewSense did not restore the original assignment fields. Close this window without saving.');return restored}
function verifyPrepared(m,role){const s=snapshotSelections(m);if(String(s.workType)!==String(role.workType))throw new Error('CrewSense Work Type did not retain Salary Step [1010].');const controlledQual=s.qualifierTexts.filter(isControlledQualText);if(!controlledQual.some(t=>role.qual.test(t)))throw new Error(`CrewSense did not retain ${role.label} qualifier.`);if(controlledQual.some(t=>!role.qual.test(t)))throw new Error('CrewSense retained a conflicting controlled riding qualifier.');const controlledSub=s.subtypeValues.filter(v=>CONTROLLED_SUBTYPES.has(String(v)));if(!sameValues(controlledSub,role.subtypes))throw new Error('CrewSense retained conflicting controlled work subtype values.');const controlledLabels=s.labelTexts.filter(t=>CONTROLLED_LABEL_RE.test(t));if(role.badge){if(!controlledLabels.some(t=>role.badge.test(t))||controlledLabels.some(t=>!role.badge.test(t)))throw new Error(`CrewSense did not retain only the ${role.label} assignment label.`)}else if(controlledLabels.length)throw new Error('CrewSense retained an unexpected controlled assignment label.');if(new Set(s.qualifierValues).size!==s.qualifierValues.length)throw new Error('CrewSense returned duplicate qualifier values.');return s}
async function prepareScheduleModal(pkg,expected){if(syncActive())throw new Error('Staffing/OT sync is running. Scheduling input is locked until it finishes.');const a=assignmentOf(pkg),targetRoleKey=roleFor(a),role=ROLES[targetRoleKey];if(clean(a.unit||'Truck 504')!=='Truck 504')throw new Error(`CrewSense input mapping is verified for Truck 504 only; package requests ${a.unit||'unknown unit'}.`);const initialPf=await preflight(pkg.packageKey),initialServer=initialPf?.preflight||initialPf;if(initialServer?.ready!==true)throw new Error(`Rebel Command preflight is not ready before modal preparation: ${initialServer?.reason||'unknown'}.`);const currentRoleKey=currentRoleFromPreflight(initialServer,a);if(!(currentRoleKey==='TM'&&targetRoleKey==='FFB'))throw new Error('This live qualifier-tag mapping is currently verified only for TM -> Firefighter on Truck 504; requested '+currentRoleKey+' -> '+targetRoleKey+'.');const m=await waitScheduleModal(),wt=m.dlg.querySelector('#work_type_id');if(!wt)throw new Error('CrewSense Work Type field was not found.');saveState({stage:'opening_modal',message:`CrewSense window verified. Confirming exact assignment identity and current ${ROLES[currentRoleKey].label} state before Scout changes anything...`});await stableOptions(wt);const sub=m.dlg.querySelector('#work_subtype_id'),qual=findQual(m.dlg),labels=findLabels(m.dlg);if(sub)await stableOptions(sub);await stableOptions(qual);await stableOptions(labels);const before=await waitCurrentAssignmentHydrated(m,expected,currentRoleKey),fingerprint=modalFingerprint(m,expected,pkg);try{const wtOpt=optionBy(wt,role.workType,/Salary Step\s*\[1010\]/i);if(!wtOpt)throw new Error('Salary Step [1010] is unavailable.');if(String(wt.value)!==String(wtOpt.value)){await pageSet(wt,[String(wtOpt.value)]);await wait(350)}if(sub){const desired=targetSubtypeValues(sub,role);if(!sameValues(selectedValues(sub),desired)){await pageSet(sub,desired);await wait(350)}}const qOpt=optionBy(qual,null,role.qual);if(!qOpt)throw new Error(`${role.label} qualifier is unavailable.`);const uncontrolledBefore=before.qualifierTags.filter(x=>!isControlledQualText(x.text)).map(x=>x.id),desiredQual=uniqueValues([...uncontrolledBefore,String(qOpt.value)]);if(!sameValues(qualifierTagValues(m),desiredQual))await setQualifierTagState(m,desiredQual);let lOpt=null;if(role.badge){lOpt=optionBy(labels,null,role.badge);if(!lOpt)throw new Error(`${role.label} assignment label is unavailable.`)}const desiredLabels=targetLabelValues(labels,lOpt);if(!sameValues(selectedValues(labels),desiredLabels)){await pageSet(labels,desiredLabels);await wait(500)}const prepared=await waitPreparedStable(m,role);modalFingerprint(m,expected,pkg);const pf=await preflight(pkg.packageKey),server=pf?.preflight||pf,preconditionMatch=server?.ready===true;const result=await core.post({version:`rebel-scout-${VERSION}`,actionPreview:{packageKey:pkg.packageKey,displayedDate:pkg.targetDate,sourceVersion:`rebel-scout-${VERSION}`,preconditionMatch,evidence:{mode:'explicit_schedule_input',row:fingerprint,prepared,serverPreflight:server,automatedWriteAttempted:false}}});if(!result?.actionPreview?.ready)throw new Error(`Rebel Command blocked the prepared input: ${result?.actionPreview?.preflight?.reason||server?.reason||'preconditions changed'}.`);const testOnly=nonWritablePackage(pkg);saveState({packageKey:pkg.packageKey,targetDate:pkg.targetDate,actionType:'schedule',summary:pkg.summary||'',payload:pkg.payload,stage:'prepared',row:fingerprint,prepared,preparedAt:Date.now(),testOnly,message:testOnly?`TEST PREVIEW READY: Prepared ${a.person_name} -> ${role.label}. Commit is disabled; close the CrewSense window without saving after review.`:`Prepared ${a.person_name} -> ${role.label}. Review CrewSense fields, then COMMIT ONE SCHEDULE SAVE.`})}catch(e){const original=clean(e?.message||e);try{await restoreSelections(m,before)}catch(re){throw new Error(`${original} Restore warning: ${clean(re?.message||re)}`)}throw e}}
let armedHandler=null,armedModalTimer=null,armedAdvanceBusy=false;
function disarm(){if(armedHandler){document.removeEventListener('pointerdown',armedHandler,true);armedHandler=null}if(armedModalTimer){clearInterval(armedModalTimer);armedModalTimer=null}armedAdvanceBusy=false}
function sameScheduleIdentity(info,expected){return !!info&&!!expected&&info.date===expected.date&&info.userId===expected.userId&&info.shiftUserId===expected.shiftUserId&&info.assignmentId===expected.assignmentId}
async function advanceSchedulePreparation(pkg,hit,expected,source,modalFallback=false){if(armedAdvanceBusy)return;const st=getState();if(st.stage!=='awaiting_row_click'||st.packageKey!==pkg.packageKey)return;if(hit){if(!sameScheduleIdentity(rowInfo(hit),expected))return}else{if(!modalFallback||!scheduleModal())return}armedAdvanceBusy=true;disarm();saveState({stage:'opening_modal',message:`Verified ${source}. Waiting for CrewSense to fully hydrate the exact assignment identity before Scout changes anything...`});try{await prepareScheduleModal(pkg,expected)}catch(e){saveState({stage:'error',message:clean(e?.message||e)})}}
async function armScheduleRow(pkg){disarm();const row=markScheduleRow(pkg),expected=rowInfo(row);saveState({packageKey:pkg.packageKey,targetDate:pkg.targetDate,actionType:'schedule',summary:pkg.summary||'',payload:pkg.payload,stage:'opening_modal',row:expected,message:`Opening the exact verified ${expected.person} / ${assignmentOf(pkg).unit||'Truck 504'} CrewSense assignment. Scout will prepare fields but will not Save.`});try{await pageClickScheduleRow(row);await prepareScheduleModal(pkg,expected)}catch(e){saveState({stage:'error',message:clean(e?.message||e)})}}
async function startScheduleInput(){if(syncActive())throw new Error('Rebel Scout data sync is still running. Let it finish before starting a CrewSense write workflow.');const list=await worklist(),pkg=selectSchedulePackage(list);if(!pkg)throw new Error('No approved/queued schedule action is waiting in Rebel Command.');if(pkg.stage==='reread_verification'){saveState({packageKey:pkg.packageKey,targetDate:pkg.targetDate,actionType:'schedule',summary:pkg.summary||'',stage:'commit_consumed',message:'A schedule Save was already authorized earlier. Scout will verify only; it will not Save again.'});return beginVerification()}if(!isSchedule()||renderedScheduleDate()!==pkg.targetDate){saveState({packageKey:pkg.packageKey,targetDate:pkg.targetDate,actionType:'schedule',summary:pkg.summary||'',payload:pkg.payload,stage:'navigating',message:`Opening Crew Scheduler for ${pkg.targetDate}.`});location.assign(scheduleUrl(pkg.targetDate));return}return armScheduleRow(pkg)}
function exactSaveButton(){const m=scheduleModal();if(!m)throw new Error('CrewSense assignment window is no longer open.');const hits=[...m.dlg.querySelectorAll('button,a,input[type="submit"],input[type="button"]')].filter(el=>/^save$/i.test(clean(el.textContent||el.value||''))&&!el.disabled);if(hits.length!==1)throw new Error(`Expected one exact Save control in the verified assignment window; found ${hits.length}.`);return hits[0]}
async function commitPrepared(){if(syncActive())throw new Error('Data sync is running. Commit is blocked.');const initial=getState();if(initial.stage!=='prepared'||!initial.packageKey)throw new Error('No prepared schedule action is waiting for commit.');if(initial.testOnly===true)throw new Error('This is a test-only/non-writable preview. Scout will not authorize CrewSense Save.');if(!navigator.locks?.request)throw new Error('Browser commit lock is unavailable. Scout will not risk a duplicate Save.');return navigator.locks.request(`mvci-rebel-scout-commit:${initial.packageKey}`,{mode:'exclusive'},async()=>{const st=getState();if(st.stage!=='prepared'||st.packageKey!==initial.packageKey)throw new Error('Schedule commit was already started or consumed. Scout will not retry Save.');if(Date.now()-Number(st.preparedAt||0)>10*60*1000)throw new Error('Prepared schedule action expired. Re-open and prepare it again.');saveState({stage:'committing',commitStartedAt:Date.now(),message:'Commit locked. Rechecking Rebel Command authorization; no second commit can start.'});try{const m=scheduleModal();if(!m)throw new Error('CrewSense assignment window is no longer open.');const list=await worklist(),pkg=list.find(x=>x.packageKey===st.packageKey);if(!pkg)throw new Error('Rebel Command package is no longer available.');if(nonWritablePackage(pkg))throw new Error('Rebel Command package is test-only/non-writable. Save is blocked.');modalIdentity(m,st.row||{},st.targetDate);const a=assignmentOf(pkg),role=ROLES[roleFor(a)],prepared=verifyPrepared(m,role),button=exactSaveButton();const result=await core.post({version:`rebel-scout-${VERSION}`,actionCommit:{packageKey:st.packageKey,displayedDate:st.targetDate,sourceVersion:`rebel-scout-${VERSION}`,userConfirmed:true,evidence:{mode:'explicit_schedule_input',row:st.row||{},prepared,saveControl:{tag:button.tagName,id:button.id||'',name:button.name||'',text:clean(button.textContent||button.value||'Save')}}}});if(!result?.actionCommit?.allowWrite)throw new Error(`Rebel Command refused commit: ${result?.actionCommit?.reason||'not authorized'}.`);saveState({stage:'commit_consumed',commitConsumedAt:Date.now(),message:'One-time Save authorization consumed in Rebel Command. Clicking CrewSense Save exactly once; this action will never auto-retry.'});button.click();setTimeout(()=>beginVerification(),1800)}catch(e){if(getState().stage==='committing')saveState({stage:'error',message:`Schedule commit stopped before any retry. ${clean(e?.message||e)} Re-prepare explicitly if another attempt is needed.`});throw e}})}
async function beginVerification(){const st=getState();if(!st.packageKey||!['commit_consumed','verifying'].includes(st.stage))return;disarm();clearMarks();saveState({stage:'verifying',message:`Verifying ${st.summary||'schedule action'} from a fresh CrewSense reread. No second Save is possible.`});if(!isListView()){location.assign(listViewUrl(st.targetDate));return}return verifyCommitted(st)}
async function verifyCommitted(st=getState()){const date=st.targetDate,key=st.packageKey;if(!key||!date)return;if(!isListView()){location.assign(listViewUrl(date));return}const staffing=window.MVCI_REBEL_SCOUT_STAFFING;if(!staffing?.scrapeNow)throw new Error('Staffing collector is unavailable for write verification.');const r=await staffing.scrapeNow({expectedDate:date}),pf=await preflight(key),server=pf?.preflight||pf,match=server?.reason==='already_in_target_state';const result=await core.post({version:`rebel-scout-${VERSION}`,actionVerification:{packageKey:key,displayedDate:date,sourceVersion:`rebel-scout-${VERSION}`,match,evidence:{mode:'fresh_post_write_reread',staffing:r?.lastCapture||r,serverPreflight:server,secondWriteAttempted:false}}});if(result?.actionVerification?.verified){saveState({stage:'verified',message:'Schedule write verified from a fresh CrewSense reread. No further Save was attempted.'});return true}saveState({stage:'error',message:`Schedule Save was not verified (${server?.reason||'reread mismatch'}). Scout will not retry Save.`});return false}
function visible(el){if(!el||!(el instanceof Element))return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)!==0&&r.width>2&&r.height>2}
function minimalTextNode(root,needle){const want=clean(needle).toLowerCase(),xs=[...root.querySelectorAll('div,li,tr,[role="row"],a,button,span')].filter(el=>visible(el)&&clean(el.textContent).toLowerCase().includes(want));return xs.sort((a,b)=>clean(a.textContent).length-clean(b.textContent).length)[0]||null}
function otSection(pkg){const date=pkg?.targetDate||'';const shifts=[...document.querySelectorAll('.fc-event-shift[data-date]')].filter(el=>visible(el)&&clean(el.getAttribute('data-date'))===date);const ot=shifts.filter(el=>{const inner=el.querySelector('.fc-event-inner')||el;return /^Overtime\s+Sign\s*Up\b/i.test(clean(inner.textContent||''))});if(ot.length!==1)throw new Error(`Expected exactly one CrewSense Overtime Sign Up shift for ${date}; found ${ot.length}.`);return ot[0]}
function otPayload(pkg){const p=pkg?.payload&&typeof pkg.payload==='object'?pkg.payload:{};return{personName:clean(p.person_name||p.personName||'Michael Brion'),desiredState:clean(p.desired_state||p.desiredState||'signed_up')}}
function findOtClickTarget(sec,label,pkg){const want=clean(label).toLowerCase(),date=pkg?.targetDate||'';const rows=[...sec.querySelectorAll('.fc-event-user[data-date]')].filter(el=>visible(el)&&clean(el.getAttribute('data-date'))===date);if(want==='open slot'){const open=rows.filter(el=>el.classList.contains('unscheduled')&&el.classList.contains('mergeShared')&&clean(el.textContent).toLowerCase()==='open slot');return open[0]||null}const person=rows.filter(el=>clean(el.querySelector('.fc-event-user-name')?.textContent||el.textContent).toLowerCase()===want);return person[0]||null}
function markOtTarget(pkg){clearMarks();const sec=otSection(pkg);const p=otPayload(pkg),label=p.desiredState==='not_signed_up'?p.personName:'Open slot',row=findOtClickTarget(sec,label,pkg);if(!row)throw new Error(`CrewSense OT target row "${label}" was not found inside the verified Overtime Sign Up shift for ${pkg.targetDate}.`);return mark(row)}
function describe(el){return{tag:el.tagName?.toLowerCase()||'',id:el.id||'',name:el.name||'',type:el.type||'',cls:clip(el.className||'',300),text:clip(el.textContent||el.value||'',500),value:clip(el.value||'',500),data:Object.fromEntries([...el.attributes||[]].filter(a=>a.name.startsWith('data-')).slice(0,30).map(a=>[a.name,clip(a.value,300)]))}}
function findOtDialog(){const roots=[...document.querySelectorAll('.ui-dialog,[role="dialog"],.modal,.modal-dialog,.modal-content')].filter(visible);const scored=roots.map(el=>{const t=clean(el.textContent);let s=0;if(/Overtime\s+Sign\s*Up/i.test(t))s+=8;if(/notify the employee/i.test(t))s+=6;if(/Delete user from shift/i.test(t))s+=6;if(/Add User/i.test(t))s+=4;if(/\bSave\b/i.test(t))s+=2;return{el,s,t}}).filter(x=>x.s>0).sort((a,b)=>b.s-a.s||a.t.length-b.t.length);return scored[0]?.el||null}
async function waitOtDialog(timeout=10000){const start=Date.now();while(Date.now()-start<timeout){const x=findOtDialog();if(x)return x;await wait(150)}throw new Error('CrewSense OT window did not become identifiable after the verified human click.')}
function otSnapshot(dlg,target,pkg){const buttons=[...dlg.querySelectorAll('button,a,[role="button"],input[type="submit"],input[type="button"]')].filter(visible).map(describe).slice(0,80),inputs=[...dlg.querySelectorAll('input')].filter(visible).map(describe).slice(0,120),selects=[...dlg.querySelectorAll('select')].filter(visible).map(s=>({...describe(s),multiple:!!s.multiple,selected:[...s.selectedOptions].map(o=>({value:o.value,text:clip(o.textContent,180)})),options:[...s.options].slice(0,160).map(o=>({value:o.value,text:clip(o.textContent,180),selected:o.selected}))}));return{targetDate:pkg.targetDate,payload:otPayload(pkg),target:describe(target),title:clip(dlg.querySelector('.ui-dialog-title,.modal-title,h1,h2,h3,h4')?.textContent||'',500),dialog:describe(dlg),buttons,inputs,selects,forms:[...dlg.querySelectorAll('form')].map(f=>({id:f.id||'',action:f.action||'',method:f.method||'',text:clip(f.textContent,1000)})).slice(0,20),html:String(dlg.outerHTML||'').slice(0,30000)}}
async function postOtDiagnostic(pkg,target,dlg){const p=core.pairing(),snap=otSnapshot(dlg,target,pkg);try{const result=await core.post({version:`rebel-scout-${VERSION}`,scoutDiagnostic:{diagnosticId:`scoutdiag:${p.deviceId||'scout'}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,runtimeVersion:`rebel-scout-${VERSION}`,kind:'checkpoint',actionType:'overtime_signup',targetDate:pkg.targetDate,personName:otPayload(pkg).personName,requestedRole:'',message:'Production OT input discovery captured the exact CrewSense Overtime Sign Up modal. No OT write was attempted.',pageUrl:location.href,pagePath:location.pathname,pageHash:location.hash,renderedDate:renderedScheduleDate(),stage:'ot_modal_inspected',occurredAt:new Date().toISOString(),snapshot:snap}});return{result,snap}}catch(e){return{result:null,snap,error:clean(e?.message||e)}}}
async function postOtTrace(pkg,stage,message,target,extra={}){try{const p=core.pairing(),anc=[];for(let el=target,n=0;el&&n<6;el=el.parentElement,n++)anc.push(describe(el));await core.post({version:`rebel-scout-${VERSION}`,scoutDiagnostic:{diagnosticId:`scoutdiag:${p.deviceId||'scout'}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,runtimeVersion:`rebel-scout-${VERSION}`,kind:'checkpoint',actionType:'overtime_signup',targetDate:pkg.targetDate,personName:otPayload(pkg).personName,requestedRole:'',message,pageUrl:location.href,pagePath:location.pathname,pageHash:location.hash,renderedDate:renderedScheduleDate(),stage,occurredAt:new Date().toISOString(),snapshot:{target:target?describe(target):null,ancestors:anc,...extra}}})}catch(_){}}
function validateOtSignupModal(dlg,pkg,row,expectedAvailable=''){
  const p=otPayload(pkg);
  if(p.personName!=='Michael Brion')throw new Error('OT preview mapping is currently verified only for Michael Brion.');
  if(p.desiredState!=='signed_up')throw new Error('OT preview mapping is currently verified only for SIGN UP; UNSIGN remains inspection-only.');
  if(row&&clean(row?.getAttribute?.('data-date'))!==pkg.targetDate)throw new Error('CrewSense OT target row date does not match the approved package date.');
  const expectedDate=new Date(`${pkg.targetDate}T12:00:00`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const title=clean(dlg.querySelector('.ui-dialog-title,.modal-title,h1,h2,h3,h4')?.textContent||'');
  if(!/Overtime\s+Sign\s*Up/i.test(title)||!title.includes(expectedDate))throw new Error('CrewSense OT modal title/date does not match the approved signup request.');
  const available=dlg.querySelector('#available');
  if(!available)throw new Error('CrewSense OT available-employee field was not found.');
  const michael=[...available.options].filter(o=>/^Michael Brion\b/i.test(clean(o.textContent||'')));
  if(michael.length!==1||String(michael[0].value)!=='294652')throw new Error('CrewSense OT modal did not expose exactly one verified Michael Brion option (294652).');
  if(clean(available.value)!==String(expectedAvailable||''))throw new Error(expectedAvailable?'CrewSense OT employee selection does not match the one authorized Michael Brion value.':'CrewSense OT employee field was already changed before preview. Close the window without submitting and retry.');
  const wt=dlg.querySelector('#work_type_id'),wtText=clean(wt?.selectedOptions?.[0]?.textContent||'');
  if(!wt||String(wt.value)!=='34631'||!/^OT Sign-up$/i.test(wtText))throw new Error('CrewSense OT Work Type is not the verified OT Sign-up mapping (34631).');
  const add=dlg.querySelector('#save-shift-users'),addText=clean(add?.textContent||add?.value||''),href=clean(add?.getAttribute?.('data-href'));
  if(!add||add.disabled||!visible(add)||!/^Add User$/i.test(addText)||href!=='/Application/Ajax/Process/Shift/Add/')throw new Error('CrewSense OT Add User control does not match the verified mapping.');
  const timing=Object.fromEntries(['start','end','hours-start_time','minutes-start_time','hours-end_time','minutes-end_time'].map(id=>{const el=dlg.querySelector(`#${id}`);return el?[id,{value:clean(el.value),text:clean(el.selectedOptions?.[0]?.textContent||'')}]:null}).filter(Boolean));
  return{title,targetDate:pkg.targetDate,target:{tag:row?.tagName?.toLowerCase()||'',text:clean(row?.textContent),date:clean(row?.getAttribute?.('data-date')),cls:clean(row?.className||'')},available:{id:available.id,value:clean(available.value),michaelOption:{value:String(michael[0].value),text:clean(michael[0].textContent)}},workType:{id:wt.id,value:String(wt.value),text:wtText},timing,addUser:{id:add.id,text:addText,dataHref:href},fieldsChanged:false,submitClicked:false,automatedWriteAttempted:false}
}
function otTimingEqual(a,b){return JSON.stringify(a||{})===JSON.stringify(b||{})}
async function waitOtControlsStable(dlg,timeout=5000){const start=Date.now();let last='',stable=0;while(Date.now()-start<timeout){const available=dlg.querySelector('#available'),wt=dlg.querySelector('#work_type_id'),add=dlg.querySelector('#save-shift-users');if(available&&wt&&add){const timing=Object.fromEntries(['start','end','hours-start_time','minutes-start_time','hours-end_time','minutes-end_time'].map(id=>{const el=dlg.querySelector(`#${id}`);return el?[id,{value:clean(el.value),text:clean(el.selectedOptions?.[0]?.textContent||'')}]:null}).filter(Boolean)),sig=JSON.stringify({available:[...available.options].map(o=>[String(o.value),clean(o.textContent)]),workType:[String(wt.value),clean(wt.selectedOptions?.[0]?.textContent||'')],timing,add:[add.id,clean(add.textContent||add.value||''),clean(add.getAttribute('data-href'))]});if(sig===last)stable++;else stable=0;last=sig;if(stable>=4)return true}await wait(200)}throw new Error('CrewSense OT controls did not stabilize before preview. No field was changed.')}
function assertOtControlsUnchanged(now,before){if(!before)throw new Error('OT preview evidence is missing. Re-open OT INPUT and preview again.');if(now.title!==before.title||now.available?.michaelOption?.value!==before.available?.michaelOption?.value||now.workType?.value!==before.workType?.value||now.addUser?.id!==before.addUser?.id||now.addUser?.dataHref!==before.addUser?.dataHref||!otTimingEqual(now.timing,before.timing))throw new Error('CrewSense OT controls changed after preview. Close without submitting and preview again.')}
async function prepareOtPreview(pkg,row){
  if(syncActive())throw new Error('Staffing/OT sync is running. OT input is locked until it finishes.');
  const initial=await preflight(pkg.packageKey),initialServer=initial?.preflight||initial;
  if(initialServer?.ready!==true)throw new Error(`Rebel Command OT preflight is not ready: ${initialServer?.reason||'unknown'}.`);
  saveState({packageKey:pkg.packageKey,targetDate:pkg.targetDate,actionType:'overtime_signup',summary:pkg.summary||'',payload:pkg.payload,stage:'opening_ot_modal',message:'Opening the exact verified OT Open slot automatically. Scout will inspect only; it will not select an employee or submit.'});
  await postOtTrace(pkg,'ot_target_resolved','Resolved the clickable CrewSense OT event before opening the modal.',row);
  await pageClickOtRow(row);
  const dlg=await waitOtDialog();await waitOtControlsStable(dlg);await postOtDiagnostic(pkg,row,dlg);const controls=validateOtSignupModal(dlg,pkg,row);
  const pf=await preflight(pkg.packageKey),server=pf?.preflight||pf,preconditionMatch=server?.ready===true;
  const result=await core.post({version:`rebel-scout-${VERSION}`,actionPreview:{packageKey:pkg.packageKey,displayedDate:pkg.targetDate,sourceVersion:`rebel-scout-${VERSION}`,preconditionMatch,evidence:{mode:'explicit_ot_signup_preview',controls,serverPreflight:server,fieldsChanged:false,submitClicked:false,automatedWriteAttempted:false}}});
  if(!result?.actionPreview?.ready)throw new Error(`Rebel Command blocked OT preview: ${result?.actionPreview?.preflight?.reason||server?.reason||'preconditions changed'}.`);
  const testOnly=nonWritablePackage(pkg);
  saveState({packageKey:pkg.packageKey,targetDate:pkg.targetDate,actionType:'overtime_signup',summary:pkg.summary||'',payload:pkg.payload,stage:'ot_preview_ready',testOnly,preparedAt:Date.now(),otControls:controls,message:testOnly?'OT TEST PREVIEW READY. Exact Michael Brion signup controls verified; no field changed and Add User was not clicked. Commit is disabled.':'OT PREVIEW READY. No CrewSense field has changed. Review the modal, then use COMMIT ONE OT SIGNUP for one-time authorization.'});
  return{ready:true,controls,serverPreflight:server}
}
function otEmployeeSerializationEvidence(dlg){
  const scope=dlg.querySelector('form')||dlg;
  const controls=[...scope.querySelectorAll('input,select,textarea')].map(el=>({tag:(el.tagName||'').toLowerCase(),id:clean(el.id||''),name:clean(el.name||''),type:clean(el.type||''),value:clean(el.value||'')}));
  const userControls=controls.filter(x=>x.id!=='available'&&/^users(?:\[|\]|$)/i.test(x.name||''));
  const idEvidence=userControls.filter(x=>String(x.name||'').includes('294652')||String(x.value||'')==='294652');
  const tagNodes=[...scope.querySelectorAll('.tagedit-listelement-old,[data-value="294652"],[data-id="294652"]')];
  const tagEvidence=tagNodes.map(el=>({text:clean(el.textContent||''),htmlId:clean(el.id||''),dataValue:clean(el.getAttribute?.('data-value')||''),dataId:clean(el.getAttribute?.('data-id')||''),hidden:[...el.querySelectorAll('input[type="hidden"]')].map(i=>({name:clean(i.name||''),value:clean(i.value||'')}))})).filter(t=>t.dataValue==='294652'||t.dataId==='294652'||t.hidden.some(h=>String(h.name||'').includes('294652')||String(h.value||'')==='294652'));
  return{ready:idEvidence.length>0||tagEvidence.length>0,userControls:userControls.slice(0,12),idEvidence:idEvidence.slice(0,6),tagEvidence:tagEvidence.slice(0,6)};
}
async function waitOtEmployeeSerialized(dlg,timeout=7000){
  const start=Date.now();let last=null;
  while(Date.now()-start<timeout){last=otEmployeeSerializationEvidence(dlg);if(last.ready)return last;await wait(100)}
  const err=new Error('CrewSense did not serialize Michael Brion employee id 294652 into the OT form after selection. Add User is blocked.');
  err.serializationEvidence=last;throw err;
}

function validateOtSignupModalAfterSerialization(dlg,pkg,before,serialization){
  const p=otPayload(pkg);
  if(p.personName!=='Michael Brion')throw new Error('OT post-selection mapping is currently verified only for Michael Brion.');
  if(p.desiredState!=='signed_up')throw new Error('OT post-selection mapping is currently verified only for SIGN UP.');
  if(!serialization?.ready)throw new Error('CrewSense Michael Brion serialization evidence is missing after selection. Add User is blocked.');
  const expectedDate=new Date(pkg.targetDate+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const title=clean(dlg.querySelector('.ui-dialog-title,.modal-title,h1,h2,h3,h4')?.textContent||'');
  if(!/Overtime\s+Sign\s*Up/i.test(title)||!title.includes(expectedDate))throw new Error('CrewSense OT modal title/date changed after employee selection. Add User is blocked.');
  const available=dlg.querySelector('#available');
  if(!available)throw new Error('CrewSense OT available-employee field disappeared after selection. Add User is blocked.');
  const availableValue=clean(available.value);
  if(availableValue&&availableValue!=='294652')throw new Error('CrewSense OT employee selector changed to an unexpected value after serialization. Add User is blocked.');
  const wt=dlg.querySelector('#work_type_id'),wtText=clean(wt?.selectedOptions?.[0]?.textContent||'');
  if(!wt||String(wt.value)!=='34631'||!/^OT Sign-up$/i.test(wtText))throw new Error('CrewSense OT Work Type changed after employee selection. Add User is blocked.');
  const add=dlg.querySelector('#save-shift-users'),addText=clean(add?.textContent||add?.value||''),href=clean(add?.getAttribute?.('data-href'));
  if(!add||add.disabled||!visible(add)||!/^Add User$/i.test(addText)||href!=='/Application/Ajax/Process/Shift/Add/')throw new Error('CrewSense OT Add User control changed after employee selection. Add User is blocked.');
  const timing=Object.fromEntries(['start','end','hours-start_time','minutes-start_time','hours-end_time','minutes-end_time'].map(id=>{const el=dlg.querySelector('#'+id);return el?[id,{value:clean(el.value),text:clean(el.selectedOptions?.[0]?.textContent||'')}]:null}).filter(Boolean));
  return{title,targetDate:pkg.targetDate,target:before?.target||{},available:{id:available.id,value:availableValue,michaelOption:before?.available?.michaelOption||{value:'294652',text:'Michael Brion'}},workType:{id:wt.id,value:String(wt.value),text:wtText},timing,addUser:{id:add.id,text:addText,dataHref:href},fieldsChanged:true,submitClicked:false,automatedWriteAttempted:false,serialization};
}
async function commitOtPrepared(){if(syncActive())throw new Error('Data sync is running. OT commit is blocked.');const initial=getState();if(initial.actionType!=='overtime_signup'||initial.stage!=='ot_preview_ready'||!initial.packageKey)throw new Error('No prepared OT signup preview is waiting for commit.');if(initial.testOnly===true)throw new Error('This is a test-only/non-writable OT preview. Scout will not authorize Add User.');if(!navigator.locks?.request)throw new Error('Browser commit lock is unavailable. Scout will not risk a duplicate OT submit.');return navigator.locks.request(`mvci-rebel-scout-ot-commit:${initial.packageKey}`,{mode:'exclusive'},async()=>{const st=getState();if(st.stage!=='ot_preview_ready'||st.packageKey!==initial.packageKey)throw new Error('OT commit was already started or consumed. Scout will not retry Add User.');if(Date.now()-Number(st.preparedAt||0)>10*60*1000)throw new Error('OT preview expired. Re-open OT INPUT and preview again.');let authorized=false;saveState({stage:'ot_committing',commitStartedAt:Date.now(),message:'OT commit locked. Rechecking exact modal and Rebel Command authorization; no second submit can start.'});try{const dlg=findOtDialog();if(!dlg)throw new Error('CrewSense OT signup window is no longer open.');const list=await worklist(),pkg=list.find(x=>x.packageKey===st.packageKey);if(!pkg)throw new Error('Rebel Command OT package is no longer available.');if(nonWritablePackage(pkg))throw new Error('Rebel Command OT package is test-only/non-writable. Add User is blocked.');await waitOtControlsStable(dlg);const current=validateOtSignupModal(dlg,pkg,null);assertOtControlsUnchanged(current,st.otControls);const clientPf=await preflight(st.packageKey),clientServer=clientPf?.preflight||clientPf;if(clientServer?.ready!==true)throw new Error(`Fresh OT preflight is not ready: ${clientServer?.reason||'unknown'}.`);const add=dlg.querySelector('#save-shift-users'),available=dlg.querySelector('#available');const result=await core.post({version:`rebel-scout-${VERSION}`,actionCommit:{packageKey:st.packageKey,displayedDate:st.targetDate,sourceVersion:`rebel-scout-${VERSION}`,userConfirmed:true,evidence:{mode:'explicit_ot_signup',controls:current,serverPreflight:clientServer,employeeSelectedBeforeAuthorization:false,submitClickedBeforeAuthorization:false,submitControl:{tag:add.tagName,id:add.id,text:clean(add.textContent||add.value||''),dataHref:clean(add.getAttribute('data-href'))}}}});if(!result?.actionCommit?.allowWrite)throw new Error(`Rebel Command refused OT commit: ${result?.actionCommit?.reason||'not authorized'}.`);authorized=true;saveState({stage:'ot_commit_consumed',commitConsumedAt:Date.now(),message:'One-time OT authorization consumed. Selecting Michael and clicking Add User exactly once; this action will never auto-retry.'});const operatorSelection=await selectMichaelLikeOperator(dlg);const serialization={ready:true,operatorSelection};await postOtTrace(pkg,'ot_employee_selected_like_operator','CrewSense selected Michael Brion through the same tag/autocomplete workflow demonstrated by the operator before Add User.',add,{operatorSelection});const selectedControls=validateOtSignupModalAfterSerialization(dlg,pkg,st.otControls,serialization);assertOtControlsUnchanged(selectedControls,st.otControls);add.click();setTimeout(()=>beginOtVerification(),1800)}catch(e){const msg=clean(e?.message||e);if(authorized){saveState({stage:'ot_commit_consumed',message:`OT authorization was consumed, but the submit path reported: ${msg} Scout will verify only and will never retry Add User.`});setTimeout(()=>beginOtVerification(),500)}else if(getState().stage==='ot_committing')saveState({stage:'error',message:`OT commit stopped before authorization. ${msg} Preview again before any later attempt.`});throw e}})}
async function beginOtVerification(){const st=getState();if(st.actionType!=='overtime_signup'||!st.packageKey||!['ot_commit_consumed','ot_verifying'].includes(st.stage))return;disarm();clearMarks();saveState({stage:'ot_verifying',message:'Verifying OT signup from a fresh CrewSense ListView reread. No second Add User attempt is possible.'});if(!isListView()){location.assign(listViewUrl(st.targetDate));return}return verifyOtCommitted(st)}
async function verifyOtCommitted(st=getState()){const date=st.targetDate,key=st.packageKey;if(!key||!date)return;if(!isListView()){location.assign(listViewUrl(date));return}const staffing=window.MVCI_REBEL_SCOUT_STAFFING;if(!staffing?.captureSignupNow)throw new Error('Narrow OT signup reader is unavailable for verification.');const r=await staffing.captureSignupNow({expectedDate:date}),pf=await preflight(key),server=pf?.preflight||pf,match=server?.reason==='already_in_target_state';const result=await core.post({version:`rebel-scout-${VERSION}`,actionVerification:{packageKey:key,displayedDate:date,sourceVersion:`rebel-scout-${VERSION}`,match,evidence:{mode:'fresh_ot_signup_reread',signup:r?.lastCapture||r,serverPreflight:server,secondWriteAttempted:false}}});if(result?.actionVerification?.verified){saveState({stage:'ot_verified',message:'OT signup verified from a fresh exact-date CrewSense signup reread. No further Add User attempt was made.'});return true}saveState({stage:'error',message:`OT signup was not verified (${server?.reason||'reread mismatch'}). Scout will not retry Add User.`});return false}
async function armOtRow(pkg){disarm();const row=markOtTarget(pkg);try{return await prepareOtPreview(pkg,row)}catch(e){const msg=clean(e?.message||e);await postOtTrace(pkg,'ot_flow_error',msg,row,{dialogFound:!!findOtDialog()});saveState({stage:'error',message:msg});throw e}}
async function refreshOtSignupCapture(pkg){saveState({packageKey:pkg.packageKey,targetDate:pkg.targetDate,actionType:'overtime_signup',summary:pkg.summary||'',payload:pkg.payload,stage:'ot_refreshing_capture',message:`Refreshing exact-date OT signup state for ${pkg.targetDate} with the narrow signup reader.`});if(!isListView()){location.assign(listViewUrl(pkg.targetDate));return false}const staffing=window.MVCI_REBEL_SCOUT_STAFFING;if(!staffing?.captureSignupNow)throw new Error('Narrow OT signup reader is unavailable.');const rendered=clean(staffing.status?.()?.renderedDate||'');if(rendered!==pkg.targetDate){location.assign(listViewUrl(pkg.targetDate));return false}const cap=await staffing.captureSignupNow({expectedDate:pkg.targetDate});if(cap?.signupCapture?.quality&&cap.signupCapture.quality!=='good')throw new Error(`Fresh OT signup capture did not pass validation (${cap.signupCapture.quality}).`);const pf=await preflight(pkg.packageKey),server=pf?.preflight||pf;if(server?.ready!==true)throw new Error(`Automatic OT preflight refresh did not become ready: ${server?.reason||'unknown'}.`);saveState({packageKey:pkg.packageKey,targetDate:pkg.targetDate,actionType:'overtime_signup',summary:pkg.summary||'',payload:pkg.payload,stage:'navigating_ot',message:`Fresh OT signup state confirmed. Opening Crew Scheduler using the recorded operator path.`});location.assign(scheduleBaseUrl());return false}
async function startOtInput(){if(syncActive())throw new Error('Rebel Scout data sync is still running. Let it finish before starting OT input.');const list=await worklist(),pkg=selectOtPackage(list);if(!pkg)throw new Error('No approved/queued OT signup action is waiting in Rebel Command.');if(pkg.stage==='reread_verification'){saveState({packageKey:pkg.packageKey,targetDate:pkg.targetDate,actionType:'overtime_signup',summary:pkg.summary||'',stage:'ot_commit_consumed',message:'An OT Add User authorization was already consumed earlier. Scout will verify only; it will never submit again.'});return beginOtVerification()}const pf=await preflight(pkg.packageKey),server=pf?.preflight||pf;if(server?.ready===true){if(isSchedule()&&renderedScheduleDate()===pkg.targetDate)return armOtRow(pkg);saveState({packageKey:pkg.packageKey,targetDate:pkg.targetDate,actionType:'overtime_signup',summary:pkg.summary||'',payload:pkg.payload,stage:'navigating_ot',message:`Fresh OT signup state confirmed. Opening Crew Scheduler using the recorded operator path.`});location.assign(scheduleBaseUrl());return}return refreshOtSignupCapture(pkg)}
function cancelLocal(){clearState();return status()}
function status(){return{version:VERSION,...getState(),syncActive:syncActive(),isSchedule:isSchedule(),isListView:isListView(),renderedDate:isSchedule()?renderedScheduleDate():window.MVCI_REBEL_SCOUT_STAFFING?.status?.()?.renderedDate||''}}
async function boot(){const st=getState();if(!st.packageKey||syncActive())return;try{const list=await worklist(),pkg=list.find(x=>x.packageKey===st.packageKey);if(!pkg){if(['schedule','overtime_signup'].includes(st.actionType)&&st.testOnly===true){clearState();return}if(['verified','ot_verified','ot_inspected','error'].includes(st.stage))return;saveState({stage:'error',message:'Rebel Command action package is no longer available.'});return}if(st.actionType==='schedule'){const preferred=selectSchedulePackage(list);if(preferred&&preferred.packageKey!==st.packageKey&&!nonWritablePackage(preferred)&&nonWritablePackage(pkg)){clearState();return}}else if(st.actionType==='overtime_signup'){const preferred=selectOtPackage(list);if(preferred&&preferred.packageKey!==st.packageKey&&!nonWritablePackage(preferred)&&nonWritablePackage(pkg)){clearState();return}}if(st.actionType==='schedule'){if(['navigating','awaiting_row_click'].includes(st.stage)&&isSchedule()&&renderedScheduleDate()===st.targetDate)armScheduleRow(pkg);else if(st.stage==='opening_modal')saveState({stage:'error',message:'CrewSense reloaded while assignment preparation was in progress. No Save was attempted. Close any open assignment window and start SCHEDULE INPUT again.'});else if(['commit_consumed','verifying'].includes(st.stage))beginVerification()}else if(st.actionType==='overtime_signup'){if(st.stage==='ot_refreshing_capture')await refreshOtSignupCapture(pkg);else if(['navigating_ot','awaiting_ot_row_click'].includes(st.stage)&&isSchedule()){if(renderedScheduleDate()!==st.targetDate){saveState({stage:'navigating_ot',message:`Crew Scheduler opened. Selecting ${st.targetDate} through the same date-picker path demonstrated by the operator.`});await setScheduleDateLikeOperator(st.targetDate)}await armOtRow(pkg);}else if(st.stage==='opening_ot_modal'){saveState({stage:'ot_refreshing_capture',message:'Recovered an interrupted OT modal-open step. Refreshing live state before trying the read-only open again.'});location.assign(listViewUrl(st.targetDate))}else if(['ot_commit_consumed','ot_verifying'].includes(st.stage))beginOtVerification();else if(st.stage==='ot_committing')saveState({stage:'ot_commit_consumed',message:'Scout reloaded after OT commit began. It will verify only and will never retry Add User.'})}}catch(e){saveState({stage:'error',message:clean(e?.message||e)})}}
window.MVCI_REBEL_SCOUT_ACTIONS={version:VERSION,startScheduleInput,startOtInput,commitPrepared,commitOtPrepared,beginOtVerification,verifyOtCommitted,cancelLocal,worklist,preflight,status,boot,scheduleRows,markOtTarget,nonWritablePackage,selectSchedulePackage,selectOtPackage};
/* collector-only: action auto-resume disabled */
})();


GM_deleteValue('rebelScoutActionTraceV2');
// ============================================================
// READ-ONLY AUTOMATIC ACTION + MANUAL WORKFLOW TRACE RECORDER
// ============================================================
(function(){
if(window.top!==window.self||window.MVCI_REBEL_SCOUT_TRACE)return;
const VERSION='1.1.38',core=window.MVCI_REBEL_SCOUT_CORE,KEY='rebelScoutActionTraceV2',MAX_EVENTS=240,MAX_MS=20*60*1000;
let state=GM_getValue(KEY,{active:false,sessionId:'',startedAt:0,count:0,label:'',mode:'',packageKey:'',actionType:'',targetDate:''})||{},obs=null,timer=null,lastDomSig='',lastActionSig='',posting=Promise.resolve();
const clean=v=>String(v??'').replace(/\s+/g,' ').trim(),clip=(v,n=220)=>clean(v).slice(0,n);
const isVisible=el=>{if(!(el instanceof Element))return false;const r=el.getBoundingClientRect(),cs=getComputedStyle(el);return r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'};
function currentAction(){return window.MVCI_REBEL_SCOUT_ACTIONS?.status?.()||{}}
function dateGuess(){const a=window.MVCI_REBEL_SCOUT?.status?.()?.visibleDate||currentAction()?.renderedDate||state.targetDate||'';if(/^\d{4}-\d{2}-\d{2}$/.test(a))return a;const m=location.hash.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);return m?[m[1],String(+m[2]).padStart(2,'0'),String(+m[3]).padStart(2,'0')].join('-'):''}
function attrs(el){if(!(el instanceof Element))return{};const out={};for(const n of ['id','class','role','type','name','href','data-id','data-date','data-position','data-eventuserid','data-user-id','data-shift-user-id','data-qualifierid','data-href','data-callback-id','data-mvci-action-target','aria-label']){const v=n==='id'?el.id:n==='class'?el.className:el.getAttribute?.(n);if(v!=null&&clean(v)!=='')out[n]=clip(v,240)}return out}
function node(el){return el instanceof Element?{tag:el.tagName.toLowerCase(),text:clip(el.innerText||el.textContent,260),attrs:attrs(el)}:null}
function path(el){const out=[];for(let x=el instanceof Element?el:null;x&&out.length<8;x=x.parentElement)out.push(node(x));return out}
function selectInfo(sel){const opts=[...sel.options||[]];return{id:sel.id||'',name:sel.name||'',value:clip(sel.value,100),selected:opts.filter(o=>o.selected).map(o=>({value:clip(o.value,100),text:clip(o.textContent,140)})),interestingOptions:opts.filter(o=>o.selected||/Michael Brion|OT Sign-up/i.test(clean(o.textContent))).slice(0,14).map(o=>({value:clip(o.value,100),text:clip(o.textContent,140),selected:!!o.selected})),optionCount:opts.length}}
function dialogSnapshot(root=document){const dialogs=[...root.querySelectorAll('.ui-dialog,[role="dialog"],.modal,.modal-dialog,.modal-content')].filter(isVisible);const dlg=dialogs.sort((a,b)=>(b.getBoundingClientRect().width*b.getBoundingClientRect().height)-(a.getBoundingClientRect().width*a.getBoundingClientRect().height))[0];if(!dlg)return null;return{dialog:node(dlg),buttons:[...dlg.querySelectorAll('button,a,[role="button"],input[type="submit"],input[type="button"]')].filter(isVisible).slice(0,24).map(node),selects:[...dlg.querySelectorAll('select')].filter(isVisible).slice(0,14).map(selectInfo),inputs:[...dlg.querySelectorAll('input')].filter(i=>isVisible(i)&&!['password','hidden'].includes(String(i.type).toLowerCase())).slice(0,20).map(i=>({id:i.id||'',name:i.name||'',type:i.type||'',checked:!!i.checked,placeholder:clip(i.placeholder,120),value:/^(start|end|tagedit-input)$/i.test(i.id)||['date','time','datetime-local'].includes(String(i.type).toLowerCase())?clip(i.value,120):undefined}))}}
function workflowSnapshot(){const action=currentAction(),autocomplete=[...document.querySelectorAll('.ui-autocomplete a,#ui-active-menuitem,a.ui-corner-all')].filter(isVisible).map(node).filter(x=>x?.text).slice(0,12),chips=[...document.querySelectorAll('li.tagedit-listelement-old,.tagedit-listelement-old')].filter(isVisible).map(node).filter(x=>/Michael Brion/i.test(x?.text||'')).slice(0,8),otRows=[...document.querySelectorAll('.fc-event-shift[data-date]')].filter(isVisible).filter(el=>/Overtime\s+Sign\s*Up/i.test(clean((el.querySelector('.fc-event-inner')||el).textContent))).slice(0,3).map(el=>({shift:node(el),users:[...el.querySelectorAll('.fc-event-user[data-date]')].filter(isVisible).slice(0,14).map(node)}));return{action:{packageKey:action.packageKey||'',actionType:action.actionType||'',targetDate:action.targetDate||'',stage:action.stage||'',message:clip(action.message||'',500),testOnly:action.testOnly===true},page:{url:location.href,path:location.pathname,hash:location.hash,date:dateGuess(),readyState:document.readyState},dialog:dialogSnapshot(),autocomplete,chips,otRows}}
function status(){return{...state,active:!!state.active,elapsedMs:state.startedAt?Date.now()-state.startedAt:0}}
function save(patch){state={...state,...patch};GM_setValue(KEY,state);window.dispatchEvent(new CustomEvent('mvci:trace-status',{detail:status()}));return state}
function post(stage,message,snapshot={}){if(!core?.paired?.()||!state.sessionId)return Promise.resolve(null);const now=new Date().toISOString(),action=currentAction();posting=posting.then(()=>core.post({version:'rebel-scout-'+VERSION,scoutDiagnostic:{diagnosticId:'autotrace:'+state.sessionId+':'+String(state.count).padStart(4,'0')+':'+Date.now(),runtimeVersion:'rebel-scout-'+VERSION,kind:'interaction',actionType:action.actionType||state.actionType||'manual_workflow',targetDate:action.targetDate||state.targetDate||dateGuess()||null,personName:'Michael Brion',requestedRole:'',message,pageUrl:location.href,pagePath:location.pathname,pageHash:location.hash,renderedDate:dateGuess(),stage,occurredAt:now,snapshot:{traceSessionId:state.sessionId,sequence:state.count,label:state.label||'',mode:state.mode||'',packageKey:action.packageKey||state.packageKey||'',actionStage:action.stage||'',...snapshot}}})).catch(()=>null);return posting}
function bump(stage,message,snapshot={}){if(!state.active)return Promise.resolve(null);if(Number(state.count||0)>=MAX_EVENTS){stop('event_limit');return Promise.resolve(null)};save({count:Number(state.count||0)+1});return post(stage,message,snapshot)}
function recordEvent(ev){if(!state.active)return;const target=ev.target instanceof Element?ev.target:null;if(target?.closest?.('#mvci-rebel-scout'))return;bump('trace_'+ev.type,'CrewSense '+ev.type+' observed while action recorder was active.',{event:{type:ev.type,button:Number.isFinite(ev.button)?ev.button:null,target:node(target),path:path(target)},workflow:workflowSnapshot()})}
function domCheck(){if(!state.active)return;const snap=workflowSnapshot(),sig=JSON.stringify([snap.page.hash,snap.action.stage,snap.dialog?.dialog?.text?.slice(0,160),snap.autocomplete.map(x=>x.text),snap.chips.map(x=>x.text),snap.otRows.map(x=>x.users.map(u=>u.text))]);if(sig===lastDomSig)return;lastDomSig=sig;bump('trace_dom_state','CrewSense/action DOM state changed while action recorder was active.',{workflow:snap})}
function actionStateCheck(){if(!state.active)return;const a=currentAction(),sig=JSON.stringify([a.packageKey||'',a.actionType||'',a.targetDate||'',a.stage||'',a.message||'']);if(sig===lastActionSig)return;lastActionSig=sig;bump('trace_action_state','Scout action state changed.',{workflow:workflowSnapshot()});if(['verified','ot_verified','ot_inspected','error'].includes(clean(a.stage||'')))setTimeout(()=>{if(state.active)stop('action_terminal_'+clean(a.stage||'unknown'))},350)}
function onActionState(){actionStateCheck()}
function onError(ev){if(!state.active)return;bump('trace_window_error','Browser error observed while Scout action recorder was active.',{error:{message:clip(ev?.message||'',700),filename:clip(ev?.filename||'',300),lineno:ev?.lineno||0,colno:ev?.colno||0},workflow:workflowSnapshot()})}
function onRejection(ev){if(!state.active)return;bump('trace_unhandled_rejection','Unhandled promise rejection observed while Scout action recorder was active.',{error:{message:clip(ev?.reason?.message||ev?.reason||'',700)},workflow:workflowSnapshot()})}
function onNav(){if(!state.active)return;bump('trace_navigation','CrewSense browser navigation/hash state changed.',{workflow:workflowSnapshot()})}
function attach(){document.addEventListener('pointerdown',recordEvent,true);document.addEventListener('click',recordEvent,true);document.addEventListener('input',recordEvent,true);document.addEventListener('change',recordEvent,true);document.addEventListener('submit',recordEvent,true);window.addEventListener('mvci-rebel-scout-action-state',onActionState);window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onRejection);window.addEventListener('hashchange',onNav);window.addEventListener('popstate',onNav);obs=new MutationObserver(()=>setTimeout(domCheck,60));obs.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','aria-hidden','value','data-date']});timer=setInterval(()=>{if(!state.active)return;if(Date.now()-Number(state.startedAt||0)>MAX_MS)stop('time_limit');else{actionStateCheck();domCheck()}},700)}
function detach(){document.removeEventListener('pointerdown',recordEvent,true);document.removeEventListener('click',recordEvent,true);document.removeEventListener('input',recordEvent,true);document.removeEventListener('change',recordEvent,true);document.removeEventListener('submit',recordEvent,true);window.removeEventListener('mvci-rebel-scout-action-state',onActionState);window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onRejection);window.removeEventListener('hashchange',onNav);window.removeEventListener('popstate',onNav);obs?.disconnect();obs=null;if(timer)clearInterval(timer);timer=null}
async function start(label='manual',meta={}){if(state.active)return status();lastDomSig='';lastActionSig='';save({active:true,sessionId:String(Date.now())+':'+Math.random().toString(36).slice(2,8),startedAt:Date.now(),count:0,label:clip(label,100),mode:clip(meta.mode||'manual',40),packageKey:clip(meta.packageKey||'',240),actionType:clip(meta.actionType||'',80),targetDate:clip(meta.targetDate||'',20),stopReason:''});attach();await bump('trace_started',(meta.mode==='action'?'Automatic Scout action recording':'Read-only manual CrewSense workflow recording')+' started.',{workflow:workflowSnapshot(),safety:{preventedEvents:false,clicked:false,changed:false,submitted:false,navigated:false}});return status()}
async function startAction(meta={}){const pkg=clip(meta.packageKey||currentAction().packageKey||'',240),atype=clip(meta.actionType||currentAction().actionType||'',80),tdate=clip(meta.targetDate||currentAction().targetDate||'',20);if(state.active){if(state.mode==='action'&&(!pkg||!state.packageKey||state.packageKey===pkg)){if(pkg&&!state.packageKey)save({packageKey:pkg,actionType:atype||state.actionType,targetDate:tdate||state.targetDate,label:'action:'+(atype||state.actionType||'unknown')});await bump('trace_action_command','Scout action command observed while existing automatic recording continues.',{command:clip(meta.command||'',80),workflow:workflowSnapshot()});return status()}await stop('superseded_by_new_action')}return start('action:'+(atype||'unknown'),{mode:'action',packageKey:pkg,actionType:atype,targetDate:tdate})}
async function checkpoint(stage,message,snapshot={}){if(!state.active)return null;return bump(stage,message,{...snapshot,workflow:workflowSnapshot()})}
async function stop(reason='manual'){if(!state.active)return status();const final={...status(),active:false,stopReason:reason,stoppedAt:Date.now(),workflow:workflowSnapshot()};save({count:Number(state.count||0)+1});await post('trace_stopped','Scout workflow recording stopped ('+reason+').',{final});detach();save({active:false,stopReason:reason,stoppedAt:Date.now()});return status()}
function clear(){if(state.active)throw new Error('Stop recording before clearing local trace state.');GM_deleteValue(KEY);state={active:false,sessionId:'',startedAt:0,count:0,label:'',mode:'',packageKey:'',actionType:'',targetDate:''};return status()}
if(state.active){if(Date.now()-Number(state.startedAt||0)<MAX_MS){attach();setTimeout(()=>{bump('trace_page_resumed','Automatic action recording resumed after CrewSense page load/navigation.',{workflow:workflowSnapshot()});actionStateCheck();domCheck()},250)}else save({active:false,stopReason:'expired_on_reload'})}
window.MVCI_REBEL_SCOUT_TRACE={version:VERSION,start,startAction,checkpoint,stop,clear,status,dialogSnapshot,node,path,workflowSnapshot};
})();


/* --- Collector-only safety lock: CrewSense writes intentionally disabled. --- */
(function(){
'use strict';
GM_deleteValue('rebelScoutActionInputV1');GM_deleteValue('rebelScoutActionTraceV2');const disabled=()=>Promise.reject(new Error('CrewSense editing is disabled in this Rebel Scout collector-only build.'));
window.MVCI_REBEL_SCOUT_ACTIONS=Object.freeze({
  collectorOnly:true,
  status:()=>({stage:'collector_only',message:'CrewSense editing disabled; Scout is collecting only.'}),
  worklist:async()=>[],
  startScheduleInput:disabled,
  commitPrepared:disabled,
  startOtInput:disabled,
  commitOtPrepared:disabled,
  cancelLocal:()=>true
});
})();

/* --- Single production controller/UI --- */

(function(){
'use strict';
if(window.top!==window.self||window.MVCI_REBEL_SCOUT)return;
const VERSION='1.1.39';
const core=window.MVCI_REBEL_SCOUT_CORE;
const REBEL_SYMBOL_HTML="<img alt=\"\" aria-hidden=\"true\" draggable=\"false\" width=\"39\" height=\"39\" style=\"display:block;width:39px;height:39px;object-fit:contain;pointer-events:none;user-select:none\" src=\"data:image/png;base64,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\">";
const ROOT_ID='mvci-rebel-scout';
const STYLE_ID='mvci-rebel-scout-style';
const QUEUE_KEY='rebelScoutSyncQueueV1';
const LOCK_KEY='rebelScoutSyncLockV1';
const STATE_KEY='rebelScoutUiStateV1';
const RANKING_PATH_KEY='mvciLastRankingPath_v1';
const DEFAULT_RANKING_PATH='/Application/ControlPanel/CallbackModule/Rankings/63542/95668';
const MAX_ATTEMPTS=3;
const LOCK_TTL=60000;
const clean=core.clean;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tabId=(()=>{try{let v=sessionStorage.getItem('rebelScoutTabIdV1');if(!v){v=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;sessionStorage.setItem('rebelScoutTabIdV1',v)}return v}catch(_){return`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}})();
const state={open:false,busy:false,runner:false,message:'Ready.',kind:'info',plan:null};
function get(key,f){return GM_getValue(key,f)} function set(key,v){GM_setValue(key,v)}
function queue(){const d={schemaVersion:2,active:false,index:0,items:[],results:[],successKeys:[],finalFailures:[],attempts:{},navReloads:{},sessionKeys:[],totalAdded:0,hardSafetyMax:250},q=get(QUEUE_KEY,d);return Number(q?.schemaVersion)===2?{...d,...q}:d}
function saveQueue(q){set(QUEUE_KEY,q);render()}
function itemKey(x){return `${x.type}:${x.workDate}`}
function ownLock(force=false){const now=Date.now(),l=get(LOCK_KEY,{});if(!force&&l.tabId&&l.tabId!==tabId&&now-(Number(l.at)||0)<LOCK_TTL)return false;set(LOCK_KEY,{tabId,at:now});return true}
function pulseLock(){const l=get(LOCK_KEY,{});if(!l.tabId||l.tabId===tabId)set(LOCK_KEY,{tabId,at:Date.now()})}
function releaseLock(){const l=get(LOCK_KEY,{});if(l.tabId===tabId)GM_deleteValue(LOCK_KEY)}
function saveStatus(msg,kind='info'){state.message=clean(msg);state.kind=kind;set(STATE_KEY,{message:state.message,kind,at:Date.now()});render()}
function restoreStatus(){const s=get(STATE_KEY,{});if(s?.message){state.message=s.message;state.kind=s.kind||'info'}}
function isListView(){return /\/Application\/ControlPanel\/ListView/i.test(location.pathname)}
function isRankingPage(){return window.MVCI_REBEL_SCOUT_OT?.isRankingPage?.()||/\/Application\/ControlPanel\/CallbackModule\/Rankings/i.test(location.pathname)}
function targetHash(date){const[y,m,d]=date.split('-');return `#${y}/${m}/${d}`}
function listViewUrl(date){return `${location.origin}/Application/ControlPanel/ListView/${targetHash(date)}`}
function rankingUrl(date){const[y,m,d]=date.split('-');let path='';try{const raw=localStorage.getItem(RANKING_PATH_KEY);const x=raw?JSON.parse(raw):{};path=/^\/Application\/ControlPanel\/CallbackModule\/Rankings\//i.test(clean(x.path))?clean(x.path):''}catch(_){}path=path||DEFAULT_RANKING_PATH;return `${location.origin}${path}?shift_date=${encodeURIComponent(`${m}/${d}/${y}`)}&select-date=`}
function actualVisibleDate(){if(isListView()){const d=clean(window.MVCI_REBEL_SCOUT_STAFFING?.status?.()?.renderedDate||'');if(/^\d{4}-\d{2}-\d{2}$/.test(d))return d}if(isRankingPage()){const d=clean(window.MVCI_REBEL_SCOUT_OT?.detectForecastDate?.()?.date||'');if(/^\d{4}-\d{2}-\d{2}$/.test(d))return d}return''}
async function waitForTargetDate(target,mode,timeout=120000){const started=Date.now();let stable=0,last='';while(Date.now()-started<timeout){const pathOk=mode==='staffing'?isListView():isRankingPage(),d=actualVisibleDate();last=d;if(pathOk&&d===target){stable++;if(stable>=3)return true}else stable=0;await wait(document.hidden?900:300)}throw new Error(`CrewSense did not finish rendering ${target}${last?` (still showed ${last})`:''}.`)}
async function syncPlan(){const p=await core.request('?action=range-sync-plan');state.plan=p;return p}
function mergeNewNeeded(q,plan){const hard=Math.max(1,Number(q.hardSafetyMax)||250),done=new Set(q.successKeys||[]),failed=new Set((q.finalFailures||[]).map(x=>x.key)),existing=new Set((q.items||[]).slice(q.index||0).map(itemKey)),session=new Set(q.sessionKeys||[]);for(const k of done)session.add(k);for(const k of failed)session.add(k);for(const k of existing)session.add(k);let added=0;for(const raw of(plan?.worklist||[])){if(session.size>=hard)break;const type=raw.type==='staffing'?'staffing':raw.type==='overtime'?'overtime':raw.type==='ranking'?'overtime':raw.type;const item={...raw,type};if(!['staffing','overtime'].includes(item.type)||!/^(20\d{2})-\d{2}-\d{2}$/.test(clean(item.workDate)))continue;const k=itemKey(item);if(done.has(k)||failed.has(k)||existing.has(k)||session.has(k))continue;q.items.push(item);existing.add(k);session.add(k);added++}q.sessionKeys=[...session];q.totalAdded=session.size;return added}
async function navigateFor(item,q){const date=item.workDate,key=itemKey(item);if(item.type==='staffing'){if(!isListView()){location.assign(listViewUrl(date));return false}if(actualVisibleDate()===date)return true;const h=targetHash(date);q.navReloads=q.navReloads||{};if(location.hash===h){try{await waitForTargetDate(date,'staffing',30000);if(q.navReloads)delete q.navReloads[key];saveQueue(q);return true}catch(e){q.navReloads[key]=(Number(q.navReloads[key])||0)+1;saveQueue(q);if(q.navReloads[key]>2)throw new Error(`CrewSense did not render ${date} after waiting on the already-correct ListView URL (${actualVisibleDate()||'no rendered date detected'}).`);location.reload();return false}}location.hash=h;await waitForTargetDate(date,'staffing');if(q.navReloads)delete q.navReloads[key];saveQueue(q);return true}
if(!isRankingPage()||actualVisibleDate()!==date){const target=rankingUrl(date);q.navReloads=q.navReloads||{};if(location.href===target){try{await waitForTargetDate(date,'overtime',30000);if(q.navReloads)delete q.navReloads[key];saveQueue(q);return true}catch(e){q.navReloads[key]=(Number(q.navReloads[key])||0)+1;saveQueue(q);if(q.navReloads[key]>2)throw new Error(`OT Rankings did not render ${date} after waiting on the already-correct URL (${actualVisibleDate()||'no rendered date detected'}).`);location.reload();return false}}location.assign(target);return false}return true}
async function collectStaffing(date){await waitForTargetDate(date,'staffing');const api=window.MVCI_REBEL_SCOUT_STAFFING;if(!api?.scrapeNow)throw new Error('Rebel Scout staffing collector is unavailable.');await wait(650);const started=Date.now();let thrown='';try{await api.scrapeNow({expectedDate:date})}catch(e){thrown=clean(e?.message||e)}const s=api.status?.()||{},fresh=s.lastCapture?.date===date&&Date.parse(s.lastCapture?.at||'')>=started-1000,last=s.lastError||thrown||s.status||'unknown';if(s.status==='sent-good'&&fresh)return `Staffing ${date}: ${s.lastCapture.rows} rows, ${s.lastCapture.regular} regular 24-hour.`;throw new Error(`Staffing ${date} did not pass the full-census verification (${last}).`)}
async function collectOvertime(date){await waitForTargetDate(date,'overtime');const api=window.MVCI_REBEL_SCOUT_OT;if(!api?.captureRanking)throw new Error('Rebel Scout overtime collector is unavailable.');const r=await api.captureRanking({force:true});if(r?.ranking?.quality==='good')return `OT priority ${date}: accepted.`;throw new Error(`OT priority ${date} did not pass verification (${r?.error||r?.ranking?.quality||'unknown'}).`)}
async function finishOrExtend(q){let plan;try{plan=await syncPlan()}catch(e){q.active=false;q.completedAt=Date.now();q.finalServerCheckError=clean(e?.message||e);saveQueue(q);releaseLock();const good=(q.successKeys||[]).length,fail=q.finalFailures||[];if(fail.length)saveStatus(`Collection finished ${good} checks; ${fail.length} still failed after retries. Final server freshness check was unavailable (${q.finalServerCheckError}). ${fail.slice(0,2).map(x=>`${x.key}: ${x.message}`).join(' | ')}`,'error');else saveStatus(`Collection complete. ${good} requested checks succeeded. Final server freshness check was unavailable (${q.finalServerCheckError}), so Scout could not ask whether any additional stale dates remain.`,'info');return true}const added=mergeNewNeeded(q,plan),hard=Math.max(1,Number(q.hardSafetyMax)||250),atCap=(Number(q.totalAdded)||0)>=hard;if(added){saveQueue(q);return false}q.active=false;q.completedAt=Date.now();q.finalServerCheckError='';saveQueue(q);releaseLock();const good=(q.successKeys||[]).length,fail=q.finalFailures||[];if(fail.length)saveStatus(`Sync completed ${good} checks; ${fail.length} still failed after retries. ${fail.slice(0,2).map(x=>`${x.key}: ${x.message}`).join(' | ')}`,'error');else if(atCap&&(plan?.worklist||[]).some(raw=>!new Set(q.sessionKeys||[]).has(`${raw.type==='ranking'?'overtime':raw.type}:${raw.workDate}`)))saveStatus(`Sync reached the whole-session safety ceiling of ${hard} unique checks. ${good} succeeded; remaining server-requested work is deferred to the next manual sync.`,'info');else saveStatus(`Sync complete. ${good} required checks succeeded and the server reports no remaining missing/stale data.`,'success');return true}
async function runQueue(){if(state.runner)return;state.runner=true;try{while(true){let q=queue();if(!q.active)return;if(!ownLock(false)){saveStatus('Sync is already running in another CrewSense tab.','info');return}pulseLock();if(q.index>=q.items.length){if(await finishOrExtend(q))return;q=queue();continue}const item=q.items[q.index],key=itemKey(item),date=item.workDate;state.busy=true;saveStatus(`Syncing ${q.index+1}/${q.items.length}: ${item.type==='staffing'?'staffing':'OT priority'} ${date}`,'info');let navigated=await navigateFor(item,q);if(!navigated)return;let ok=true,message='';try{message=item.type==='staffing'?await collectStaffing(date):await collectOvertime(date)}catch(e){ok=false;message=clean(e?.message||e)}q=queue();q.results=q.results||[];q.successKeys=q.successKeys||[];q.finalFailures=q.finalFailures||[];q.attempts=q.attempts||{};q.results.push({key,ok,message,at:Date.now()});if(ok){if(!q.successKeys.includes(key))q.successKeys.push(key);if(q.navReloads)delete q.navReloads[key]}else{q.attempts[key]=(Number(q.attempts[key])||0)+1;if(q.attempts[key]<MAX_ATTEMPTS)q.items.push({...item,retry:q.attempts[key]});else if(!q.finalFailures.some(x=>x.key===key))q.finalFailures.push({key,message,attempts:q.attempts[key]})}q.index++;saveQueue(q);state.busy=false;await wait(document.hidden?1100:400)}}catch(e){saveStatus(`Sync stopped: ${clean(e?.message||e)}`,'error')}finally{state.runner=false;state.busy=false;render()}}
async function startSync(){if(!core.paired()){saveStatus('Pair Rebel Scout before syncing.','error');return}if(!ownLock(false)){saveStatus('Sync is already running in another CrewSense tab.','info');return}const old=queue();if(old.active){state.open=true;render();runQueue();return}state.busy=true;render();try{const plan=await syncPlan(),hard=Math.max(1,Number(plan?.config?.hardSafetyMaxChecks)||250),q={schemaVersion:2,active:true,startedAt:Date.now(),index:0,items:[],results:[],successKeys:[],finalFailures:[],attempts:{},navReloads:{},hardSafetyMax:hard,sessionKeys:[],totalAdded:0};mergeNewNeeded(q,plan);q.active=q.items.length>0;saveQueue(q);if(!q.active){releaseLock();saveStatus('Everything is current. No missing or stale staffing/OT data was requested.','success');return}saveStatus(`Rebel Scout sync started with ${q.items.length} required checks; whole-session ceiling ${hard}.`,'info');runQueue()}catch(e){releaseLock();saveStatus(`Sync could not start: ${clean(e?.message||e)}`,'error')}finally{state.busy=false;render()}}
function stopSync(){const q=queue();q.active=false;q.stoppedAt=Date.now();saveQueue(q);releaseLock();saveStatus('Sync stopped by user.','info')}
async function captureCurrentStaffing(){try{state.busy=true;render();const d=actualVisibleDate();if(!isListView()||!d)throw new Error('Open a CrewSense ListView staffing date first.');const r=await window.MVCI_REBEL_SCOUT_STAFFING.scrapeNow({expectedDate:d});saveStatus(`Staffing ${d} captured (${r?.lastCapture?.rows??'unknown'} rows).`,r?.status==='sent-good'?'success':'info')}catch(e){saveStatus(clean(e?.message||e),'error')}finally{state.busy=false;render()}}
async function captureCurrentOT(){try{state.busy=true;render();if(!isRankingPage())throw new Error('Open the CrewSense Global OT Rankings page first.');const d=actualVisibleDate();const r=await window.MVCI_REBEL_SCOUT_OT.captureRanking({force:true});saveStatus(`OT ranking ${d||''} captured (${r?.ranking?.quality||'unknown'}).`,r?.ranking?.quality==='good'?'success':'info')}catch(e){saveStatus(clean(e?.message||e),'error')}finally{state.busy=false;render()}}
async function runNextAction(){const api=window.MVCI_REBEL_SCOUT_ACTIONS;if(!api)throw new Error('Action input module is unavailable.');const trace=window.MVCI_REBEL_SCOUT_TRACE,st=api.status?.()||{};if(st.actionType==='schedule'&&st.stage==='prepared'){if(st.testOnly===true)throw new Error('This schedule preview is test-only. Clear the local action state from Tools / Diagnostics before running another action.');await trace?.startAction?.({packageKey:st.packageKey,actionType:st.actionType,targetDate:st.targetDate,command:'commit-schedule'});await trace?.checkpoint?.('trace_user_command','User invoked COMMIT ONE SCHEDULE SAVE.');return api.commitPrepared()}if(st.actionType==='overtime_signup'&&st.stage==='ot_preview_ready'){if(st.testOnly===true)throw new Error('This OT preview is test-only. Clear the local action state from Tools / Diagnostics before running another action.');await trace?.startAction?.({packageKey:st.packageKey,actionType:st.actionType,targetDate:st.targetDate,command:'commit-ot'});await trace?.checkpoint?.('trace_user_command','User invoked COMMIT ONE OT SIGNUP.');return api.commitOtPrepared()}await trace?.startAction?.({command:'run-next-action'});await trace?.checkpoint?.('trace_user_command','User invoked RUN NEXT ACTION before Scout queried the Rebel Command worklist.');try{const list=await api.worklist(),all=Array.isArray(list)?list:[],recover=all.filter(x=>x.stage==='reread_verification'||x.status==='writing').sort((a,b)=>String(a.targetDate||'').localeCompare(String(b.targetDate||''))),isNonWritable=x=>(api.nonWritablePackage||(()=>false))(x),writable=all.filter(x=>!isNonWritable(x)),pool=recover.length?recover:(writable.length?writable:all),pkg=pool.sort((a,b)=>String(a.targetDate||'').localeCompare(String(b.targetDate||'')))[0];if(!pkg)throw new Error('No approved/queued Rebel Command action is waiting.');await trace?.startAction?.({packageKey:pkg.packageKey,actionType:pkg.actionType,targetDate:pkg.targetDate,command:'package-selected'});await trace?.checkpoint?.('trace_package_selected','Scout selected the Rebel Command action package.',{package:{packageKey:pkg.packageKey,actionType:pkg.actionType,targetDate:pkg.targetDate,status:pkg.status,stage:pkg.stage}});if(pkg.actionType==='schedule')return api.startScheduleInput();if(pkg.actionType==='overtime_signup')return api.startOtInput();throw new Error(`Unsupported Rebel Command action type: ${clean(pkg.actionType||'unknown')}.`)}catch(e){await trace?.checkpoint?.('trace_action_command_error','RUN NEXT ACTION failed before or during package dispatch.',{error:{message:clean(e?.message||e)}});await trace?.stop?.('command_error');throw e}}
function style(){if(document.getElementById(STYLE_ID))return;const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`#${ROOT_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483647;font-family:Arial,sans-serif;color:#243746}#${ROOT_ID} *{box-sizing:border-box}#${ROOT_ID} .orb{width:54px;height:54px;border:2px solid #1b5a7a;border-radius:50%;background:#fff;color:#153e5c;box-shadow:0 5px 18px rgba(13,50,72,.28);cursor:pointer;padding:0;margin:0;display:flex;align-items:center;justify-content:center;}#${ROOT_ID} .orb.header-orb{width:38px;height:38px;min-width:38px;border-color:rgba(255,255,255,.7);box-shadow:none}#${ROOT_ID} .orb.header-orb img{width:30px!important;height:30px!important;}#${ROOT_ID} .p{width:390px;max-width:calc(100vw - 24px);margin-bottom:8px;background:#f6f8f9;border:1px solid #cbd8df;border-radius:11px;box-shadow:0 10px 30px #0005;overflow:hidden}#${ROOT_ID} .h{background:#173e63;color:#fff;padding:12px 14px;display:flex;justify-content:space-between;gap:10px}#${ROOT_ID} .b{padding:12px}#${ROOT_ID} button{cursor:pointer}#${ROOT_ID} .a{width:100%;min-height:42px;margin-top:8px;border:1px solid #173e63;border-radius:8px;background:#173e63;color:#fff;font-weight:800}#${ROOT_ID} .a.commit{background:#177245;border-color:#177245}#${ROOT_ID} .s{min-height:34px;border:1px solid #cbd8df;border-radius:8px;background:#fff;color:#29495a;font-weight:700;padding:7px}#${ROOT_ID} .grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}#${ROOT_ID} .m{margin-top:8px;padding:8px;border:1px solid #dce5ea;border-radius:8px;background:#fff;font-size:11px;line-height:1.4;max-height:120px;overflow:auto}#${ROOT_ID} .ok{border-color:#a7d9bd;background:#f0fbf5;color:#216340}#${ROOT_ID} .err{border-color:#efb2b2;background:#fff4f4;color:#8b2c2c}#${ROOT_ID} .meta{font-size:10px;color:#637987;line-height:1.35;margin-bottom:5px}`;document.documentElement.appendChild(s)}
function render(){style();let r=document.getElementById(ROOT_ID);if(!r){r=document.createElement('div');r.id=ROOT_ID;document.documentElement.appendChild(r)}r.replaceChildren();const q=queue();if(state.open){const p=document.createElement('div');p.className='p';p.innerHTML=`<div class="h"><div><b>REBEL SCOUT</b><div style="font-size:10px;opacity:.75">v${VERSION} · read-only CrewSense collector</div></div><button id="rs-close" class="orb header-orb" type="button" title="Minimize Rebel Scout" aria-label="Minimize Rebel Scout">${REBEL_SYMBOL_HTML}</button></div><div class="b"><div class="meta">Connection: <b>${core.paired()?'paired':'needed'}</b> · Page: <b>${isListView()?'Staffing ListView':isRankingPage()?'OT Rankings':'CrewSense'}</b>${actualVisibleDate()?` · Date: <b>${esc(actualVisibleDate())}</b>`:''}</div><button id="rs-sync" class="a" ${state.busy?'disabled':''}>${q.active?`RESUME SYNC · ${Math.min((q.index||0)+1,q.items?.length||0)}/${q.items?.length||0}`:'SYNC SCOUT DATA'}</button>${q.active?'<button id="rs-stop" class="a" style="background:#fff;color:#173e63">STOP SYNC</button>':''}<details style="margin-top:8px"><summary class="meta" style="cursor:pointer;font-weight:700">DIAGNOSTICS / CONNECTION</summary><div style="margin-top:6px"><div class="grid"><button id="rs-staff" class="s" ${!isListView()||state.busy?'disabled':''}>CAPTURE STAFFING</button><button id="rs-ot" class="s" ${!isRankingPage()||state.busy?'disabled':''}>CAPTURE OT RANKING</button></div><button id="rs-connect" class="s" style="width:100%;margin-top:6px">CONNECTION</button></div></details><div class="m ${state.kind==='success'?'ok':state.kind==='error'?'err':''}">${esc(state.message)}${q.active&&q.items?.[q.index]?`<br><b>Current:</b> ${esc(q.items[q.index].type)} · ${esc(q.items[q.index].workDate)}`:''}</div><div class="meta" style="margin-top:8px">Read-only collector. Scout gathers staffing and overtime information for Rebel Command. CrewSense editing is disabled in this build.</div></div>`;r.appendChild(p);p.querySelector('#rs-close').onclick=()=>{state.open=false;render()};p.querySelector('#rs-sync').onclick=()=>q.active?runQueue():startSync();p.querySelector('#rs-stop')?.addEventListener('click',stopSync);p.querySelector('#rs-staff').onclick=captureCurrentStaffing;p.querySelector('#rs-ot').onclick=captureCurrentOT;p.querySelector('#rs-connect').onclick=async()=>{try{await core.configure();saveStatus('Connection configuration complete.','success')}catch(e){saveStatus(`Connection failed: ${clean(e?.message||e)}`,'error')}}}else{const orb=document.createElement('button');orb.className='orb';orb.type='button';orb.innerHTML=REBEL_SYMBOL_HTML;orb.title='Open Rebel Scout';orb.setAttribute('aria-label','Open Rebel Scout');orb.onclick=()=>{state.open=true;render()};r.appendChild(orb)}}
restoreStatus();render();
setInterval(()=>{const q=queue();if(q.active){pulseLock();render()}},30000);
setTimeout(()=>{const q=queue();if(q.active){state.open=false;render();runQueue()}},1300);
window.MVCI_REBEL_SCOUT={version:VERSION,collectorOnly:true,startSync,stopSync,runQueue,captureCurrentStaffing,captureCurrentOT,status:()=>({paired:core.paired(),collectorOnly:true,queue:queue(),visibleDate:actualVisibleDate(),page:isListView()?'staffing':isRankingPage()?'overtime':'other'})};
})();