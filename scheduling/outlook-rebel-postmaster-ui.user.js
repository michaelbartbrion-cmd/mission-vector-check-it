// ==UserScript==
// @name         Mission Vector - Rebel Postmaster UI
// @namespace    mission-vector-check-it
// @version      0.2.0
// @description  Compact read-only Outlook panel styling; no mailbox scraping, observers, or uploads.
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/outlook-rebel-postmaster-ui.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/outlook-rebel-postmaster-ui.user.js
// @match        https://outlook.cloud.microsoft/*
// @match        https://outlook.office.com/*
// @match        https://outlook.office365.com/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==
(function () {
  'use strict';
  if (window.top !== window.self || window.MVCI_POSTMASTER_BROWSER_020) return;
  window.MVCI_POSTMASTER_BROWSER_020 = { version:'0.2.0', attached:false, readOnly:true };
  const clean = v => String(v || '').replace(/\s+/g,' ').trim();
  const isButton = (el, text) => el.tagName === 'BUTTON' && text.test(clean(el.textContent));
  function locate() {
    const capture = [...document.querySelectorAll('button')].find(el => isButton(el,/^CAPTURE VISIBLE LIST$/i));
    if (!capture) return null;
    for (let el=capture.parentElement, steps=0; el && steps<9; el=el.parentElement,steps++) {
      const text=clean(el.textContent);
      if(text.length>3500) return null;
      if(/WORK EMAIL READER/i.test(text) && /SCAN VISIBLE LIST/i.test(text)) return el;
    }
    return null;
  }
  function attach() {
    if(window.MVCI_POSTMASTER_BROWSER_020.attached) return;
    const root=locate(); if(!root) return;
    root.setAttribute('data-mvci-postmaster-root','');
    const leaf=[...root.querySelectorAll('*')].find(el => el.children.length===0 && /^WORK EMAIL READER$/i.test(clean(el.textContent)));
    if(!leaf) return;
    const header=leaf.parentElement;
    leaf.textContent='REBEL POSTMASTER';
    leaf.setAttribute('data-pm-title','');
    if(header) {
      header.setAttribute('data-pm-header','');
      const subtitle=[...header.children].find(el => el!==leaf && /work-email-reader|read-only discovery/i.test(clean(el.textContent)));
      if(subtitle) {subtitle.textContent='OUTLOOK - VISIBLE MAIL ONLY';subtitle.setAttribute('data-pm-subtitle','');}
    }
    const buttons=[...root.querySelectorAll('button')];
    const scan=buttons.find(el => /SCAN VISIBLE LIST/i.test(clean(el.textContent)));
    if(scan) {scan.textContent='PREVIEW VISIBLE MAIL';scan.setAttribute('data-pm-preview','');}
    const capture=buttons.find(el => /CAPTURE VISIBLE LIST/i.test(clean(el.textContent)));
    if(capture) {capture.setAttribute('data-pm-capture','');capture.title='Hidden while organizational mailbox access is unavailable';}
    const config=buttons.find(el => /Configure pairing/i.test(clean(el.textContent)));
    if(config) config.setAttribute('data-pm-config','');
    const leaves=[...root.querySelectorAll('*')].filter(el=>el.children.length===0);
    for(const el of leaves) {
      const txt=clean(el.textContent);
      if(/^Safety:|^Discovery mode:/i.test(txt)) el.setAttribute('data-pm-verbose','');
      if(/^Pairing:/.test(txt) && /Visible candidates:/.test(txt)) el.setAttribute('data-pm-status','');
    }
    const note=document.createElement('p');note.id='mvci-postmaster-short-note';note.textContent='Read-only preview. No full-mailbox access or uploads.';
    (scan?.parentElement || root).appendChild(note);
    const style=document.createElement('style');style.id='mvci-postmaster-style';
    style.textContent=`
[data-mvci-postmaster-root]{width:320px!important;max-width:calc(100vw - 20px)!important;border:1px solid #47624b!important;border-radius:14px!important;background:#111d17!important;color:#e9f3ea!important;box-shadow:0 15px 50px #0006!important;overflow:hidden!important;font:12px/1.45 system-ui,sans-serif!important}
[data-mvci-postmaster-root] *{box-sizing:border-box!important}
[data-mvci-postmaster-root]>div:not([data-pm-header]),[data-mvci-postmaster-root]>section{background:#14231b!important;color:#e3ede5!important}
[data-mvci-postmaster-root] [data-pm-header]{position:relative!important;padding:14px 12px 13px 55px!important;min-height:59px!important;background:linear-gradient(125deg,#1a3426,#142a32)!important;color:#f4f6ef!important}
[data-mvci-postmaster-root] [data-pm-header]:before{content:'';position:absolute;left:13px;top:12px;width:31px;height:31px;display:block;border:1px solid #8caa7d;border-radius:8px;background:#263f31 url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAABZElEQVR42u2aMQ7CMAxFs3KATky9CDviCvQajCxcgRN0ZmfuFbJ2YWJh6MZqhFQkhJLUTu0kRh08VIrj/6iTOjGm2uyNZpMOAKOpBIAfUwXQOwBAC8DDI14EgurQRaRODMCFG+BGCL4LiLfIOQZsPKmdhCN9UD7YSY7IcY/x2QYAtgSgyXEh5zMykC9NXOJr4luZHIdxbiNSxSc0JrWC46LJiTvPnDVBBohdeBLi33YP+XGXANziXfM2IQCOr+aU+IazrsoBYKQAWkUA4ALgLLx84jvtACY1wLpgAPsNkCJnJdbUAqACABiDHri3ZEoJkPo7ANwAkBBgkAKABMUcSQtnKZxljo/jasahJKcZjlNVLqu1A5i/A9AEcdUOQDrULwBS4rEXWwuAlHjs3WgpdppzvV7kr09tcBQnntJiKlI8tclXnPiYLmWfstKU7BNLCX+mbnRzCbdVAZ16qRZT1n+riNsL8DKPqVHo2CcAAAAASUVORK5CYII=) center/contain no-repeat;box-shadow:inset 0 1px #ffffff21}
[data-mvci-postmaster-root] [data-pm-title]{font-size:16px!important;line-height:1.2!important;font-weight:900!important;letter-spacing:.02em!important;color:#f2f6ed!important}
[data-mvci-postmaster-root] [data-pm-subtitle]{margin-top:4px!important;color:#9fbca7!important;font:700 9px/1.3 system-ui,sans-serif!important;letter-spacing:.08em!important}
[data-mvci-postmaster-root] [data-pm-status]{margin:10px 10px 6px!important;padding:7px 9px!important;border:1px solid #49604f!important;border-radius:8px!important;background:#203126!important;color:#dae9dc!important;font:11px/1.4 system-ui,sans-serif!important}
[data-mvci-postmaster-root] button{border-radius:8px!important;min-height:32px!important;font-size:11px!important;font-weight:750!important;letter-spacing:0!important}
[data-mvci-postmaster-root] [data-pm-preview]{display:block!important;margin:7px 10px!important;width:calc(100% - 20px)!important;border:1px solid #547a5e!important;background:#294c36!important;color:#f0fff2!important}
[data-mvci-postmaster-root] [data-pm-capture],[data-mvci-postmaster-root] [data-pm-config],[data-mvci-postmaster-root] [data-pm-verbose]{display:none!important}
[data-mvci-postmaster-root] #mvci-postmaster-short-note{margin:4px 10px 10px!important;padding:7px 8px!important;border:1px solid #385441!important;border-radius:7px!important;background:#182b20!important;color:#b8d4bc!important;font:10px/1.4 system-ui,sans-serif!important}
[data-mvci-postmaster-root] details{margin:5px 10px 10px!important;border:1px solid #364b3e!important;border-radius:7px!important;overflow:hidden!important;background:#18251d!important;color:#b1c8b5!important}
[data-mvci-postmaster-root] details>summary{padding:8px!important;cursor:pointer!important;font:700 10px system-ui,sans-serif!important}
[data-mvci-postmaster-root] details:not([open]){max-height:33px!important;overflow:hidden!important}
`;
    document.documentElement.appendChild(style);
    window.MVCI_POSTMASTER_BROWSER_020.attached=true;
  }
  // Five bounded discovery attempts. No document-wide MutationObserver or interval.
  [0,800,2400,5000,9000].forEach(ms=>setTimeout(attach,ms));
})();
