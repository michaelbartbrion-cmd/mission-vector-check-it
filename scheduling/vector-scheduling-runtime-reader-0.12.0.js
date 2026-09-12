(function () {
  'use strict';

  const VERSION = '0.12.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const Engine = window.VectorSchedulingEngine;
  if (!Engine || window.__mvciVectorReader0120 || window.top !== window.self) return;
  window.__mvciVectorReader0120 = { version: VERSION, startedAt: Date.now() };

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const uid = (...parts) => parts.map(v => clean(v).toLowerCase()).join('|');
  const MONTHS = {jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
  const GROUP_RE = /\b(Truck\s+\d+|Engine\s+\d+|Medic\s+\d+|Quint\s+\d+|Battalion\s+\d+|Deployment|Employees\s+Off|Training\s*\/\s*Additional\s+Hours|Overtime\s+Sign\s+Up|Command\s+Staff|Prevention|Support\s+Services|Emergency\s+Management\s+Specialist)\b/i;

  function loadState(){ try{return JSON.parse(localStorage.getItem(STATE_KEY)||'null');}catch(_){return null;} }
  function saveState(s){ if(!s)return; s.metadata=s.metadata||{}; s.metadata.updatedAt=new Date().toISOString(); localStorage.setItem(STATE_KEY,JSON.stringify(s)); }
  function people(s){ return [...(s?.settings?.firefighters||[]),...(s?.settings?.command||[])]; }
  function upsert(list,row,keyFn){ const k=keyFn(row), i=list.findIndex(x=>keyFn(x)===k); if(i>=0)list[i]=row; else list.push(row); }
  function iso(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
  function isOwnUi(el){ return !!el?.closest?.('#mvci-vs-panel,#mvci-vs-open,#mvci-vs-style'); }

  function pageDocuments(){
    const out=[],seen=new Set();
    function walk(doc){
      if(!doc||seen.has(doc))return;
      seen.add(doc); out.push(doc);
      let frames=[]; try{frames=[...doc.querySelectorAll('iframe,frame')];}catch(_){return;}
      for(const f of frames){ try{if(f.contentDocument)walk(f.contentDocument);}catch(_){} }
    }
    walk(document); return out;
  }

  function parseDateText(text){
    const t=clean(text); if(!t)return null; let m;
    m=t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/); if(m)return iso(m[1],m[2],m[3]);
    m=t.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/); if(m)return iso(m[3],m[1],m[2]);
    m=t.match(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*,?\s*(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),\s*(20\d{2})\b/i);
    if(m)return iso(m[3],MONTHS[m[1].toLowerCase()],m[2]);
    return null;
  }

  function visibleDisplayedDate(){
    const candidates=[];
    for(const doc of pageDocuments()){
      let els=[];
      try{els=[...doc.querySelectorAll('input[type="date"],[data-date],[data-day],[datetime],time,h1,h2,h3,[class*="date"],[id*="date"],button,a,span,div')];}catch(_){continue;}
      for(const el of els){
        if(isOwnUi(el))continue;
        const vals=[el.value,el.getAttribute?.('data-date'),el.getAttribute?.('data-day'),el.getAttribute?.('datetime'),el.getAttribute?.('aria-label'),el.getAttribute?.('title'),el.textContent];
        for(const v of vals){
          if(!v || clean(v).length>110)continue;
          const d=parseDateText(v); if(!d)continue;
          let score=0;
          const tag=(el.tagName||'').toLowerCase();
          if(/^h[1-3]$/.test(tag))score+=8;
          if(tag==='time')score+=7;
          if(el.matches?.('input[type="date"],[data-date],[datetime]'))score+=6;
          const cls=clean(el.className||'').toLowerCase(); if(/date|day/.test(cls))score+=4;
          try{const r=el.getBoundingClientRect(); if(r.width>0&&r.height>0)score+=2;}catch(_){}
          candidates.push({d,score});
        }
      }
    }
    candidates.sort((a,b)=>b.score-a.score);
    return candidates[0]?.d||null;
  }

  function hashDisplayedDate(){
    const m=location.hash.match(/#?(20\d{2})\/(\d{1,2})\/(\d{1,2})/);
    return m?iso(m[1],m[2],m[3]):null;
  }

  function displayedDate(){ return visibleDisplayedDate() || hashDisplayedDate() || parseDateText(location.href); }
  function pageMode(){ const s=(location.pathname+' '+location.hash).toLowerCase(); if(s.includes('listview'))return 'ListView'; if(s.includes('schedule'))return 'Schedule'; return 'Unknown'; }

  function candidateRows(name){
    const needle=clean(name).toLowerCase(),out=[];
    for(const doc of pageDocuments()){
      let nodes=[]; try{nodes=[...doc.querySelectorAll('body *')];}catch(_){continue;}
      for(const el of nodes){
        if(isOwnUi(el))continue;
        const txt=clean(el.innerText||el.textContent||'');
        if(!txt||txt.length>900||!txt.toLowerCase().includes(needle))continue;
        let score=0;
        if(/\b\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\b/.test(txt))score+=7;
        if(/\b(?:Capt|DE-A|DE|FFB|FFA|FF|TM|TAC|TADE)\b/i.test(txt))score+=5;
        if(/Salary Step|Vacation Pay|Holiday Pay|Sick|Leave|Additional Time|Deployment|Disaster/i.test(txt))score+=3;
        if(el.matches?.('tr,[role="row"],li,.row,.list-group-item'))score+=4;
        if(/\d+\.\d+%/.test(txt))score-=12;
        score-=txt.length/350;
        out.push({el,txt,score,doc});
      }
    }
    out.sort((a,b)=>b.score-a.score||a.txt.length-b.txt.length);
    return out;
  }

  function groupFromAncestors(el){
    let cur=el;
    for(let depth=0;cur&&depth<10;depth++,cur=cur.parentElement){
      if(isOwnUi(cur))continue;
      const text=clean(cur.innerText||''); if(!text||text.length>7000)continue;
      const m=text.match(GROUP_RE); if(m)return clean(m[1]);
    }
    return null;
  }

  function groupFromPreceding(el){
    const doc=el?.ownerDocument; if(!doc)return null;
    let all=[]; try{all=[...doc.querySelectorAll('body *')];}catch(_){return null;}
    let idx=all.indexOf(el); if(idx<0)idx=all.findIndex(x=>x.contains?.(el));
    for(let i=idx-1,seen=0;i>=0&&seen<180;i--,seen++){
      const x=all[i]; if(isOwnUi(x))continue;
      const t=clean(x.innerText||x.textContent||''); if(!t||t.length>120)continue;
      const m=t.match(GROUP_RE); if(m)return clean(m[1]);
    }
    return null;
  }

  function contextFor(row){
    if(!row?.el)return {group:null,contextText:''};
    const group=groupFromAncestors(row.el)||groupFromPreceding(row.el)||null;
    let contextText='',cur=row.el;
    for(let depth=0;cur&&depth<5;depth++,cur=cur.parentElement){
      const t=clean(cur.innerText||'');
      if(t.length>=row.txt.length&&t.length<=1000){contextText=t;if(group&&t.toLowerCase().includes(group.toLowerCase()))break;}
    }
    return {group,contextText:contextText.slice(0,1000)};
  }

  function captureNow(){
    const s=loadState(); if(!s)throw new Error('Scheduling state has not been initialized.');
    const date=displayedDate(); if(!date)throw new Error('Could not determine the displayed Vector date.');
    const crew=people(s); if(!crew.length)throw new Error('Import the private Truck 504 history first.');
    s.observations=Array.isArray(s.observations)?s.observations:[];
    const capturedAt=new Date().toISOString(),mode=pageMode(),results=[];
    for(const p of crew){
      const best=candidateRows(p.name)[0]||null,rawText=best?.txt||'',cx=contextFor(best),combined=clean(`${cx.group||''} ${rawText}`);
      const row={date,personId:p.id,personName:p.name,capturedAt,rawText,dutyCode:rawText?Engine.detectDutyCode(rawText):null,assignment:combined?Engine.detectAssignment(combined):null,assignmentGroup:cx.group,contextText:cx.contextText,found:!!best,source:'vector-dom-readonly-v0120',pageMode:mode,locked:/\bLOCKED\b/i.test(clean(best?.doc?.body?.innerText||document.body?.innerText||'')),captureQuality:!best?'missing':(cx.group?'row+group':'row-only')};
      upsert(s.observations,row,x=>uid(x.date,x.personId,x.capturedAt,x.source)); results.push(row);
    }
    s.metadata=s.metadata||{};
    s.metadata.lastCaptureAt=capturedAt; s.metadata.lastCaptureVersion=VERSION; s.metadata.lastCaptureSummary={date,pageMode:mode,found:results.filter(r=>r.found).length,withGroup:results.filter(r=>r.assignmentGroup).length,total:results.length};
    saveState(s); return {date,mode,results,capturedAt,state:s};
  }

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function latestCapture(state){
    const rows=state?.observations||[]; if(!rows.length)return [];
    const latest=[...rows].map(r=>r.capturedAt).filter(Boolean).sort().pop(); return rows.filter(r=>r.capturedAt===latest);
  }

  function diagnosticsHtml(rows){
    if(!rows.length)return '';
    const first=rows[0];
    return `<h3>Last live capture check <span class="vs-muted">${VERSION}</span></h3><div class="vs-muted" style="margin-bottom:6px">${esc(first.date||'')} · ${esc(first.pageMode||'')} · ${rows.filter(r=>r.found).length}/${rows.length} people found · ${rows.filter(r=>r.assignmentGroup).length}/${rows.length} with assignment group</div><table class="vs-table"><tr><th>Person</th><th>Group</th><th>Code</th><th>Quality</th></tr>${rows.map(r=>`<tr><td>${esc(r.personName||r.personId)}</td><td>${esc(r.assignmentGroup||'—')}</td><td>${esc(r.dutyCode||'—')}</td><td>${esc(r.captureQuality||'—')}</td></tr>`).join('')}</table>`;
  }

  function refreshDiagnostics(){
    const panel=document.getElementById('mvci-vs-panel'); if(!panel)return;
    const rows=latestCapture(loadState()); if(!rows.length)return;
    const sig=rows.map(r=>`${r.capturedAt}|${r.personId}|${r.assignmentGroup}|${r.dutyCode}|${r.captureQuality}`).join('~');
    let card=panel.querySelector('#vs-capture-diagnostics-v0120');
    if(card?.dataset.sig===sig)return;
    if(!card){card=document.createElement('div');card.id='vs-capture-diagnostics-v0120';card.className='vs-card';const read=[...panel.querySelectorAll('.vs-card')].find(x=>/Read current Vector page/i.test(x.textContent||''));if(read)read.insertAdjacentElement('afterend',card);else panel.appendChild(card);}
    card.dataset.sig=sig; card.innerHTML=diagnosticsHtml(rows);
  }

  function wire(){
    const btn=document.getElementById('vs-capture');
    if(btn&&btn.dataset.mvciV0120!=='1'){
      btn.dataset.mvciV0120='1';
      btn.onclick=()=>{try{const out=captureNow();refreshDiagnostics();const missing=out.results.filter(r=>!r.found).map(r=>r.personName);const noGroup=out.results.filter(r=>r.found&&!r.assignmentGroup).map(r=>r.personName);let msg=`Captured ${out.results.filter(r=>r.found).length}/${out.results.length} tracked people for ${out.date} from ${out.mode}.`;if(missing.length)msg+=`\nMissing: ${missing.join(', ')}`;if(noGroup.length)msg+=`\nFound row but no assignment group: ${noGroup.join(', ')}`;alert(msg);}catch(err){alert(`Capture failed: ${err.message||err}`);}};
    }
    refreshDiagnostics();
  }

  setInterval(wire,1000); setTimeout(wire,250);
  window.MVCI_VECTOR_READER_0120={version:VERSION,captureNow,displayedDate,visibleDisplayedDate,hashDisplayedDate,pageMode,pageDocuments};
})();
