'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-iq.user.js'),'utf8');
const start=src.indexOf('  function findNativeRowVerifyControl(row) {');
const end=src.indexOf('  function findNativeAssetTagEntry() {',start);
assert.ok(start>0&&end>start,'native asset-card control discovery is present');
const source=src.slice(start,end)+'\nreturn findNativeRowVerifyControl;';
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const makeControl=(label,icon='')=>{
  const iconNode=icon?{
    getAttribute(name){return name==='class'?icon:null;},
    textContent:''
  }:null;
  return {
    tagName:'BUTTON',isConnected:true,disabled:false,
    getAttribute(name){return name==='title'?label:null;},
    querySelectorAll(){return iconNode?[iconNode]:[];}
  };
};
const run=new Function('clean',source)(clean);
test('only the native check-circle action is selected from warning/verify/more buttons',()=>{
  const warning=makeControl('Flag as needing attention','fa-exclamation-triangle');
  const present=makeControl('','fa fa-check-circle');
  const more=makeControl('','material-icons more_vert');
  const row={status:'not verified',element:{
    isConnected:true,querySelectorAll:()=>[warning,present,more]
  }};
  assert.equal(run(row),present);
});
test('native verify action requires a unique identifiable semantic button',()=>{
  const present=makeControl('Mark Verified');
  const row={status:'not verified',element:{
    isConnected:true,querySelectorAll:()=>[present,present]
  }};
  assert.equal(run(row),null);
  row.element.querySelectorAll=()=>[makeControl('View details')];
  assert.equal(run(row),null);
  row.element.querySelectorAll=()=>[present];
  row.status='verified';
  assert.equal(run(row),null);
  row.status='not verified';
  row.element.isConnected=false;
  assert.equal(run(row),null);
});
test('no unsafe generic report-problem control is mistaken for Verified',()=>{
  const controls=[
    makeControl('Report a problem','fa-exclamation-triangle'),
    makeControl('Needs Attention','fa-warning'),
    makeControl('More','more-vert')
  ];
  const row={status:'not verified',element:{
    isConnected:true,querySelectorAll:()=>controls
  }};
  assert.equal(run(row),null);
  assert.match(src,/Official Verified status not confirmed/);
  assert.match(src,/native\.button\.click\(\)/);
  assert.match(src,/const rowAction=findNativeRowVerifyControl\(same\[0\]\)/);
  assert.match(src,/^\/\/ @version\s+0\.1\.18/m);
});
