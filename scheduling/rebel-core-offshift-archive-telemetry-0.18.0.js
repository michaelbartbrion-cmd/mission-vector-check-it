(function () {
  'use strict';

  const VERSION = '0.18.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const CONFIG_KEY = 'missionVectorRebelCorePairing_v1';
  const SENT_KEY = 'missionVectorRebelCoreOffshiftArchiveSent_v1';
  const MAX_BATCH = 25;

  if (window.top !== window.self || window.__mvciRebelCoreOffshiftArchive0180) return;
  window.__mvciRebelCoreOffshiftArchive0180 = { version: VERSION, startedAt: Date.now() };

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const nowIso = () => new Date().toISOString();

  function loadJson(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
  }
  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }
  function pairing() {
    const cfg = loadJson(CONFIG_KEY, null);
    if (!cfg?.endpoint || !cfg?.token || !/^https:\/\//i.test(cfg.endpoint)) return null;
    return cfg;
  }
  function state() { return loadJson(STATE_KEY, null); }
  function sentMap() { const m=loadJson(SENT_KEY,{}); return m&&typeof m==='object'?m:{}; }

  async function post(events) {
    const cfg=pairing();
    if(!cfg) return { ok:false, paired:false };
    const list=Array.isArray(events)?events:[events];
    if(!list.length) return { ok:true, accepted:0, failed:0 };
    const response=await fetch(cfg.endpoint,{
      method:'POST',mode:'cors',credentials:'omit',
      headers:{'content-type':'application/json','x-rebel-device-key':cfg.token},
      body:JSON.stringify(list.length===1?list[0]:{events:list}),
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok||body?.ok===false) throw new Error(clean(body?.error||body?.detail||`HTTP ${response.status}`));
    return body;
  }

  function mapStatus(status) {
    if(status==='complete') return 'success';
    if(status==='running') return 'running';
    if(status==='stopped-error') return 'error';
    if(status==='stopped-user') return 'stopped';
    return 'partial';
  }

  function rows() {
    const s=state();
    const runs=Array.isArray(s?.activityArchiveRuns)?s.activityArchiveRuns:[];
    return runs.filter(r=>r?.id).map(r=>({
      id:r.id,
      revision:JSON.stringify([r.status,r.captures,r.activityDates,r.summaryRows,r.segmentRows,r.lastCapturedDate,r.error,r.updatedAt,r.completedAt,r.stoppedAt]),
      event:{
        kind:'sync_run',
        sync_key:`vector-scheduling-offshift:${r.id}`,
        source:'Vector Scheduling Off-shift Archive',
        target:'Rebel Core',
        status:mapStatus(r.status),
        started_at:r.startedAt||nowIso(),
        completed_at:r.completedAt||r.stoppedAt||undefined,
        records_seen:Number(r.captures||0),
        records_created:Number(r.segmentRows||0),
        records_updated:0,
        records_skipped:0,
        error_message:clean(r.error),
        details:{
          scope:'off-shift-only',
          startDate:r.startDate,
          startingDate:r.startingDate,
          expectedDates:r.expectedDates,
          lastCapturedDate:r.lastCapturedDate,
          activityDates:Number(r.activityDates||0),
          summaryRows:Number(r.summaryRows||0),
          segmentRows:Number(r.segmentRows||0),
          anchorDay1:r.anchorDay1,
          anchorDay2:r.anchorDay2,
        },
      },
    }));
  }

  async function syncRuns() {
    if(!pairing()) return { paired:false, sent:0 };
    const sent=sentMap();
    const pending=rows().filter(r=>sent[r.id]!==r.revision);
    let count=0;
    for(let i=0;i<pending.length;i+=MAX_BATCH){
      const batch=pending.slice(i,i+MAX_BATCH);
      const result=await post(batch.map(r=>r.event));
      if(Number(result?.failed||0)>0) throw new Error(`Rebel Core rejected ${result.failed} off-shift archive run update(s).`);
      for(const row of batch) sent[row.id]=row.revision;
      saveJson(SENT_KEY,sent);
      count+=batch.length;
    }
    const s=state();
    const latest=(Array.isArray(s?.activityArchiveRuns)?s.activityArchiveRuns:[]).slice(-1)[0];
    await post({
      kind:'heartbeat',
      program_key:'vector-scheduling',
      program_name:'Vector Scheduling',
      program_category:'scheduling',
      connection_key:'vector-scheduling-offshift-archive',
      name:'Vector Scheduling Off-shift Archive',
      type:'vector',
      component:'off-shift activity collector',
      status:latest?.status==='stopped-error'?'error':'connected',
      version:VERSION,
      source:'Vector Scheduling',
      occurred_at:nowIso(),
      details:latest ? `Latest off-shift archive: ${latest.status || 'unknown'}; ${Number(latest.captures||0)} off-days checked; ${Number(latest.activityDates||0)} date(s) with operational activity.` : 'Off-shift activity collector is loaded and has not run yet.',
      error_message:clean(latest?.error),
    });
    return { paired:true, sent:count };
  }

  setTimeout(()=>{ if(pairing()) syncRuns().catch(()=>{}); },10000);
  setInterval(()=>{ if(pairing()) syncRuns().catch(()=>{}); },120000);
  window.MVCI_REBEL_CORE_OFFSHIFT_ARCHIVE_0180={version:VERSION,syncRuns,rows};
})();
