'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../beta/vector-rebel.user.js'), 'utf8');
function between(start, end) {
  const a = script.indexOf(start), b = script.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'Expected code boundaries: ' + start);
  return script.slice(a, b);
}
const updateSource = between('    function openManagedUpdate() {', '    function updateStatusHtml() {');
const recoverySource = between('    function dismissObsoleteRecoveryToast() {', '\n    getConfig();');
const URL = 'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-rebel.user.js';
test('Check for Update opens the direct Tampermonkey installer without an empty Utilities field', () => {
  let opened = null, copied = null, status = null;
  const run = new Function('MANAGED_UPDATE_URL','GM_setClipboard','GM_openInTab','setStatus','window',
    updateSource + '\nreturn openManagedUpdate;')(
      URL,(value)=>{copied=value;},(value,options)=>{opened={value,options};return {close() {}};},
      (value)=>{status=value;},{open(){throw Error('fallback must not run')}}
    );
  run();
  assert.equal(opened.value,URL);
  assert.equal(opened.options.active,true);
  assert.equal(copied,URL);
  assert.match(status,/Install\/Reinstall/);
  assert.doesNotMatch(updateSource,/options\.html#nav=utils/);
});
test('legacy popup is removed narrowly without touching backup state or normal messages', () => {
  const popup = {id:'',textContent:'Vector Rebel Recovery No old-site backup has been captured yet. Open or refresh the old Vector site once, then return here.',parentElement:null,removed:false,remove(){this.removed=true;}};
  const leaf = {nodeValue:'No old-site backup has been captured yet.',parentElement:popup};
  const untouched = {id:'',textContent:'Main app settings and roster',parentElement:null,removed:false,remove(){this.removed=true;}};
  const fakeDoc = {body:{},createTreeWalker:()=>({nextNode: (()=>{let n=0;return ()=> n++===0?leaf:null;})()})};
  const dismiss = new Function('location','document','NodeFilter','PANEL_ID','OVERLAY_ID',recoverySource+
      '\nreturn dismissObsoleteRecoveryToast;')(
      {hostname:'app.vectorcheckit.us'},fakeDoc,{SHOW_TEXT:4},'vr-panel','vr-overlay');
  assert.equal(dismiss(),true);
  assert.equal(popup.removed,true);
  assert.equal(untouched.removed,false);
  assert.equal(script.includes('dismissObsoleteRecoveryToast();'),true);
});
test('does not suppress recovery notices on the original Vector site', () => {
  const dismiss = new Function('location','document','NodeFilter','PANEL_ID','OVERLAY_ID',recoverySource+
      '\nreturn dismissObsoleteRecoveryToast;')(
      {hostname:'checkitapp.targetsolutions.com'}, {body:{}}, {SHOW_TEXT:4}, 'vr-panel','vr-overlay');
  assert.equal(dismiss(),false);
});
test('notification text is independent from existing portable backup storage', () => {
  assert.match(script,/function refreshPortableSnapshot\(\)/);
  assert.match(script,/EXPORT FULL VECTOR REBEL BACKUP/);
  assert.match(script,/RESTORE FULL VECTOR REBEL BACKUP/);
  assert.doesNotMatch(recoverySource,/GM_deleteValue|localStorage\.removeItem|persistentRemoveRaw/);
});
