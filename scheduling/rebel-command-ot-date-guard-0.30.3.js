(function(){
'use strict';
const VERSION='0.30.3-dev';
if(window.top!==window.self||window.MVCI_OT_DATE_GUARD_0303)return;
const isRanking=()=>/\/Application\/ControlPanel\/CallbackModule\/Rankings/i.test(location.pathname);
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
function parseDate(raw){
  const s=clean(raw);let m=s.match(/^((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})$/);
  if(!m){m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-]((?:19|20)\d{2})$/);if(!m)return'';m=[m[0],m[3],m[1],m[2]];}
  const y=Number(m[1]),mo=Number(m[2]),day=Number(m[3]);
  const dt=new Date(Date.UTC(y,mo-1,day));
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===day?`${y}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`:'';
}
function visible(el){if(!el||!(el instanceof Element))return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;}
function renderedForecastDate(){
  if(!isRanking())return'';
  // An input near the ranking forecast selector is DOM evidence. A URL is not.
  const labels=[...document.querySelectorAll('label,div,span,p')].filter(el=>visible(el)&&/select date to forecast rankings/i.test(clean(el.textContent))).sort((a,b)=>clean(a.textContent).length-clean(b.textContent).length);
  let dates=[];
  for(const label of labels){
    for(let scope=label.parentElement,depth=0;scope&&depth<8;scope=scope.parentElement,depth++){
      const found=[...scope.querySelectorAll('input')].filter(visible).map(el=>parseDate(el.value)).filter(Boolean);
      if(found.length===1){dates=found;break;}
      if(found.length>1)return'';
    }
    if(dates.length)break;
  }
  if(!dates.length){const found=[...document.querySelectorAll('input')].filter(visible).map(el=>parseDate(el.value)).filter(Boolean);if(new Set(found).size===1)dates=[found[0]];}
  const domDate=dates[0]||'',requested=parseDate(new URLSearchParams(location.search).get('shift_date'));
  // Request and rendered selector MUST independently agree; never use URL alone.
  return domDate&&requested&&domDate===requested?domDate:'';
}
const bridge=window.MVCI_VECTOR_BRIDGE_0290,reader=window.MVCI_VECTOR_READER_0120;
if(!bridge||typeof bridge.status!=='function'||!reader||typeof reader.visibleDisplayedDate!=='function'){
  window.MVCI_OT_DATE_GUARD_0303={version:VERSION,status:'unavailable',renderedForecastDate};return;
}
const originalStatus=bridge.status.bind(bridge),originalVisible=reader.visibleDisplayedDate.bind(reader);
bridge.status=function(...args){const result=originalStatus(...args);return isRanking()?{...result,renderedDate:renderedForecastDate()}:result;};
reader.visibleDisplayedDate=function(...args){return isRanking()?renderedForecastDate():originalVisible(...args);};
window.MVCI_OT_DATE_GUARD_0303={version:VERSION,status:'installed',renderedForecastDate};
})();
