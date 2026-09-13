(function () {
  'use strict';

  const VERSION = '0.20.0-dev';
  const ENDPOINT = 'https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
  const PAIR_KEY = 'vectorStaffingCollectorPairing_v1';
  const CARD_ID = 'vs-vector-bridge-v0200';
  const STYLE_ID = 'vs-vector-bridge-style-v0200';
  const CSHIFT_ANCHOR = '2026-09-10';
  const STABLE_MS = 800;
  const MIN_ROWS = 24;
  const MIN_REGULAR = 20;
  const MIN_GROUPS = 6;

  if (window.top !== window.self || window.__mvciVectorBridge0200) return;
  window.__mvciVectorBridge0200 = { version: VERSION, startedAt: Date.now() };

  const state = {
    lastMutationAt: Date.now(),
    running: false,
    status: 'idle',
    lastCapture: null,
    lastError: '',
  };

  const clean = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function loadJson(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; }
  }
  function saveJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function pairing() {
    const p = loadJson(PAIR_KEY, {});
    return { deviceId: clean(p.deviceId), token: clean(p.token), endpoint: clean(p.endpoint) || ENDPOINT };
  }
  function paired() { const p = pairing(); return !!(p.deviceId && p.token); }

  function parseDate(value) {
    const text = clean(value).replace(/^#/, '');
    let m = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (m) return `${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`;
    m = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
    if (m) return `${m[3]}-${String(Number(m[1])).padStart(2,'0')}-${String(Number(m[2])).padStart(2,'0')}`;
    return '';
  }

  function displayedDate() {
    const fromHash = parseDate(location.hash);
    if (fromHash) return { date: fromHash, confidence: 'high', source: 'url-hash' };
    const fromPath = parseDate(location.pathname);
    if (fromPath) return { date: fromPath, confidence: 'high', source: 'url-path' };
    const oldReader = window.MVCI_VECTOR_READER_0120;
    const old = oldReader?.displayedDate?.() || oldReader?.visibleDisplayedDate?.();
    if (old) return { date: old, confidence: 'high', source: 'existing-reader' };
    const inputs = [...document.querySelectorAll('input')].map(el => parseDate(el.value)).filter(Boolean);
    const unique = [...new Set(inputs)];
    if (unique.length === 1) return { date: unique[0], confidence: 'high', source: 'input' };
    return { date: '', confidence: 'none', source: 'not-found' };
  }

  function cShiftLabel(date) {
    if (!date) return 'Shift unknown';
    const a = new Date(`${CSHIFT_ANCHOR}T12:00:00Z`);
    const b = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(b.getTime())) return 'Shift unknown';
    const mod = ((Math.round((b-a)/86400000) % 6) + 6) % 6;
    if (mod === 0) return 'C Shift Day 1';
    if (mod === 1) return 'C Shift Day 2';
    return 'Off C Shift';
  }

  function rendered(el) {
    if (!el || !(el instanceof Element)) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function loadingVisible() {
    return [...document.querySelectorAll('[aria-busy="true"],.loading,.spinner,[class*="loading"],[class*="spinner"]')].some(rendered);
  }

  function rowMarker(text) {
    return /Salary Step\s*\[1010\]|\bSub\s*\[1010\]|Additional Time|Disaster Relief|Overtime|OT Sign|Force Hire|Backfill|Trade|Swap|Open Slot|Vacation|Sick|Leave|Time Off/i.test(text);
  }

  function candidateElements(root=document) {
    const pool = [...root.querySelectorAll('tr,[role="row"],li,article,section,div')]
      .filter(el => rendered(el) && !el.closest(`#${CARD_ID}`) && !el.closest('#mvci-vs-panel'))
      .map(el => ({el, text: clean(el.textContent)}))
      .filter(x => x.text.length >= 8 && x.text.length <= 900 && rowMarker(x.text));
    const selected=[];
    for (const item of pool.sort((a,b)=>a.text.length-b.text.length)) {
      if (selected.some(x => item.el.contains(x.el))) continue;
      selected.push(item);
    }
    return selected;
  }

  const GROUP_RE = /\b(Engine|Truck|Medic|Quint|Rescue|Battalion|Brush|Squad|Tower|Ladder|Ambulance|Station)\s+\d{1,4}\b/i;
  function groupFor(el) {
    let node = el;
    for (let depth=0; node && depth<10; depth++, node=node.parentElement) {
      const text = clean(node.textContent).slice(0, 5000);
      const matches = [...text.matchAll(new RegExp(GROUP_RE.source, 'ig'))];
      if (matches.length === 1) return clean(matches[0][0]);
      if (matches.length > 1 && depth <= 2) return clean(matches[matches.length-1][0]);
    }
    let prev = el.previousElementSibling;
    for (let i=0; prev && i<8; i++, prev=prev.previousElementSibling) {
      const m = clean(prev.textContent).match(GROUP_RE);
      if (m) return clean(m[0]);
    }
    return '';
  }

  function hoursFrom(text) {
    const t=clean(text);
    let m=t.match(/\b(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\b/i);
    if (m) return Number(m[1]);
    m=t.match(/\b(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\b/);
    if (!m) return null;
    let start=Number(m[1])+Number(m[2])/60, end=Number(m[3])+Number(m[4])/60;
    if (end<=start) end+=24;
    return Math.round((end-start)*100)/100;
  }

  function scheduleType(text) {
    const t=clean(text);
    for (const re of [/Salary Step\s*\[1010\](?:\s*-\s*[^\[]+\[[^\]]+\])?/i,/\bSub\s*\[1010\]/i,/Additional Time[^\[]*(?:\[[^\]]+\])?/i,/Salary Disaster Relief[^\[]*(?:\[[^\]]+\])?/i,/Overtime[^\[]*(?:\[[^\]]+\])?/i]) {
      const m=t.match(re); if (m) return clean(m[0]);
    }
    return '';
  }

  function personAndDuty(text) {
    const t=clean(text);
    if (/^Open Slot\b/i.test(t)) return {personName:'Open Slot', dutyCode:''};
    const marker=t.search(/\s+(?=Salary Step\s*\[1010\]|Sub\s*\[1010\]|Additional Time|Salary Disaster Relief|Overtime|OT Sign|Force Hire|Backfill|Trade|Swap|Vacation|Sick|Leave|Time Off)/i);
    const prefix=clean(marker>0?t.slice(0,marker):t);
    const tokens=prefix.split(' ').filter(Boolean);
    const dutySet=new Set(['CAPT','CAPTAIN','DE','DE-A','DE-B','DE-C','FF','FFA','FFB','FFC','TM','TILLER','TADE','TAC','SWING','FFC']);
    let duty='';
    if (tokens.length>2) {
      const last=tokens[tokens.length-1].toUpperCase();
      if (dutySet.has(last)) duty=tokens.pop();
    }
    const personName=clean(tokens.join(' ')).slice(0,180);
    return {personName, dutyCode:duty};
  }

  function hash32(text) {
    let h=0x811c9dc5; for (let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193);} return (h>>>0).toString(36);
  }

  function makeRow(item) {
    const rawText=clean(item.text);
    const group=groupFor(item.el);
    const pd=personAndDuty(rawText);
    const lengthHours=hoursFrom(rawText);
    return {
      personId:`dom-${hash32((pd.personName||rawText).toLowerCase())}`,
      personName:pd.personName,
      activity:'Work Shift',
      assignment:group,
      assignmentGroup:group,
      dutyCode:pd.dutyCode,
      scheduleType:scheduleType(rawText),
      ...(Number.isFinite(lengthHours)?{lengthHours}:{}),
      captureQuality:group?'row+group':'row-only',
      rawText,
    };
  }

  function findScroller(el) {
    let node=el?.parentElement||null;
    for (let d=0;node&&d<12;d++,node=node.parentElement){const s=getComputedStyle(node);if(node.scrollHeight>node.clientHeight+80&&/(auto|scroll)/i.test(s.overflowY||''))return node;}
    return null;
  }

  function merge(target, items) {
    for (const item of items) {
      const row=makeRow(item); if (!row.personName || !row.rawText) continue;
      const key=`${row.assignmentGroup}|${row.rawText}`; if (!target.has(key)) target.set(key,row);
    }
  }

  async function sweep() {
    const found=new Map();
    const initial=candidateElements(); merge(found,initial);
    const scroller=findScroller(initial[0]?.el);
    if (!scroller) return {rows:[...found.values()], scrollSweepComplete:true, scroller:'none'};
    const original=scroller.scrollTop, max=Math.max(0,scroller.scrollHeight-scroller.clientHeight), step=Math.max(180,Math.floor(scroller.clientHeight*.7));
    let bottom=false;
    try {
      for(let pos=0,loops=0;pos<=max+step&&loops<120;pos+=step,loops++){
        scroller.scrollTop=Math.min(pos,max); await wait(90); merge(found,candidateElements(scroller));
        if(scroller.scrollTop>=max-3){bottom=true;merge(found,candidateElements(scroller));break;}
      }
    } finally {scroller.scrollTop=original;await wait(100);}
    return {rows:[...found.values()],scrollSweepComplete:bottom,scroller:'element'};
  }

  async function waitStable(max=6000){const start=Date.now();while(Date.now()-start<max){if(Date.now()-state.lastMutationAt>=STABLE_MS&&!loadingVisible())return true;await wait(100);}return false;}

  async function verifyPair(p){const response=await fetch(p.endpoint||ENDPOINT,{method:'GET',headers:{Authorization:`Bearer ${p.token}`,'X-Rebel-Device-ID':p.deviceId},cache:'no-store',credentials:'omit'});if(!response.ok)throw new Error(`Pairing rejected (${response.status})`);return response.json().catch(()=>({}));}

  async function configure(){
    const current=pairing();
    if(current.deviceId&&current.token){const action=prompt('Vector bridge is paired. Type TEST to test, REPAIR to replace credentials, CLEAR to remove pairing, or leave blank to cancel.','TEST');if(!action)return;const upper=action.trim().toUpperCase();if(upper==='CLEAR'){localStorage.removeItem(PAIR_KEY);state.status='idle';render();return;}if(upper==='TEST'){try{await verifyPair(current);alert('Rebel Command pairing is working.');}catch(e){alert(`Pairing test failed: ${e.message||e}`);}return;}if(upper!=='REPAIR')return;}
    const deviceId=clean(prompt('Paste the Rebel Command Device ID:',current.deviceId||'')||'');if(!deviceId)return;
    const token=clean(prompt('Paste the private device token from Rebel Command:','')||'');if(!token)return;
    const next={deviceId,token,endpoint:ENDPOINT};
    try{await verifyPair(next);saveJson(PAIR_KEY,next);state.status='ready';render();alert('Vector bridge paired with Rebel Command.');}catch(e){alert(`Pairing failed: ${e.message||e}`);}
  }

  async function sendCapture(payload){const p=pairing();if(!p.deviceId||!p.token)throw new Error('Pair Rebel Command first.');const response=await fetch(p.endpoint||ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${p.token}`,'X-Rebel-Device-ID':p.deviceId,'Content-Type':'application/json'},body:JSON.stringify({version:VERSION,staffingCapture:payload}),cache:'no-store',credentials:'omit'});const body=await response.json().catch(()=>({}));if(!response.ok||body?.ok===false)throw new Error(body?.error||`Rebel Command rejected capture (${response.status})`);return body;}

  async function scrapeNow(){
    if(state.running)return;
    if(!paired()){await configure();if(!paired())return;}
    state.running=true;state.status='reading';state.lastError='';render();
    try{
      const stable=await waitStable();const before=displayedDate();if(!before.date)throw new Error('Could not identify the ListView date.');
      const result=await sweep();await waitStable(3000);const after=displayedDate();if(before.date!==after.date)throw new Error('Date changed during scrape.');
      const rows=result.rows;const regular=rows.filter(r=>/Salary Step\s*\[1010\]/i.test(r.scheduleType||r.rawText)&&Number(r.lengthHours)===24&&!/Sub\s*\[1010\]|Additional Time|Overtime|OT Sign|Force Hire|Backfill|Disaster Relief|Trade|Swap|Vacation|Sick|Leave|Time Off/i.test(r.rawText)).length;
      const groups=new Set(rows.map(r=>r.assignmentGroup).filter(Boolean)).size;const noLoading=!loadingVisible();const dateConfidence=before.confidence==='high'&&after.confidence==='high'?'high':'medium';
      const full=stable&&noLoading&&result.scrollSweepComplete&&dateConfidence==='high'&&rows.length>=MIN_ROWS&&regular>=MIN_REGULAR&&groups>=MIN_GROUPS;
      const digest=hash32(JSON.stringify(rows.map(r=>[r.personId,r.assignmentGroup,r.rawText]).sort()));const capturedAt=new Date().toISOString();
      const payload={batchId:`unified:${before.date}:${Date.now()}:${digest}`,capturedAt,sourceVersion:`vector-bridge-${VERSION}`,pageMode:'ListView',captureComplete:full,diagnostics:{pageStable:stable,allVisibleGroupsScanned:result.scrollSweepComplete,scrollSweepComplete:result.scrollSweepComplete,noLoadingIndicator:noLoading,dateConfidence,dateSource:before.source,visibleScheduleRows:rows.length,candidateRegularRows:regular,groupCount:groups,scroller:result.scroller},days:[{workDate:before.date,shiftLabel:'',rows}]};
      const body=await sendCapture(payload);
      state.status=body?.staffing?.quality==='good'?'sent-good':'sent-partial';
      state.lastCapture={date:before.date,rows:rows.length,regular,groups,full,quality:body?.staffing?.quality||'unknown',at:capturedAt};
      try{window.MVCI_VECTOR_READER_0120?.captureNow?.();}catch(_){}
    }catch(e){state.status='error';state.lastError=clean(e?.message||e);}
    finally{state.running=false;render();}
  }

  function ensureStyle(){if(document.getElementById(STYLE_ID))return;const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`#vs-vector-bridge-v0190{display:none!important}#vector-staffing-collector-status{display:none!important}#mvci-vs-panel.mvci-bridge-compact .vs-card:not(#${CARD_ID}){display:none!important}#${CARD_ID} .mvci-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}#${CARD_ID} .mvci-stat{border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:7px;background:rgba(0,0,0,.12)}#${CARD_ID} .mvci-label{font-size:10px;opacity:.62;text-transform:uppercase;letter-spacing:.06em}#${CARD_ID} .mvci-value{font-size:12px;font-weight:700;margin-top:2px}#${CARD_ID} .mvci-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}`;document.documentElement.appendChild(style);}

  function statusLabel(){if(!paired())return'Not paired';if(state.status==='reading')return'Reading…';if(state.status==='sent-good')return'Connected · good capture';if(state.status==='sent-partial')return'Connected · verify data';if(state.status==='error')return'Connected · error';return'Connected';}

  function render(){
    ensureStyle();const panel=document.getElementById('mvci-vs-panel');if(!panel)return;panel.classList.add('mvci-bridge-compact');
    let card=panel.querySelector(`#${CARD_ID}`);if(!card){card=document.createElement('div');card.id=CARD_ID;card.className='vs-card';panel.prepend(card);}
    const date=displayedDate().date;const cap=state.lastCapture;const html=`<h3>Vector bridge <span class="vs-muted">${VERSION}</span></h3><div class="mvci-grid"><div class="mvci-stat"><div class="mvci-label">Rebel Command</div><div class="mvci-value">${esc(statusLabel())}</div></div><div class="mvci-stat"><div class="mvci-label">Displayed</div><div class="mvci-value">${esc(date||'Unknown')} · ${esc(cShiftLabel(date))}</div></div><div class="mvci-stat"><div class="mvci-label">Last census</div><div class="mvci-value">${cap?`${cap.rows} rows · ${cap.regular} regular24h`:'None yet'}</div></div><div class="mvci-stat"><div class="mvci-label">Groups / quality</div><div class="mvci-value">${cap?`${cap.groups} groups · ${esc(cap.quality)}`:'Waiting'}</div></div></div><div class="mvci-actions"><button id="mvci-pair-0200" class="vs-btn secondary">${paired()?'TEST PAIRING':'PAIR'}</button><button id="mvci-scrape-0200" class="vs-btn" ${state.running?'disabled':''}>${state.running?'READING…':'SCRAPE NOW'}</button></div><button class="vs-btn" style="margin-top:7px" disabled>INPUT SCHEDULE · 0</button><button class="vs-btn secondary" style="margin-top:6px" disabled>INPUT OT SIGNUPS · 0</button><div class="vs-muted" style="margin-top:7px">One shared ListView census feeds Scheduling and Overtime. Writes remain disabled.</div>${state.lastError?`<div class="vs-muted" style="margin-top:5px;color:#fca5a5">${esc(state.lastError)}</div>`:''}`;
    if(card.dataset.html!==html){card.dataset.html=html;card.innerHTML=html;card.querySelector('#mvci-pair-0200')?.addEventListener('click',configure);card.querySelector('#mvci-scrape-0200')?.addEventListener('click',scrapeNow);}
  }

  const observer=new MutationObserver(()=>{state.lastMutationAt=Date.now();});
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  setInterval(render,1200);setTimeout(render,700);
  window.MVCI_VECTOR_BRIDGE_0200={version:VERSION,configure,scrapeNow,status:()=>({paired:paired(),status:state.status,lastCapture:state.lastCapture,lastError:state.lastError})};
})();
