'use strict';
const {test}=require('node:test'),a=require('node:assert/strict');
const {window,planRecentFirst,split,evaluateWindow}=require('../beta/postmaster-date-window.cjs');
test('recent-first inclusive weekly queries cover the exact range without overlap',()=>{
 const p=planRecentFirst('2026-11-15','2026-11-27');
 a.deepEqual(p,[{start:'2026-11-21',end:'2026-11-27',query:'Received:11/21/2026..11/27/2026'},{start:'2026-11-15',end:'2026-11-20',query:'Received:11/15/2026..11/20/2026'}]);
 a.equal(window('2028-02-29','2028-02-29').query,'Received:02/29/2028');
 a.throws(()=>window('2026-02-29','2026-03-01'));
 a.throws(()=>planRecentFirst('2026-11-28','2026-11-27'));
});
test('split at result cap and never mark a capped single day reconciled',()=>{
 const w=window('2026-11-26','2026-11-27'),e={query:w.query,exactFolderScope:true,exactMailboxScope:true,settled:true,reportedCount:1000,rows:[]};
 a.deepEqual(evaluateWindow(w,e).children,split(w));
 const one=window(w.start,w.start);
 a.equal(evaluateWindow(one,{...e,query:one.query}).status,'cap_unresolved');
});
test('requires exact scope, settled counts, dates and unique IDs before bounded reconciliation',()=>{
 const w=window('2026-11-21','2026-11-27');
 const e={query:w.query,exactFolderScope:true,exactMailboxScope:true,settled:true,reportedCount:2,rows:[{id:'a',day:'2026-11-21'},{id:'b',day:'2026-11-27'}]};
 a.deepEqual(evaluateWindow(w,e),{status:'search_reconciled',accepted:2,children:[]});
 for(const patch of [{exactFolderScope:false},{exactMailboxScope:false},{settled:false},{query:'Received:today'},{reportedCount:3},{reportedCount:undefined},{truncated:true},{rows:[e.rows[0],e.rows[0]]},{rows:[e.rows[0],{id:'b',day:'2026-11-20'}]},{rows:[e.rows[0],{id:'b',day:'unknown'}]}])a.equal(evaluateWindow(w,{...e,...patch}).status,'unverified');
 a.equal(evaluateWindow(w,{...e,reportedCount:0,rows:[]}).status,'unverified');
 a.equal(evaluateWindow(w,{...e,reportedCount:0,rows:[],explicitEmpty:true}).status,'search_reconciled');
});
