'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
process.env.TZ='America/Chicago';
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=source.indexOf('    function apparatusWorkWindows(');
const b=source.indexOf('    function apparatusReportState() {',a);
const day=key=>Math.floor(Date.parse(key+'T00:00:00Z')/86400000);
const localKey=date=>{
 const d=new Date(date);
 return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
};
const makeWorkWindow=()=>{
 const stub=asOf=>({asOfDate:asOf,months:['2026-10','2026-11'],tours:[
  {startDate:'2026-11-09',endDate:'2026-11-10',month:'2026-11',due:true,eligibleDates:['2026-11-09','2026-11-10']},
  {startDate:'2026-11-14',endDate:'2026-11-15',month:'2026-11',due:true,eligibleDates:['2026-11-14','2026-11-15']}
 ]});
 return new Function('captainAuditWindow','utcDayNumber','localTodayKey','localHistoryDateKey','Date',
  source.slice(a,b)+'\nreturn {work:apparatusWorkWindows,item:apparatusItemTourStatus,group:apparatusStatusForTour};')(
  stub,day,localKey,localKey,Date);
};
const logic=makeWorkWindow();
const roster=[
 ...Array.from({length:5},(_,i)=>({name:'AP-'+String(i+4).padStart(2,'0'),scope:'truck504',
   dates:i<3?['2026-11-09']:[],readable:true,exhaustive:true})),
 ...Array.from({length:2},(_,i)=>({name:'AP-'+(45+i),scope:'medic504',
   dates:i===0?['2026-11-10']:[],readable:true,exhaustive:i===0})),
 ...Array.from({length:7},(_,i)=>({name:'AP-'+(80+i),scope:'station4',
   dates:i<5?['2026-11-09']:[],readable:true,exhaustive:true}))
];
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.textContent='';this.title='';this.attrs={};}
 append(...nodes){this.children.push(...nodes);}
 appendChild(node){this.children.push(node);}
 setAttribute(k,v){this.attrs[k]=v;}
}
test('Apparatus dashboard visibly renders each of the 14 airpacks below the 3 group totals',()=>{
 const document={createElement:tag=>new Element(tag)};
 let root;
 const showStart=source.indexOf('    function showApparatusCheck(report) {');
 const showEnd=source.indexOf('    function showStation4ScbaAirpackCheck()',showStart);
 assert.ok(showStart>=0&&showEnd>showStart);
 const show=new Function('apparatusReportState','apparatusStartReadOnlyScan',
  'apparatusWorkWindows','makeOverlayBox','document','apparatusStatusForTour',
  'apparatusItemTourStatus','makeButton',source.slice(showStart,showEnd)+
  '\nreturn showApparatusCheck;')(
  ()=>null,()=>{throw Error('report must be passed')},logic.work,
  ()=>{root=new Element('root');return {box:root,overlay:new Element('overlay')};},
  document,logic.group,logic.item,
  label=>{const button=new Element('button');button.textContent=label;return button;}
 );
 show({schemaVersion:1,asOfDate:'2026-11-10',
  generatedAt:'2026-11-10T05:00:00-06:00',items:roster});
 const table=root.children.find(el=>el.tag==='div' &&
  el.children.some(child=>child.tag==='table')).children.find(el=>el.tag==='table');
 const tbody=table.children.find(el=>el.tag==='tbody');
 assert.ok(tbody);
 assert.equal(tbody.children.length,17);
 const groupRows=tbody.children.filter(row=>!row.attrs['data-apparatus-scba-item']);
 assert.equal(groupRows.length,3);
 assert.deepEqual(groupRows.map(row=>row.children[0].textContent),[
  'Truck 504 (5 SCBAs)','Medic 504 (2 SCBAs)','Station 4 SCBA Room (7 SCBAs)'
 ]);
 const assetRows=tbody.children.filter(row=>row.attrs['data-apparatus-scba-item']);
 assert.equal(assetRows.length,14);
 assert.equal(assetRows.every(row=>row.children.length===3),true,
  '1 identity cell + 2 tour cells for every asset');
 assert.deepEqual(assetRows.map(row=>row.attrs['data-apparatus-scba-item']),
  roster.map(row=>row.name));
 const ap04=assetRows.find(row=>row.attrs['data-apparatus-scba-item']==='AP-04');
 assert.equal(ap04.children[1].textContent,'✓');
 assert.match(ap04.children[1].title,/Native completed, duty date: 2026-11-09/);
 const ap08=assetRows.find(row=>row.attrs['data-apparatus-scba-item']==='AP-08');
 assert.equal(ap08.children[1].textContent,'✕');
 const medicUnknown=assetRows.find(row=>row.attrs['data-apparatus-scba-item']==='AP-46');
 assert.equal(medicUnknown.children[1].textContent,'?');
 const station=assetRows.find(row=>row.attrs['data-apparatus-scba-item']==='AP-80');
 assert.equal(station.children[1].textContent,'✓');
 assert.equal(station.children[2].textContent,'—',
  'no Station inspection is expected on a non-Monday tour');
 const summary=groupRows[0];
 assert.equal(summary.children[1].textContent,'✕',
  'group summary fails while 2 individual Truck airpacks were not checked');
});
test('per-item and group statuses cannot contradict one another',()=>{
 const w=logic.work('2026-11-10',new Date('2026-11-10T05:00:00-06:00')).tours[0];
 for(const group of ['truck504','medic504','station4']){
  const expected=roster.filter(x=>x.scope===group).map(x=>logic.item(group,w,x));
  const summary=logic.group(group,w,roster);
  if(expected.some(x=>x.code==='unknown'))assert.equal(summary.code,'unknown');
  else if(expected.some(x=>x.code==='missing'))assert.equal(summary.code,'missing');
  else assert.equal(summary.code,'done');
 }
});
