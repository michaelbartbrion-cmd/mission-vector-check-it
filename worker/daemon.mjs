// Low-impact enterprise broker. Transport only: registered, authenticated
// browser tabs do actual read-only collection; we never hold credentials.
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {initialState,retireExpiredLease,claim,complete,health} from './scheduler.mjs';

const HOST='127.0.0.1',PORT=Number(process.env.MVCI_WORKER_PORT||18764);
const HOME=process.env.MVCI_WORKER_HOME||
  path.join(os.homedir(),'AppData','Local','MissionVectorCheckItWorker');
const STATE_FILE=path.join(HOME,'state.json');
const headers={'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const tabs=new Map();
let state=initialState(),lastSave=0,persist=Promise.resolve(),closing=false;
async function save(){
  const data=JSON.stringify(state,null,2)+'\n';
  persist=persist.catch(()=>{}).then(async()=>{
    await fs.mkdir(HOME,{recursive:true});
    const tmp=STATE_FILE+'.tmp';
    await fs.writeFile(tmp,data,{encoding:'utf8',mode:0o600});
    await fs.rename(tmp,STATE_FILE);
    lastSave=Date.now();
  });
  return persist;
}
async function restore(){
  await fs.mkdir(HOME,{recursive:true});
  try{
    const x=JSON.parse(await fs.readFile(STATE_FILE,'utf8'));
    if(x.schema===1&&x.staffing&&x.ppe&&Array.isArray(x.events))
      state=x;
  }catch(e){if(e.code!=='ENOENT')throw e}
  retireExpiredLease(state);
  await save();
}
const send=(res,status,data)=>{
  res.writeHead(status,headers);
  res.end(JSON.stringify(data));
};
function validId(x){return typeof x==='string'&&
  /^[A-Za-z0-9._:-]{8,100}$/.test(x)}
const validRole=x=>x==='ppe'||x==='staffing';
async function readBody(req){
  if(req.headers['content-type']!=='application/json')
    throw Error('json_required');
  const chunks=[];let total=0;
  for await(const part of req){
    total+=part.length;
    if(total>4096)throw Error('body_too_large');
    chunks.push(part);
  }
  const v=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
  if(!v||typeof v!=='object'||Array.isArray(v))throw Error('object_required');
  return v;
}
function guard(req){
  const expected=HOST+':'+PORT;
  const peer=req.socket.remoteAddress;
  if(peer!==HOST||req.headers.host!==expected)return false;
  if(req.method==='POST'&&req.headers['x-mvci-collector']!=='v1')
    return false;
  const origin=String(req.headers.origin||'');
  if(origin&&!/^chrome-extension:\/\/[a-z]{32}$/.test(origin)&&
     !/^https:\/\/(?:[a-z0-9.-]*crewsense\.com|checkitapp\.targetsolutions\.com|app\.vectorcheckit\.us)$/.test(origin))
    return false;
  return true;
}
const server=http.createServer(async(req,res)=>{
  if(!guard(req)){send(res,403,{ok:false,error:'local_browser_bridge_only'});return}
  try{
    const url=new URL(req.url,'http://'+HOST+':'+PORT);
    if(req.method==='GET'&&url.pathname==='/health'){
      send(res,200,health(state,[...tabs.values()]));return;
    }
    if(req.method!=='POST'||!['/v1/heartbeat','/v1/claim',
      '/v1/complete'].includes(url.pathname)){
      send(res,404,{ok:false,error:'route_not_found'});return;
    }
    const data=await readBody(req);
    if(!validRole(data.role)||!validId(data.tabId)){
      send(res,400,{ok:false,error:'invalid_browser_identity'});return;
    }
    const tabKey=data.role+':'+data.tabId;
    if(url.pathname==='/v1/heartbeat'){
      const tab={role:data.role,tabId:data.tabId,seenAtMs:Date.now(),
        ready:data.ready===true,dedicated:data.dedicated===true,
        busy:data.busy===true};
      tabs.set(tabKey,tab);
      for(const [k,x] of tabs)
        if(Date.now()-x.seenAtMs>3*60_000)tabs.delete(k);
      send(res,200,{ok:true,active:health(state,[...tabs.values()])
        [data.role].clientState==='ready',role:data.role});
      return;
    }
    const tab=tabs.get(tabKey);
    if(!tab||Date.now()-tab.seenAtMs>90_000){
      send(res,409,{ok:false,error:'recent_heartbeat_required'});return;
    }
    if(url.pathname==='/v1/claim'){
      const answer=claim(state,data.role,tab);
      if(answer.granted)await save();
      send(res,200,answer);return;
    }
    const response=complete(state,data.role,data.tabId,
      data.id,data.outcome);
    if(response.recorded)await save();
    send(res,response.ok?200:409,response);
  }catch(e){
    const bad=['json_required','body_too_large','object_required'];
    send(res,bad.includes(e.message)?400:500,
      {ok:false,error:bad.includes(e.message)?e.message:'worker_internal_error'});
  }
});
async function close(){
  if(closing)return;closing=true;
  server.close();
  await save().catch(()=>{});
}
await restore();
server.listen(PORT,HOST,()=>{
  process.stdout.write('Mission Vector Check It worker: localhost:'+
    PORT+' | one read-only task | 9-minute PPE gap | no credentials\n');
});
const timer=setInterval(()=>{
  if(retireExpiredLease(state))void save();
},20_000);
timer.unref();
for(const sig of ['SIGINT','SIGTERM']){
  process.once(sig,()=>{clearInterval(timer);
    void close().then(()=>process.exit(0)).catch(()=>process.exit(1));
  });
}
