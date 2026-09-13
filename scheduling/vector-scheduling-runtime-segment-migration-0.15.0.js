(function () {
  'use strict';

  const VERSION = '0.15.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const CSHIFT_ANCHOR = '2026-09-10';
  const MIGRATION_KEY = 'precision-segments-existing-v0150';
  const timeRangeRe = /\b\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\b/;
  const navNoiseRe = /CallBack(?:™)?\s+Board|My\s+Personal\s+Calendar|My\s+Time\s+Off\s+Bank|My\s+Personnel\s+File|My\s+Certifications|Set\s+Availability|Edit\s+Profile|My\s+Devices|Log-?Out/i;

  if (window.top !== window.self || window.__mvciSegmentMigration0150) return;
  window.__mvciSegmentMigration0150 = { version: VERSION, startedAt: Date.now() };

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const escRe = v => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const uid = (...parts) => parts.map(v => clean(v).toLowerCase()).join('|');

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); }
    catch (_) { return null; }
  }
  function saveState(s) {
    if (!s) return;
    s.metadata = s.metadata || {};
    s.metadata.updatedAt = new Date().toISOString();
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  }
  function people(s) { return [...(s?.settings?.firefighters || []), ...(s?.settings?.command || [])]; }
  function personKind(s, id) { return people(s).find(p => p.id === id)?.kind || 'other'; }
  function dayDiff(date) {
    const a = new Date(`${CSHIFT_ANCHOR}T12:00:00Z`), b = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
  }
  function cShiftInfo(date) {
    const diff = dayDiff(date); if (diff == null) return { isCShift:false, day:null };
    const mod = ((diff % 6) + 6) % 6;
    return mod === 0 ? {isCShift:true,day:1} : mod === 1 ? {isCShift:true,day:2} : {isCShift:false,day:null};
  }
  function valid(row) {
    if (!row?.found) return false;
    const text = clean(row.rawText);
    if (!text || !timeRangeRe.test(text)) return false;
    if (navNoiseRe.test(text) && !timeRangeRe.test(text)) return false;
    return true;
  }
  function roleHint(s, o, dutyCode, raw) {
    const kind = personKind(s, o.personId);
    const group = clean(o.assignmentGroup || o.assignment);
    const code = clean(dutyCode).toUpperCase();
    const text = clean(raw).toUpperCase();
    if (kind === 'firefighter') {
      if (group && !/^TRUCK\s+504$/i.test(group)) {
        if (/DEPLOYMENT/i.test(group)) return 'Deployment';
        if (/EMPLOYEES\s+OFF/i.test(group)) return 'Off';
        if (/TRAINING/i.test(group)) return 'Training';
        if (/^(TRUCK|ENGINE|MEDIC|QUINT)\s+\d+$/i.test(group)) return 'Swing';
      }
      if (/\bTADE\b/.test(text) || /^DE(?:-A)?$/.test(code) || /\bDE(?:-A)?\b/.test(text)) return 'TADE';
      if (code === 'TM' || /\bTM\b/.test(text)) return 'Tiller';
      if (/^FF(?:A|B)?$/.test(code) || /\bFF(?:A|B)?\b/.test(text)) return 'Firefighter';
      return 'Unknown';
    }
    if (code === 'TAC' || /\bTAC\b/.test(text)) return 'Temporary Captain';
    if (/\bCAPT\b/.test(text)) return 'Captain';
    if (/^DE(?:-A)?$/.test(code) || /\bDE(?:-A)?\b/.test(text)) return 'Engineer';
    return 'Unknown';
  }
  function pattern(name) {
    return new RegExp(`${escRe(name)}\\s+(.{0,260}?)(\\d{1,2}:\\d{2})\\s*-\\s*(\\d{1,2}:\\d{2})\\s+(\\d+(?:\\.\\d+)?)\\s*hrs?(?:\\s+(\\d+)\\s*min)?\\b`, 'ig');
  }
  function extract(s, o) {
    if (!valid(o) || !o.personName || !o.date) return [];
    const corpus = clean(o.contextText && o.contextText.toLowerCase().includes(o.personName.toLowerCase()) ? o.contextText : o.rawText);
    if (!corpus) return [];
    const re = pattern(o.personName), out = []; let m, index = 0;
    while ((m = re.exec(corpus))) {
      index++;
      const details = clean(m[1]), startTime = m[2], endTime = m[3];
      const durationHours = Number(m[4]) + Number(m[5] || 0) / 60;
      const rawText = clean(`${o.personName} ${details} ${startTime} - ${endTime} ${m[4]} hrs${m[5] ? ` ${m[5]} min` : ''}`);
      const dutyCode = window.VectorSchedulingEngine?.detectDutyCode?.(rawText) || null;
      const c = cShiftInfo(o.date), hint = roleHint(s, o, dutyCode, rawText);
      out.push({
        segmentKey: uid(o.date,o.personId,o.assignmentGroup,startTime,endTime,dutyCode,hint,index),
        date:o.date, personId:o.personId, personName:o.personName, capturedAt:o.capturedAt,
        assignmentGroup:o.assignmentGroup || o.assignment || null, startTime,endTime,durationHours,dutyCode,roleHint:hint,
        isCShift:c.isCShift,cShiftDay:c.day,rawText,
        sourceObservationKey:uid(o.date,o.personId,o.capturedAt,o.source), source:'vector-segment-migration-v0150',
        verified:o.captureQuality==='row+group' && durationHours>0, sequenceIndex:index,
      });
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return out;
  }
  function runMigration(force=false) {
    const s = loadState(); if (!s) return { migrated:false, segments:0, rejected:0 };
    s.metadata = s.metadata || {};
    if (!force && s.metadata.segmentMigrationKey === MIGRATION_KEY) return { migrated:false, segments:Number(s.metadata.segmentMigrationCount||0), rejected:Number(s.metadata.segmentMigrationRejected||0) };
    const latest = new Map();
    for (const o of (s.observations || [])) {
      if (!o?.date || !o?.personId) continue;
      const key = `${o.date}|${o.personId}`, prev = latest.get(key);
      if (!prev || String(o.capturedAt||'') > String(prev.capturedAt||'')) latest.set(key,o);
    }
    let rejected=0; const migrated=[];
    for (const o of latest.values()) {
      if (o.found && !valid(o)) {
        rejected++;
        o.found=false; o.rawText=''; o.dutyCode=null; o.assignment=null; o.assignmentGroup=null; o.contextText='';
        o.captureQuality='rejected-non-operational-row'; o.hardeningVersion=VERSION;
        continue;
      }
      migrated.push(...extract(s,o));
    }
    s.segments = Array.isArray(s.segments) ? s.segments : [];
    for (const segment of migrated) {
      const i=s.segments.findIndex(x=>x.segmentKey===segment.segmentKey);
      if(i>=0)s.segments[i]=segment; else s.segments.push(segment);
    }
    s.metadata.segmentMigrationKey=MIGRATION_KEY;
    s.metadata.segmentMigrationAt=new Date().toISOString();
    s.metadata.segmentMigrationCount=migrated.length;
    s.metadata.segmentMigrationRejected=rejected;
    saveState(s);
    return {migrated:true,segments:migrated.length,rejected};
  }

  const result=runMigration(false);
  console.info('Vector Scheduling precision history migration', result);
  window.MVCI_VECTOR_SEGMENT_MIGRATION_0150={version:VERSION,runMigration};
})();
