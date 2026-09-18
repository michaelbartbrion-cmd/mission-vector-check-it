// ==UserScript==
// @name         Mission Vector - Rebel Postmaster UI
// @namespace    mission-vector-check-it
// @version      0.3.0
// @description  Persistent presentation-only styling of existing Outlook reader versions; does not read or upload mail.
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
  if(window.top!==window.self || window.MVCI_POSTMASTER_BROWSER_030)return;
  // Only a stylesheet is installed. It targets the original reader's stable root IDs,
  // so the styles survive the reader rebuilding its panel without an observer or timer.
  // The reader's own capture API is NOT disabled: do not install or enable that reader
  // while organizational mailbox collection permission is unavailable.
  const STYLE_ID='mvci-postmaster-presentation-030';
  const root=()=> '#mvci-work-email-reader-v014,#mvci-work-email-reader-v015,#mvci-work-email-reader-v016';
  const style=document.createElement('style');style.id=STYLE_ID;
  style.textContent=`
:is(${root()}){--pm-dark:#132920;--pm-edge:#44644c;font:12px/1.4 system-ui,sans-serif!important}
:is(${root()}) .p{width:328px!important;max-width:calc(100vw - 24px)!important;margin-bottom:8px!important;border-radius:14px!important;border:1px solid var(--pm-edge)!important;background:#f0f4ef!important;color:#22382b!important;box-shadow:0 16px 40px #0006!important;overflow:hidden!important}
:is(${root()}) .h{position:relative!important;align-items:center!important;background:linear-gradient(125deg,#173e30,#153342)!important;color:#f6faf5!important;padding:12px!important;min-height:62px!important}
:is(${root()}) .h>div:first-child{position:relative!important;padding-left:48px!important;min-height:36px!important;display:flex!important;flex-direction:column!important;justify-content:center!important}
:is(${root()}) .h>div:first-child:before{content:'';position:absolute;left:0;top:1px;width:34px;height:34px;border-radius:8px;background:#254c38 url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAABZElEQVR42u2aMQ7CMAxFs3KATky9CDviCvQajCxcgRN0ZmfuFbJ2YWJh6MZqhFQkhJLUTu0kRh08VIrj/6iTOjGm2uyNZpMOAKOpBIAfUwXQOwBAC8DDI14EgurQRaRODMCFG+BGCL4LiLfIOQZsPKmdhCN9UD7YSY7IcY/x2QYAtgSgyXEh5zMykC9NXOJr4luZHIdxbiNSxSc0JrWC46LJiTvPnDVBBohdeBLi33YP+XGXANziXfM2IQCOr+aU+IazrsoBYKQAWkUA4ALgLLx84jvtACY1wLpgAPsNkCJnJdbUAqACABiDHri3ZEoJkPo7ANwAkBBgkAKABMUcSQtnKZxljo/jasahJKcZjlNVLqu1A5i/A9AEcdUOQDrULwBS4rEXWwuAlHjs3WgpdppzvV7kr09tcBQnntJiKlI8tclXnPiYLmWfstKU7BNLCX+mbnRzCbdVAZ16qRZT1n+riNsL8DKPqVHo2CcAAAAASUVORK5CYII=) center/30px no-repeat;border:1px solid #82a180}
:is(${root()}) .h>div:first-child>b{font-size:0!important;line-height:1!important}
:is(${root()}) .h>div:first-child>b:after{content:'REBEL POSTMASTER';font:850 15px/1.2 system-ui,sans-serif!important;letter-spacing:.025em}
:is(${root()}) .h>div:first-child>div{display:none!important}
:is(${root()}) .h>button.s{background:#214537!important;color:#e1f0e5!important;border:1px solid #5b7a64!important;min-width:32px!important}
:is(${root()}) .b{padding:8px 10px 9px!important}
:is(${root()}) .b>div:first-child{font:650 10px/1.4 system-ui,sans-serif!important;color:#3f5a48!important;padding:3px 0 5px!important}
:is(${root()}) .b>button.a:first-of-type{width:100%!important;margin:3px 0!important;padding:10px!important;background:#24563d!important;color:#fff!important;border:1px solid #24563d!important;border-radius:8px!important;font-size:0!important}
:is(${root()}) .b>button.a:first-of-type:after{content:'PREVIEW VISIBLE MAIL';font:750 11px/1.4 system-ui,sans-serif!important}
:is(${root()}) .b>button.a:nth-of-type(2),:is(${root()}) .b>button.s,:is(${root()}) .warn{display:none!important}
:is(${root()}) .m{padding:6px 8px!important;margin:6px 0!important;font:10px/1.4 system-ui,sans-serif!important;background:#e7efe8!important;color:#47604c!important;border:1px solid #cbd9cd!important}
:is(${root()}) .b:after{content:'Read-only preview â€¢ full-mailbox access and uploads unavailable';display:block;margin-top:6px;color:#65766b;font:10px/1.4 system-ui,sans-serif}
:is(${root()}) .orb{background:#193e30 url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAABZElEQVR42u2aMQ7CMAxFs3KATky9CDviCvQajCxcgRN0ZmfuFbJ2YWJh6MZqhFQkhJLUTu0kRh08VIrj/6iTOjGm2uyNZpMOAKOpBIAfUwXQOwBAC8DDI14EgurQRaRODMCFG+BGCL4LiLfIOQZsPKmdhCN9UD7YSY7IcY/x2QYAtgSgyXEh5zMykC9NXOJr4luZHIdxbiNSxSc0JrWC46LJiTvPnDVBBohdeBLi33YP+XGXANziXfM2IQCOr+aU+IazrsoBYKQAWkUA4ALgLLx84jvtACY1wLpgAPsNkCJnJdbUAqACABiDHri3ZEoJkPo7ANwAkBBgkAKABMUcSQtnKZxljo/jasahJKcZjlNVLqu1A5i/A9AEcdUOQDrULwBS4rEXWwuAlHjs3WgpdppzvV7kr09tcBQnntJiKlI8tclXnPiYLmWfstKU7BNLCX+mbnRzCbdVAZ16qRZT1n+riNsL8DKPqVHo2CcAAAAASUVORK5CYII=) center/40px no-repeat!important;border:2px solid #699271!important;font-size:0!important}
:is(${root()}) .orb img{max-width:40px!important;max-height:40px!important}
:is(${root()}) details{margin:6px 0!important;font-size:10px!important}
`;
  // CSS applies to future reader redraws without inspecting Outlook's mailbox or DOM.
  document.documentElement.appendChild(style);
  window.MVCI_POSTMASTER_BROWSER_030={version:'0.3.0',presentationOnly:true,readerBehaviorUnchanged:true};
})();
