'use strict';
// Prototype for supported Outlook Web date searches. No authentication,
// browser navigation, native writes, or ingestion. Inclusive calendar dates.
const DAY=86400000;
function dayNumber(day){
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Invalid calendar day');
 const n=Date.parse(day+'T00:00:00Z');
 if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==day)throw Error('Invalid calendar day');
 return n/DAY;
}
const iso=n=>new Date(n*DAY).toISOString().slice(0,10);
const aqs=day=>day.slice(5,7)+'/'+day.slice(8,10)+'/'+day.slice(0,4);
function window(start,end){
 const a=dayNumber(start),b=dayNumber(end);
 if(a>b)throw Error('Reversed date range');
 return {start,end,query:'Received:'+aqs(start)+(start===end?'':'..'+aqs(end))};
}
function planRecentFirst(start,end,days=7){
 const a=dayNumber(start),b=dayNumber(end);
 if(a>b||!Number.isInteger(days)||days<1||days>31||b-a>36525)throw Error('Invalid date partition');
 const out=[];
 for(let hi=b;hi>=a;hi-=days)out.push(window(iso(Math.max(a,hi-days+1)),iso(hi)));
 return out;
}
function split(w){
 const a=dayNumber(w.start),b=dayNumber(w.end);
 if(a>b)throw Error('Reversed date range');
 if(a===b)return [];
 const mid=Math.floor((a+b)/2);
 return [window(iso(mid+1),iso(b)),window(iso(a),iso(mid))];
}
// Search result cap in Microsoft support: 1000. A cap-sized result is
// unresolved even if the displayed count and unique rows agree.
function evaluateWindow(w,evidence){
 const expected=window(w.start,w.end);
 if(evidence?.query!==expected.query||evidence?.exactFolderScope!==true||
    evidence?.exactMailboxScope!==true||evidence?.settled!==true||
    evidence?.truncated===true||!Array.isArray(evidence.rows))
  return {status:'unverified',accepted:0,children:[]};
 const total=evidence.reportedCount;
 if(Number.isSafeInteger(total)&&total>=1000||evidence.rows.length>=1000){
  const children=split(w);
  return {status:children.length?'split':'cap_unresolved',accepted:0,children};
 }
 if(!Number.isSafeInteger(total)||total<0||total!==evidence.rows.length||
    (!total&&evidence.explicitEmpty!==true))return {status:'unverified',accepted:0,children:[]};
 const seen=new Set();
 for(const row of evidence.rows){
  if(typeof row?.id!=='string'||!row.id.trim()||seen.has(row.id)||
     typeof row.day!=='string')return {status:'unverified',accepted:0,children:[]};
  try{dayNumber(row.day)}catch{return {status:'unverified',accepted:0,children:[]};}
  if(row.day<w.start||row.day>w.end)return {status:'unverified',accepted:0,children:[]};
  seen.add(row.id);
 }
 // Only the bounded search has reconciled its *reported* results.
 // This never proves native mailbox completeness or authorizes upload.
 return {status:'search_reconciled',accepted:seen.size,children:[]};
}
module.exports={window,planRecentFirst,split,evaluateWindow};
