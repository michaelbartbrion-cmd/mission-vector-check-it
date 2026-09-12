(function () {
  'use strict';

  const PATCH_VERSION = '0.7.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const Engine = window.VectorSchedulingEngine;
  if (!Engine || window.__mvciVectorSchedulingPatch070) return;
  window.__mvciVectorSchedulingPatch070 = { version: PATCH_VERSION, startedAt: Date.now() };

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const uid = (...parts) => parts.map(v => clean(v).toLowerCase()).join('|');
  const MONTHS = {jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
  const GROUP_RE = /\b(Truck\s+\d+|Engine\s+\d+|Medic\s+\d+|Quint\s+\d+|Battalion\s+\d+|Deployment|Employees\s+Off|Training\s*\/\s*Additional\s+Hours|Overtime\s+Sign\s+Up|Command\s+Staff|Prevention|Support\s+Services|Emergency\s+Management\s+Specialist)\b/i;

  function loadState(){ try{return JSON.parse(localStorage.getItem(STATE_KEY)||'null');}catch(_){return null;} }
  function saveState(s){ if(!s)return; s.metadata=s.metadata||{}; s.metadata.updatedAt=new Date().toISOString(); localStorage.setItem(STATE_KEY,JSON.stringify(s)); }
  function people(s){ return [...(s?.settings?.firefighters||[]),...(s?.settings?.command||[])]; }
  function upsert(list,row,keyFn){ const k=keyFn(row), i=list.findIndex(x=>keyFn(x)===k); if(i>=0)list[i]=row; else list.push(row); }
  function iso(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

  function pageDocuments(){
    const out=[], seen=new Set();
    function walk(doc){
      if(!doc||seen.has(doc)) return; seen.add(doc); out.push(doc);
      let frames=[]; try{frames=[...doc.querySelectorAll('iframe,frame')];}catch(_){return;}
      for(const f of frames){ try{if(f.contentDocument)walk(f.contentDocument);}catch(_){/*cross-origin*/} }
    }
    walk(document); return out;
  }

  function parseDateText(text){
    const t=clean(text);
    let m=t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/); if(m)return iso(m[1],m[2],m[3]);
    m=t.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/); if(m)return iso(m[3],m[1],m[2]);
    m=t.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),\s*(20\d{2})\b/i);
    if(m)return iso(m[3],MONTHS[m[1].toLowerCase()],m[2]);
    return null;
  }

  function displayedDate(){
    for(const doc of pageDocuments()){
      const selectors=['input[type="date"]','[data-date]','[data-day]','[datetime]','.date','[class*="date"]','h1','h2','h3'];
      for(const sel of selectors){
        let els=[]; try{els=[...doc.querySelectorAll(sel)];}catch(_){continue;}
        for(const el of els){
          if(el.closest?.('#mvci-vs-panel,#mvci-vs-open')) continue;
          const vals=[el.value,el.getAttribute?.('data-date'),el.getAttribute?.('data-day'),el.getAttribute?.('datetime'),el.textContent];
          for(const v of vals){ const d=parseDateText(v); if(d)return d; }
        }
      }
      const d=parseDateText(doc.body?.innerText||''); if(d)return d;
    }
    const u=parseDateText(location.href); if(u)return u;
    return null;
  }

  function pageMode(){
    const s=(location.pathname+' '+location.hash+' '+document.body?.innerText?.slice(0,2000)).toLowerCase();
    if(s.includes('listview')||s.includes('list view')) return 'ListView';
    if(s.includes('schedule')) return 'Schedule';
    return 'Unknown';
  }

  function isOwnUi(el){ return !!el?.closest?.('#mvci-vs-panel,#mvci-vs-open,#mvci-vs-style'); }

  function candidateRows(name){
    const needle=clean(name).toLowerCase();
    const out=[];
    for(const doc of pageDocuments()){
      let nodes=[]; try{nodes=[...doc.querySelectorAll('body *')];}catch(_){continue;}
      for(const el of nodes){
        if(isOwnUi(el)) continue;
        const txt=clean(el.innerText||el.textContent||'');
        if(!txt||txt.length>900||!txt.toLowerCase().includes(needle)) continue;
        let score=0;
        if(/^\s*[^\n]*$/m.test(txt)) score+=0.5;
        if(/\b\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\b/.test(txt)) score+=7;
        if(/\b(?:Capt|DE-A|DE|FFB|FFA|FF|TM|TAC|TADE)\b/i.test(txt)) score+=5;
        if(/Salary Step|Vacation Pay|Holiday Pay|Sick|Leave|Additional Time|Deployment/i.test(txt)) score+=3;
        if(el.matches?.('tr,[role="row"],li,.row,.list-group-item')) score+=4;
        if(/\d+\.\d+%/.test(txt)) score-=10;
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
      if(isOwnUi(cur)) continue;
      const text=clean(cur.innerText||'');
      if(!text||text.length>7000) continue;
      const m=text.match(GROUP_RE); if(m)return clean(m[1]);
    }
    return null;
  }

  function groupFromPreceding(el){
    const doc=el?.ownerDocument; if(!doc)return null;
    let all=[]; try{all=[...doc.querySelectorAll('body *')];}catch(_){return null;}
    let idx=all.indexOf(el); if(idx<0){
      const holder=all.findIndex(x=>x.contains?.(el)); idx=holder;
    }
    for(let i=idx-1,seen=0;i>=0&&seen<180;i--,seen++){
      const x=all[i]; if(isOwnUi(x))continue;
      const t=clean(x.innerText||x.textContent||'');
      if(!t||t.length>120)continue;
      const m=t.match(GROUP_RE); if(m)return clean(m[1]);
    }
    return null;
  }

  function contextFor(row){
    if(!row?.el)return {group:null,contextText:''};
    const group=groupFromAncestors(row.el)||groupFromPreceding(row.el)||null;
    let contextText='';
    let cur=row.el;
    for(let depth=0;cur&&depth<5;depth++,cur=cur.parentElement){
      const t=clean(cur.innerText||'');
      if(t.length>=row.txt.length&&t.length<=1000){ contextText=t; if(group&&t.toLowerCase().includes(group.toLowerCase()))break; }
    }
    return {group,contextText:contextText.slice(0,1000)};
  }

  function captureNow(){
    const s=loadState(); if(!s)throw new Error('Scheduling state has not been initialized.');
    const date=displayedDate(); if(!date)throw new Error('Could not determine the displayed Vector date.');
    const crew=people(s); if(!crew.length)throw new Error('Import the private Truck 504 history first.');
    s.observations=Array.isArray(s.observations)?s.observations:[];
    const capturedAt=new Date().toISOString(), mode=pageMode();
    const results=[];
    for(const p of crew){
      const rows=candidateRows(p.name);
      const best=rows[0]||null;
      const rawText=best?.txt||'';
      const cx=contextFor(best);
      const combined=clean(`${cx.group||''} ${rawText}`);
      const row={
        date,personId:p.id,personName:p.name,capturedAt,rawText,
        dutyCode:rawText?Engine.detectDutyCode(rawText):null,
        assignment:combined?Engine.detectAssignment(combined):null,
        assignmentGroup:cx.group,
        contextText:cx.contextText,
        found:!!best,
        source:'vector-dom-readonly-v070',
        pageMode:mode,
        locked:/\bLOCKED\b/i.test(clean(best?.doc?.body?.innerText||document.body?.innerText||'')),
        captureQuality:!best?'missing':(cx.group?'row+group':'row-only')
      };
      upsert(s.observations,row,x=>uid(x.date,x.personId,x.capturedAt,x.source));
      results.push(row);
    }
    s.metadata=s.metadata||{};
    s.metadata.lastCaptureAt=capturedAt;
    s.metadata.lastCaptureVersion=PATCH_VERSION;
    s.metadata.lastCaptureSummary={date,pageMode:mode,found:results.filter(r=>r.found).length,withGroup:results.filter(r=>r.assignmentGroup).length,total:results.length};
    saveState(s);
    return {date,mode,results};
  }

  function latestCapture(state){
    const rows=state?.observations||[]; if(!rows.length)return [];
    const latest=[...rows].map(r=>r.capturedAt).filter(Boolean).sort().pop();
    return rows.filter(r=>r.capturedAt===latest);
  }

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function injectDiagnostics(){
    const panel=document.getElementById('mvci-vs-panel'); if(!panel)return;
    const existing=panel.querySelector('#vs-capture-diagnostics-v070'); if(existing)existing.remove();
    const s=loadState(), rows=latestCapture(s); if(!rows.length)return;
    const card=document.createElement('div'); card.id='vs-capture-diagnostics-v070'; card.className='vs-card';
    const first=rows[0];
    card.innerHTML=`<h3>Last live capture check <span class="vs-muted">${PATCH_VERSION}</span></h3>
      <div class="vs-muted" style="margin-bottom:6px">${esc(first.date||'')} · ${esc(first.pageMode||'')} · ${rows.filter(r=>r.found).length}/${rows.length} people found · ${rows.filter(r=>r.assignmentGroup).length}/${rows.length} with assignment group</div>
      <table class="vs-table"><tr><th>Person</th><th>Group</th><th>Code</th><th>Quality</th></tr>${rows.map(r=>`<tr><td>${esc(r.personName||r.personId)}</td><td>${esc(r.assignmentGroup||'—')}</td><td>${esc(r.dutyCode||'—')}</td><td>${esc(r.captureQuality||'—')}</td></tr>`).join('')}</table>`;
    const readCard=[...panel.querySelectorAll('.vs-card')].find(x=>/Read current Vector page/i.test(x.textContent||''));
    if(readCard)readCard.insertAdjacentElement('afterend',card); else panel.appendChild(card);
  }

  function wire(){
    const btn=document.getElementById('vs-capture');
    if(btn&&btn.dataset.mvciV070!=='1'){
      btn.dataset.mvciV070='1';
      btn.onclick=()=>{
        try{
          const out=captureNow();
          injectDiagnostics();
          const bad=out.results.filter(r=>!r.found).map(r=>r.personName);
          const noGroup=out.results.filter(r=>r.found&&!r.assignmentGroup).map(r=>r.personName);
          let msg=`Captured ${out.results.filter(r=>r.found).length}/${out.results.length} tracked people for ${out.date} from ${out.mode}.`;
          if(bad.length)msg+=`\nMissing: ${bad.join(', ')}`;
          if(noGroup.length)msg+=`\nFound row but no assignment group: ${noGroup.join(', ')}`;
          alert(msg);
        }catch(err){alert(`Capture failed: ${err.message||err}`);}
      };
    }
    injectDiagnostics();
  }

  const observer=new MutationObserver(()=>setTimeout(wire,0));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  wire();
})();
