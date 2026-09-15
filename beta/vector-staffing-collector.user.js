// ==UserScript==
// @name         Mission Vector Check It - Staffing Collector (Retired)
// @namespace    mission-vector-check-it
// @version      0.1.1
// @description  Retired legacy Check It staffing collector. Rebel Scout on CrewSense now owns Scheduling/OT collection.
// @match        https://checkitapp.targetsolutions.com/*
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-staffing-collector.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-staffing-collector.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  // This legacy Check It-side collector is intentionally retired. Rebel Scout now collects
  // Scheduling/OT data from CrewSense using the shared bridge. Keep this userscript as a
  // self-cleaning no-op so existing Tampermonkey installs update cleanly without leaving UI behind.
  try {
    document.getElementById('vector-staffing-collector-status')?.remove();
    for (const el of [...document.querySelectorAll('button,div,span')]) {
      const t = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^OT collector:\s*(?:pair|reading|sent|verify|error)/i.test(t)) el.remove();
    }
  } catch (_) {}
  window.__vectorStaffingCollector = { retired: true, version: '0.1.1' };
})();
