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
  assert.match(src,/^\/\/ @version\s+0\.1\.21/m);
});

test('actual authenticated Front Line markup selects correct grey check icon, not warning',()=>{
  const correct={
    isConnected:true,getAttribute:()=>null,
    querySelector:sel=>sel==='.svg-checked-not-active'?{}:null
  };
  const warning={isConnected:true,getAttribute:()=>null,
    querySelector:sel=>sel==='.svg-warning-not-active'?{}:null};
  const status={textContent:' Not Verified '};
  const card={
    isConnected:true,
    matches:sel=>sel==='.item-status.item-alert',
    innerText:'Thermal Imager\nAsset Tag: 213\nNot Verified',
    querySelectorAll:sel=>{
      if(sel==='.asset-row__actions .icon-wrapper[id="87e630a6bd"]')return [correct];
      if(sel==='.asset-row__actions .icon-wrapper[id="dac0bcd8b6"]')return [warning];
      if(sel==='.verification-status__wrapper .status.status-alert')return [status];
      return [];
    }
  };
  assert.equal(run({status:'not verified',element:card}),correct);
  assert.notEqual(run({status:'not verified',element:card}),warning);
  status.textContent=' Verified ';
  assert.equal(run({status:'not verified',element:card}),null,'never recertify a completed item');
  status.textContent=' Not Verified ';
  card.innerText='Paratech Base Plate\nPAR: 6\nNot Verified';
  assert.equal(run({status:'not verified',element:card}),correct,
    'only a real native exact check icon could authorize a PAR check');
});
test('catalog PAR item without native check control is not guessed as Verified',()=>{
  const card={isConnected:true,innerText:'Paratech Base Plate\nPAR: 6\nNot Verified',
    matches:()=>true,querySelectorAll:()=>[]};
  assert.equal(run({status:'not verified',element:card}),null);
});
