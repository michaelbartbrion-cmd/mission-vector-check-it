(function(){
'use strict';
const VERSION='0.30.3-ui2';
const ROOT='mvci-command-center-v0290';
const STYLE='mvci-rebel-browser-polish-0303';
const TOOLS='mvci-scout-readonly-tools';
if(window.top!==window.self||window.MVCI_REBEL_BROWSER_POLISH_0303)return;
window.MVCI_REBEL_BROWSER_POLISH_0303={version:VERSION};
function css(){
  if(document.getElementById(STYLE))return;
  const s=document.createElement('style');s.id=STYLE;s.textContent=`
#${ROOT}{right:14px!important;bottom:14px!important;color:#24313a!important}
#${ROOT} .panel{width:360px!important;border:1px solid #334957!important;border-radius:14px!important;background:#f3f1ea!important;box-shadow:0 18px 46px rgba(8,22,30,.34)!important}
#${ROOT} .head{padding:12px 13px!important;background:linear-gradient(135deg,#173e63,#102d45)!important;align-items:center!important}
#${ROOT} .title{font-size:15px!important;letter-spacing:.02em!important;text-transform:uppercase!important}
#${ROOT} .title span{display:inline-flex!important;margin-left:5px!important;padding:2px 5px!important;border-radius:999px!important;background:#ffffff18!important;font:700 8px/1.2 ui-monospace,monospace!important;vertical-align:2px!important}
#${ROOT} .sub{font-size:9px!important;letter-spacing:.04em!important;opacity:.72!important}
#${ROOT} .body{padding:10px!important}
#${ROOT} .user{margin-bottom:8px!important;padding:7px 9px!important;border-color:#d4d8d4!important;background:#e9ebe6!important}
#${ROOT} .user strong{font-size:10px!important}#${ROOT} .user span{font-size:9px!important}
#${ROOT} .sync{min-height:41px!important;border-radius:7px!important;background:#183f63!important;font-size:11px!important;letter-spacing:.04em!important;text-transform:uppercase!important}
#${ROOT} .grid{gap:6px!important;margin-top:7px!important}#${ROOT} .btn{min-height:38px!important;padding:7px!important;border-radius:7px!important;background:#176f87!important;font-size:10px!important;text-transform:uppercase!important;letter-spacing:.035em!important}
#${ROOT} .status{margin-top:7px!important;padding:7px 8px!important;max-height:62px!important;font-size:9px!important;line-height:1.35!important}
#${ROOT} .foot{gap:5px!important;margin-top:6px!important}#${ROOT} .secondary{min-height:31px!important;border-radius:6px!important;font-size:9px!important;background:#faf9f6!important}
#${ROOT} .settings{margin-top:6px!important;padding:7px!important;border:1px solid #d7dbd6!important;border-radius:7px!important;background:#faf9f6!important;font-size:9px!important}
#${ROOT} .orb{width:48px!important;height:48px!important;border-color:#224d69!important;background:#f7f4ed!important}#${ROOT} .orb img{width:34px!important;height:34px!important}
#${TOOLS}{margin-top:8px;border:1px solid #c8b78d;border-radius:8px;background:#f5efe2;overflow:hidden}
#${TOOLS}>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 9px;cursor:pointer;color:#5b4a2d;font:800 9px/1.2 Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase}
#${TOOLS}>summary::-webkit-details-marker{display:none}#${TOOLS}>summary:after{content:'TEST';padding:2px 5px;border:1px solid #bba875;border-radius:999px;font-size:7px;color:#7b673e}
#${TOOLS}[open]>summary{border-bottom:1px solid #d7c8a4;background:#ece1c8}
#${TOOLS} #rebel-scout-assisted-v0300{margin:8px!important;box-shadow:none!important}
@media(max-width:520px){#${ROOT}{right:8px!important;bottom:8px!important}#${ROOT} .panel{width:calc(100vw - 16px)!important}}
`;
  document.documentElement.appendChild(s);
}
function wrapTools(){
  const p=document.getElementById('rebel-scout-assisted-v0300');
  if(!p||p.closest('#'+TOOLS))return;
  const d=document.createElement('details');d.id=TOOLS;
  const summary=document.createElement('summary');summary.textContent='Read-only verification tools';
  d.appendChild(summary);p.parentNode?.insertBefore(d,p);d.appendChild(p);
}
function polish(){
  css();
  const root=document.getElementById(ROOT);if(!root)return;
  const title=root.querySelector('.title');if(title&&/Mission Vector|Rebel Scout/i.test(title.textContent||'')){
    const runtime=(document.documentElement.dataset.mvciRuntimeVersion||'0.30.3').replace('-dev','');
    title.innerHTML=`REBEL SCOUT <span>${runtime}</span>`;
  }
  const sub=root.querySelector('.sub');if(sub)sub.textContent='CrewSense bridge · Rebel Command';
  const sync=root.querySelector('#mvci29-sync');if(sync&&!/Syncing/i.test(sync.textContent||''))sync.textContent='Sync Rebel Command';
  const ride=root.querySelector('#mvci29-ride');if(ride)ride.textContent='Riding Plan';
  const ot=root.querySelector('#mvci29-ot');if(ot)ot.textContent='OT Signup';
  const update=root.querySelector('#mvci29-update');if(update&&/Update Loader/i.test(update.textContent||''))update.textContent='Update';
  wrapTools();
}
new MutationObserver(polish).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(polish,250);setTimeout(polish,1200);setInterval(polish,3000);
window.MVCI_REBEL_BROWSER_POLISH_0303={version:VERSION,polish};
})();