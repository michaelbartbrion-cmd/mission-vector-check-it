'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../beta');
const current=fs.readFileSync(path.join(root,'vector-rebel.user.js'),'utf8');
const legacy=fs.readFileSync(path.join(root,'vector-ppe-helper.user.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8'));
const version=source=>{
 const match=source.match(/^\/\/ @version\s+(\d+(?:\.\d+)+)$/m);
 assert.ok(match,'userscript @version metadata');
 return match[1];
};
test('legacy installer now serves same installed code as canonical Vector Rebel, not archived 3.2.11',()=>{
 assert.equal(version(current),manifest.latestVersion);
 assert.equal(version(legacy),manifest.latestVersion);
 assert.equal(legacy,current,'legacy URL must not install an older or unrelated helper');
});
test('both installers converge on one canonical Tampermonkey update identity',()=>{
 const canonical='https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-rebel.user.js';
 for(const script of [current,legacy]){
  assert.match(script,/^\/\/ @namespace\s+mission-vector-check-it-vector-rebel$/m);
  assert.ok(script.includes('// @updateURL    '+canonical));
  assert.ok(script.includes('// @downloadURL  '+canonical));
 }
});
