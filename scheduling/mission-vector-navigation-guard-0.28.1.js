(function(){
  'use strict';
  const VERSION='0.28.1-dev';
  const QUEUE_KEY='mvciServerDrivenSync_v0280';
  const NAV_KEY='mvciSyncNavigationGuard_v0281';
  const RANKING_PATH_KEY='mvciLastRankingPath_v1';
  const DEFAULT_RANKING_PATH='/Application/ControlPanel/CallbackModule/Rankings/63542/95668';
  if(window.top!==window.self||window.MVCI_NAV_GUARD_0281)return;

  const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
  function loadJson(k,f={}){try{const raw=localStorage.getItem(k);return raw?JSON.parse(raw):f}catch(_){return f}}
  function saveJson(k,v){try{sessionStorage.setItem(k,JSON.stringify(v))}catch(_){}}
  function loadSession(k,f={}){try{const raw=sessionStorage.getItem(k);return raw?JSON.parse(raw):f}catch(_){return f}}
  function parseDate(value){const t=decodeURIComponent(clean(value).replace(/^#/,''));let m=t.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);if(m)return`${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`;m=t.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);return m?`${m[3]}-${String(+m[1]).padStart(2,'0')}-${String(+m[2]).padStart(2,'0')}`:''}
  function actualDate(){const reader=window.MVCI_VECTOR_READER_0120;const d=clean(reader?.visibleDisplayedDate?.()||'');return /^\d{4}-\d{2}-\d{2}$/.test(d)?d:''}
  function requestedDate(){return parseDate(location.hash)||parseDate(location.search)||parseDate(location.pathname)}
  function isList(){return /\/Application\/ControlPanel\/ListView/i.test(location.pathname)}
  function isRank(){return /\/Application\/ControlPanel\/CallbackModule\/Rankings/i.test(location.pathname)}
  function listUrl(date){const[y,m,d]=date.split('-');return`${location.origin}/Application/ControlPanel/ListView/#${y}/${m}/${d}`}
  function rankUrl(date){const[y,m,d]=date.split('-'),saved=loadJson(RANKING_PATH_KEY,{}),path=/^\/Application\/ControlPanel\/CallbackModule\/Rankings\//i.test(clean(saved.path))?clean(saved.path):DEFAULT_RANKING_PATH;return`${location.origin}${path}?shift_date=${encodeURIComponent(`${m}/${d}/${y}`)}&select-date=`}

  function guard(){
    const q=loadJson(QUEUE_KEY,{});
    if(!q?.active||!Array.isArray(q.items)||Number(q.index)>=q.items.length)return;
    const item=q.items[Number(q.index)||0];
    if(!item?.workDate||!item?.type)return;
    const target=item.workDate;
    const pathOk=item.type==='staffing'?isList():isRank();
    const actual=actualDate();
    const requested=requestedDate();
    // If CrewSense is already rendering the requested target, leave the command center alone.
    if(pathOk&&(actual===target||requested===target))return;
    const last=loadSession(NAV_KEY,{});
    const key=`${item.type}:${target}`;
    if(last.key===key&&Date.now()-Number(last.at||0)<8000)return;
    saveJson(NAV_KEY,{key,at:Date.now(),fromActual:actual,fromRequested:requested});
    location.assign(item.type==='staffing'?listUrl(target):rankUrl(target));
  }

  setTimeout(guard,900);
  setInterval(guard,2000);
  window.addEventListener('hashchange',()=>setTimeout(guard,350));
  window.MVCI_NAV_GUARD_0281={version:VERSION,guard,status:()=>({actualDate:actualDate(),requestedDate:requestedDate(),queue:loadJson(QUEUE_KEY,{})})};
})();
