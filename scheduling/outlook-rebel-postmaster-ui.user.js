// ==UserScript==
// @name         Mission Vector - Rebel Postmaster UI
// @namespace    mission-vector-check-it
// @version      0.1.0
// @description  Presentation-only cleanup for the existing read-only Outlook work-email reader.
// @match        https://outlook.cloud.microsoft/*
// @match        https://outlook.office365.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function(){
'use strict';
const STYLE_ID='mvci-postmaster-browser-style';
if(window.top!==window.self||window.MVCI_REBEL_POSTMASTER_UI)return;
window.MVCI_REBEL_POSTMASTER_UI={version:'0.1.0'};
const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
function locate(){
  const nodes=[...document.querySelectorAll('div,section,aside')];
  const title=nodes.find(el=>/^WORK EMAIL READER$/i.test(clean(el.textContent)));
  if(!title)return null;
  let p=title;
  for(let i=0;i<7&&p;i++,p=p.parentElement){
    const text=clean(p.textContent),buttons=p.querySelectorAll('button').length;
    if(buttons>=2&&/CAPTURE VISIBLE LIST/i.test(text)&&/Pairing:/i.test(text))return p;
  }
  return null;
}
function addStyle(root){
  if(document.getElementById(STYLE_ID))return;
  const id=root.id||(root.id='mvci-postmaster-browser-panel');
  const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
#${id}{width:330px!important;max-width:calc(100vw - 24px)!important;border:1px solid #456552!important;border-radius:14px!important;background:#f2f5ef!important;color:#24342a!important;box-shadow:0 18px 48px rgba(0,0,0,.32)!important;overflow:hidden!important;font:12px/1.4 Arial,sans-serif!important}
#${id} *{box-sizing:border-box!important}
#${id} button{border-radius:7px!important;min-height:34px!important;font-size:10px!important;font-weight:800!important;letter-spacing:.025em!important}
#${id} input,#${id} select{min-height:32px!important;border-radius:7px!important;font-size:10px!important}
#${id} [data-mvci-postmaster-header]{padding:12px 13px!important;background:linear-gradient(135deg,#234d37,#173f46)!important;color:white!important}
#${id} [data-mvci-postmaster-title]{font-size:15px!important;font-weight:900!important;letter-spacing:.04em!important;text-transform:uppercase!important}
#${id} [data-mvci-postmaster-sub]{margin-top:2px!important;font:700 8px/1.3 ui-monospace,monospace!important;opacity:.75!important}
#${id} [data-mvci-postmaster-status]{margin:8px!important;padding:7px 9px!important;border:1px solid #c8d7cc!important;border-radius:8px!important;background:#e5eee8!important;color:#395646!important;font-size:9px!important}
#${id} [data-mvci-postmaster-primary]{margin:6px 8px!important;width:calc(100% - 16px)!important;background:#265f49!important;color:#fff!important;border:1px solid #214f3e!important}
#${id} [data-mvci-postmaster-secondary]{margin:0 8px 7px!important;width:calc(100% - 16px)!important;background:#dfe9e2!important;color:#294637!important;border:1px solid #aebfb3!important}
#${id} [data-mvci-postmaster-config]{margin:0 8px 7px!important;padding:6px 9px!important;min-height:30px!important;background:#f9faf7!important;color:#486052!important;border:1px solid #bec9c0!important}
#${id} [data-mvci-postmaster-note]{margin:7px 8px!important;padding:7px 8px!important;border:1px solid #d7ddd8!important;border-radius:7px!important;background:#fafbf8!important;color:#66746a!important;font-size:8px!important;line-height:1.45!important}
#${id} [data-mvci-postmaster-safety]{display:none!important}
#${id} [data-mvci-postmaster-details]{margin:7px 8px 9px!important;border:1px solid #cbd5cd!important;border-radius:7px!important;background:#fafbf8!important;overflow:hidden!important}
#${id} [data-mvci-postmaster-details]>summary{list-style:none;padding:7px 8px!important;cursor:pointer;color:#53675a!important;font-size:9px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.04em!important}
#${id} [data-mvci-postmaster-details]>summary::-webkit-details-marker{display:none}
#${id} [data-mvci-postmaster-details]>div{padding:0 8px 8px!important;color:#65756a!important;font-size:8px!important;line-height:1.45!important}
`;
  document.documentElement.appendChild(s);
}
function polish(){
  const root=locate();if(!root)return;
  addStyle(root);
  const all=[...root.querySelectorAll('*')];
  const title=all.find(el=>/^WORK EMAIL READER$/i.test(clean(el.textContent))&&el.children.length===0);
  if(title){title.textContent='REBEL POSTMASTER';title.dataset.mvciPostmasterTitle='1';const h=title.parentElement;if(h){h.dataset.mvciPostmasterHeader='1';const siblings=[...h.children].filter(x=>x!==title);const sub=siblings.find(x=>/work-email-reader|read-only discovery/i.test(clean(x.textContent)));if(sub){sub.textContent='Outlook bridge · read-only';sub.dataset.mvciPostmasterSub='1';}}}
  const status=all.find(el=>/Pairing:/.test(clean(el.textContent))&&/Visible candidates:/.test(clean(el.textContent))&&el.children.length===0);if(status)status.dataset.mvciPostmasterStatus='1';
  const buttons=[...root.querySelectorAll('button')];
  const scan=buttons.find(b=>/SCAN VISIBLE LIST/i.test(clean(b.textContent)));if(scan){scan.textContent='CHECK VISIBLE MAIL';scan.dataset.mvciPostmasterSecondary='1';}
  const capture=buttons.find(b=>/CAPTURE VISIBLE LIST/i.test(clean(b.textContent)));if(capture){capture.textContent='CAPTURE VISIBLE MAIL';capture.dataset.mvciPostmasterPrimary='1';}
  const config=buttons.find(b=>/Configure pairing/i.test(clean(b.textContent)));if(config){config.textContent='Connection';config.dataset.mvciPostmasterConfig='1';}
  const notes=all.filter(el=>el.children.length===0&&/Discovery mode:|nothing is uploaded until/i.test(clean(el.textContent)));notes.forEach(el=>{el.textContent='Preview locally first. Nothing uploads until you choose Capture.';el.dataset.mvciPostmasterNote='1';});
  const safety=all.find(el=>el.children.length===0&&/^Safety:/i.test(clean(el.textContent)));
  if(safety&&!root.querySelector('[data-mvci-postmaster-details]')){
    safety.dataset.mvciPostmasterSafety='1';
    const d=document.createElement('details');d.dataset.mvciPostmasterDetails='1';
    const s=document.createElement('summary');s.textContent='Read-only safety';
    const body=document.createElement('div');body.textContent='The reader does not send, reply, delete, archive, move, or change read/flag state. Full message-body collection remains separately controlled.';
    d.append(s,body);safety.parentElement?.insertBefore(d,safety.nextSibling);
  }
  const detail=all.find(el=>el.tagName==='SUMMARY'&&/Discover details/i.test(clean(el.textContent)));if(detail)detail.textContent='Technical details';
}
new MutationObserver(polish).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(polish,300);setTimeout(polish,1200);setInterval(polish,3000);
})();