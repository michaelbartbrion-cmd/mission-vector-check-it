'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'..','outlook-rebel-postmaster-ui.user.js'),'utf8');
assert.doesNotMatch(code,/new\s+MutationObserver\s*\(|setInterval\s*\(|GM_xmlhttpRequest\s*\(|fetch\s*\(/);
assert.match(code,/@match\s+https:\/\/outlook\.cloud\.microsoft\/\*/);
assert.match(code,/No full-mailbox access or uploads/);
let timers=[],network=0;
const win={};win.top=win;win.self=win;
const emptyDoc={querySelectorAll:()=>[],documentElement:{appendChild(){}},createElement:()=>({}),getElementById:()=>null};
vm.runInNewContext(code,{window:win,document:emptyDoc,setTimeout:fn=>timers.push(fn),fetch:()=>{network++}}, {timeout:1000});
assert.equal(timers.length,5,'bounded startup discovery, no recurring search');
for(const run of timers)run();
assert.equal(network,0);
assert.equal(win.MVCI_POSTMASTER_BROWSER_020.attached,false,'no UI invented when original reader is missing');
class El{
 constructor(tag,text=''){this.tagName=tag.toUpperCase();this._text=text;this.children=[];this.parentElement=null;this.attrs={};this.style={};this.id='';}
 get textContent(){return this.children.length?this._text+this.children.map(c=>c.textContent).join(' '):this._text}
 set textContent(value){this._text=value;this.children=[]}
 appendChild(el){this.children.push(el);el.parentElement=this;return el}
 setAttribute(k,v){this.attrs[k]=v}
 querySelectorAll(selector){const out=[];const visit=x=>{for(const child of x.children){if(selector==='*'||selector==='button'&&child.tagName==='BUTTON')out.push(child);visit(child)}};visit(this);return out}
}
const root=new El('aside'),header=root.appendChild(new El('div'));
const title=header.appendChild(new El('div','WORK EMAIL READER'));
header.appendChild(new El('div','work-email-reader-0.1.6-discovery'));
root.appendChild(new El('div','Pairing: configured Visible candidates: 0'));
const scan=root.appendChild(new El('button','SCAN VISIBLE LIST - NO UPLOAD'));
const capture=root.appendChild(new El('button','CAPTURE VISIBLE LIST'));
root.appendChild(new El('div','Safety: original reader is read-only'));
const styles=[];timers=[];const w={};w.top=w;w.self=w;
const document={querySelectorAll:sel=>sel==='button'?[scan,capture]:[],createElement:tag=>new El(tag),documentElement:{appendChild:x=>styles.push(x)}};
vm.runInNewContext(code,{window:w,document,setTimeout:fn=>timers.push(fn)}, {timeout:1000});
for(const run of timers)run();
assert.equal(root.attrs['data-mvci-postmaster-root'],'');
assert.equal(title.textContent,'REBEL POSTMASTER');
assert.equal(scan.textContent,'PREVIEW VISIBLE MAIL');
assert.equal(capture.attrs['data-pm-capture'],'');
assert.equal(styles.length,1,'one stylesheet, no callback rewrite loop');
assert.match(styles[0].textContent,/data-pm-capture.*display:none/s);
assert.equal(w.MVCI_POSTMASTER_BROWSER_020.attached,true);
console.log('postmaster-browser-ui: PASS (visible panel renamed and condensed, upload hidden, no observers or network)');
