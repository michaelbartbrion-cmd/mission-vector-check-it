'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
function between(first,last){
 const a=script.indexOf('    '+first),b=script.indexOf('    '+last,a+1);
 assert.ok(a>=0&&b>a,first);
 return script.slice(a,b);
}
const backupSource=between('function buildPortableBackupPayload() {','function exportDepartmentProfile() {') +
 '\nreturn {buildPortableBackupPayload,validatePortableBackupPayload,restorePortableBackup};';
const signatureSource=between('function peekSignatureVariant() {','function showSignatureManager() {')+
 '\nreturn {peekSignatureVariant,advanceSignatureCursor};';
function store(){
 const values=new Map();
 const keys=['vectorPpeConfig_v3','vectorPpeSignatureLibrary_v2','vectorRebelMasterRosterOverride_v1','vectorPpeRunHistory_v3'];
 values.set(keys[0],JSON.stringify({inspectorName:'Michael Brion',selfPrefix:'BRION'}));
 values.set(keys[1],JSON.stringify([{label:'Genuine signature'}]));
 values.set(keys[2],JSON.stringify({people:[{name:'Michael Brion',prefix:'PERSON-001'}]}));
 values.set(keys[3],'[]');
 const list=[...keys];
 let reloads=0,clears=[];
 const factory=new Function('PORTABLE_BACKUP_KEYS','persistentGetRaw','persistentSetRaw',
   'persistentRemoveRaw','VERSION','downloadTextFile','setStatus','setTimeout','location',
   'refreshPortableSnapshot','FileReader','configCache',backupSource);
 const backup=factory(list,k=>values.get(k)??null,
  (k,v)=>values.set(k,v),(k)=>{clears.push(k);values.delete(k);},
  '3.2.19',()=>{},()=>{},fn=>{fn();},{reload(){reloads++;}},()=>{},class{},null);
 return {values,backup,clears,keys,reloads:()=>reloads};
}
test('Backup includes profile, signature, roster and run history without browser telemetry tokens',()=>{
 const st=store();
 const b=st.backup.buildPortableBackupPayload();
 assert.equal(b.schema,'vector-rebel-portable-backup');
 assert.deepEqual(Object.keys(b.items).sort(),st.keys.sort());
 assert.doesNotMatch(JSON.stringify(b),/vectorRebelPairingV1/);
});
test('Backup validation refuses invalid types and ignores unknown fields',()=>{
 const st=store();
 assert.throws(()=>st.backup.validatePortableBackupPayload({schema:'random',schemaVersion:1,items:{x:'a'}}),/not a supported/);
 assert.throws(()=>st.backup.validatePortableBackupPayload({schema:'vector-rebel-portable-backup',schemaVersion:1,items:{vectorPpeConfig_v3:{}}}),/invalid/);
 const validated=st.backup.validatePortableBackupPayload({schema:'vector-rebel-portable-backup',schemaVersion:1,items:{vectorPpeConfig_v3:'{}',maliciousUnrecognizedKey:'a'}});
 assert.deepEqual(Object.keys(validated.items),['vectorPpeConfig_v3']);
});
test('Full backup restores all supported settings and never clears unrelated keys',()=>{
 const st=store();
 const b=st.backup.buildPortableBackupPayload();
 st.values.set('vectorPpeConfig_v3','CHANGED');
 st.values.set('vectorRebelPairingV1','PRESERVE-CONNECTION');
 st.backup.restorePortableBackup(b);
 assert.equal(st.values.get('vectorPpeConfig_v3'),b.items.vectorPpeConfig_v3);
 assert.equal(st.values.get('vectorRebelPairingV1'),'PRESERVE-CONNECTION');
 assert.equal(st.clears.length,st.keys.length);
 assert.equal(st.reloads(),1);
});
test('Signature rotation cycles through genuine saved variants with wraparound',()=>{
 const variants=[{label:'Original #1'},{label:'Original #2'},{label:'Original #3'}];
 let cursor='0';
 const fn=new Function('getSignatureLibrary','persistentGetRaw','persistentSetRaw','SIGNATURE_CURSOR_KEY',signatureSource);
 const x=fn(()=>variants,()=>cursor,(_key,value)=>{cursor=value;},'sig-cursor');
 const labels=[];
 for(let i=0;i<8;i++){const sig=x.peekSignatureVariant();labels.push(sig.variant.label);x.advanceSignatureCursor(sig.index,sig.total);}
 assert.deepEqual(labels,['Original #1','Original #2','Original #3','Original #1','Original #2','Original #3','Original #1','Original #2']);
});
test('No signature means a PPE run must stop before form fill',()=>{
 const fn=new Function('getSignatureLibrary','persistentGetRaw','persistentSetRaw','SIGNATURE_CURSOR_KEY',signatureSource);
 const x=fn(()=>[],()=> '0',()=>{},'sig-cursor');
 assert.throws(()=>x.peekSignatureVariant(),/No saved signature variants/);
 assert.match(script,/if \(!getSignatureLibrary\(\)\.length\)/);
});
