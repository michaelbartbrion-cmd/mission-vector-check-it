(function(){
'use strict';
const VERSION='0.29.1-dev';
if(window.top!==window.self||window.REBEL_COMMAND_DST_UI_PATCH_0291)return;
window.REBEL_COMMAND_DST_UI_PATCH_0291={version:VERSION};

const excluded=/Sub\s*\[1010\]|Additional Time|Overtime|OT Sign|Force Hire|Backfill|Disaster Relief|Trade|Swap|Vacation|Sick|Leave|Time Off/i;
const isDutyDayHours=v=>[23,24,25].includes(Number(v));

function patchStaffingCapture(body){
  if(!body||typeof body!=='object'||!body.staffingCapture)return body;
  const cap=body.staffingCapture;
  if(!/^vector-bridge-0\.29\./i.test(String(cap.sourceVersion||'')))return body;
  const day=Array.isArray(cap.days)?cap.days[0]:null;
  const rows=Array.isArray(day?.rows)?day.rows:[];
  if(!rows.length)return body;
  const regular=rows.filter(r=>/Salary Step\s*\[1010\]/i.test(String(r?.scheduleType||r?.rawText||''))&&isDutyDayHours(r?.lengthHours)&&!excluded.test(String(r?.rawText||''))).length;
  const d=cap.diagnostics||{};
  const enoughRows=rows.length>=24;
  const enoughGroups=Number(d.groupCount||0)>=6;
  const stable=d.pageStable===true||d.pageStableBefore===true&&d.pageStableAfter===true;
  const structural=stable&&d.allVisibleGroupsScanned===true&&d.scrollSweepComplete===true&&d.noLoadingIndicator===true;
  if(structural&&enoughRows&&enoughGroups&&regular>=20){
    cap.captureComplete=true;
    cap.diagnostics={...d,candidateRegularRows:regular,dstDutyDayAdjusted:true,dutyDayClockHoursAllowed:[23,24,25]};
  }
  return body;
}

// Explicit capture normalization only: never override the host page fetch.
window.REBEL_COMMAND_DST_UI_PATCH_0291.patchStaffingCapture=patchStaffingCapture;

function cleanBrowserLabels(root=document){
  const hosts=[...root.querySelectorAll('[id^="mvci-"],#mvci-command-center-v0290')];
  for(const host of hosts){
    const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);
    let n;
    while((n=walker.nextNode())){
      if(/Mission Vector/i.test(n.nodeValue||''))n.nodeValue=(n.nodeValue||'').replace(/Mission Vector/gi,'Rebel Command');
      if(/0\.29\.0-dev/.test(n.nodeValue||''))n.nodeValue=(n.nodeValue||'').replace(/0\.29\.0-dev/g,VERSION);
    }
  }
}
// Cosmetic labels are best-effort and must never watch the live CrewSense DOM.
cleanBrowserLabels();
})();
