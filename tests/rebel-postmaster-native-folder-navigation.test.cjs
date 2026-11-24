'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const s=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
const a=s.indexOf('async function navigateToFolder('),b=s.indexOf('function statePayload(',a);
assert.ok(a>0&&b>a);
const target={key:'href:folder',name:'Junk Email',href:'https://outlook.cloud.microsoft/mail/junkemail'};
function fixture({frames=[],accounts=[],delay=60000,candidates=[],wrongNode=false,abortAt=-1}={}){
 let i=0,time=0,clicks=0;
 const el={click(){clicks++}};
 const ctx={findFolderNavTarget:()=>({_el:el,href:target.href}),mailboxId:()=>accounts[Math.min(i,accounts.length-1)]||'mailbox-a',isFolderTreeNode:()=>!wrongNode,folderName:()=> 'Previous folder',
 selectedFolderCandidate:()=>frames[Math.min(i,frames.length-1)]||null,folderCandidates:()=>candidates,clean:String,
 get mailboxAbort(){return i===abortAt},Date:{now:()=>time},wait:async()=>{i++;time+=delay}};
 vm.createContext(ctx);vm.runInContext(s.slice(a,b),ctx);return{ctx,clicks:()=>clicks};
}
test('native folder activation survives delayed background timer without forced URL navigation',async()=>{
 const h=fixture({frames:[{key:'other',name:'Old'},{key:'other',name:'Old'},target]});
 assert.equal(await h.ctx.navigateToFolder(target),true);assert.equal(h.clicks(),1);
 assert.doesNotMatch(s.slice(a,b),/location\.(assign|replace|reload)/);
});
test('matching URL is not proof of selected folder, no duplicate clicks on timeout',async()=>{
 const h=fixture({frames:[{key:'other',name:'Other'}]});
 await assert.rejects(h.ctx.navigateToFolder(target),/did not confirm selected/);assert.equal(h.clicks(),1);
});
test('account change or pause stops navigation; non-folder control never clicked',async()=>{
 const h=fixture({accounts:['mailbox-a','mailbox-b'],frames:[null,target]});
 await assert.rejects(h.ctx.navigateToFolder(target),/account changed/);
 const x=fixture({abortAt:1});await assert.rejects(x.ctx.navigateToFolder(target),/paused/);
 const y=fixture({wrongNode:true});await assert.rejects(y.ctx.navigateToFolder(target),/target not found/);assert.equal(y.clicks(),0);
});
test('unique actual selected name alias is allowed; ambiguous aliases never confirm',async()=>{
 const named={key:'name:folder',name:'Junk Email'},selected={key:'id:actual',name:'Junk Email'};
 const h=fixture({frames:[selected],candidates:[selected]});assert.equal(await h.ctx.navigateToFolder(named),true);
 const x=fixture({frames:[selected],candidates:[selected,{key:'id:other',name:'Junk Email'}]});
 await assert.rejects(x.ctx.navigateToFolder(named),/did not confirm selected/);
});