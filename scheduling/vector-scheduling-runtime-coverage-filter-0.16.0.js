(function(){
'use strict';
const VERSION='0.16.0-dev';
const STATE_KEY='missionVectorScheduling_v3';
if(window.top!==window.self||window.__mvciCoverageFilter0160)return;
window.__mvciCoverageFilter0160={version:VERSION,startedAt:Date.now()};
function load(){try{return JSON.parse(localStorage.getItem(STATE_KEY)||'null');}catch(_){return null;}}
function save(s){if(!s)return;s.metadata=s.metadata||{};s.metadata.updatedAt=new Date().toISOString();s.metadata.coverageFilterVersion=VERSION;localStorage.setItem(STATE_KEY,JSON.stringify(s));}
function apply(){
 const s=load();if(!s||!Array.isArray(s.reconciliationCases))return 0;
 const floor=String(s.metadata?.lastBackfillDate||'');
 if(!floor)return 0;
 const observationKeys=new Set((s.observations||[]).filter(o=>o?.date&&o?.personId).map(o=>`${o.date}|${o.personId}`));
 const before=s.reconciliationCases.length;
 s.reconciliationCases=s.reconciliationCases.filter(c=>{
   if(c?.issueType!=='missing')return true;
   const hasPlan=Boolean(c?.evidence?.plan);
   const hasObservation=observationKeys.has(`${c.date}|${c.personId}`);
   // A legacy date earlier than the current backfill coverage floor is work the
   // scanner still owes us, not a human exception. Remove it so reconciliation
   // can recreate it later if the date is actually scanned and remains missing.
   if(!hasPlan&&!hasObservation&&String(c.date||'')<floor)return false;
   return true;
 });
 const removed=before-s.reconciliationCases.length;
 if(removed){
   s.metadata.openReconciliationCases=s.reconciliationCases.filter(c=>['open','reviewing'].includes(c.status)).length;
   s.metadata.coverageSuppressedCases=Number(s.metadata.coverageSuppressedCases||0)+removed;
   save(s);
 }
 return removed;
}
setInterval(apply,2200);setTimeout(apply,7000);
window.MVCI_VECTOR_COVERAGE_FILTER_0160={version:VERSION,apply};
})();
