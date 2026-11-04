// ==UserScript==
// @name         Rebel IQ - T504
// @namespace    mission-vector-check-it-rebel-fleet
// @version      0.1.6
// @description  Prepare T504 daily and weekly Operative IQ inspection drafts, save in process, never submit.
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
  window.__rebelIqT504 = { version: '0.1.6' };
  // Minimal RC diagnostics: only stage, redacted error, URL path, version.
  // Never transmit form answers, notes, asset readings, or login credentials.
  const IQ_VERSION = '0.1.6';
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
  const inspectionId = () => location.pathname.match(/\/inspections\/(\d+)\//)?.[1] || '';
  const formId = () => location.pathname.match(/\/questionaries\/(\d+)\/?$/)?.[1] || '';
  const isGroupPage = () => /\/questionaries\/group\/\d+\/?$/.test(location.pathname);
  const listUrl = id => '/inspections/' + id + '/questionaries/group/0';
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
    detail.style.color = error ? '#9f2828' : '#205b48';
  };

  function makeUi() {
    if (document.getElementById(PANEL)) return;
    root = document.createElement('div');
    root.id = PANEL;
    root.style.cssText = 'position:fixed;right:22px;bottom:24px;z-index:2147483645;font:13px/1.4 Arial,sans-serif;color:#143650;';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.innerHTML = rebelStarbirdIcon;
    toggle.title = 'Rebel IQ - Truck 504';
    toggle.setAttribute('aria-label', 'Open Rebel IQ');
    toggle.style.cssText = 'display:flex;align-items:center;justify-content:center;' +
      'width:54px;height:54px;border-radius:50%;border:2px solid #1b5a7a;' +
      'background:#fff;color:#153e5c;box-shadow:0 5px 18px rgba(13,50,72,.28);' +
      'padding:0;margin:0;cursor:pointer;flex:none;';
    menu = document.createElement('div');
    menu.style.cssText = 'display:none;width:315px;max-width:calc(100vw - 40px);' +
      'padding:13px;background:#fff;border:2px solid #163c58;border-radius:12px;' +
      'box-shadow:0 7px 26px #10324855;';
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px;';
    label = document.createElement('div');
    label.textContent = 'REBEL IQ  |  T504';
    label.style.cssText = 'font:bold 16px Arial;color:#163c58;margin-bottom:5px;';
    const help = document.createElement('div');
    help.textContent = 'Prepare an UNVERIFIED draft. Physically inspect the truck and correct answers before you submit from your phone.';
    help.style.cssText = 'font:12px/1.45 Arial;color:#546b79;margin:4px 0 10px;';
    detail = document.createElement('div');
    detail.setAttribute('role', 'status');
    detail.style.cssText = 'font:11px/1.5 Arial;margin:8px 0 2px;color:#205b48;';
    detail.textContent = 'Open T504 Unit Inspection first.';
    rcStatusEl = document.createElement('div');
    rcStatusEl.style.cssText = 'font:11px/1.5 Arial;color:#536c77;margin:7px 0 0;';
    setRcStatus(readIqErrors().length ?
      readIqErrors().length + ' error(s) pending delivery' : 'no errors queued');
    const button = (text, kind) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = text;
      el.style.cssText = 'width:100%;border:0;border-radius:7px;background:#176b8e;color:#fff;cursor:pointer;text-align:left;padding:11px;margin:4px 0;font:bold 13px Arial;';
      el.onclick = () => kind === 'ropes' ? beginRopes() : begin(kind);
      return el;
    };
    header.append(label);
    const update = document.createElement('a');
    update.href = 'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/rebel-iq.user.js';
    update.textContent = 'Check for Update · v0.1.6';
    update.target = '_blank';
    update.rel = 'noopener noreferrer';
    update.style.cssText = 'display:block;text-align:center;padding:9px;margin-top:8px;' +
      'border:1px solid #9ebdcc;border-radius:7px;background:#edf4f8;color:#163c58;' +
      'font:bold 12px Arial;text-decoration:none;cursor:pointer;';
    menu.append(header, help, button('Daily Tour: Save In Process', 'daily'),
      button('Weekly: Save In Process', 'weekly'),
      button('Thursday Rope Checks (3): Save In Process', 'ropes'),
      update, detail, rcStatusEl);
    const setExpanded = (expanded) => {
      opened = expanded;
      menu.style.display = expanded ? 'block' : 'none';
      toggle.setAttribute('aria-label', expanded ? 'Minimize Rebel IQ' : 'Open Rebel IQ');
      toggle.title = expanded ? 'Minimize Rebel IQ' : 'Rebel IQ - Truck 504';
      if (expanded) {
        header.append(toggle); // One Rebel icon, now in panel header as minimize control.
      } else {
        root.append(toggle); // Same Rebel icon, bottom-right 54 px circle.
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
      const headings = [...raw.matchAll(/(?:^|\n)\s*(\d{1,2})\s*\.\s*[A-Za-z]/g)]
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
    form.save.click(); // Not Submit. Physical inspection remains the firefighter's responsibility.
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
      if (!task || inspectionId() !== ROPE_UNIT_ID || !t504Visible()) {
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
    if (readPending()) void runPending().catch(error => {
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
