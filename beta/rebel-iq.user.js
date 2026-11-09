// ==UserScript==
// @name         Rebel IQ - T504
// @namespace    mission-vector-check-it-rebel-fleet
// @version      0.1.14
// @description  Prepare T504 daily, weekly, and Thursday rope drafts. Save In Process only; never submit.
// @match        https://fmfd.operativeiqfrontline.com/*
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/rebel-iq.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/rebel-iq.user.js
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      base44.app
// ==/UserScript==

(() => {
  'use strict';
  if (window.__rebelIqT504) return;
  window.__rebelIqT504 = { version: '0.1.14' };
  // Minimal RC diagnostics: only stage, redacted error, URL path, version.
  // Never transmit form answers, notes, asset readings, or login credentials.
  const IQ_VERSION = '0.1.14';
  const IQ_ENROLL_ENDPOINT = 'https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryEnroll';
  const IQ_REPORT_ENDPOINT = 'https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
  const IQ_DEVICE_KEY = 'rebelIqDeviceV1';
  const IQ_ERRORS_KEY = 'rebelIqErrorQueueV1';
  const randomToken = count => {
    let binary = '';
    for (const value of crypto.getRandomValues(new Uint8Array(count))) {
      binary += String.fromCharCode(value);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  };
  const scrubError = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\b\d{5,}\b/g, '[id]')
    .replace(/\b[A-Z]{3,}[-_]\d[\w.-]*/gi, '[asset]')
    .replace(/\s+/g, ' ').trim().slice(0, 260);
  const readIqErrors = () => {
    try {
      const rows = GM_getValue(IQ_ERRORS_KEY, []);
      return Array.isArray(rows) ? rows.filter(x => x && x.suggestionId).slice(-20) : [];
    } catch { return []; }
  };
  let rcStatusEl = null, reporting = false, rcStatus = 'Not verified';
  let lastReportSignature = '', lastReportAt = 0;
  const setRcStatus = message => {
    rcStatus = message;
    if (rcStatusEl) rcStatusEl.textContent = 'Rebel Command: ' + message;
  };
  function captureIqError(error, stage) {
    try {
      const detail = scrubError(error?.message || error || 'Unexpected error');
      const safeStage = scrubError(stage || 'unknown');
      const signature = safeStage + '|' + detail;
      const timestamp = Date.now();
      if (signature === lastReportSignature && timestamp - lastReportAt < 60000) return;
      lastReportSignature = signature;
      lastReportAt = timestamp;
      const rows = readIqErrors();
      rows.push({
        suggestionId: 'feedback:riq-error:' + timestamp + ':' + Math.random().toString(36).slice(2, 10),
        timestamp: new Date(timestamp).toISOString(),
        title: 'Rebel IQ automatic error',
        details: 'Rebel IQ v' + IQ_VERSION + ' | stage: ' + safeStage +
          ' | error: ' + detail + ' | route: ' + scrubError(location.pathname),
        category: 'feedback',
        priority: 'high',
        sourceContext: 'automatic_error',
        sourceVersion: IQ_VERSION
      });
      GM_setValue(IQ_ERRORS_KEY, rows.slice(-20));
      setRcStatus(readIqErrors().length + ' error(s) pending delivery');
      void flushIqErrors();
    } catch { /* A reporting failure must not touch an inspection. */ }
  }

  function getIqDevice() {
    let device = GM_getValue(IQ_DEVICE_KEY, null);
    if (device?.installationId && device?.deviceToken) return device;
    device = {
      installationId: 'riq-install-' + randomToken(16),
      deviceToken: randomToken(32),
      deviceId: ''
    };
    GM_setValue(IQ_DEVICE_KEY, device);
    return device;
  }
  async function enrollIqDevice() {
    const device = getIqDevice();
    if (device.deviceId) return device;
    const response = await fetch(IQ_ENROLL_ENDPOINT, {
      method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        program: 'Rebel IQ',
        installationId: device.installationId,
        deviceToken: device.deviceToken,
        profileName: 'Truck 504', version: IQ_VERSION
      })
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || json?.ok !== true || !json.deviceId) {
      throw Error('RC enrollment was not accepted (HTTP ' + response.status + ')');
    }
    const enrolled = { ...device, deviceId: String(json.deviceId) };
    GM_setValue(IQ_DEVICE_KEY, enrolled);
    return enrolled;
  }
  function submitIqReport(device, report) {
    return new Promise(resolve => {
      try {
        GM_xmlhttpRequest({
          method: 'POST', url: IQ_REPORT_ENDPOINT, timeout: 12000,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + device.deviceToken,
            'X-Rebel-Device-ID': device.deviceId
          },
          data: JSON.stringify({version: IQ_VERSION, suggestions: [report]}),
          onload: response => {
            let receipt = null;
            try { receipt = JSON.parse(response.responseText || 'null'); } catch {}
            resolve(response.status >= 200 && response.status < 300 &&
              receipt?.ok === true &&
              (Number(receipt.acceptedSuggestions) > 0 ||
               Number(receipt.duplicateSuggestions) > 0));
          },
          onerror: () => resolve(false),
          ontimeout: () => resolve(false)
        });
      } catch { resolve(false); }
    });
  }
  async function flushIqErrors() {
    if (reporting || !readIqErrors().length) return false;
    reporting = true;
    try {
      const device = await enrollIqDevice();
      for (const report of readIqErrors()) {
        if (!await submitIqReport(device, report)) {
          throw Error('RC did not acknowledge error receipt');
        }
        GM_setValue(IQ_ERRORS_KEY,
          readIqErrors().filter(row => row.suggestionId !== report.suggestionId));
      }
      setRcStatus('error reporting connected');
      return true;
    } catch {
      setRcStatus('offline or not confirmed, ' + readIqErrors().length + ' queued');
      return false;
    } finally { reporting = false; }
  }

  const KEY = 'rebelIqT504PendingV1';
  const RESULT = 'rebelIqT504ResultV1';
  const PANEL = 'rebel-iq-t504-panel';
  // Same user-supplied Starbird image used by Vector Rebel, Scout, and Postmaster.
  // The collapsed launcher is the 54 px Rebel circle, never an RIQ text badge.
  const rebelStarbirdIcon = `<img
                alt=""
                aria-hidden="true"
                draggable="false"
                width="39"
                height="39"
                style="display:block;width:39px;height:39px;object-fit:contain;pointer-events:none;user-select:none"
                src="data:image/png;base64,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">`;
  const TASKS = {
    daily: { name: '63000-13 Tour Check', count: 41 },
    weekly: { name: 'Weekly 63000-13 Check', count: 12 }
  };
  // Exact verified T504 Thursday questionnaire IDs and labels.
  // These are unverified draft defaults only; no rope inspection is submitted.
  const ROPE_UNIT_ID = '60421';
  const ROPE_KEY = 'rebelIqT504ThreeRopesV1';
  const ROPE_RESULT = 'rebelIqT504ThreeRopesResultV1';
  const ROPE_TASKS = [
    {
      id: '91548', name: 'Weekly Rope Rescue Equipment (Low Angle Kit 1)',
      type: 'radio', questions: [
        'Anchor Strap','Anchor Plate','MPD','Double Pulley w/ Swivel (x2)',
        'Single Pulley w/ Swivel (x2)','Locking Carabiner "G" (x6)',
        'Rescucender (x2)','Large Prusik (x2)','Small Prusik (x2)',
        "20' Webbing","12' Webbing"
      ]
    },
    {
      id: '91549', name: 'Weekly Rope Rescue Equipment (SAR 2)',
      type: 'radio', questions: [
        'Anchor Strap','Anchor Plate','MPD (x2)','Clutch (x2)','AZTEK (x3)',
        'Delta Quick Link (x2)','Kootenay Pulley','Double Pulley w/ Swivel (x2)',
        'Single Pulley w/ Swivel (x3)','Locking Carabiner "G" (x9)',
        'DNA Carabiner x2','Locking Carabiner "T" (x2)','Rescucender (x2)',
        'Rescue 8 (x4)','Small Prusik (x13)','Large Prusik (x7)',
        "40' Webbing","20' Webbing","12' Webbing",
        'Multi-Loop Straps (x4)','Bull Ring','Pick Off Strap',
        'Patient Seat Harness','Canvas Pad (x2)','Plastic Edge Protection',
        'CMC Squid x1','Texora TX/L Sling'
      ]
    },
    {
      id: '91550', name: 'Weekly Rope Gear',
      type: 'checkbox', questions: [
        {name:'Personal Kits (x4)',options:[
          'Helmet w/ Headlamp (x4)','Goggles (x4)','Gloves (x4)',
          'Harness (x4)','Locking Carabiner "T" (x4)','CMC Field Guide (x4)']},
        {name:'Sked',options:[
          'Rope','Yellow Straps (x2)','Black Strap w/ Clips',
          'Yellow Handles (x4)','Steel Carabiner']},
        {name:'Stokes Basket Kit',options:[
          'Litter Harness','Etrier','Pelvic Harness','Litter Straps (x4)']},
        {name:'Vortex',options:['Spare Pins','Spare Pully']}
      ]
    }
  ];

  const now = () => Date.now();
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const visible = node => !!node && !!(node.getClientRects().length);
  const t504Visible = () => /63000-13\s*\(\s*T504\s*\)/i.test(document.body.innerText || '');
  const inspectionId = () => location.pathname.match(/\/inspections\/(\d+)(?:\/|$)/)?.[1] || '';
  const formId = () => location.pathname.match(/\/questionaries\/(\d+)\/?$/)?.[1] || '';
  const isGroupPage = () => /\/questionaries\/group\/\d+\/?$/.test(location.pathname);
  const listUrl = id => '/inspections/' + id + '/questionaries/group/0';
  // Operative IQ separates questionnaire and asset verification. The daily
  // action opens the assigned asset list only AFTER a verified Tour draft save.
  const ASSET_FOLLOWUP_KEY = 'rebelIqT504DailyAssetFollowupV1';
  const ASSET_UNIT_ID = '60443';
  const assetUrl = id => '/inspections/' + id + '/assets/group/-1';
  const isAssetPage = () => /\/inspections\/\d+\/assets\/group\/-1\/?$/.test(location.pathname);
  const readAssetFollowup = () => {
    try {
      const run = JSON.parse(sessionStorage.getItem(ASSET_FOLLOWUP_KEY) || 'null');
      return run && run.unitId === ASSET_UNIT_ID &&
        ['await_daily_save','assets_opening'].includes(run.stage) &&
        Date.now() - run.startedAt < 5 * 60 * 1000 ? run : null;
    } catch { return null; }
  };
  const writeAssetFollowup = run => sessionStorage.setItem(ASSET_FOLLOWUP_KEY, JSON.stringify(run));
  const clearAssetFollowup = () => sessionStorage.removeItem(ASSET_FOLLOWUP_KEY);

  const readPending = () => {
    try {
      const data = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      return data && data.startedAt && now() - data.startedAt < 90000 && TASKS[data.kind] ? data : null;
    } catch { return null; }
  };
  const writePending = data => sessionStorage.setItem(KEY, JSON.stringify(data));
  const clearPending = () => sessionStorage.removeItem(KEY);
  const readRopes = () => {
    try {
      const run = JSON.parse(sessionStorage.getItem(ROPE_KEY) || 'null');
      if (run && run.unitId === ROPE_UNIT_ID &&
        Number.isInteger(run.index) && run.index >= 0 &&
        run.index < ROPE_TASKS.length &&
        Date.now() - run.startedAt < 5 * 60 * 1000) return run;
    } catch {}
    return null;
  };
  const writeRopes = run => sessionStorage.setItem(ROPE_KEY, JSON.stringify(run));
  const clearRopes = () => sessionStorage.removeItem(ROPE_KEY);
  let ropeBusy = false;
  let busy = false, lastRoute = location.pathname, attempts = 0, opened = false;
  let label, detail, menu, root;

  const notify = (message, error = false) => {
    if (!detail) return;
    detail.textContent = message;
    detail.style.color = error ? '#9f2828' : '#607483';
    detail.style.borderLeftColor = error ? '#c65050' : '#176b8e';
    detail.style.background = error ? '#fff6f5' : '#f7f9fa';
  };

  // Match Vector Rebel's navy header, white card, two-column action grid,
  // compact status footer and original Rebel Starbird launcher. One icon
  // moves into the header as the minimize button, not a second floating icon.
  function makeUi() {
    if (document.getElementById(PANEL)) return;
    root = document.createElement('div');
    root.id = PANEL;
    root.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:2147483646;' +
      'font-family:Arial,sans-serif;color:#18384f;';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.innerHTML = rebelStarbirdIcon;
    toggle.title = 'Rebel IQ - T504';
    toggle.setAttribute('aria-label', 'Open Rebel IQ');
    const floatingStyle =
      'display:flex;align-items:center;justify-content:center;' +
      'width:54px;height:54px;min-width:54px;flex:none;box-sizing:border-box;' +
      'border:2px solid #1b5a7a;border-radius:50%;background:#fff;' +
      'color:#153e5c;box-shadow:0 5px 18px rgba(13,50,72,.28);' +
      'padding:0;margin:0;cursor:pointer;overflow:hidden;';
    const headerStyle =
      'display:flex;align-items:center;justify-content:center;' +
      'width:43px;height:43px;min-width:43px;flex:none;box-sizing:border-box;' +
      'border:2px solid rgba(255,255,255,.72);border-radius:50%;' +
      'background:#fff;color:#153e5c;padding:0;margin:0;cursor:pointer;' +
      'overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.18);';
    toggle.style.cssText = floatingStyle;

    menu = document.createElement('div');
    menu.setAttribute('data-rebel-iq-panel', '1');
    menu.style.cssText =
      'display:none;width:430px;max-width:calc(100vw - 28px);' +
      'background:#fff;border:1px solid #cbd9e2;border-radius:12px;' +
      'padding:0;max-height:calc(100vh - 24px);overflow-y:auto;' +
      'box-shadow:0 10px 28px rgba(12,43,62,.22);';

    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;align-items:center;gap:10px;padding:13px 14px 11px;' +
      'background:#153e5c;color:#fff;';
    const titleWrap = document.createElement('div');
    titleWrap.style.cssText = 'flex:1;min-width:0;';
    label = document.createElement('div');
    label.textContent = 'Rebel IQ v' + IQ_VERSION;
    label.style.cssText = 'font-size:17px;font-weight:700;letter-spacing:.1px;';
    const subtitle = document.createElement('div');
    subtitle.textContent = 'T504  ·  This is the way.';
    subtitle.style.cssText = 'font-size:10px;opacity:.78;margin-top:2px;';
    titleWrap.append(label, subtitle);
    header.append(titleWrap);

    const body = document.createElement('div');
    body.style.cssText = 'padding:12px 13px 13px;background:#fff;';
    const actions = document.createElement('div');
    actions.setAttribute('data-rebel-iq-actions', '1');
    actions.style.cssText =
      'display:grid;grid-template-columns:1fr 1fr;gap:7px;';
    const button = (text, kind) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = text;
      el.style.cssText =
        'min-height:44px;padding:10px 9px;border:1px solid #176b8e;' +
        'border-radius:8px;background:#176b8e;color:#fff;cursor:pointer;' +
        'font:700 12px/1.2 Arial,sans-serif;text-align:center;' +
        'box-shadow:0 1px 2px rgba(15,43,62,.08);';
      el.onclick = () => kind === 'ropes' ? beginRopes() : kind === 'assets' ? beginAssets() : begin(kind);
      return el;
    };
    const update = document.createElement('a');
    update.href = 'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/rebel-iq.user.js';
    update.textContent = 'Check for Update';
    update.setAttribute('aria-label', 'Check for Rebel IQ update');
    update.target = '_blank';
    update.rel = 'noopener noreferrer';
    update.style.cssText =
      'display:flex;align-items:center;justify-content:center;' +
      'box-sizing:border-box;min-height:44px;padding:10px 9px;' +
      'border:1px solid #b8c8d6;border-radius:8px;' +
      'background:#fff;color:#153e5c;cursor:pointer;text-align:center;' +
      'font:700 12px/1.2 Arial,sans-serif;text-decoration:none;' +
      'box-shadow:0 1px 2px rgba(15,43,62,.08);';
    actions.append(
      button('Daily Tour + Assets', 'daily'),
      button('Weekly Check', 'weekly'),
      button('Asset Checks', 'assets'),
      button('Rope Checks ×3', 'ropes'),
      update
    );

    const statusWrap = document.createElement('div');
    statusWrap.style.cssText = 'margin-top:10px;';
    detail = document.createElement('div');
    detail.setAttribute('role', 'status');
    detail.style.cssText =
      'padding:8px 9px;background:#f7f9fa;border-left:3px solid #176b8e;' +
      'font-size:11px;line-height:1.4;color:#607483;border-radius:6px;' +
      'overflow-wrap:anywhere;';
    detail.textContent = t504Visible() ? 'Ready. Choose a check.' :
      'Open T504 Unit Inspection first.';
    rcStatusEl = document.createElement('div');
    rcStatusEl.style.cssText =
      'font-size:10px;line-height:1.4;color:#607483;' +
      'margin-top:7px;padding:0 1px;';
    setRcStatus(readIqErrors().length ?
      readIqErrors().length + ' error(s) pending delivery' : 'no errors queued');
    statusWrap.append(detail, rcStatusEl);
    // Asset review belongs inside the single expanded Rebel IQ menu.
    body.append(actions, makeAssetReviewSection(), statusWrap);
    menu.append(header, body);

    const setExpanded = (expanded) => {
      opened = expanded;
      menu.style.display = expanded ? 'block' : 'none';
      toggle.style.cssText = expanded ? headerStyle : floatingStyle;
      toggle.setAttribute('aria-label', expanded ? 'Minimize Rebel IQ' : 'Open Rebel IQ');
      toggle.title = expanded ? 'Minimize Rebel IQ' : 'Rebel IQ - T504';
      if (expanded) {
        header.append(toggle);
      } else {
        root.append(toggle);
      }
    };
    toggle.onclick = () => setExpanded(!opened);
    root.append(menu, toggle);
    document.body.appendChild(root);

    const runningRopes = readRopes();
    const ropeResult = sessionStorage.getItem(ROPE_RESULT);
    const prior = sessionStorage.getItem(RESULT);
    if (runningRopes) {
      setExpanded(true);
      notify('Preparing Thursday rope checks ' +
        (runningRopes.index + 1) + '/3: ' +
        ROPE_TASKS[runningRopes.index].name);
    } else if (ropeResult) notify(ropeResult);
    else if (prior) notify(prior);
  }


  // T504 Asset Requirements: native status read + attended inspection recording.
  // Never infer that an asset was inspected from its appearance on the page.
  const ASSET_GUIDE_ID = 'rebel-iq-t504-asset-guide';
  let assetGuideRows = [], assetGuideNext = -1, assetGuideLastScan = 0;
  let selectedAssetReview = null, assetRecordBusy = false;
  let assetBatchPreview = null, assetBatchRunning = false;
  let assetBatchCancel = false, assetBatchPilotConfirmed = false;
  const attemptedAssetRecords = new Set();

  // Read Operative IQ's own top-bar totals independently from individual rows.
  // Action Required and Maintenance Due are distinct native categories;
  // maintenance due may overlap other counts, so never sum it into total.
  function readNativeAssetTotals() {
    if (!isAssetPage() || inspectionId() !== ASSET_UNIT_ID || !t504Visible()) return null;
    const patterns = {
      total: /^All Assets\s*(\d{1,4})$/i,
      required: /^Action Required\s*(\d{1,4})$/i,
      completed: /^Completed\s*(\d{1,4})$/i,
      maintenance: /^Maintenance Due\s*(\d{1,4})$/i
    };
    const totals = {};
    const nodes = [...document.querySelectorAll('button,a,[role="tab"],[role="button"],div,span')]
      .filter(node => visible(node) && !node.closest('#' + PANEL + ', #' + ASSET_GUIDE_ID))
      .map(node => clean(node.innerText || node.textContent || ''))
      .filter(text => text.length > 0 && text.length <= 64);
    for (const [key, pattern] of Object.entries(patterns)) {
      const matches = nodes.map(text => text.match(pattern)?.[1])
        .filter(value => value !== undefined).map(Number);
      if (matches.length && matches.every(value => value === matches[0])) {
        totals[key] = matches[0];
      }
    }
    // Do not present an inconsistent or partial page-header read as truth.
    if (totals.total > 0 && totals.total <= 500 &&
        Number.isInteger(totals.required) &&
        Number.isInteger(totals.completed) &&
        totals.required + totals.completed === totals.total &&
        (totals.maintenance === undefined ||
         totals.maintenance <= totals.total)) return totals;
    return null;
  }

  function readAssetReviewRows() {
    if (!isAssetPage() || inspectionId() !== ASSET_UNIT_ID || !t504Visible()) return [];
    const statusPattern = /^(Not Verified|Verified|Needs Attention|Requires Attention)$/i;
    const statusNodes = [...document.querySelectorAll('span,div,small,p,label,strong')]
      .filter(node => visible(node) && node.children.length === 0 &&
        !node.closest('#' + PANEL + ', #' + ASSET_GUIDE_ID) &&
        statusPattern.test(clean(node.textContent || '')));
    const used = new Set(), rows = [];
    for (const label of statusNodes) {
      const status = clean(label.textContent).toLowerCase();
      let card = label.parentElement, fallback = null;
      for (let depth = 0; depth < 8 && card; depth++, card = card.parentElement) {
        const text = String(card.innerText || card.textContent || '');
        const bounds = card.getBoundingClientRect();
        if (text.length > 850 || bounds.height > 260) break;
        if (bounds.height < 28 || used.has(card)) continue;
        // Exclude wrappers containing other statuses and overview badges.
        const statusesInCard = statusNodes.filter(node => card.contains(node));
        if (statusesInCard.length !== 1) continue;
        const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
        const titleLine = lines.find(line =>
          line.length >= 3 && line.length <= 160 &&
          !statusPattern.test(line) &&
          !/^(?:Location|Asset Tag|Asset Type|Asset Class|Part|Qty|Quantity|P\/N|S\/N)\s*:/i.test(line) &&
          /[A-Za-z]{2,}/.test(line));
        if (!titleLine) continue;
        const title = clean(titleLine.replace(
          /\b(?:Not Verified|Verified|Needs Attention|Requires Attention)\s*$/i, ''));
        if (!title || !/[A-Za-z]{2,}/.test(title)) continue;
        // A tag differentiates assets with the same visible description.
        // Do not infer identity from position, description or a fake serial.
        const tag = text.match(/\bAsset\s*Tag\s*:\s*([A-Za-z0-9._-]{1,80})/i)?.[1] || '';
        // A current or unparseable maintenance-due requirement requires
        // individual attention and is not safe for present-batch recording.
        const due = text.match(/Maintenance\s+Due\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
        let maintenanceBlocked = /Maintenance\s+Due\s*:/i.test(text) && !due;
        if (due) {
          const m = Number(due[1]), d = Number(due[2]), y = Number(due[3]);
          const at = new Date(y,m-1,d);
          const today = new Date(); today.setHours(0,0,0,0);
          maintenanceBlocked = at.getFullYear() !== y || at.getMonth() !== m-1 ||
            at.getDate() !== d || at <= today;
        }
        const row = {element: card, title: title.slice(0, 110), status,
          assetTag: tag.trim(), maintenanceBlocked};
        const hasMetadata = /\b(?:Location|Asset Tag|Asset Type|Asset Class|Part|Qty|Quantity)\s*:/i.test(text);
        if (hasMetadata) {
          fallback = row;
          break;
        }
        // The lower T504 list includes requirements without location/tag
        // metadata. Keep the smallest plausible one-status item card.
        if (text.length >= 12 && !fallback) fallback = row;
      }
      if (fallback && !used.has(fallback.element)) {
        used.add(fallback.element);
        rows.push(fallback);
      }
    }
    return rows;
  }

  function makeAssetReviewSection() {
    // Inline only: no fixed-position popup, second launcher, or Hide button.
    // The single Rebel Starbird controls whether this panel is expanded.
    const section = document.createElement('section');
    section.id = ASSET_GUIDE_ID;
    section.setAttribute('aria-label', 'Truck 504 Asset Review');
    section.style.cssText =
      'display:none;margin-top:10px;padding:10px;border:1px solid #d6e2e9;' +
      'border-left:3px solid #176b8e;border-radius:7px;background:#f7f9fa;' +
      'font-size:11px;line-height:1.45;';

    const heading = document.createElement('div');
    heading.textContent = 'T504 Asset Checks';
    heading.style.cssText = 'font-size:12px;font-weight:bold;margin-bottom:5px;';

    const summary = document.createElement('div');
    summary.setAttribute('data-asset-guide-summary', '');
    summary.textContent = 'Reading Operative IQ asset statuses...';

    const coverage = document.createElement('div');
    coverage.setAttribute('data-asset-guide-coverage', '');
    coverage.style.cssText = 'margin-top:4px;color:#9b4c18;';

    const instructions = document.createElement('div');
    instructions.textContent = 'Physically inspect the T504 assets first. ' +
      'List any missing, damaged or unserviceable tags below. ' +
      'Rebel IQ will leave those and maintenance-due items for manual attention.';
    instructions.style.cssText = 'margin:6px 0;color:#526a78;';

    const excludedLabel = document.createElement('label');
    excludedLabel.textContent = 'Exceptions / asset tags (comma or new line separated)';
    excludedLabel.style.cssText = 'display:block;margin:8px 0 3px;font-weight:600;';
    const excluded = document.createElement('textarea');
    excluded.setAttribute('data-asset-batch-exceptions','');
    excluded.setAttribute('aria-label','Excluded asset tags requiring individual follow-up');
    excluded.placeholder = 'Example: 213, EFS-2001';
    excluded.rows = 2;
    excluded.style.cssText = 'display:block;width:100%;box-sizing:border-box;' +
      'border:1px solid #bacbd7;border-radius:5px;padding:6px;' +
      'font:11px/1.4 Arial,sans-serif;resize:vertical;';
    excluded.oninput = () => invalidateAssetBatchPreview();
    const prepare = document.createElement('button');
    prepare.type = 'button';
    prepare.textContent = 'Preview Inspected Assets';
    prepare.setAttribute('data-asset-batch-preview','');
    prepare.style.cssText = 'padding:8px 9px;background:#176b8e;color:white;' +
      'border:0;border-radius:5px;margin-top:7px;cursor:pointer;';
    prepare.onclick = prepareAssetBatchPreview;
    const plan = document.createElement('div');
    plan.setAttribute('data-asset-batch-plan','');
    plan.style.cssText = 'margin:7px 0;color:#18384f;';
    plan.textContent = 'No batch prepared. No equipment will be changed.';

    const attestLabel = document.createElement('label');
    attestLabel.style.cssText = 'display:flex;gap:6px;align-items:start;' +
      'margin:7px 0;cursor:pointer;';
    const attest = document.createElement('input');
    attest.type = 'checkbox';
    attest.disabled = true;
    attest.setAttribute('data-asset-batch-attest','');
    const attestText = document.createElement('span');
    attestText.setAttribute('data-asset-batch-attest-text','');
    attestText.textContent = 'I physically inspected all included assets ' +
      'and confirm they are present and serviceable.';
    attestLabel.append(attest,attestText);

    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = 'Verify Inspected Assets';
    action.disabled = true;
    action.setAttribute('data-asset-batch-run','');
    action.style.cssText = 'padding:9px;background:#176b8e;color:white;' +
      'border:0;border-radius:5px;cursor:pointer;min-height:36px;';
    attest.onchange = () => {
      action.disabled = !attest.checked || !assetBatchPreview || assetBatchRunning;
    };
    action.onclick = () => { void runInspectedAssetBatch(); };
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Stop';
    cancel.disabled = true;
    cancel.setAttribute('data-asset-batch-stop','');
    cancel.style.cssText = 'margin-left:6px;padding:9px;border:1px solid #a8bac8;' +
      'border-radius:5px;background:white;cursor:pointer;';
    cancel.onclick = () => {assetBatchCancel = true;};
    const progress = document.createElement('div');
    progress.setAttribute('data-asset-batch-progress','');
    progress.setAttribute('role','status');
    progress.style.cssText = 'margin:6px 0;color:#526a78;';
    progress.textContent = 'Not started. No assets recorded.';
    const batchControls = document.createElement('div');
    batchControls.append(action,cancel);

    const status = document.createElement('div');
    status.setAttribute('data-asset-guide-status', '');
    status.setAttribute('role', 'status');
    status.style.cssText = 'margin-top:6px;color:#526a78;';
    status.textContent = 'Physically inspect each item; no status is changed automatically.';

    section.append(heading, summary, coverage, instructions, excludedLabel, excluded,
      prepare, plan, attestLabel, batchControls, progress, status);
    return section;
  }

  function showNextAssetToReview() {
    const pending = assetGuideRows.filter(row =>
      row.status === 'not verified' || row.status === 'needs attention' ||
      row.status === 'requires attention');
    const section = document.getElementById(ASSET_GUIDE_ID);
    const status = section?.querySelector('[data-asset-guide-status]');
    if (!pending.length) {
      if (status) status.textContent = assetGuideRows.length
        ? 'No pending items detected by the guide. Confirm the full list in Operative IQ.'
        : 'No individual asset statuses detected. Use the native list.';
      return;
    }
    assetGuideNext = (assetGuideNext + 1) % pending.length;
    const target = pending[assetGuideNext];
    selectedAssetReview = target.status === 'not verified' && target.assetTag
      ? {title: target.title, assetTag: target.assetTag} : null;
    const checkbox = section?.querySelector('[data-asset-guide-confirm]');
    if (checkbox) { checkbox.checked = false; checkbox.disabled = !selectedAssetReview; }
    const record = section?.querySelector('[data-asset-guide-record]');
    if (record) record.disabled = true;
    target.element.scrollIntoView({behavior: 'smooth', block: 'center'});
    const previous = target.element.style.outline;
    target.element.style.outline = '3px solid #176b8e';
    setTimeout(() => {
      if (target.element.isConnected) target.element.style.outline = previous;
    }, 2200);
    if (status) status.textContent =
      'Review ' + (assetGuideNext + 1) + '/' + pending.length + ': ' +
      target.title + (target.assetTag && target.status === 'not verified'
        ? ' (tag ' + target.assetTag + '). Physically check it, tick the' +
          ' confirmation and press Record Present.'
        : '. Use the native Operative IQ control; automated recording is not available for this item.');
  }

  function refreshAssetReviewGuide() {
    const section = document.getElementById(ASSET_GUIDE_ID);
    if (!section) return;
    if (!isAssetPage() || inspectionId() !== ASSET_UNIT_ID || !t504Visible()) {
      // Keep section in the Rebel IQ menu, but hide it off the T504 asset page.
      section.style.display = 'none';
      if (assetBatchPreview && !assetBatchRunning) invalidateAssetBatchPreview();
      assetGuideRows = [];
      assetGuideNext = -1;
      selectedAssetReview = null;
      const checkbox = section.querySelector('[data-asset-guide-confirm]');
      if (checkbox) {checkbox.checked = false; checkbox.disabled = true;}
      const record = section.querySelector('[data-asset-guide-record]');
      if (record) record.disabled = true;
      assetGuideLastScan = 0;
      return;
    }
    section.style.display = 'block';
    if (now() - assetGuideLastScan < 2000) return;
    assetGuideLastScan = now();
    assetGuideRows = readAssetReviewRows();
    const counts = {not: 0, verified: 0, attention: 0};
    for (const row of assetGuideRows) {
      if (row.status === 'not verified') counts.not++;
      else if (row.status === 'verified') counts.verified++;
      else counts.attention++;
    }
    const native = readNativeAssetTotals();
    const summary = section.querySelector('[data-asset-guide-summary]');
    const coverage = section.querySelector('[data-asset-guide-coverage]');
    if (summary) summary.textContent = native
      ? 'Operative IQ: ' + native.total + ' Assets | ' +
        native.required + ' Action Required | ' +
        native.completed + ' Completed' +
        (Number.isInteger(native.maintenance)
          ? ' | ' + native.maintenance + ' Maintenance Due' : '')
      : 'Detected only: ' + counts.not + ' Not Verified | ' +
        counts.verified + ' Verified | ' + counts.attention + ' Attention';
    if (coverage) {
      const missing = native ? native.total - assetGuideRows.length : 0;
      coverage.textContent = native
        ? (missing > 0
          ? 'Guide detects ' + assetGuideRows.length + '/' + native.total +
            ' rows. ' + missing + ' not mapped: use the native list for these.'
          : assetGuideRows.length === native.total
            ? 'Guide detects all ' + native.total + ' rows; verify physically.'
            : 'Guide row count differs from native totals; use native list.')
        : 'Native totals unavailable. The guide may miss some equipment.';
    }
  }


  // An attended, one-item-only native Operative IQ operation.
  // No direct HTTP mutation, no bulk verification, no synthetic signatures.
  // The user must explicitly confirm they physically checked this exact tag.
  function findNativeAssetTagEntry() {
    if (!isAssetPage() || inspectionId() !== ASSET_UNIT_ID || !t504Visible()) return null;
    const fields = [...document.querySelectorAll('input')]
      .filter(node => visible(node) && !node.disabled && !node.readOnly &&
        !node.closest('#' + PANEL) &&
        /enter\s+asset\s+tag\s*\/\s*serial/i.test(
          (node.getAttribute('placeholder') || '') + ' ' +
          (node.getAttribute('aria-label') || '')));
    if (fields.length !== 1 || clean(fields[0].value)) return null;
    const input = fields[0], rect = input.getBoundingClientRect();
    let container = input.parentElement;
    for (let depth = 0; depth < 5 && container; depth++, container = container.parentElement) {
      const matches = [...container.querySelectorAll('button')]
        .filter(button => visible(button) && !button.disabled && button.type !== 'reset')
        .filter(button => {
          const box = button.getBoundingClientRect();
          const label = clean([
            button.getAttribute('aria-label') || '',
            button.getAttribute('title') || '',
            button.textContent || ''
          ].join(' '));
          return box.left >= rect.right - 5 &&
            box.left < rect.right + 110 &&
            Math.abs((box.top + box.bottom) / 2 - (rect.top + rect.bottom) / 2) < 22 &&
            (label === '' || /^(search|go|find|verify)(\s+(asset|tag))?$/i.test(label));
        });
      if (matches.length === 1) return {input, button: matches[0]};
      if (matches.length > 1) return null;
    }
    return null;
  }

  function selectOnePendingAssetByTag(assetTag, title) {
    const matching = readAssetReviewRows().filter(row =>
      row.assetTag === assetTag);
    // A repeated tag anywhere on this T504 page is ambiguous, even when
    // one description happens to match. Never act on an ambiguous tag.
    return matching.length === 1 && matching[0].title === title &&
      matching[0].status === 'not verified' ? matching[0] : null;
  }

  async function recordSelectedAssetPresence() {
    const section = document.getElementById(ASSET_GUIDE_ID);
    const status = section?.querySelector('[data-asset-guide-status]');
    const record = section?.querySelector('[data-asset-guide-record]');
    const checkbox = section?.querySelector('[data-asset-guide-confirm]');
    const fail = message => {if (status) status.textContent = message; };
    if (assetRecordBusy || !section || !selectedAssetReview ||
        !checkbox || !checkbox.checked || checkbox.disabled ||
        !isAssetPage() || inspectionId() !== ASSET_UNIT_ID || !t504Visible() ||
        readPending() || readRopes()) {
      fail('Cannot record: select a T504 asset after finishing other draft work.');
      return;
    }
    const {assetTag,title} = selectedAssetReview;
    const key = location.pathname + '|' + assetTag;
    if (attemptedAssetRecords.has(key)) {
      fail('This tag was already attempted on this page. Check Operative IQ before retrying.');
      return;
    }
    const pending = selectOnePendingAssetByTag(assetTag,title);
    if (!pending) {
      fail('Target not uniquely identifiable or already updated. No record was changed.');
      return;
    }
    const native = findNativeAssetTagEntry();
    if (!native) {
      fail('The native asset-tag scanner/search control is not uniquely identified or contains text. Use the original Operative IQ checkmark or scanner.');
      return;
    }
    // The in-panel checkbox is the operator's explicit confirmation for
    // THIS selected item. Never pop up another dialog or automate a batch.
    // Reread the native control and exact asset after this attestation.
    const currentNative = findNativeAssetTagEntry();
    if (!selectOnePendingAssetByTag(assetTag,title) ||
        !currentNative || currentNative.input !== native.input ||
        currentNative.button !== native.button ||
        !native.input.isConnected || !native.button.isConnected ||
        !isAssetPage() || inspectionId() !== ASSET_UNIT_ID) {
      fail('Asset changed while confirming; no action taken.');
      return;
    }
    assetRecordBusy = true;
    checkbox.checked = false;
    checkbox.disabled = true;
    attemptedAssetRecords.add(key);  // Never auto-repeat a potentially consequential click.
    if (record) record.disabled = true;
    try {
      native.input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!setter) throw Error('Native input setter unavailable.');
      setter.call(native.input,assetTag);
      native.input.dispatchEvent(new Event('input',{bubbles:true}));
      native.input.dispatchEvent(new Event('change',{bubbles:true}));
      if (native.input.value !== assetTag) throw Error('Native input rejected the selected tag.');
      // The official Front Line guide documents entering/scanning the asset
      // tag in this bottom field as a verification method. One click only.
      native.button.click();
      fail('Submitted tag ' + assetTag + ' through Operative IQ. Checking for its Verified status...');
      let confirmed = false;
      for (let i = 0; i < 22; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!isAssetPage() || inspectionId() !== ASSET_UNIT_ID) break;
        const rows = readAssetReviewRows().filter(row =>
          row.assetTag === assetTag && row.title === title);
        if (rows.length === 1 && rows[0].status === 'verified') {
          confirmed = true;
          break;
        }
      }
      fail(confirmed
        ? 'Operative IQ confirms VERIFIED: ' + title + ' (tag ' + assetTag + ').'
        : 'Verification not confirmed for tag ' + assetTag +
          '. Inspect the native status. Do not retry until it is reconciled.');
      selectedAssetReview = null;
      assetGuideNext = -1;
      assetGuideLastScan = 0;
      refreshAssetReviewGuide();
    } catch (error) {
      fail('Recording outcome UNKNOWN for tag ' + assetTag +
        ': ' + clean(error?.message || 'operation failed') +
        '. Check Operative IQ before trying again.');
    } finally {
      assetRecordBusy = false;
    }
  }

  // Build an exact, attended batch from native T504 data. This is NOT
  // an assertion that the inspector has inspected anything. Only their
  // subsequent in-panel physical-attestation permits the native writes.
  function buildAssetBatchPlan(rawExceptions) {
    if (!isAssetPage() || inspectionId() !== ASSET_UNIT_ID || !t504Visible())
      return {error: 'Open T504 Asset Requirements before preparing a batch.'};
    if (readPending() || readRopes() || assetRecordBusy || assetBatchRunning)
      return {error: 'Finish existing checks before preparing asset verification.'};
    const native = readNativeAssetTotals();
    const rows = readAssetReviewRows();
    if (!native || native.total < 1 || native.total > 180 ||
        !rows.length || rows.length > native.total)
      return {error: 'Cannot reconcile live Operative IQ asset totals. No batch prepared.'};
    const excludedTags = [...new Set(
      clean(rawExceptions).split(/[\s,;]+/).filter(Boolean)
        .map(tag => tag.toUpperCase())
    )];
    if (excludedTags.length > native.total ||
        excludedTags.some(tag => !/^[A-Z0-9._-]{1,80}$/.test(tag)))
      return {error: 'Exception tags are invalid or too numerous. Check the entries.'};

    const tagCounts = new Map();
    const knownTags = new Set();
    for (const row of rows) {
      const tag = clean(row.assetTag).toUpperCase();
      if (!tag) continue;
      knownTags.add(tag);
      tagCounts.set(tag,(tagCounts.get(tag) || 0) + 1);
    }
    const unknownExceptions = excludedTags.filter(tag => !knownTags.has(tag));
    if (unknownExceptions.length)
      return {error: 'Exception tag not found in the current T504 list: ' +
        unknownExceptions.slice(0,4).join(', ') + '. No batch prepared.'};
    const exceptions = new Set(excludedTags);
    const blocked = {exception:0, maintenance:0, untagged:0,
      duplicate:0, otherStatus:0};
    const items = [];
    for (const row of rows) {
      if (row.status !== 'not verified') {
        blocked.otherStatus++;
        continue;
      }
      const tag = clean(row.assetTag).toUpperCase();
      if (exceptions.has(tag)) {blocked.exception++;continue;}
      if (row.maintenanceBlocked) {blocked.maintenance++;continue;}
      if (!tag || !/^[A-Z0-9._-]{1,80}$/.test(tag)) {blocked.untagged++;continue;}
      if (tagCounts.get(tag) !== 1) {blocked.duplicate++;continue;}
      items.push({assetTag:tag, title:row.title});
    }
    if (!items.length) return {error: 'No uniquely identified, currently unverified ' +
      'T504 assets are eligible. Use Operative IQ for individual exceptions.'};
    if (items.length > 90) return {error:'Unusually large batch. No records prepared.'};
    return {
      items, native, excludedTags, blocked, unmapped: native.total-rows.length,
      route: location.pathname, preparedAt: Date.now(),
      confirmed: false
    };
  }

  function invalidateAssetBatchPreview() {
    if (assetBatchRunning) return;
    assetBatchPreview = null;
    const section = document.getElementById(ASSET_GUIDE_ID);
    if (!section) return;
    const attestation = section.querySelector('[data-asset-batch-attest]');
    const action = section.querySelector('[data-asset-batch-run]');
    if (attestation) {attestation.checked = false; attestation.disabled = true;}
    if (action) action.disabled = true;
    const plan = section.querySelector('[data-asset-batch-plan]');
    if (plan) plan.textContent = 'Exceptions changed. Preview again before verification.';
  }

  function prepareAssetBatchPreview() {
    const section = document.getElementById(ASSET_GUIDE_ID);
    if (!section || assetBatchRunning) return;
    invalidateAssetBatchPreview();
    const raw = section.querySelector('[data-asset-batch-exceptions]')?.value || '';
    const proposed = buildAssetBatchPlan(raw);
    const output = section.querySelector('[data-asset-batch-plan]');
    if (!output) return;
    if (proposed.error) {
      output.textContent = proposed.error;
      return;
    }
    assetBatchPreview = proposed;
    const remaining = proposed.blocked.maintenance + proposed.blocked.untagged +
      proposed.blocked.duplicate + proposed.blocked.exception;
    const limit = assetBatchPilotConfirmed ? proposed.items.length : 1;
    output.textContent = proposed.items.length + ' uniquely identified candidate(s) | ' +
      remaining + ' require individual attention or are excluded | ' +
      proposed.unmapped + ' native row(s) not mapped. ' +
      (assetBatchPilotConfirmed ? 'Ready to record selected inspected assets.' :
        'Safety pilot: the first run records ONE asset and checks the native result.') +
      ' No maintenance-due or exception assets are included.';
    const details = document.createElement('details');
    details.style.cssText = 'margin-top:4px;';
    const sum = document.createElement('summary');
    sum.textContent = 'Review included tags (' + proposed.items.length + ')';
    sum.style.cssText = 'cursor:pointer;';
    const ids = document.createElement('div');
    ids.style.cssText = 'overflow-wrap:anywhere;max-height:125px;overflow:auto;';
    ids.textContent = proposed.items.map(item =>
      item.title + ' [' + item.assetTag + ']').join('; ');
    details.append(sum,ids);
    output.append(details);
    const attest = section.querySelector('[data-asset-batch-attest]');
    const wording = section.querySelector('[data-asset-batch-attest-text]');
    if (wording) wording.textContent =
      'I physically inspected all ' + proposed.items.length +
      ' included T504 assets, confirmed they are present and serviceable, ' +
      'and excluded every known missing/damaged item.';
    if (attest) {attest.checked = false;attest.disabled = false;}
    const button = section.querySelector('[data-asset-batch-run]');
    if (button) {
      button.disabled = true;
      button.textContent = assetBatchPilotConfirmed
        ? 'Verify Inspected Assets (' + limit + ')'
        : 'Verify 1 Pilot Asset';
    }
  }

  async function runInspectedAssetBatch() {
    const section = document.getElementById(ASSET_GUIDE_ID);
    const attestation = section?.querySelector('[data-asset-batch-attest]');
    const action = section?.querySelector('[data-asset-batch-run]');
    const stop = section?.querySelector('[data-asset-batch-stop]');
    const progress = section?.querySelector('[data-asset-batch-progress]');
    const output = message => {if(progress) progress.textContent = message;};
    const plan = assetBatchPreview;
    if (assetBatchRunning || assetRecordBusy || !section || !plan ||
        !attestation || !attestation.checked || attestation.disabled ||
        !isAssetPage() || inspectionId() !== ASSET_UNIT_ID || !t504Visible() ||
        readPending() || readRopes() ||
        plan.route !== location.pathname ||
        Date.now() - plan.preparedAt > 10*60*1000) {
      output('Cannot start: refresh the asset list, preview, and physically confirm first.');
      return;
    }
    const currentExceptions = clean(
      section.querySelector('[data-asset-batch-exceptions]')?.value || ''
    ).split(/[\s,;]+/).filter(Boolean).map(x => x.toUpperCase());
    if (currentExceptions.length !== plan.excludedTags.length ||
        currentExceptions.some(x => !plan.excludedTags.includes(x))) {
      invalidateAssetBatchPreview();
      output('Exceptions changed. Preview again. Nothing recorded.');
      return;
    }
    assetBatchRunning = true;
    assetBatchCancel = false;
    if (action) action.disabled = true;
    if (stop) stop.disabled = false;
    const exceptionEntry = section.querySelector('[data-asset-batch-exceptions]');
    const previewAction = section.querySelector('[data-asset-batch-preview]');
    if (exceptionEntry) exceptionEntry.disabled = true;
    if (previewAction) previewAction.disabled = true;
    attestation.checked = false;
    attestation.disabled = true;
    const maximum = assetBatchPilotConfirmed ? plan.items.length : 1;
    let confirmed = 0, attempted = 0, failed = '';
    for (const item of plan.items.slice(0,maximum)) {
      if (assetBatchCancel) {failed='Stopped by inspector.';break;}
      if (!isAssetPage() || inspectionId() !== ASSET_UNIT_ID ||
          location.pathname !== plan.route || !t504Visible()) {
        failed='T504 page changed. Stop and reconcile in Operative IQ.';break;
      }
      const key = location.pathname + '|' + item.assetTag;
      if (attemptedAssetRecords.has(key)) {
        failed = 'Previously attempted tag ' + item.assetTag +
          '. Inspect native status before retrying.';break;
      }
      const rows = readAssetReviewRows().filter(row =>
        clean(row.assetTag).toUpperCase() === item.assetTag);
      if (rows.length !== 1 || rows[0].title !== item.title ||
          rows[0].status !== 'not verified' || rows[0].maintenanceBlocked) {
        failed = 'Asset identity/status changed for tag ' + item.assetTag + '.';break;
      }
      const native = findNativeAssetTagEntry();
      if (!native || !native.input.isConnected || !native.button.isConnected) {
        failed='Native tag input unavailable. No further assets attempted.';break;
      }
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,'value')?.set;
      if (!setter) {failed='Native tag entry unavailable.';break;}
      attemptedAssetRecords.add(key);
      attempted++;
      output('Recording ' + attempted + '/' + maximum + ': ' +
        item.title + ' [' + item.assetTag + ']...');
      try {
        native.input.focus();
        setter.call(native.input,item.assetTag);
        native.input.dispatchEvent(new Event('input',{bubbles:true}));
        native.input.dispatchEvent(new Event('change',{bubbles:true}));
        if (native.input.value !== item.assetTag)
          throw Error('Native tag field rejected the exact tag');
        native.button.click(); // One native Operative IQ action per item.
        let verified = false;
        for (let i = 0; i < 22; i++) {
          await new Promise(resolve => setTimeout(resolve,500));
          if (!isAssetPage() || inspectionId() !== ASSET_UNIT_ID ||
              location.pathname !== plan.route) break;
          const again = readAssetReviewRows().filter(row =>
            clean(row.assetTag).toUpperCase() === item.assetTag);
          if (again.length === 1 && again[0].title === item.title &&
              again[0].status === 'verified') {verified=true;break;}
        }
        if (!verified) throw Error('Official Verified status not confirmed');
        confirmed++;
        // Clear ONLY the value entered by this flow, never the inspector's
        // independent entry. Some Angular controls clear themselves.
        const existing = clean(native.input.value);
        if (existing === item.assetTag) {
          setter.call(native.input,'');
          native.input.dispatchEvent(new Event('input',{bubbles:true}));
          native.input.dispatchEvent(new Event('change',{bubbles:true}));
        } else if (existing) throw Error('Tag field changed unexpectedly');
        if (clean(native.input.value))
          throw Error('Tag field did not reset');
      } catch (error) {
        failed = 'Tag ' + item.assetTag + ': ' +
          clean(error?.message || error) +
          '. Stop. Check Operative IQ; do not retry automatically.';
        break;
      }
    }
    if (!assetBatchPilotConfirmed && confirmed === 1 && !failed)
      assetBatchPilotConfirmed = true;
    assetBatchPreview = null;
    assetBatchRunning = false;
    assetBatchCancel = false;
    if (stop) stop.disabled = true;
    if (action) action.disabled = true;
    if (exceptionEntry) exceptionEntry.disabled = false;
    if (previewAction) previewAction.disabled = false;
    assetGuideLastScan = 0;
    refreshAssetReviewGuide();
    if (failed) output('Confirmed ' + confirmed + ' of ' + attempted +
      ' attempted. ' + failed + ' All remaining unverified items need review.');
    else if (maximum < plan.items.length)
      output('Pilot confirmed: 1 asset VERIFIED in Operative IQ. ' +
        'Preview again to record the remaining inspected assets together.');
    else output('Verified ' + confirmed + '/' + maximum +
      ' selected assets in Operative IQ. ' +
      'Inspect excluded, maintenance-due, and unmapped items separately.');
  }

  function beginAssets() {
    const id = inspectionId();
    if (id !== ASSET_UNIT_ID || !t504Visible()) {
      notify('Open the Truck 504 inspection first. No assets were marked checked.', true);
      return;
    }
    if (readRopes() || readPending()) {
      notify('A questionnaire draft is running. Finish it before opening Asset Checks.', true);
      return;
    }
    notify('Opening T504 Asset Requirements. Verify each required asset at the apparatus; Rebel IQ will not mark anything checked.');
    if (isAssetPage()) return;
    location.assign(assetUrl(id));
  }

  function begin(kind) {
    if (readRopes()) {
      notify('Three-rope draft run is already active. Do not start another check.', true);
      return;
    }
    const id = inspectionId();
    if (!id || !t504Visible()) {
      notify('Open the T504 Unit Inspection page first. No form was changed.', true);
      return;
    }
    if (!window.confirm(
      'Prepare T504 ' + TASKS[kind].name + ' with default answers?\n\n' +
      'This may replace existing draft answers. The defaults are NOT inspection results. ' +
      'You must verify every item at the truck before submitting.\n\n' +
      'Rebel IQ will use Save In Process, NEVER Submit.'
    )) return;
    sessionStorage.removeItem(RESULT);
    if (kind === 'daily') {
      writeAssetFollowup({unitId: id, startedAt: now(), stage: 'await_daily_save'});
    } else {
      clearAssetFollowup();
    }
    attempts = 0;
    writePending({ kind, unitId: id, startedAt: now(), stage: 'list' });
    notify('Opening ' + TASKS[kind].name + '...');
    if (formId() && clean(document.body.innerText).includes(TASKS[kind].name)) {
      runPending();
    } else if (isGroupPage()) {
      runPending();
    } else {
      location.assign(listUrl(id));
    }
  }


  function beginRopes() {
    if (inspectionId() !== ROPE_UNIT_ID || !t504Visible()) {
      notify('Open Truck 504 Unit Inspection to prepare Thursday rope checks. Nothing changed.', true);
      return;
    }
    if (readRopes() || readPending()) {
      notify('Another Rebel IQ draft run is already active. Nothing changed.', true);
      return;
    }
    // Exactly one button click starts all three *draft* forms, sequentially.
    // No form is submitted, and every positive answer needs physical verification.
    sessionStorage.removeItem(ROPE_RESULT);
    sessionStorage.removeItem(RESULT);
    const run = {
      unitId: ROPE_UNIT_ID,
      startedAt: Date.now(),
      index: 0,
      stage: 'form',
      confirmed: [],
      savedClickAt: null
    };
    writeRopes(run);
    notify('Three-rope draft run 1/3: ' + ROPE_TASKS[0].name +
      '. Defaults are UNVERIFIED. No submission.');
    location.assign('/inspections/' + ROPE_UNIT_ID +
      '/questionaries/' + ROPE_TASKS[0].id);
  }

  const questionNumber = container => {
    const text = clean(container?.innerText || '');
    const match = text.match(/^(\d+)\s*\./);
    return match ? Number(match[1]) : null;
  };
  const questionName = container => {
    const lines = String(container?.innerText || container?.textContent || '')
      .split(/\r?\n/).map(clean).filter(Boolean);
    const match = lines[0]?.match(/^\d+\s*\.\s*(.*)$/);
    if (!match) return '';
    // On the live Operative IQ screen, "1. Fuel *" is all one heading.
    // Some older versions split the number and question title across lines.
    return clean((match[1] || lines[1] || '').replace(/\s*\*\s*$/, ''));
  };
  // Operative IQ currently renders plain radio controls rather than
  // Angular Material mat-radio-group inside .form-group. Locate a question
  // from its numbered heading, independent of the UI component library.
  function findIqQuestion(node) {
    for (let el = node; el && el !== document.body; el = el.parentElement) {
      if (el.closest?.('#' + PANEL)) break;
      const raw = String(el.innerText || el.textContent || '');
      const number = questionNumber(el);
      if (!number || number > 80) continue;
      const headings = [...raw.matchAll(/(?:^|\n)\s*(\d{1,2})\s*\.\s*(?=[A-Za-z0-9])/g)]
        .map(match => Number(match[1]));
      if (headings.length === 1 && headings[0] === number) return el;
    }
    return null;
  }

  const knownRadioAnswer = /^(Full|Pass|Present|Fail|Missing|Added|Not needed|3\/4|7\/8|Less than 3\/4)$/i;
  function readableIqRadio(node) {
    const labelNodes = [
      node.closest?.('label'),
      ...(node.labels ? [...node.labels] : [])
    ].filter(Boolean);
    const candidates = [
      node.getAttribute?.('aria-label'),
      ...labelNodes.map(label => label.innerText || label.textContent),
      node.parentElement?.innerText || node.parentElement?.textContent,
      node.innerText || node.textContent,
      node.value
    ];
    const answer = candidates.map(value => clean(value || ''))
      .find(value => knownRadioAnswer.test(value)) || '';
    return {
      value: answer === 'Not Needed' ? 'Not needed' : answer,
      get checked() { return node.checked === true || node.getAttribute?.('aria-checked') === 'true'; },
      click() { node.click(); }
    };
  }

  function iqRadioControls() {
    const native = [...document.querySelectorAll('input[type="radio"]')];
    const aria = [...document.querySelectorAll('[role="radio"]')]
      .filter(node => !node.querySelector('input[type="radio"]'));
    const custom = native.length || aria.length ? [] :
      [...document.querySelectorAll('mat-radio-button,p-radioButton,.mat-radio-button')]
        .filter(node => !node.querySelector('input[type="radio"],[role="radio"]'));
    return [...native, ...aria, ...custom].filter(node => !node.closest('#' + PANEL));
  }

  function readIqForm() {
    const radioMap = new Map(), textMap = new Map();
    const radioNodes = iqRadioControls();
    for (const node of radioNodes) {
      const group = findIqQuestion(node), number = questionNumber(group);
      if (!number) continue;
      const prior = radioMap.get(number);
      if (prior && prior.group !== group) {
        throw Error('Conflicting radio groups at question ' + number + '. No answers changed.');
      }
      if (!prior) radioMap.set(number, { group, choices: [] });
      radioMap.get(number).choices.push(readableIqRadio(node));
    }
    for (const textarea of document.querySelectorAll('textarea')) {
      if (textarea.closest('#' + PANEL)) continue;
      const group = findIqQuestion(textarea), number = questionNumber(group);
      if (!number) continue;
      if (textMap.has(number)) throw Error('Multiple text inputs at question ' + number + '.');
      textMap.set(number, { group, textarea });
    }
    return {
      radioMap, textMap,
      radioCount: radioNodes.length,
      textareaCount: document.querySelectorAll('textarea').length
    };
  }

  function validateForm(kind) {
    const task = TASKS[kind];
    if (!formId() || !t504Visible() || !clean(document.body.innerText).includes(task.name)) {
      throw Error('This page is not the T504 ' + task.name + ' questionnaire.');
    }
    const { radioMap, textMap, radioCount, textareaCount } = readIqForm();
    if (radioMap.size !== task.count) {
      throw Error('Unexpected questionnaire layout: found ' +
        radioMap.size + ' choices, expected ' + task.count +
        '. DOM: ' + radioCount + ' radio controls, ' + textareaCount +
        ' text fields. Nothing was saved.');
    }
    if (kind === 'daily') {
      // Live T504 Tour form contains 41 required radio choices PLUS a
      // separate optional Question 42: General Comments textarea.
      // It is not a change to the form and must be preserved untouched.
      if (textMap.size !== 1 || radioMap.size !== 41 ||
        !/Fuel/i.test(questionName(radioMap.get(1)?.group)) ||
        !/Hand Tools/i.test(questionName(radioMap.get(41)?.group)) ||
        !textMap.has(42) ||
        !/General Comments/i.test(questionName(textMap.get(42).group))) {
        throw Error('Daily questionnaire changed. No answers were modified.');
      }
      for (let i = 1; i <= 41; i++) {
        const choices = radioMap.get(i)?.choices || [];
        if (choices.length < 2 || !['Full', 'Pass', 'Present'].includes(choices[0].value)) {
          throw Error('Unrecognized answer at Tour question ' + i + '. No answers were modified.');
        }
      }
    } else {
      if (textMap.size !== 11 || radioMap.size !== 12 ||
        !/Aerial Lubrication/i.test(questionName(radioMap.get(7)?.group))) {
        throw Error('Weekly questionnaire changed. No answers were modified.');
      }
      for (let i = 4; i <= 15; i++) {
        const choices = radioMap.get(i)?.choices || [];
        const wanted = i === 7 ? 'Not needed' : choices[0]?.value;
        if (!choices.some(x => x.value === wanted) ||
          (i !== 7 && !['Full', 'Pass'].includes(wanted))) {
          throw Error('Unrecognized weekly option at question ' + i + '. Nothing was modified.');
        }
      }
      for (let i = 1; i <= 3; i++) {
        const names = ['Odometer', 'Aerial Hours', 'Engine Hours'];
        if (!textMap.has(i) || !questionName(textMap.get(i).group).includes(names[i - 1])) {
          throw Error('Weekly hour or odometer question changed.');
        }
      }
      for (let i = 16; i <= 23; i++) {
        if (!textMap.has(i) || !/Tire Pressure/i.test(questionName(textMap.get(i).group))) {
          throw Error('Weekly tire pressure fields changed. Nothing was modified.');
        }
      }
    }
    const saveButtons = [...document.querySelectorAll('button')]
      .filter(button => visible(button) && clean(button.textContent) === 'Save In Process');
    if (saveButtons.length !== 1 || saveButtons[0].disabled) {
      throw Error('A unique enabled Save In Process button was not found.');
    }
    return { radioMap, textMap, save: saveButtons[0] };
  }


  const iqLabelKey = value => clean(value).toLowerCase()
    .replace(/[\u2019\u2018]/g,"'").replace(/\s+/g, ' ');
  function checkboxLabel(node) {
    const candidates = [
      node.getAttribute?.('aria-label'),
      ...(node.labels ? [...node.labels].map(el=>el.innerText||el.textContent) : []),
      node.closest?.('mat-checkbox,.mat-mdc-checkbox,.mdc-form-field')?.innerText,
      node.closest?.('mat-checkbox,.mat-mdc-checkbox,.mdc-form-field')?.textContent,
      node.parentElement?.innerText,
      node.parentElement?.textContent
    ];
    return candidates.map(clean).find(Boolean) || '';
  }
  function readRopeCheckboxes() {
    const all = [...document.querySelectorAll('input[type="checkbox"]')]
      .filter(node => !node.closest('#' + PANEL));
    const groups = new Map();
    for (const node of all) {
      const group = findIqQuestion(node);
      const number = questionNumber(group);
      if (!number) continue;
      const prior = groups.get(number);
      if (prior && prior.group !== group) {
        throw Error('Conflicting checkbox cards at question '+number+'. No answers changed.');
      }
      if (!prior) groups.set(number,{group,boxes:[]});
      groups.get(number).boxes.push({node, label:checkboxLabel(node)});
    }
    return {groups,total:all.length};
  }

  function validateRopeForm(task) {
    if (!task || inspectionId() !== ROPE_UNIT_ID ||
      formId() !== task.id || !t504Visible() ||
      !clean(document.body.innerText).includes(task.name)) {
      throw Error('Wrong T504 Thursday rope questionnaire. No answers changed.');
    }
    const {radioMap,textMap,radioCount,textareaCount} = readIqForm();
    const {groups:checkMap,total:checkboxCount} = readRopeCheckboxes();
    if (task.type === 'radio') {
      if (radioMap.size !== task.questions.length || textMap.size ||
        checkMap.size || checkboxCount) {
        throw Error('Rope radio form incomplete: '+radioMap.size+'/'+task.questions.length+
          ' questions, '+radioCount+' radios, '+textareaCount+' text fields, '+
          checkboxCount+' checkboxes. No answers changed.');
      }
      for (let i = 1; i <= task.questions.length; i++) {
        const current = radioMap.get(i);
        const choices = current?.choices || [];
        if (!current ||
          iqLabelKey(questionName(current.group)) !== iqLabelKey(task.questions[i-1]) ||
          choices.length !== 2 ||
          !choices.some(x => x.value === 'Present') ||
          !choices.some(x => x.value === 'Missing')) {
          throw Error('Unexpected rope question/answer at '+i+'. No answers changed.');
        }
      }
    } else if (task.type === 'checkbox') {
      const expectedCount = task.questions.reduce((sum,q)=>sum+q.options.length,0);
      if (radioMap.size || textMap.size || checkMap.size !== task.questions.length ||
        checkboxCount !== expectedCount) {
        throw Error('Rope Gear form incomplete: '+checkMap.size+'/4 groups, '+
          checkboxCount+'/'+expectedCount+' checkboxes. No answers changed.');
      }
      for (let i = 1; i <= task.questions.length; i++) {
        const actual = checkMap.get(i), expected = task.questions[i-1];
        if (!actual || iqLabelKey(questionName(actual.group)) !== iqLabelKey(expected.name) ||
          actual.boxes.length !== expected.options.length ||
          actual.boxes.some((box,j) => iqLabelKey(box.label) !== iqLabelKey(expected.options[j]) ||
            box.node.disabled)) {
          throw Error('Unexpected rope gear or checkbox at group '+i+'. No answers changed.');
        }
      }
    } else {
      throw Error('Unknown rope draft questionnaire type. No answers changed.');
    }
    const saves = [...document.querySelectorAll('button')]
      .filter(node=>visible(node) && clean(node.textContent)==='Save In Process');
    if (saves.length !== 1 || saves[0].disabled) {
      throw Error('Rope questionnaire Save In Process button was not uniquely available.');
    }
    return {radioMap, checkMap, save:saves[0]};
  }

  // Operative IQ's Angular route/title renders BEFORE its radio choices and
  // text controls. Do not treat that transient empty DOM as a changed form.
  // Check the complete questionnaire repeatedly, then require a stable,
  // fully-validated rendering before modifying even one draft answer.
  async function waitForIqForm(kind, isStillCurrent = () => true,
      timeoutMs = 15000, pollMs = 180) {
    const deadline = Date.now() + timeoutMs;
    let stable = 0, lastFailure = null;
    while (Date.now() < deadline) {
      if (!isStillCurrent()) {
        throw Error('The T504 questionnaire changed while loading. No answers were modified.');
      }
      try {
        validateForm(kind); // Read-only. Includes every required card and Save In Process.
        stable += 1;
        if (stable >= 3) return; // At least two polling intervals of stable readiness.
      } catch (error) {
        stable = 0;
        lastFailure = error;
      }
      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
    throw Error('T504 questionnaire did not become ready after loading. ' +
      (lastFailure?.message || 'Form controls were incomplete.') +
      ' No answers were modified or saved.');
  }


  async function waitForRopeForm(task, currentRun, timeoutMs = 16000, pollMs = 180) {
    const deadline = Date.now() + timeoutMs;
    let stable = 0, lastFailure = null;
    while (Date.now() < deadline) {
      if (!currentRun()) throw Error('Thursday rope run or form changed while loading.');
      try {
        validateRopeForm(task); // read-only until all 11/27 radios or 17 boxes are verified
        if (++stable >= 3) return;
      } catch (error) {
        stable = 0;
        lastFailure = error;
      }
      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
    throw Error('Thursday rope questionnaire did not finish loading: ' +
      (lastFailure?.message || 'Unknown incomplete form'));
  }

  function prepareRopeDraft(task, currentRun) {
    const form = validateRopeForm(task);
    if (task.type === 'radio') {
      for (let i = 1; i <= task.questions.length; i++) {
        const answer = form.radioMap.get(i).choices.find(c => c.value === 'Present');
        if (!answer) throw Error('Present option missing at rope question ' + i);
        if (!answer.checked) answer.click();
        if (!answer.checked) throw Error('Rope question ' + i + ' rejected draft selection.');
      }
    } else {
      for (let i = 1; i <= task.questions.length; i++) {
        for (const {node, label} of form.checkMap.get(i).boxes) {
          if (!node.checked) node.click();
          if (!node.checked) throw Error('Rope Gear ' + label + ' rejected draft checkbox.');
        }
      }
    }
    if (!currentRun() || location.pathname !==
        '/inspections/' + ROPE_UNIT_ID + '/questionaries/' + task.id) {
      throw Error('Thursday rope form changed before Save In Process.');
    }
    const current = readRopes();
    if (!current || current.stage !== 'form') {
      throw Error('Thursday rope transaction is not ready to save.');
    }
    // Persist BEFORE the only save click so page reloads cannot repeat it.
    writeRopes({...current, stage:'receipt', savedClickAt:Date.now()});
    // Physical inspection remains the firefighter's responsibility.
    form.save.click();
  }

  function finishRopesWithError(error, run = readRopes()) {
    const confirmed = Array.isArray(run?.confirmed) ? run.confirmed.length : 0;
    clearRopes();
    const message = 'Thursday rope drafts stopped at '+confirmed+'/3 confirmed: ' +
      clean(error?.message || error || 'Unknown error') +
      ' Check the other forms before retrying. No automatic resubmission.';
    sessionStorage.setItem(ROPE_RESULT, message);
    notify(message, true);
    captureIqError(error, 'thursday-ropes:'+String(run?.stage||'unknown'));
  }

  function ropeSavedOnGroup(task) {
    // A save click is not success. Require a visible, exact questionnaire card
    // with Saved in Process on the returned unit group listing.
    const links = [...document.querySelectorAll('a,[role="link"]')]
      .filter(node => visible(node) && !node.closest('#' + PANEL));
    return links.some(node => {
      const label = clean(node.innerText || node.textContent);
      return label.startsWith(task.name) && /saved in process/i.test(label) &&
        (label.length === task.name.length ||
          /\s/.test(label.charAt(task.name.length)));
    });
  }

  async function runRopes() {
    if (ropeBusy) return;
    const run = readRopes();
    if (!run) return;
    ropeBusy = true;
    try {
      const task = ROPE_TASKS[run.index];
      if (!task || inspectionId() !== ROPE_UNIT_ID) {
        throw Error('Truck 504 inspection identity was not verified.');
      }
      if (run.stage === 'form') {
        if (formId() !== task.id) {
          if (Date.now() - (run.navigateAt || run.startedAt) > 12000) {
            throw Error('Could not navigate to '+task.name+'. Nothing was saved for this item.');
          }
          return; // The requested route is still navigating.
        }
        const currentRun = () => {
          const live = readRopes();
          return live?.stage === 'form' && live?.index === run.index &&
            inspectionId() === ROPE_UNIT_ID && formId() === task.id;
        };
        notify('Loading Thursday rope draft '+(run.index+1)+'/3: '+task.name);
        await waitForRopeForm(task,currentRun);
        if (!currentRun()) throw Error('Rope form changed during verification.');
        prepareRopeDraft(task,currentRun);
        notify('Save In Process clicked for '+task.name+
          '. Waiting for unit-list confirmation, not submitting.');
        return;
      }
      if (run.stage !== 'receipt' || !run.savedClickAt) {
        throw Error('Unexpected Thursday rope draft transaction stage.');
      }
      if (isGroupPage() && ropeSavedOnGroup(task)) {
        const confirmed = [...(run.confirmed || []),task.id];
        if (run.index + 1 >= ROPE_TASKS.length) {
          clearRopes();
          const message = 'All 3 Thursday rope drafts: Saved in Process confirmed on unit list. ' +
            'Physically inspect every item and submit manually only after verification.';
          sessionStorage.setItem(ROPE_RESULT,message);
          notify(message);
          return;
        }
        const next = ROPE_TASKS[run.index+1];
        writeRopes({...run,index:run.index+1,confirmed,
          stage:'form',navigateAt:Date.now(),savedClickAt:null});
        notify('Saved '+confirmed.length+'/3 rope drafts. Opening '+next.name+'...');
        location.assign('/inspections/'+ROPE_UNIT_ID+'/questionaries/'+next.id);
        return;
      }
      if (Date.now()-run.savedClickAt > 22000) {
        throw Error('Save In Process was clicked for '+task.name+
          ', but the unit-list receipt was not verified.');
      }
    } catch (error) {
      finishRopesWithError(error,readRopes() || run);
    } finally {
      ropeBusy = false;
    }
  }

  function applyTextarea(field, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (!setter) throw Error('Textarea controls unavailable.');
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  async function prepare(kind) {
    const verified = validateForm(kind); // Checks layout BEFORE changing any answer.
    for (const [number, record] of verified.radioMap) {
      const chosen = kind === 'weekly' && number === 7 ?
        record.choices.find(c => c.value === 'Not needed') : record.choices[0];
      if (!chosen) throw Error('Expected option not available at question ' + number);
      if (!chosen.checked) chosen.click();
      if (!chosen.checked) throw Error('Question ' + number + ' did not accept the draft answer.');
    }
    if (kind === 'weekly') {
      for (let i = 1; i <= 23; i++) {
        const item = verified.textMap.get(i);
        if (!item) continue;
        const desired = i <= 3 ? '' : '110';
        if (item.textarea.value !== desired) applyTextarea(item.textarea, desired);
        if (item.textarea.value !== desired) throw Error('Field ' + i + ' did not accept its draft value.');
      }
    }
    await new Promise(resolve => setTimeout(resolve, 220));
    // The only submission-related action used by Rebel IQ.
    verified.save.click();
    return TASKS[kind].name + ': Save In Process clicked. Confirm orange Saved in Process status.';
  }

  async function runPending() {
    const pending = readPending();
    if (!pending || busy) return;
    if (inspectionId() !== pending.unitId) {
      clearPending();
      notify('Inspection ID changed. Stopped without editing another inspection.', true);
      return;
    }
    if (!t504Visible()) return;
    const task = TASKS[pending.kind];
    if (formId()) {
      if (!clean(document.body.innerText).includes(task.name)) {
        notify('Wrong questionnaire open. No answers changed.', true);
      captureIqError('Unexpected questionnaire route', pending.kind + ':wrong-form');
        return;
      }
      busy = true;
      try {
        notify('Waiting for the complete T504 questionnaire to load...');
        const originalPath = location.pathname;
        await waitForIqForm(pending.kind, () =>
          location.pathname === originalPath &&
          inspectionId() === pending.unitId &&
          readPending()?.kind === pending.kind);
        notify('Form loaded and verified. Preparing draft...');
        const result = await prepare(pending.kind);
        sessionStorage.setItem(RESULT, result);
        notify(result);
      } catch (error) {
        notify('Stopped safely: ' + error.message, true);
        captureIqError(error, pending.kind + ':prepare');
      } finally {
        clearPending();
        busy = false;
      }
      return;
    }
    if (!isGroupPage()) return;
    if (pending.stage === 'form') return;
    if (++attempts > 8) {
      clearPending();
      notify('Could not locate questionnaire. Open it manually; no answers were changed.', true);
      captureIqError('Questionnaire navigation did not settle', pending.kind + ':navigation');
      return;
    }
    const leaf = [...document.querySelectorAll('h1,h2,h3,h4,h5,span,div,p,button,a')]
      .filter(node => visible(node) && !node.closest('#' + PANEL) &&
        clean(node.textContent) === task.name)
      .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0];
    if (!leaf) return;
    writePending({ ...pending, stage: 'form' });
    notify('Opening ' + task.name + '...');
    leaf.click();
    setTimeout(() => {
      // If Angular did not navigate, allow a single retry in the list.
      const current = readPending();
      if (current && isGroupPage() && current.stage === 'form') {
        writePending({ ...current, stage: 'list' });
      }
    }, 1800);
  }

  function tick() {
    if (!document.body) return;
    if (!document.getElementById(PANEL)) makeUi();
    if (location.pathname !== lastRoute) {
      lastRoute = location.pathname;
      attempts = 0;
    }
    refreshAssetReviewGuide();
    const assetFollowup = readAssetFollowup();
    if (assetFollowup?.stage === 'assets_opening' && isAssetPage() &&
        t504Visible() && /Asset Requirements/i.test(document.body.innerText || '')) {
      clearAssetFollowup();
      const message = 'Daily Tour draft saved. T504 Asset Requirements is ready for physical verification. No asset has been marked checked by Rebel IQ.';
      sessionStorage.setItem(RESULT, message);
      notify(message);
    } else if (assetFollowup?.stage === 'assets_opening' &&
        now() - (assetFollowup.requestedAt || assetFollowup.startedAt) > 25000) {
      clearAssetFollowup();
      notify('Daily Tour draft saved, but Asset Requirements did not open. Use Asset Checks to open it manually.', true);
    } else if (!assetFollowup && sessionStorage.getItem(ASSET_FOLLOWUP_KEY)) {
      clearAssetFollowup();
    }
    const ropeRun = readRopes();
    if (ropeRun) {
      void runRopes().catch(error => finishRopesWithError(error, readRopes()));
    } else if (sessionStorage.getItem(ROPE_KEY)) {
      clearRopes();
      notify('Thursday rope draft run expired before completion. Confirm existing saved drafts before retrying.', true);
    }
    if (!ropeRun && readPending()) void runPending().catch(error => {
      clearPending();
      captureIqError(error, 'navigation');
      notify('Stopped safely: ' + scrubError(error?.message || error), true);
    });
    else if (sessionStorage.getItem(KEY)) clearPending();
    const result = sessionStorage.getItem(RESULT);
    if (result && isGroupPage() && t504Visible()) {
      const task = result.startsWith(TASKS.daily.name) ? TASKS.daily : TASKS.weekly;
      const card = [...document.querySelectorAll('div,article,a,button')]
        .filter(el => visible(el) && !el.closest('#' + PANEL) &&
          clean(el.textContent).startsWith(task.name) &&
          clean(el.textContent).includes('Saved in Process'))
        .sort((a, b) => clean(a.textContent).length - clean(b.textContent).length)[0];
      if (card) {
        const followup = readAssetFollowup();
        if (task === TASKS.daily && followup?.stage === 'await_daily_save' &&
            followup.unitId === inspectionId()) {
          writeAssetFollowup({...followup, stage: 'assets_opening', requestedAt: now()});
          sessionStorage.setItem(RESULT, task.name + ': Saved in Process confirmed. Opening Asset Requirements for physical verification.');
          notify('Daily Tour saved in process. Opening the separate asset-verification step, without marking any assets checked.');
          location.assign(assetUrl(followup.unitId));
          return;
        }
        sessionStorage.setItem(RESULT, task.name + ': Saved in Process confirmed. Verify on phone before submission.');
        notify(task.name + ': Saved in Process confirmed. Verify at truck.');
      }
    }
  }
  // Only capture global errors that identify Rebel IQ itself.
  window.addEventListener('error', event => {
    const source = String(event.filename || '') + ' ' + String(event.error?.stack || '');
    if (/rebel-iq(?:\.user)?\.js/i.test(source)) {
      captureIqError(event.error || event.message, 'runtime');
    }
  });
  window.addEventListener('unhandledrejection', event => {
    if (/rebel-iq(?:\.user)?\.js/i.test(String(event.reason?.stack || ''))) {
      captureIqError(event.reason, 'unhandled-promise');
    }
  });
  setInterval(() => {
    try { tick(); } catch (error) { captureIqError(error, 'ui'); }
  }, 700);
  setInterval(() => { void flushIqErrors(); }, 5 * 60 * 1000);
  try { tick(); } catch (error) { captureIqError(error, 'startup'); }
  if (readIqErrors().length) void flushIqErrors();
})();