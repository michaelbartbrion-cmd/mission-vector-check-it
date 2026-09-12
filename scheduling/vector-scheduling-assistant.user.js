// ==UserScript==
// @name         Mission Vector Check It - Vector Scheduling DEV Bootstrap
// @namespace    mission-vector-check-it-scheduling
// @version      0.4.1-dev
// @description  Bootstrap/update shell for the Vector Scheduling development assistant.
// @homepageURL  https://github.com/michaelbartbrion-cmd/mission-vector-check-it
// @supportURL   https://github.com/michaelbartbrion-cmd/mission-vector-check-it/issues
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-assistant.user.js
// @match        https://crewsense.com/*
// @match        https://*.crewsense.com/*
// @require      https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/rotation-engine.js
// @require      https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/horizon-planner.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  const VERSION='0.4.1-dev';
  const UPDATE_URL='https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-assistant.user.js';
  const KEY='missionVectorScheduling_v3';
  const Engine=window.VectorSchedulingEngine;
  if(!Engine){console.error('Vector Scheduling engine did not load.');return;}
  if(window.__mvciVectorScheduling)return;
  window.__mvciVectorScheduling={version:VERSION};
  const defaultState={settings:{apparatusName:'Truck 504',firefighters:[],command:[],balanceStartDate:null,balanceEndDate:null,blockDays:2},history:[],plans:[],observations:[],segments:[]};
  let state=(()=>{try{return {...defaultState,...JSON.parse(localStorage.getItem(KEY)||'{}'),settings:{...defaultState.settings,...(JSON.parse(localStorage.getItem(KEY)||'{}').settings||{})}}}catch{return structuredClone(defaultState)}})();
  const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const person=id=>[...(state.settings.firefighters||[]),...(state.settings.command||[])].find(p=>p.id===id)||{name:id};
  const ffids=()=>state.settings.firefighters.map(p=>p.id);
  const stats=()=>Engine.statsFromHistory(state.history,ffids(),state.settings.balanceStartDate||null,state.settings.balanceEndDate||null);
  function installStyle(){if(document.getElementById('mvci-vs-style'))return;const s=document.createElement('style');s.id='mvci-vs-style';s.textContent='#mvci-vs-open{position:fixed;right:18px;bottom:18px;z-index:2147483646;width:58px;height:58px;border:0;border-radius:50%;background:#17365d;color:white;font:bold 14px Arial;cursor:pointer;box-shadow:0 3px 12px #0006}#mvci-vs-panel{position:fixed;right:0;top:0;width:min(520px,97vw);height:100vh;z-index:2147483647;background:#f7f9fc;font:13px Arial;box-shadow:-4px 0 16px #0004;padding:0;overflow:auto}.vs-head{display:flex;gap:8px;align-items:center;background:#17365d;color:#fff;padding:12px}.vs-head strong{flex:1}.vs-btn{padding:7px 10px;border:1px solid #315a88;border-radius:5px;background:#315a88;color:white;cursor:pointer}.vs-update{background:#f0b429;border-color:#f0b429;color:#111;font-weight:bold}.vs-card{background:#fff;border:1px solid #d8e0e9;border-radius:8px;padding:10px;margin:10px}.vs-table{width:100%;border-collapse:collapse;font-size:12px}.vs-table th,.vs-table td{border-bottom:1px solid #e2e7ed;padding:5px;text-align:left}.vs-input{width:100%;padding:6px;border:1px solid #aebdce;border-radius:5px;box-sizing:border-box}.vs-muted{font-size:11px;color:#687787}';document.head.appendChild(s)}
  function openPanel(){installStyle();let p=document.getElementById('mvci-vs-panel');if(!p){p=document.createElement('div');p.id='mvci-vs-panel';document.body.appendChild(p)}const s=stats();p.innerHTML='<div class="vs-head"><strong>Vector Scheduling DEV '+VERSION+'</strong><button class="vs-btn vs-update" id="vs-update">↻ UPDATE</button><button class="vs-btn" id="vs-close">×</button></div><div class="vs-card"><h3>Confirmed rotation</h3>'+(ffids().length?'<table class="vs-table"><tr><th>Firefighter</th>'+Engine.CREDIT_CATEGORIES.map(c=>'<th>'+c+'</th>').join('')+'<th>Total</th></tr>'+ffids().map(id=>'<tr><td><b>'+esc(person(id).name)+'</b></td>'+Engine.CREDIT_CATEGORIES.map(c=>'<td>'+(((s[id]?.ratios?.[c]||0)*100).toFixed(1))+'%</td>').join('')+'<td>'+(s[id]?.total||0)+'</td></tr>').join('')+'</table>':'<div>Import the private Truck 504 JSON below.</div>')+'</div><div class="vs-card"><h3>Import private data</h3><input class="vs-input" id="vs-import" type="file" accept=".json,application/json"><div class="vs-muted" style="margin-top:6px">This bootstrap keeps the updater in place while we validate the live Vector page. Plans, verification, and partial-day features will update through the same button.</div></div><div class="vs-card"><h3>Partial-day rule now reserved</h3><div>Partial TADE/Tiller/etc. will be stored as exact hours and kept separate from full-shift rotation credit. Two-shift seat continuity remains the default whenever staffing permits.</div></div>';
    p.querySelector('#vs-close').onclick=()=>p.remove();
    p.querySelector('#vs-update').onclick=()=>window.open(UPDATE_URL,'_blank','noopener');
    p.querySelector('#vs-import').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const x=JSON.parse(await f.text());if(x.settings)state.settings={...state.settings,...x.settings};for(const k of ['history','plans','observations','segments'])if(Array.isArray(x[k]))state[k]=x[k];save();alert('Imported '+f.name);openPanel()}catch(err){alert('Import failed: '+err.message)}};
  }
  function init(){installStyle();if(document.getElementById('mvci-vs-open'))return;const b=document.createElement('button');b.id='mvci-vs-open';b.textContent='VS';b.title='Vector Scheduling DEV';b.onclick=openPanel;document.body.appendChild(b)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();