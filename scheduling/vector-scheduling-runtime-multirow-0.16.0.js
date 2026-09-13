(function () {
  'use strict';

  const VERSION = '0.16.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const CSHIFT_ANCHOR = '2026-09-10';
  const GROUP_RE = /\b(Truck\s+\d+|Engine\s+\d+|Medic\s+\d+|Quint\s+\d+|Battalion\s+\d+|Deployment|Employees\s+Off|Training\s*\/\s*Additional\s+Hours|Overtime\s+Sign\s+Up|Command\s+Staff|Prevention|Support\s+Services|Emergency\s+Management\s+Specialist)\b/i;
  const timeRangeRe = /\b\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\b/;

  if (window.top !== window.self || window.__mvciVectorMultirow0160) return;
  window.__mvciVectorMultirow0160 = { version: VERSION, startedAt: Date.now() };

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const escRe = v => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const uid = (...parts) => parts.map(v => clean(v).toLowerCase()).join('|');

  function loadState() { try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (_) { return null; } }
  function saveState(s) {
    if (!s) return;
    s.metadata = s.metadata || {};
    s.metadata.updatedAt = new Date().toISOString();
    s.metadata.multirowReaderVersion = VERSION;
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  }
  function crew(s) { return [...(s?.settings?.firefighters || []), ...(s?.settings?.command || [])]; }
  function kind(s,id) { return crew(s).find(p=>p.id===id)?.kind || 'other'; }
  function isOwnUi(el) { return !!el?.closest?.('#mvci-vs-panel,#mvci-vs-open,#mvci-vs-style'); }
  function dayDiff(date) {
    const a=new Date(`${CSHIFT_ANCHOR}T12:00:00Z`), b=new Date(`${date}T12:00:00Z`);
    if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime()))return null;
    return Math.round((b-a)/86400000);
  }
  function cShiftInfo(date) {
    const diff=dayDiff(date);if(diff==null)return{isCShift:false,day:null};
    const mod=((diff%6)+6)%6;return mod===0?{isCShift:true,day:1}:mod===1?{isCShift:true,day:2}:{isCShift:false,day:null};
  }

  function pageDocuments() {
    const reader=window.MVCI_VECTOR_READER_0120;
    if(reader?.pageDocuments)return reader.pageDocuments();
    return [document];
  }

  function groupFromAncestors(el) {
    let cur=el;
    for(let depth=0;cur&&depth<10;depth++,cur=cur.parentElement){
      if(isOwnUi(cur))continue;
      const text=clean(cur.innerText||'');if(!text||text.length>7000)continue;
      const m=text.match(GROUP_RE);if(m)return clean(m[1]);
    }
    return null;
  }

  function groupFromPreceding(el) {
    const doc=el?.ownerDocument;if(!doc)return null;
    let all=[];try{all=[...doc.querySelectorAll('body *')];}catch(_){return null;}
    let idx=all.indexOf(el);if(idx<0)idx=all.findIndex(x=>x.contains?.(el));
    for(let i=idx-1,seen=0;i>=0&&seen<180;i--,seen++){
      const x=all[i];if(isOwnUi(x))continue;
      const t=clean(x.innerText||x.textContent||'');if(!t||t.length>120)continue;
      const m=t.match(GROUP_RE);if(m)return clean(m[1]);
    }
    return null;
  }

  function rowPattern(name) {
    return new RegExp(`${escRe(name)}\\s+(.{0,280}?)(\\d{1,2}:\\d{2})\\s*-\\s*(\\d{1,2}:\\d{2})\\s+(\\d+(?:\\.\\d+)?)\\s*hrs?(?:\\s+(\\d+)\\s*min)?\\b`, 'ig');
  }

  function detectCode(raw) {
    const Engine=window.VectorSchedulingEngine;
    if(Engine?.detectDutyCode)return Engine.detectDutyCode(raw);
    const t=clean(raw).toUpperCase();
    for(const [re,val] of [[/\bDE-A\b/,'DE-A'],[/\bFFB\b/,'FFB'],[/\bFFA\b/,'FFA'],[/\bFF\b/,'FF'],[/\bTM\b/,'TM'],[/\bTAC\b/,'TAC'],[/\bCAPT\b/,'Capt'],[/\bDE\b/,'DE']]) if(re.test(t))return val;
    return null;
  }

  function roleHint(s,p,group,dutyCode,raw) {
    const text=clean(raw).toUpperCase(), code=clean(dutyCode).toUpperCase();
    if(kind(s,p.id)==='firefighter'){
      if(group&&!/^TRUCK\s+504$/i.test(group)){
        if(/DEPLOYMENT/i.test(group))return'Deployment';
        if(/EMPLOYEES\s+OFF/i.test(group))return'Off';
        if(/TRAINING/i.test(group))return'Training';
        if(/^(TRUCK|ENGINE|MEDIC|QUINT)\s+\d+$/i.test(group))return'Swing';
      }
      if(/\bTADE\b/.test(text)||/^DE(?:-A)?$/.test(code)||/\bDE(?:-A)?\b/.test(text))return'TADE';
      if(code==='TM'||/\bTM\b/.test(text))return'Tiller';
      if(/^FF(?:A|B)?$/.test(code)||/\bFF(?:A|B)?\b/.test(text))return'Firefighter';
      return'Unknown';
    }
    if(code==='TAC'||/\bTAC\b/.test(text))return'Temporary Captain';
    if(/\bCAPT\b/.test(text))return'Captain';
    if(/^DE(?:-A)?$/.test(code)||/\bDE(?:-A)?\b/.test(text))return'Engineer';
    return'Unknown';
  }

  function scanPerson(s,p,date,capturedAt) {
    const candidates=new Map();
    for(const doc of pageDocuments()){
      let nodes=[];try{nodes=[...doc.querySelectorAll('body *')];}catch(_){continue;}
      for(const el of nodes){
        if(isOwnUi(el))continue;
        const txt=clean(el.innerText||el.textContent||'');
        if(!txt||txt.length>1200||!txt.toLowerCase().includes(p.name.toLowerCase())||!timeRangeRe.test(txt))continue;
        const group=groupFromAncestors(el)||groupFromPreceding(el)||null;
        const re=rowPattern(p.name);let m;
        while((m=re.exec(txt))){
          const details=clean(m[1]);
          const startTime=m[2],endTime=m[3],durationHours=Number(m[4])+Number(m[5]||0)/60;
          const rawText=clean(`${p.name} ${details} ${startTime} - ${endTime} ${m[4]} hrs${m[5]?` ${m[5]} min`:''}`);
          const dedupe=uid(startTime,endTime,rawText);
          let score=0;if(group)score+=10;if(el.matches?.('tr,[role="row"],li,.row,.list-group-item'))score+=5;score-=txt.length/300;
          const prior=candidates.get(dedupe);
          if(!prior||score>prior.score)candidates.set(dedupe,{group,rawText,startTime,endTime,durationHours,score});
          if(re.lastIndex===m.index)re.lastIndex++;
        }
      }
    }
    const c=cShiftInfo(date);
    return [...candidates.values()].sort((a,b)=>a.startTime.localeCompare(b.startTime)||a.endTime.localeCompare(b.endTime)).map((x,index)=>{
      const dutyCode=detectCode(x.rawText),hint=roleHint(s,p,x.group,dutyCode,x.rawText);
      return {date,personId:p.id,personName:p.name,capturedAt,assignmentGroup:x.group,startTime:x.startTime,endTime:x.endTime,durationHours:x.durationHours,dutyCode,roleHint:hint,isCShift:c.isCShift,cShiftDay:c.day,rawText:x.rawText,source:'vector-multirow-v0160',verified:Boolean(x.group&&x.durationHours>0),sequenceIndex:index+1};
    });
  }

  function supplementSegments(s,date,capturedAt,rows) {
    s.segments=Array.isArray(s.segments)?s.segments:[];
    let added=0;
    for(const row of rows){
      const duplicate=s.segments.find(x=>x.date===row.date&&x.personId===row.personId&&x.startTime===row.startTime&&x.endTime===row.endTime&&clean(x.assignmentGroup)===clean(row.assignmentGroup)&&clean(x.rawText)===clean(row.rawText));
      if(duplicate){
        if(!duplicate.roleHint||duplicate.roleHint==='Unknown')duplicate.roleHint=row.roleHint;
        if(!duplicate.dutyCode)duplicate.dutyCode=row.dutyCode;
        duplicate.multirowConfirmed=true;
        continue;
      }
      const existingForPerson=s.segments.filter(x=>x.date===row.date&&x.personId===row.personId);
      const nextIndex=Math.max(0,...existingForPerson.map(x=>Number(x.sequenceIndex||0)))+1;
      row.sequenceIndex=nextIndex;
      row.segmentKey=uid(row.date,row.personId,row.assignmentGroup,row.startTime,row.endTime,row.dutyCode,row.roleHint,nextIndex);
      row.sourceObservationKey=uid(row.date,row.personId,capturedAt,'multirow');
      s.segments.push(row);added++;
    }
    return added;
  }

  function scanCurrent(out) {
    const s=loadState();if(!s||!out?.date)return{added:0,rows:[]};
    const capturedAt=out.capturedAt||new Date().toISOString();
    const rows=crew(s).flatMap(p=>scanPerson(s,p,out.date,capturedAt));
    const added=supplementSegments(s,out.date,capturedAt,rows);
    s.metadata=s.metadata||{};
    s.metadata.lastMultirowScanAt=new Date().toISOString();
    s.metadata.lastMultirowScanDate=out.date;
    s.metadata.lastMultirowOccurrences=rows.length;
    s.metadata.lastMultirowAddedSegments=added;
    saveState(s);
    return{added,rows};
  }

  function installWrapper(){
    const reader=window.MVCI_VECTOR_READER_0120;
    if(!reader||reader.__multirowWrapper0160)return false;
    const original=reader.captureNow.bind(reader);
    reader.__preMultirowCaptureNow=original;
    reader.captureNow=function(){
      const out=original();
      out.multirow=scanCurrent(out);
      return out;
    };
    reader.version=VERSION;reader.__multirowWrapper0160=true;
    window.MVCI_VECTOR_READER_0160=reader;
    return true;
  }

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function card(){
    const panel=document.getElementById('mvci-vs-panel');if(!panel)return;
    const s=loadState();if(!s)return;
    let el=panel.querySelector('#vs-multirow-v0160');
    if(!el){el=document.createElement('div');el.id='vs-multirow-v0160';el.className='vs-card';const precision=panel.querySelector('#vs-segment-diagnostics-v0150');if(precision)precision.insertAdjacentElement('afterend',el);else panel.appendChild(el);}
    const date=s.metadata?.lastMultirowScanDate,count=Number(s.metadata?.lastMultirowOccurrences||0),added=Number(s.metadata?.lastMultirowAddedSegments||0);
    const sig=`${date}|${count}|${added}`;if(el.dataset.sig===sig)return;el.dataset.sig=sig;
    el.innerHTML=`<h3>Multi-row duty scan <span class="vs-muted">${VERSION}</span></h3><div class="vs-muted">${esc(date||'No scan yet')} · ${count} operational row occurrence(s) found · ${added} additional cross-row segment(s) added.</div><div class="vs-muted" style="margin-top:5px">This supplements the primary row reader so partial days that move a person between apparatus/groups can be preserved.</div>`;
  }

  function tick(){installWrapper();card();}
  setInterval(tick,900);setTimeout(tick,350);
  window.MVCI_VECTOR_MULTIROW_0160={version:VERSION,scanCurrent};
})();
