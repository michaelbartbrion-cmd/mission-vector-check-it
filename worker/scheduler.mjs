// Mission Vector Check It: portable, rate-limited LOCAL work arbiter.
// Does not authenticate to Vector or CrewSense and cannot submit inspections.
import { randomUUID } from 'node:crypto';

export const POLICY=Object.freeze({
  idlePollMs:20_000,
  heartbeatTtlMs:90_000,
  staffingLeaseMs:20*60_000,
  ppeLeaseMs:20*60_000,
  staffingRetryMs:45*60_000,
  ppeRetryMs:20*60_000,
  ppeMinGapMs:9*60_000,
  ppeDailyLimit:90
});
export function chicagoClock(now=new Date()){
  const fields=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(now).map(x=>[x.type,x.value]));
  const date=`${fields.year}-${fields.month}-${fields.day}`;
  const minutes=Number(fields.hour)*60+Number(fields.minute);
  const day=new Date(date+'T12:00:00Z');
  if(minutes<7*60)day.setUTCDate(day.getUTCDate()-1);
  return{date,opDate:day.toISOString().slice(0,10),minutes,
    slot:minutes>=13*60?'midday':'turnover'};
}
export function initialState(){
  return{schema:1,startedAt:new Date().toISOString(),lease:null,
    staffing:{},ppe:{},events:[],seq:0};
}
const dateAsMillis=x=>Number.isFinite(Date.parse(x||''))?
  Date.parse(x):0;
export function currentTask(state,now=Date.now()){
  const a=state.lease;
  return a&&a.deadlineMs>now?a:null;
}
function appendEvent(state,event){
  state.events.push({at:new Date(event.atMs||Date.now()).toISOString(),
    role:event.role,event:event.event,detail:String(event.detail||'').slice(0,180)});
  state.events=state.events.slice(-80);
}
export function retireExpiredLease(state,now=Date.now()){
  const l=state.lease;
  if(!l||l.deadlineMs>now)return false;
  state.lease=null;
  const role=state[l.role];
  role.lastFailureMs=now;
  role.lastFailure='Deadline exceeded; source confirmation missing';
  appendEvent(state,{atMs:now,role:l.role,event:'timeout'});
  return true;
}
export function eligible(state,role,tab,now=new Date()){
  if(!['staffing','ppe'].includes(role))return{allowed:false,why:'invalid_role'};
  const at=now.getTime(), clock=chicagoClock(now),lane=state[role]||{};
  if(currentTask(state,at))return{allowed:false,why:'one_global_lease_active'};
  if(!tab||tab.role!==role||tab.ready!==true||tab.dedicated!==true||
      at-Number(tab.seenAtMs)>POLICY.heartbeatTtlMs)
    return{allowed:false,why:'authenticated_dedicated_tab_offline'};
  if(tab.busy===true)return{allowed:false,why:'browser_busy'};
  if(clock.minutes>=7*60&&clock.minutes<7*60+5)
    return{allowed:false,why:'shift_change_settling'};
  if(role==='staffing'){
    const slot=clock.minutes>=13*60?'midday':'turnover';
    const day=clock.opDate;
    if(lane.lastSuccessDate===day &&
        (slot==='turnover'||lane.lastSuccessSlot==='midday'))
      return{allowed:false,why:'daily_capture_already_satisfied'};
    if(at-Number(lane.lastFailureMs||0)<POLICY.staffingRetryMs)
      return{allowed:false,why:'backoff_after_failure'};
    if(at-Number(lane.lastClaimMs||0)<POLICY.staffingRetryMs)
      return{allowed:false,why:'backoff_after_attempt'};
    return{allowed:true,kind:'staffing-current-day',workDate:day,
      slot,leaseMs:POLICY.staffingLeaseMs};
  }
  const day=clock.opDate;
  if(lane.countDate===day&&lane.count>=POLICY.ppeDailyLimit)
    return{allowed:false,why:'daily_ppe_budget_exhausted'};
  if(at-Number(lane.lastClaimMs||0)<POLICY.ppeMinGapMs)
    return{allowed:false,why:'ppe_cooldown'};
  if(at-Number(lane.lastFailureMs||0)<POLICY.ppeRetryMs)
    return{allowed:false,why:'ppe_failure_backoff'};
  return{allowed:true,kind:'ppe-one-readonly-rotation',workDate:day,
    slot:'continuous',leaseMs:POLICY.ppeLeaseMs};
}
export function claim(state,role,tab,now=new Date()){
  retireExpiredLease(state,now.getTime());
  const decision=eligible(state,role,tab,now);
  if(!decision.allowed)return{ok:true,granted:false,reason:decision.why};
  const at=now.getTime(),id=randomUUID();
  const lane=state[role];
  lane.lastClaimMs=at;
  state.lease={id,role,tabId:tab.tabId,kind:decision.kind,
    workDate:decision.workDate,slot:decision.slot,
    startedMs:at,deadlineMs:at+decision.leaseMs};
  state.seq++;
  appendEvent(state,{atMs:at,role,event:'claim',detail:decision.kind});
  return{ok:true,granted:true,id,kind:decision.kind,
    workDate:decision.workDate,leaseDeadlineMs:state.lease.deadlineMs};
}
export function complete(state,role,tabId,id,outcome,now=new Date()){
  const l=state.lease;
  if(!l||l.id!==id||l.role!==role||l.tabId!==tabId)
    return{ok:false,error:'lease_mismatch'};
  if(!['success','no_work','error','auth_required'].includes(outcome))
    return{ok:false,error:'invalid_outcome'};
  const at=now.getTime(),lane=state[role];
  state.lease=null;
  if(outcome==='success'){
    lane.lastSuccessAt=new Date(at).toISOString();
    lane.lastFailure='';lane.lastFailureMs=0;
    if(role==='staffing'){
      lane.lastSuccessDate=l.workDate;lane.lastSuccessSlot=l.slot;
    }else{
      if(lane.countDate!==l.workDate){lane.countDate=l.workDate;lane.count=0}
      lane.count++;
    }
  }else if(outcome==='no_work'){
    // No native work available, but one gentle rotation has been consumed.
    // This must never be turned into a passing compliance receipt.
    if(role==='ppe'){
      if(lane.countDate!==l.workDate){lane.countDate=l.workDate;lane.count=0}
      lane.count++;
    }
  }else{
    lane.lastFailureMs=at;
    lane.lastFailure=outcome;
  }
  appendEvent(state,{atMs:at,role,event:outcome,detail:l.kind});
  return{ok:true,recorded:true,outcome};
}
export function health(state,tabs=[],now=new Date()){
  const clock=chicagoClock(now),at=now.getTime();
  const summarize=role=>{
    const lane=state[role];
    const living=tabs.filter(x=>x.role===role&&
      at-Number(x.seenAtMs)<POLICY.heartbeatTtlMs);
    return{clientState:living.some(x=>x.ready&&x.dedicated)?'ready':
        living.length?'not_ready':'offline',
      lastSuccessAt:lane.lastSuccessAt||null,
      lastSuccessDate:lane.lastSuccessDate||null,
      lastFailure:lane.lastFailure||null,
      lastClaimAt:lane.lastClaimMs?
        new Date(lane.lastClaimMs).toISOString():null,
      completedToday:role==='ppe'&&lane.countDate===clock.opDate?
        lane.count||0:null};
  };
  return{ok:true,project:'Mission Vector Check It',mode:'read_only',
    computerRole:'local_worker_portable',now:new Date(at).toISOString(),
    operationalDate:clock.opDate,lease:currentTask(state,at)?
      {role:state.lease.role,kind:state.lease.kind,
        startedAt:new Date(state.lease.startedMs).toISOString(),
        deadlineAt:new Date(state.lease.deadlineMs).toISOString()}:null,
    staffing:summarize('staffing'),ppe:summarize('ppe'),
    limits:{concurrency:1,ppeReadGapMinutes:POLICY.ppeMinGapMs/60000,
      ppeDailyCeiling:POLICY.ppeDailyLimit,
      staffingWindows:'After 07:05 and after 13:00 Central',
      noCredentialStorage:true,noOfficialInspectionSubmissions:true,
      onlyRegisteredBrowserTabs:true}};
}
