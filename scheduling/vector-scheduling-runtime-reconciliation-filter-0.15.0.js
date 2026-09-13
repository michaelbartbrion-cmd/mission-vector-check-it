(function(){
'use strict';
const VERSION='0.15.0-dev';
const STATE_KEY='missionVectorScheduling_v3';
const ROTATION=new Set(['Firefighter','Swing','Tiller','TADE']);
if(window.top!==window.self||window.__mvciReconciliationFilter0150)return;
window.__mvciReconciliationFilter0150={version:VERSION,startedAt:Date.now()};
function load(){try{return JSON.parse(localStorage.getItem(STATE_KEY)||'null');}catch(_){return null;}}
function save(s){if(!s)return;s.metadata=s.metadata||{};s.metadata.updatedAt=new Date().toISOString();s.metadata.reconciliationFilterVersion=VERSION;localStorage.setItem(STATE_KEY,JSON.stringify(s));}
function apply(){
 const s=load();if(!s||!Array.isArray(s.reconciliationCases))return 0;
 let changed=0;
 for(const c of s.reconciliationCases){
   if(c?.issueType!=='partial_day'||!['open','reviewing'].includes(c?.status))continue;
   const evidence=c.evidence||{};
   const segments=Array.isArray(evidence.segments)?evidence.segments:[];
   const hasRotation=segments.some(seg=>ROTATION.has(String(seg?.roleHint||'')));
   const hasExpected=Boolean(evidence.legacy||evidence.plan);
   if(!hasRotation&&!hasExpected){
     c.status='ignored';
     c.resolutionNotes='Automatically suppressed from the scheduling Ready Room because the precision segments are non-riding activity only (for example leave/deployment/training) and there is no legacy or planned riding credit to reconcile.';
     c.resolvedAt=new Date().toISOString();
     changed++;
   }
 }
 if(changed){
   s.metadata.openReconciliationCases=s.reconciliationCases.filter(c=>['open','reviewing'].includes(c.status)).length;
   save(s);
 }
 return changed;
}
setInterval(apply,2500);setTimeout(apply,6500);
window.MVCI_RECONCILIATION_FILTER_0150={version:VERSION,apply};
})();
