// ==UserScript==
// @name         Rebel IQ - T504
// @namespace    mission-vector-check-it-rebel-fleet
// @version      0.1.0
// @description  Prepare T504 daily and weekly Operative IQ inspection drafts, save in process, never submit.
// @match        https://fmfd.operativeiqfrontline.com/*
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/rebel-iq.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/rebel-iq.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__rebelIqT504) return;
  window.__rebelIqT504 = { version: '0.1.0' };
  const KEY = 'rebelIqT504PendingV1';
  const RESULT = 'rebelIqT504ResultV1';
  const PANEL = 'rebel-iq-t504-panel';
  const TASKS = {
    daily: { name: '63000-13 Tour Check', count: 41 },
    weekly: { name: 'Weekly 63000-13 Check', count: 12 }
  };
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
    toggle.textContent = 'RIQ';
    toggle.title = 'Rebel IQ - Truck 504';
    toggle.setAttribute('aria-label', 'Open Rebel IQ');
    toggle.style.cssText = 'display:block;margin-left:auto;width:60px;height:60px;border-radius:50%;border:3px solid #c9ddea;background:#123c56;color:#fff;font:bold 16px Arial;box-shadow:0 4px 18px #123c5680;cursor:pointer;';
    menu = document.createElement('div');
    menu.style.cssText = 'display:none;width:285px;max-width:calc(100vw - 40px);margin-bottom:9px;padding:13px;background:#fff;border:2px solid #163c58;border-radius:12px;box-shadow:0 7px 26px #10324855;';
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
    const button = (text, kind) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = text;
      el.style.cssText = 'width:100%;border:0;border-radius:7px;background:#176b8e;color:#fff;cursor:pointer;text-align:left;padding:11px;margin:4px 0;font:bold 13px Arial;';
      el.onclick = () => begin(kind);
      return el;
    };
    menu.append(label, help, button('Daily Tour: Save In Process', 'daily'),
      button('Weekly: Save In Process', 'weekly'), detail);
    toggle.onclick = () => { opened = !opened; menu.style.display = opened ? 'block' : 'none'; };
    root.append(menu, toggle);
    document.body.appendChild(root);
    const prior = sessionStorage.getItem(RESULT);
    if (prior) notify(prior);
  }

  function begin(kind) {
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

  const questionNumber = container => {
    const text = clean(container?.innerText || '');
    const match = text.match(/^(\d+)\s*\./);
    return match ? Number(match[1]) : null;
  };
  const questionName = container => {
    const text = (container?.innerText || '').split(/\r?\n/).map(clean).filter(Boolean);
    return clean(text.slice(1, 3).filter(part => part !== '*').join(' '));
  };
  function validateForm(kind) {
    const task = TASKS[kind];
    if (!formId() || !t504Visible() || !clean(document.body.innerText).includes(task.name)) {
      throw Error('This page is not the T504 ' + task.name + ' questionnaire.');
    }
    const groups = [...document.querySelectorAll('.form-group')]
      .filter(group => group.querySelector('mat-radio-group'));
    if (groups.length !== task.count) throw Error('Unexpected questionnaire layout: found ' +
      groups.length + ' choices, expected ' + task.count + '. Nothing was saved.');
    const radioMap = new Map();
    for (const group of groups) {
      const number = questionNumber(group);
      const choices = [...group.querySelectorAll('mat-radio-group input[type="radio"]')];
      if (!number || !choices.length || radioMap.has(number)) throw Error('Duplicate or missing radio question.');
      radioMap.set(number, { group, choices });
    }
    const textMap = new Map();
    for (const textarea of document.querySelectorAll('.form-group textarea.text-qs-input')) {
      const group = textarea.closest('.form-group'), number = questionNumber(group);
      if (!number || textMap.has(number)) throw Error('Invalid numeric field mapping.');
      textMap.set(number, { group, textarea });
    }
    if (kind === 'daily') {
      if (textMap.size !== 0 || radioMap.size !== 41 ||
        !/Fuel/i.test(questionName(radioMap.get(1)?.group)) ||
        !/Hand Tools/i.test(questionName(radioMap.get(41)?.group))) {
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
        return;
      }
      busy = true;
      try {
        notify('Checking all fields before preparing draft...');
        const result = await prepare(pending.kind);
        sessionStorage.setItem(RESULT, result);
        notify(result);
      } catch (error) {
        notify('Stopped safely: ' + error.message, true);
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
    if (readPending()) void runPending();
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
  setInterval(tick, 700);
  tick();
})();
