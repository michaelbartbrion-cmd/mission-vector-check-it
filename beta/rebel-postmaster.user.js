// ==UserScript==
// @name         Rebel Postmaster
// @namespace    mission-vector-check-it-rebel-postmaster
// @version      1.2.37
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/rebel-postmaster.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/rebel-postmaster.user.js
// @description  Minimal read-only Outlook Web collector for Rebel Command with whole-mailbox indexing and automatic capture of messages the user opens.
// @match        https://outlook.office.com/*
// @match        https://outlook.office365.com/*
// @match        https://outlook.cloud.microsoft/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @connect      base44.app
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function(){
'use strict';
if(window.top!==window.self||window.MVCI_REBEL_POSTMASTER)return;
const VERSION='rebel-postmaster-1.2.37';
const DEFAULT_ENDPOINT='https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
const MANAGED_UPDATE_URL='https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/rebel-postmaster.user.js';
function openManagedUpdate(){
    // Open the .user.js URL itself. Tampermonkey intercepts that URL and
    // presents its own Install/Reinstall confirmation. Opening Tampermonkey's
    // Utilities page left the user with a copied URL but no applied update.
    try{
        const opened=GM_openInTab(MANAGED_UPDATE_URL,{active:true,insert:true,setParent:true});
        if(!opened)throw new Error('The userscript installer was blocked.');
        state.msg='Installer opened. Approve Install or Reinstall in Tampermonkey, then reload Outlook. No mail is changed by checking for an update.';
        state.kind='info';
    }catch(e){
        try{GM_setClipboard(MANAGED_UPDATE_URL,'text')}catch(_){}
        state.msg='Could not open the installer automatically. Update URL copied. Paste it into Chrome to open the Tampermonkey Install/Reinstall screen.';
        state.kind='error';
    }
    render();
}

const REBEL_SYMBOL_HTML="<img alt=\"\" aria-hidden=\"true\" draggable=\"false\" width=\"39\" height=\"39\" style=\"display:block;width:39px;height:39px;object-fit:contain;pointer-events:none;user-select:none\" src=\"data:image/png;base64,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\">";
const ROOT_ID='mvci-rebel-postmaster';
const CFG_KEY='mvciWorkEmailPairingV1';
const CRAWL_KEY='mvciPostmasterFolderCrawlV1';
const MAILBOX_KEY='mvciPostmasterMailboxCrawlV1';
const MANIFEST_PROVIDER='outlook_web_rendered_ui_manifest';
const OPENED_KEY='mvciPostmasterOpenedKeysV1';
const MAX_FOLDER_MESSAGES=25000;
const MAX_CRAWL_STEPS=8000;
const MAX_MAILBOX_FOLDERS=120;
const MAX_FOLDER_NAV_ATTEMPTS=2;
const MAX_FOLDER_NO_PROGRESS_ATTEMPTS=2;
const TRACE_KEY='mvciPostmasterDiagnosticTraceV1';
const MAX_TRACE_ROWS=160;
function traceRows(){const x=GM_getValue(TRACE_KEY,[]);return Array.isArray(x)?x:[]}
function trace(kind,data={}){try{const rows=traceRows();rows.push({at:new Date().toISOString(),kind:String(kind||'event').slice(0,80),url:location.href,...data});while(rows.length>MAX_TRACE_ROWS)rows.shift();GM_setValue(TRACE_KEY,rows)}catch(_){}}
function clearTrace(){GM_deleteValue(TRACE_KEY);return[]}
function traceExport(){return JSON.stringify({schema:'mvci-postmaster-trace-v1',version:VERSION,exportedAt:new Date().toISOString(),rows:traceRows()},null,2)}
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const rawText=v=>String(v==null?'':v).replace(/\r/g,'').trim();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const attr=(el,n)=>clean(el?.getAttribute?.(n)||'');
const visible=el=>{if(!(el instanceof Element))return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0&&r.width>2&&r.height>2&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth};
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
const isoMaybe=v=>{const t=Date.parse(clean(v));return Number.isFinite(t)?new Date(t).toISOString():''};
const timeLike=s=>/^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+)?(?:\d{1,2}:\d{2}\s*(?:AM|PM)|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4})$/i.test(clean(s));
const symbolOnly=s=>{const x=clean(s);return !x||/^[^A-Za-z0-9]+$/.test(x)};
const initialsOf=s=>clean(s).split(/\s+/).map(w=>(w.match(/[A-Za-z0-9]/)||[''])[0]).join('').toUpperCase();
const edgeInitialsOf=s=>{const p=clean(s).split(/\s+/).filter(Boolean);if(!p.length)return'';const first=(p[0].match(/[A-Za-z0-9]/)||[''])[0],last=(p[p.length-1].match(/[A-Za-z0-9]/)||[''])[0];return`${first}${last}`.toUpperCase()};
const initialBadge=(badge,next)=>{const b=clean(badge).toUpperCase(),n=clean(next);if(!/^[A-Z0-9]{1,3}$/.test(b)||n.length<=b.length)return false;const all=initialsOf(n),edge=edgeInitialsOf(n),first=(n.match(/[A-Za-z0-9]/)||[''])[0].toUpperCase();return all===b||edge===b||(b.length===1&&first===b)};
function normalizeEndpoint(value){const raw=clean(value)||DEFAULT_ENDPOINT;let u,d;try{u=new URL(raw);d=new URL(DEFAULT_ENDPOINT)}catch(_){throw new Error('Telemetry endpoint is not a valid URL.')}const path=x=>x.pathname.replace(/\/+$/,'');if(u.protocol!=='https:'||u.origin!==d.origin||path(u)!==path(d))throw new Error('Rebel Postmaster may send captures only to the configured Rebel Command Base44 endpoint.');return `${d.origin}${path(d)}`}
function cfg(){const x=GM_getValue(CFG_KEY,{endpoint:DEFAULT_ENDPOINT,deviceId:'',token:''})||{};let endpoint=DEFAULT_ENDPOINT;try{endpoint=normalizeEndpoint(x.endpoint)}catch(_){}return{endpoint,deviceId:clean(x.deviceId),token:clean(x.token)}}
function saveCfg(x){GM_setValue(CFG_KEY,x)}
function paired(){const c=cfg();return!!(c.deviceId&&c.token)}
function apiOnce(method,payload=null){
    const c=cfg();
    return new Promise((resolve,reject)=>{
        if(!c.deviceId||!c.token)return reject(new Error('Pairing not configured.'));
        GM_xmlhttpRequest({
            method,url:c.endpoint||DEFAULT_ENDPOINT,
            headers:{Authorization:`Bearer ${c.token}`,'X-Rebel-Device-ID':c.deviceId,...(payload?{'Content-Type':'application/json'}:{})},
            data:payload?JSON.stringify(payload):undefined,timeout:30000,
            onload:r=>{
                let b={};try{b=JSON.parse(r.responseText||'{}')}catch(_){}
                if(r.status>=200&&r.status<300&&b?.ok!==false)return resolve(b);
                const message=clean(b?.error||`HTTP ${r.status}`);
                const error=new Error(message);
                // Retry ONLY an explicit rate-limit response. A timeout or
                // ambiguous network failure might have persisted the batch.
                error.rateLimited=Number(r.status)===429||/rate limit exceeded/i.test(message);
                reject(error);
            },
            onerror:()=>reject(new Error('Network error')),
            ontimeout:()=>reject(new Error('Network timeout'))
        });
    });
}
async function api(method,payload=null){
    for(let attempt=0;attempt<4;attempt++){
        try{return await apiOnce(method,payload)}
        catch(error){
            if(!error.rateLimited||attempt===3)throw error;
            const delayMs=2000*Math.pow(2,attempt);
            trace('bridge_rate_limited_backoff',{attempt:attempt+1,delayMs});
            await wait(delayMs);
        }
    }
}
const request=payload=>api('POST',payload);
const verify=()=>api('GET');
// Outlook exposes a named native List / Group in its current accessibility tree.
// Restrict new list support to that exact semantic region, never arbitrary lists.
function isNativeMessageListRegion(el){
    if(!el?.getAttribute)return false;
    // The native Outlook MailList can be a plain DIV; its verified enclosing
    // landmark disambiguates it from navigation or an open message.
    if(attr(el,'id')==='MailList'&&el.closest?.('[id="Skip to message list-region"]'))return true;
    const role=attr(el,'role').toLowerCase(),tag=String(el.tagName||'').toLowerCase();
    if(!['group','list','listbox','grid','region'].includes(role)&&!['ul','ol','section'].includes(tag))return false;
    const refs=attr(el,'aria-labelledby').split(/\s+/).filter(Boolean);
    const linked=refs.map(id=>clean(document.getElementById(id)?.textContent||'')).join(' ');
    const label=clean(attr(el,'aria-label')||linked);
    return /^(?:message|mail) list$/i.test(label);
}
function nativeMessageListRegion(el){
    for(let n=el;n&&n!==document.body;n=n.parentElement)if(isNativeMessageListRegion(n))return n;
    return null;
}
function containsNativeMessageList(el){
    return [...(el?.querySelectorAll?.('[id="MailList"],[role="list"],[role="group"],[role="listbox"],[role="grid"],[role="region"],ul,ol,section')||[])].some(isNativeMessageListRegion);
}
function candidateRows(){
    const pane=findReadingPane();
    const selectors='[role="option"],[data-convid],[data-itemid],[data-item-id],[data-conversation-id],[role="listitem"][id],li[id]';
    const found=[...document.querySelectorAll(selectors)].filter(visible),out=[],seen=new Set();
    for(const el of found){
        if(seen.has(el))continue;
        seen.add(el);
        if(el.closest('[role="tree"]'))continue;
        if(pane&&(el===pane||pane.contains(el))&&!nativeMessageListRegion(el))continue;
        const txt=clean(el.innerText||el.textContent||''),aria=attr(el,'aria-label');
        if((txt||aria).length<8)continue;
        const inMail=!!nativeMessageListRegion(el)||!!el.closest('[role="listbox"],[role="grid"],[aria-label*="message" i],[aria-label*="mail" i]');
        const explicitId=!!(attr(el,'data-convid')||attr(el,'data-itemid')||attr(el,'data-item-id')||attr(el,'data-conversation-id'));
        // Outlook's newer virtualized message list exposes real ListItem
        // elements inside its scroll host, with stable opaque HTML ids.
        // Never treat arbitrary navigation, account or folder list items as
        // messages. A long id is required, but parseRow / credibleMessageRow
        // still enforce genuine sender + subject before any upload.
        const nativeRow=!!(el.matches?.('[role="listitem"][id],li[id],[role="option"][id]')&&
            el.closest('[class~="customScrollBar"]')&&
            attr(el,'id').length>=18);
        if(!inMail&&!explicitId&&!nativeRow)continue;
        out.push(el);
    }
    return out.slice(0,150);
}
function displayedReceived(lines,timeEl){const explicit=clean(attr(timeEl,'aria-label')||attr(timeEl,'title')||timeEl?.textContent||'');if(explicit)return explicit.slice(0,160);return clean(lines.find(timeLike)||'').slice(0,160)}
function parseRow(el,index){const raw=(el.innerText||el.textContent||'').trim(),text=clean(raw),aria=attr(el,'aria-label'),title=attr(el,'title'),dataId=attr(el,'data-itemid')||attr(el,'data-item-id')||attr(el,'data-convid')||attr(el,'data-conversation-id')||attr(el,'id'),lines=raw.split(/\n+/).map(clean).filter(Boolean),meaningful=lines.filter(x=>!symbolOnly(x)),content=meaningful.filter(x=>!timeLike(x));while(content.length>=2&&initialBadge(content[0],content[1]))content.shift();const sender=content[0]||'',subject=content[1]||'',preview=content.slice(2,6).join(' '),timeEl=el.querySelector('time,[datetime]'),receivedAt=isoMaybe(attr(timeEl,'datetime')),displayedReceivedText=displayedReceived(lines,timeEl),unread=/\bunread\b/i.test(`${aria} ${el.className||''}`),flagged=/\bflagged\b/i.test(`${aria} ${title}`)||!!el.querySelector('[aria-label*="flag" i][aria-pressed="true"],[title*="flagged" i]'),attachments=!!el.querySelector('[aria-label*="attachment" i],[title*="attachment" i],svg[data-icon-name*="Attach" i]')||/\battachment\b/i.test(aria),rawKey=dataId||hash(`${sender}|${subject}|${aria}|${text.slice(0,500)}|${index}`);return{messageKey:`outlook:${rawKey}`,senderName:sender,senderAddress:uniqueSenderAddress([attr(el,'data-sender-address'),attr(el,'data-sender-email')])||undefined,subject,previewText:preview||text.slice(0,1800),receivedAt:receivedAt||undefined,displayedReceivedText:displayedReceivedText||undefined,listPosition:index,isUnread:!!unread,isFlagged:!!flagged,hasAttachments:!!attachments,webUrl:location.href,captureLevel:'list',_strongId:!!dataId}}
function uniqueSenderAddress(values){
    const addresses=new Set();
    for(const value of values){
        let field=clean(value).replace(/^(?:from|sender)\s*:\s*/i,'');
        const bracket=field.match(/^[^<>]*<([^<>]+)>$/);
        if(bracket)field=bracket[1].trim();
        if(/^[^\s<>@,;]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(field))addresses.add(field.toLowerCase());
    }
    return addresses.size===1?[...addresses][0]:'';
}
function openSenderWitness(pane,bodyEl,listMeta){
    const values=[listMeta?.senderAddress,attr(pane,'data-sender-address'),attr(pane,'data-sender-email')];
    let name='';
    // A mailto link in the message body, signature or recipient list is
    // not evidence of the sender. Require an explicitly labeled header
    // outside the dedicated body, or the selected native list sender.
    if(bodyEl&&bodyEl!==pane){
        const headers=[...pane.querySelectorAll('[data-sender-address],[data-sender-email],[aria-label^="From:" i],[title^="From:" i],[aria-label^="Sender:" i]')].filter(el=>visible(el)&&!bodyEl.contains(el)&&!el.contains(bodyEl));
        for(const el of headers){
            values.push(attr(el,'data-sender-address'),attr(el,'data-sender-email'),attr(el,'aria-label'),attr(el,'title'),clean(el.innerText||el.textContent||''));
            if(!name)name=clean(attr(el,'aria-label')||attr(el,'title')||el.innerText||el.textContent||'').replace(/^(?:from|sender)\s*:\s*/i,'');
        }
    }
    return {address:uniqueSenderAddress(values),name:clean(name||listMeta?.senderName)};
}
function isFolderTreeNode(el){return!!el?.closest?.('[role="tree"]')&&!el.closest('[role="listbox"],[role="grid"],[aria-label*="message list" i],[aria-label*="mail list" i]')}
function cleanFolderLabel(value){let s=clean(value);s=s.replace(/,?\s*\d+\s+(?:unread|items?)\b.*$/i,'').replace(/,?\s*(?:selected|collapsed|expanded)\b.*$/i,'').trim();return s}
function folderNodeLabel(el){if(!el)return'';const dataName=clean(attr(el,'data-folder-name')||attr(el,'data-foldername'));if(dataName)return cleanFolderLabel(dataName);const aria=cleanFolderLabel(attr(el,'aria-label')||attr(el,'title'));if(aria&&!/^(?:expand|collapse)$/i.test(aria))return aria;const lines=rawText(el.innerText||el.textContent||'').split(/\n+/).map(cleanFolderLabel).filter(Boolean).filter(x=>!/^\d+$/.test(x));return lines[0]||''}
function folderHref(el){const a=el?.matches?.('a[href]')?el:el?.querySelector?.('a[href]');if(!a)return'';try{const u=new URL(a.href,location.href);if(u.origin!==location.origin||!/\/mail(?:\/|$)/i.test(u.pathname)||/\/(?:compose|search|group|groups)(?:\/|$)/i.test(u.pathname))return'';u.hash='';return u.href}catch(_){return''}}
function folderDomId(el){return clean(attr(el,'data-folder-id')||attr(el,'data-folderid')||attr(el,'data-id')||attr(el,'data-item-id')||'')}
function folderKeyFromParts(name,href,domId){if(href){try{const u=new URL(href,location.href);return `href:${hash(`${u.pathname}${u.search}`.toLowerCase())}`}catch(_){}}if(domId)return`id:${hash(domId)}`;return`name:${hash(clean(name).toLowerCase())}`}
function ignoredFolderLabel(name){return!name||/^(?:favorites?|folders?|groups?|search folders?|new folder|add shared folder|go to groups?|shared with me|more)$/i.test(clean(name))}
function folderSectionLabel(el){const tree=el?.closest?.('[role="tree"]');if(!tree)return'';for(let n=el?.parentElement;n&&n!==tree;n=n.parentElement){if(attr(n,'role')!=='treeitem')continue;if(Number(attr(n,'aria-level')||0)!==1)continue;const label=cleanFolderLabel(attr(n,'aria-label')||attr(n,'title')||n.textContent||'');if(label)return label}const items=[...tree.querySelectorAll('[role="treeitem"]')];let section='';for(const item of items){if(item===el)break;if(Number(attr(item,'aria-level')||0)!==1)continue;const label=cleanFolderLabel(attr(item,'aria-label')||attr(item,'title')||item.textContent||'');if(label)section=label}return section}
function isFavoritesShortcut(el){return /^favorites?\b/i.test(folderSectionLabel(el))}
function folderCandidates(strictIdentity=false){const raw=[...document.querySelectorAll('[role="tree"] [role="treeitem"],[role="tree"] [data-folder-name],[role="tree"] a[href*="/mail" i]')],out=[],byKey=new Map();for(const el0 of raw){const el=el0.closest?.('[role="treeitem"]')||el0;if(!isFolderTreeNode(el))continue;const name=folderNodeLabel(el),href=folderHref(el),domId=folderDomId(el),key=folderKeyFromParts(name,href,domId),level=Number(attr(el,'aria-level')||0);if(ignoredFolderLabel(name)||(level===1&&!href&&!domId&&!((attr(el,'aria-selected')==='true'||attr(el,'aria-current')==='page'))))continue;if(strictIdentity&&isFavoritesShortcut(el))continue;const prior=byKey.get(key);if(prior){if(strictIdentity&&String(key).startsWith('name:')&&prior._el!==el){const a=folderSectionLabel(prior._el)||'unknown section',b=folderSectionLabel(el)||'unknown section';throw new Error(`Outlook exposes multiple real folders named "${name}" without a stable href or folder ID (sections: ${a} / ${b}). Mailbox completeness cannot be claimed.`)}continue}const item={key,name:name.slice(0,220),href,domId,selected:attr(el,'aria-selected')==='true'||attr(el,'aria-current')==='page',_el:el};byKey.set(key,item);out.push(item)}return out}
function selectedFolderCandidate(){return folderCandidates().find(x=>x.selected)||null}
function folderName(){const selected=selectedFolderCandidate();if(selected?.name)return selected.name;const c=[...document.querySelectorAll('[aria-current="page"],[aria-selected="true"]')].filter(visible).map(x=>cleanFolderLabel(attr(x,'aria-label')||x.textContent||'')),exact=c.find(x=>/^inbox$/i.test(x)||/^sent items$/i.test(x)||/^drafts$/i.test(x)||/^deleted items$/i.test(x)||/^archive$/i.test(x)||/^junk email$/i.test(x));if(exact)return exact;return c.find(x=>/inbox/i.test(x))?'Inbox':'Outlook Web'}
function mailboxHint(){
    const labels=[...document.querySelectorAll('[aria-label*="account" i],[aria-label*="profile" i]')]
        .filter(visible).map(el=>clean(attr(el,'aria-label'))).filter(Boolean);
    const account=labels.find(x=>/^Account manager for\s+\S/i.test(x));
    if(account)return account.slice(0,220);
    // The account button can load after Postmaster boots. Derive the SAME
    // account label from the verified Outlook title instead of hashing the
    // changing folder name ("Mail", "Notes", "Vector Check It", ...).
    const parts=clean(document.title||'').split(/\s+-\s+/);
    for(let i=parts.length-1;i>=2;i--){
        if(/^Outlook$/i.test(parts[i])&&parts[i-1]?.length>1)
            return ('Account manager for '+parts[i-1]).slice(0,220);
    }
    return '';
}
function mailboxId(){const hint=mailboxHint();return hint?`outlook:${hash(hint.toLowerCase())}`:''}
function currentFolderKey(){return selectedFolderCandidate()?.key||''}
function folderId(){const key=currentFolderKey();return `${mailboxId()}:${key||`name:${hash(folderName().toLowerCase())}`}`}
function credibleMessageRow(m){return!!m?._strongId&&clean(m.senderName).length>=2&&clean(m.subject).length>=1&&!symbolOnly(m.senderName)&&!timeLike(m.senderName)&&!timeLike(m.subject)}
function assess(messages){const strong=messages.filter(m=>m._strongId).length,valid=messages.filter(credibleMessageRow).length,positions=messages.every((m,i)=>Number(m.listPosition)===i);return{quality:messages.length&&strong===messages.length&&valid===messages.length&&positions?'good':'partial',total:messages.length,strongIdRows:strong,validRows:valid,positionsValid:positions}}
function snapshot(){const messages=candidateRows().map(parseRow),assessment=assess(messages);return{messages,assessment,folder:folderName(),mailbox:mailboxHint()}}
// A background Chromium timer can wake a minute late. Count actual
// source observations rather than abandoning the wait before sampling again.
async function stableSnapshot(timeout=2200){
    const attempts=Math.max(3,Math.min(16,Math.ceil(timeout/220)+1));
    const started=Date.now();let last='',stable=0,x;
    for(let i=0;i<attempts;i++){
        x=snapshot();
        const sig=JSON.stringify(x.messages.map(m=>[m.listPosition,m.messageKey]));
        if(x.messages.length&&!mailBusy()){
            stable=sig===last?stable+1:1;last=sig;
            if(stable>=3)return {...x,settled:true};
        }else{last='';stable=0;}
        if(i+1===attempts||Date.now()-started>=8*60000)break;
        await wait(220);
    }
    return {...x,settled:false};
}
function mailListHosts(){const out=[];for(const sel of ['[id="MailList"]','[role="listbox"]','[role="grid"]','[aria-label*="message list" i]','[aria-label*="mail list" i]','[role="list"][aria-labelledby]','[role="list"][aria-label]'])for(const el of document.querySelectorAll(sel))if(el instanceof HTMLElement&&visible(el)&&!el.closest('[role="tree"]')&&(!el.matches('[role="list"]')||isNativeMessageListRegion(el))&&!out.includes(el))out.push(el);return out}
function listScroller(){
    const rows=candidateRows(),candidates=[];
    for(const row of rows.slice(0,8))for(let n=row.parentElement;n&&n!==document.body;n=n.parentElement)
        if(n instanceof HTMLElement&&!candidates.includes(n))candidates.push(n);
    for(const el of mailListHosts())if(!candidates.includes(el))candidates.push(el);
    const eligible=candidates.filter(el=>visible(el)&&
        el.scrollHeight>el.clientHeight+40&&
        /(auto|scroll|overlay)/i.test(getComputedStyle(el).overflowY||'')&&
        rows.some(row=>el.contains(row)));
    // The live Outlook virtual-list row is inside a customScrollBar.
    // Prefer the real common native list scroll host to an overflowed
    // inner message preview or an unrelated outer panel.
    const native=eligible.find(el=>el.classList?.contains('customScrollBar')&&
        rows.every(row=>el.contains(row)));
    return native||eligible.find(el=>rows.every(row=>el.contains(row)))||null;
}
function resetFailedCrawlCursor(s){
    if(s?.status==='error'&&Array.isArray(s.seen)){
        // Previous run may have traversed an unloaded viewport. Start
        // at the top on an explicit retry, retaining acknowledged IDs.
        s.steps=0;s.lastTop=0;
    }
}
async function stableCrawlRows(s,scroller){
    for(let attempt=0;attempt<3;attempt++){
        if(crawlAbort)throw new Error('Folder sync paused safely.');
        if(!crawlMatchesPage(s))throw new Error('Mailbox or folder changed during viewport collection.');
        if(!scroller.isConnected)throw new Error('Native message list replaced during viewport collection.');
        const snap=await stableSnapshot(2200);
        const strong=snap.messages.filter(credibleMessageRow);
        if(snap.settled===true&&strong.length&&!mailBusy())return strong;
        if(attempt<2)await wait(1200);
    }
    return null;
}
async function stableCrawlViewport(s,scroller){
    let strong=await stableCrawlRows(s,scroller);
    if(strong)return strong;
    const cursor=Number(scroller.scrollTop);
    // A live virtualized viewport failed after 504 acknowledged IDs.
    // Re-trigger rendering by moving back inside the previous viewport,
    // then return to EXACTLY the failed cursor. Never jump forward past it.
    if(Number.isFinite(cursor)&&cursor>0&&scroller.clientHeight>0&&
        !crawlAbort&&crawlMatchesPage(s)&&scroller.isConnected){
        scroller.scrollTop=Math.max(0,cursor-Math.max(24,Math.floor(scroller.clientHeight*0.35)));
        await wait(700);
        if(crawlAbort||!crawlMatchesPage(s)||!scroller.isConnected)
            throw new Error('Folder or viewport changed during recovery; partial coverage retained.');
        scroller.scrollTop=cursor;
        await wait(900);
        if(Math.abs(scroller.scrollTop-cursor)<3){
            strong=await stableCrawlRows(s,scroller);
            if(strong)return strong;
        }
    }
    throw sourceUnavailableError('Native message viewport did not expose credible settled rows; partial coverage retained at the current cursor.');
}
async function recoverEmptyResumeViewport(s){
    if(!s?.seen?.length||crawlAbort||!crawlMatchesPage(s))return false;
    const hosts=[...document.querySelectorAll('.customScrollBar')].filter(el=>
        visible(el)&&el.isConnected&&!el.closest('[role="tree"]')&&
        el.scrollHeight>el.clientHeight+40&&
        (nativeMessageListRegion(el)||containsNativeMessageList(el)));
    if(hosts.length!==1)return false;
    hosts[0].scrollTop=0;
    await wait(1200);
    return !crawlAbort&&crawlMatchesPage(s)&&hosts[0].isConnected;
}
function nativeMailRoots(){
    return [...document.querySelectorAll('[id="MailList"],[role="group"],[role="list"],[role="listbox"],[role="grid"],[role="region"],ul,ol,section')]
        .filter(el=>isNativeMessageListRegion(el)&&visible(el)&&!el.closest('[role="tree"]'));
}
function mailBusy(){
    const busy=[...document.querySelectorAll('[aria-busy="true"],[role="progressbar"],[aria-label*="loading" i],[title*="loading" i]')].filter(visible);
    if(!busy.length)return false;
    const roots=nativeMailRoots();
    // Loading elsewhere (calendar, reading pane, side rail) is not a
    // message-list loading witness. With no exact list, fail closed.
    return !roots.length||busy.some(el=>roots.some(root=>root===el||root.contains(el)||el.contains(root)));
}
function sourceAvailability(){
    const raw=[...document.querySelectorAll('[role="option"],[data-convid],[data-itemid],[data-item-id],[data-conversation-id],[role="listitem"][id],li[id]')].filter(el=>!!nativeMessageListRegion(el)&&!el.closest('[role="tree"]'));
    const rows=candidateRows();
    return {visibility:document.visibilityState||'unknown',nativeRoots:nativeMailRoots().length,nativeCandidates:raw.length,visibleNativeCandidates:raw.filter(visible).length,candidateRows:rows.length,credibleRows:rows.map(parseRow).filter(credibleMessageRow).length,listBusy:mailBusy()};
}
function sourceUnavailableError(message){
    const d=sourceAvailability();
    trace('native_source_unavailable',d);
    return Error(message+' [view='+d.visibility+'; roots='+d.nativeRoots+'; native rows='+d.nativeCandidates+'; visible='+d.visibleNativeCandidates+'; credible='+d.credibleRows+'; list busy='+d.listBusy+']');
}
function hasExplicitEmptyFolderWitness(){
    // A temporarily blank virtualized list is NOT evidence that a folder
    // contains no mail. Require an actual visible Outlook empty-state
    // announcement, not text elsewhere in an open message or search result.
    // A search that happens to return zero results does not prove the
    // selected folder itself is empty.
    const inputs=[...document.querySelectorAll('input[role="searchbox"],input[aria-label*="search" i]')];
    if(inputs.some(el=>clean(el.value||'').length>0))return false;
    const headings=[...document.querySelectorAll('[role="heading"],h1,h2')];
    if(headings.some(el=>visible(el)&&/^(?:all )?(?:search )?results$/i.test(clean(el.innerText||el.textContent||''))))return false;
    const selectors='[role="status"],[role="alert"],[data-testid*="empty" i],[data-automation-id*="empty" i]';
    const notices=[...document.querySelectorAll(selectors)];
    const exact=/^(?:nothing here(?: yet)?[.!]?|this folder is empty[.!]?|there are no messages(?: in this folder)?[.!]?|no messages in this folder[.!]?|you(?:'|\u2019)re all caught up[.!]?)$/i;
    if(notices.some(el=>visible(el)&&exact.test(clean(el.innerText||el.textContent||''))))return true;
    // Live Outlook renders this empty state inside Message list as a group.
    // Require the exact native two-part wording and a selected folder.
    if(!selectedFolderCandidate())return false;
    const groups=[...document.querySelectorAll('[role="group"],[role="region"],[aria-label],[id="MailList"]')];
    return groups.some(el=>{
        // Native accessibility inspection on 2026-11-23 identified
        // #MailList directly beneath #Skip to message list-region.
        // Outlook's generic DIVs need not expose an explicit ARIA role.
        const nativeId=attr(el,'id')==='MailList'&&
            !!el.closest?.('[id="Skip to message list-region"]');
        if(!visible(el)||(!nativeId&&!nativeMessageListRegion(el)))return false;
        const text=clean(el.innerText||el.textContent||'');
        const label=clean(attr(el,'aria-label'));
        return [text,label].some(x=>/^nothing in folder[.!]?\s+looks empty over here[.!]?$/i.test(x)||
            (nativeId&&/^archive$/i.test(selectedFolderCandidate()?.name||'')&&
             /^nothing in archive[.!]?\s+clean up your inbox by moving messages to archive[.!]?$/i.test(x)));
    });
}
function hasNativeNonMailNotesView(){
    const selected=selectedFolderCandidate();
    if(!selected||!/^notes$/i.test(selected.name||''))return false;
    const native=document.getElementById('Jump to notes list-region');
    return !!native&&visible(native)&&!document.getElementById('MailList');
}
async function stableNonMailNotesView(){
    if(!hasNativeNonMailNotesView())return false;
    for(let pass=0;pass<6;pass++){
        if(mailBusy()||candidateRows().length||!hasNativeNonMailNotesView())return false;
        if(pass<5)await wait(350);
    }
    return true;
}
async function stableEmptyFolder(timeout=5200){
    const started=Date.now();let witnessPasses=0;
    const attempts=Math.max(6,Math.min(20,Math.ceil(timeout/350)+1));
    for(let i=0;i<attempts;i++){
        if(i>0&&Date.now()-started>=8*60000)return false;
        if(candidateRows().length||mailBusy()||!hasExplicitEmptyFolderWitness()){
            witnessPasses=0;await wait(350);continue;
        }
        witnessPasses++;
        if(witnessPasses>=6)return true;
        await wait(350);
    }
    return false;
}
function readingPaneCandidates(){const selectors=['[role="main"] [aria-label*="message" i]','[role="main"] [aria-label*="reading pane" i]','[aria-label*="reading pane" i]','[data-app-section="MailReadCompose"]','[role="document"]'];const out=[];for(const sel of selectors)for(const el of document.querySelectorAll(sel))if(visible(el)&&!nativeMessageListRegion(el)&&!containsNativeMessageList(el)&&!out.includes(el))out.push(el);return out}
function scorePane(el){const text=rawText(el.innerText||el.textContent||'');if(text.length<40)return-1;let score=Math.min(30,text.length/500);if(el.querySelector('[role="document"]'))score+=15;if(el.querySelector('time,[datetime]'))score+=5;if(el.querySelector('[aria-label*="From" i],[title*="From" i],a[href^="mailto:"]'))score+=5;if(el.closest('[role="listbox"],[role="grid"]'))score-=30;return score}
function findReadingPane(){return readingPaneCandidates().map(el=>({el,score:scorePane(el)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)[0]?.el||null}
function firstText(selectors,root=document){for(const sel of selectors){for(const el of root.querySelectorAll(sel)){const t=clean(attr(el,'aria-label')||attr(el,'title')||el.textContent||'');if(t)return t}}return''}
function findListMetaForOpen(subject,senderName,displayed){const wantSubject=clean(subject).toLowerCase(),wantSender=clean(senderName).toLowerCase(),wantDisplayed=clean(displayed).toLowerCase();let best=null,bestScore=-1;candidateRows().forEach((el,index)=>{const m=parseRow(el,index);let score=0;if(wantSubject&&clean(m.subject).toLowerCase()===wantSubject)score+=8;if(wantSender&&clean(m.senderName).toLowerCase()===wantSender)score+=4;if(wantDisplayed&&clean(m.displayedReceivedText||'').toLowerCase()===wantDisplayed)score+=2;if(score>bestScore){bestScore=score;best=m}});return bestScore>=10?best:null}
function genericPaneToken(v){return /^(?:skip to(?: message)?(?:-region)?|message[- ]?region|main|content|mail|reading pane|message)$/i.test(clean(v))}
function parseOpenMessage(){const pane=findReadingPane();if(!pane)throw new Error('No already-open Outlook message was found in the reading pane.');const dedicated=[...pane.querySelectorAll('[role="document"],[aria-label*="message body" i],[contenteditable="true"]')].filter(el=>visible(el)&&rawText(el.innerText||el.textContent||'').length>=20).sort((a,b)=>rawText(b.innerText||b.textContent||'').length-rawText(a.innerText||a.textContent||'').length);const bodyEl=dedicated[0]||pane;const body=rawText(bodyEl.innerText||bodyEl.textContent||'').slice(0,30000);if(body.length<20)throw new Error('The open message body could not be read reliably.');const rows=candidateRows(),selected=rows.find(el=>attr(el,'aria-selected')==='true'||/selected/i.test(clean(el.className||'')));let listMeta=selected?parseRow(selected,rows.indexOf(selected)):null;let subject=firstText(['[role="heading"]','h1','h2','[data-testid*="subject" i]'],pane)||listMeta?.subject||'';if(subject.length>600)subject=subject.slice(0,600);let senderWitness=openSenderWitness(pane,bodyEl,listMeta),senderAddress=senderWitness.address,senderName=senderWitness.name;const timeEl=pane.querySelector('time,[datetime]'),receivedAt=isoMaybe(attr(timeEl,'datetime'))||listMeta?.receivedAt||'',displayed=clean(attr(timeEl,'aria-label')||attr(timeEl,'title')||timeEl?.textContent||'')||listMeta?.displayedReceivedText||'';if(!listMeta){listMeta=findListMetaForOpen(subject,senderName,displayed);if(listMeta){senderWitness=openSenderWitness(pane,bodyEl,listMeta);senderAddress=senderWitness.address;senderName=senderWitness.name}}if(genericPaneToken(subject)||genericPaneToken(senderName))throw new Error('Outlook navigation chrome was mistaken for a message; capture ignored.');if(!clean(subject)&&!clean(senderName)&&!clean(senderAddress))throw new Error('The open reading pane did not expose credible message identity.');const hasAttachments=!!pane.querySelector('[aria-label*="attachment" i],[title*="attachment" i],[data-icon-name*="Attach" i]')||!!listMeta?.hasAttachments;const paneIdRaw=attr(pane,'data-itemid')||attr(pane,'data-item-id')||attr(pane,'data-convid')||attr(pane,'id'),paneId=genericPaneToken(paneIdRaw)?'':paneIdRaw;const messageKey=listMeta?.messageKey||(paneId?`outlook:${paneId}`:`outlook:${hash(`${senderAddress}|${senderName}|${subject}|${displayed}|${body.slice(0,1000)}`)}`);if(genericPaneToken(String(messageKey).replace(/^outlook:/i,'')))throw new Error('Outlook navigation chrome did not provide a valid message key.');return{messageKey,senderName:clean(senderName).slice(0,220),senderAddress:senderAddress.slice(0,320),subject:clean(subject).slice(0,600),receivedAt:receivedAt||undefined,displayedReceivedText:displayed.slice(0,160)||undefined,listPosition:listMeta?.listPosition??0,previewText:clean(body).slice(0,1200),bodyText:body,isUnread:!!listMeta?.isUnread,isFlagged:!!listMeta?.isFlagged,hasAttachments,webUrl:location.href,captureLevel:'opened_message'}}
function makeCapture(messages,quality,notes,folder=folderName()){const capturedAt=new Date().toISOString(),captureId=`workmail:${Date.now()}:${Math.random().toString(36).slice(2,9)}`;return{version:VERSION,workEmailCapture:{captureId,capturedAt,source:'Outlook Web rendered UI',sourceVersion:VERSION,mailboxHint:mailboxHint(),mailboxId:mailboxId(),folderId:folderId(),folderName:folder,visibleCount:messages.length,quality,notes,messages}}}
function crawlState(){const s=GM_getValue(CRAWL_KEY,null);return s&&typeof s==='object'?s:null}
function saveCrawl(s){GM_setValue(CRAWL_KEY,s);return s}
function clearCrawl(){GM_deleteValue(CRAWL_KEY)}
function openedKeys(){const a=GM_getValue(OPENED_KEY,[]);return new Set(Array.isArray(a)?a.slice(-10000):[])}
function saveOpened(set){GM_setValue(OPENED_KEY,[...set].slice(-10000))}
function mailboxState(){const s=GM_getValue(MAILBOX_KEY,null);return s&&typeof s==='object'?s:null}
function saveMailbox(s){GM_setValue(MAILBOX_KEY,s);return s}
function clearMailbox(){GM_deleteValue(MAILBOX_KEY)}
function mailboxMatches(s){const id=mailboxId();return!!s&&!!id&&s.mailboxId===id}
function serializableFolder(c){return{key:c.key,name:c.name,href:c.href||'',domId:c.domId||'',status:'pending',indexedCount:0,lastError:'',navAttempts:0,crawlAttempts:0}}
async function expandFolderGroups(){let total=0;for(let pass=0;pass<8&&total<80;pass++){const buttons=[...document.querySelectorAll('[role="tree"] button[aria-expanded="false"],[role="tree"] [role="button"][aria-expanded="false"]')].filter(el=>visible(el)&&isFolderTreeNode(el)).slice(0,20);if(!buttons.length)break;let opened=0;for(const el of buttons){if(total>=80)break;try{el.click();total++;opened++;await wait(140)}catch(_){}}if(!opened)break;await wait(420)}if(total)await wait(650);const remaining=[...document.querySelectorAll('[role="tree"] button[aria-expanded="false"],[role="tree"] [role="button"][aria-expanded="false"]')].filter(el=>visible(el)&&isFolderTreeNode(el)).length;return{total,remaining,truncated:remaining>0}}
async function discoverMailboxFolders(){const expansion=await expandFolderGroups();if(expansion.truncated)throw new Error(`Mailbox folder discovery stopped at its safe expansion ceiling with ${expansion.remaining} collapsed folder groups still visible. Mailbox completeness cannot be claimed.`);const found=folderCandidates(true).map(serializableFolder),selected=selectedFolderCandidate();if(selected&&!found.some(x=>x.key===selected.key))found.unshift(serializableFolder(selected));const byKey=new Map();for(const f of found){if(!byKey.has(f.key))byKey.set(f.key,f)}const all=[...byKey.values()];if(all.length>MAX_MAILBOX_FOLDERS)throw new Error(`Mailbox exposes ${all.length} discoverable folders, above the safe ceiling of ${MAX_MAILBOX_FOLDERS}. Mailbox completeness cannot be claimed.`);const order=['inbox','sent items','archive','drafts','deleted items','junk email'];return all.sort((a,b)=>{const ai=order.indexOf(a.name.toLowerCase()),bi=order.indexOf(b.name.toLowerCase());return(ai<0?999:ai)-(bi<0?999:bi)||a.name.localeCompare(b.name)})}
function newMailbox(folders){return{version:1,mailboxId:mailboxId(),mailboxHint:mailboxHint(),status:'pending',folders,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),lastError:''}}
function targetForCurrentPage(ms){const current=selectedFolderCandidate(),name=folderName().toLowerCase();return(ms?.folders||[]).find(f=>(current&&f.key===current.key)||clean(f.name).toLowerCase()===name)||null}
function targetMatchesPage(target){if(!target)return false;const current=selectedFolderCandidate();if(current&&current.key===target.key)return true;if(target.href){try{const a=new URL(target.href,location.href),b=new URL(location.href);if(a.pathname===b.pathname&&a.search===b.search)return true}catch(_){}}if(String(target.key||'').startsWith('name:'))return clean(folderName()).toLowerCase()===clean(target.name).toLowerCase();return false}
function crawlMatchesTarget(crawl,target){if(!crawl||!target||crawl.mailboxId!==mailboxId())return false;if(crawl.folderKey&&target.key)return crawl.folderKey===target.key;return clean(crawl.folderName).toLowerCase()===clean(target.name).toLowerCase()}
function scopedPartialCheckpoint(crawl,target){if(!crawl||!target||!['running','paused','error'].includes(crawl.status)||crawl.mailboxId!==mailboxId()||!crawl.folderKey||crawl.folderKey!==target.key||!Array.isArray(crawl.seen)||crawl.seen.length>MAX_FOLDER_MESSAGES)return null;return {...crawl,seen:[...crawl.seen],status:'paused',lastError:'',steps:0,lastTop:0};}
function mailboxHasUnverifiedEmpty(ms){return(ms?.folders||[]).some(f=>f.status==='complete'&&Number(f.indexedCount||0)===0&&f.emptyWitness!==true&&f.nonMailWitness!=='outlook_notes_view')}
function mailboxNeedsRetry(ms){
    return mailboxHasUnverifiedEmpty(ms)||!!(ms&&
        ['paused','error','complete_with_errors'].includes(ms.status)&&
        (ms.folders||[]).some(f=>f.status==='error'));
}
function reconcileCompletedCrawl(ms,prior){
    if(!ms||!prior||prior.status!=='complete')return false;
    const count=Number(prior.seen?.length||0);
    if(count<=0&&prior.emptyWitness!==true&&prior.nonMailWitness!=='outlook_notes_view')return false;
    const folder=(ms.folders||[]).find(f=>crawlMatchesTarget(prior,f));
    if(!folder||folder.status==='complete'&&Number(folder.indexedCount||0)>=count)return false;
    // Only a real read with the same authenticated mailbox and folder may
    // advance the existing manifest after a separately run manual folder scan.
    folder.status='complete';folder.indexedCount=count;folder.emptyWitness=!!prior.emptyWitness;folder.nonMailWitness=prior.nonMailWitness||'';
    folder.lastSuccessAt=prior.lastSuccessAt||new Date().toISOString();
    folder.lastError='';
    return true;
}
function mailboxSummary(ms){const folders=ms?.folders||[],complete=folders.filter(f=>f.status==='complete').length,errors=folders.filter(f=>f.status==='error').length,indexed=folders.reduce((n,f)=>n+Number(f.indexedCount||0),0);return{folders:folders.length,complete,errors,indexed,excluded:folders.filter(f=>f.status==='complete'&&f.nonMailWitness==='outlook_notes_view').length}}
function mailboxManifestFolderIds(ms){return(ms?.folders||[]).map(f=>`${ms.mailboxId}:${clean(f.key)}`).filter(Boolean).sort()}
function mailboxManifestFingerprint(ms){return hash(mailboxManifestFolderIds(ms).join('|'))}
function mailboxManifestPayload(ms){const summary=mailboxSummary(ms),status=ms?.status==='complete'?'complete':ms?.status==='paused'?'paused':(ms?.status==='error'||ms?.status==='complete_with_errors')?'error':ms?.status==='running'?'running':'pending';return{version:VERSION,workEmailIngestionState:{provider:MANIFEST_PROVIDER,mailboxId:ms.mailboxId,folderId:`${ms.mailboxId}:__mailbox_manifest__`,folderName:'__MAILBOX_MANIFEST__',syncStatus:status,lastPageCursor:`v1|expected=${summary.folders}|complete=${summary.complete}|errors=${summary.errors}|excluded=${Number(summary.excluded||0)}`,deltaCursor:`v1|hash=${mailboxManifestFingerprint(ms)}`,indexedCount:summary.indexed,lastSuccessAt:ms.lastSuccessAt||undefined,lastError:status==='complete'?'':(ms.lastError||(summary.errors?`${summary.errors} folder errors`:'')),updatedAt:new Date().toISOString()}}}
async function reportMailboxManifest(ms){if(!ms?.mailboxId||!Array.isArray(ms?.folders)||!ms.folders.length)return false;const res=await request(mailboxManifestPayload(ms));if(!res?.workEmailIngestionState?.accepted)throw new Error(res?.workEmailIngestionState?.error||res?.workEmailIngestionState?.reason||'Rebel Command did not accept the mailbox manifest.');return true}
// Report current terminal folder outcomes promptly, not only at the end
// of a long mailbox pass. A navigation error is evidence of a failed
// lookup, never a native message read or completed folder.
async function reportMailboxProgress(ms,target=null){
    if(!mailboxMatches(ms))return false;
    if(target&&target.status==='error'&&ms.folders?.includes(target)&&target.key&&target.name){
        try{
            const result=await request({version:VERSION,workEmailIngestionState:{
                provider:'outlook_web_rendered_ui',mailboxId:ms.mailboxId,
                folderId:ms.mailboxId+':'+target.key,folderName:target.name,
                syncStatus:'error',indexedCount:Number(target.indexedCount||0),
                lastPageCursor:'',deltaCursor:'',lastError:target.lastError||'Native folder navigation unresolved.',
                updatedAt:new Date().toISOString()
            }});
            if(!result?.workEmailIngestionState?.accepted)throw Error('Folder error receipt not acknowledged');
        }catch(e){trace('folder_progress_report_error',{key:target.key,error:clean(e?.message||e)});}
    }
    try{return await reportMailboxManifest(ms)}
    catch(e){trace('mailbox_progress_report_error',{error:clean(e?.message||e)});return false;}
}
function findFolderNavTarget(target){const candidates=folderCandidates(),exact=candidates.find(c=>c.key===target.key);if(exact)return exact;if(String(target?.key||'').startsWith('name:'))return candidates.find(c=>clean(c.name).toLowerCase()===clean(target.name).toLowerCase())||null;return null}
async function navigateToFolder(target){
    const c=findFolderNavTarget(target),el=c?._el,account=mailboxId();
    if(!account||!el||!isFolderTreeNode(el))
        throw Error('Folder navigation target not found for '+target.name+'. Expand the Outlook folder tree and resume.');
    // Use Outlook's own native folder selection; never force a full page
    // navigation just to switch a folder in an authenticated mailbox.
    const before=folderName();el.click();
    const started=Date.now();
    for(let i=0;i<33;i++){
        if(mailboxAbort)throw Error('Mailbox sync paused before folder navigation completed.');
        if(mailboxId()!==account)throw Error('Outlook account changed during folder navigation.');
        const selected=selectedFolderCandidate();
        if(selected&&selected.key===target.key)return true;
        if(selected&&String(target.key||'').startsWith('name:')&&
            clean(selected.name).toLowerCase()===clean(target.name).toLowerCase()){
            const matches=folderCandidates(true).filter(x=>clean(x.name).toLowerCase()===clean(target.name).toLowerCase());
            if(matches.length===1&&matches[0].key===selected.key)return true;
        }
        if(i===32||Date.now()-started>=8*60000)break;
        await wait(250);
    }
    throw Error('Outlook did not confirm selected folder '+target.name+' after native folder-tree activation (started from '+before+').');
}
function statePayload(s){const nativeWitness=Number.isSafeInteger(s.nativeItemCount)&&s.nativeItemCount>=0&&s.nativeItemCountAt?{nativeItemCount:s.nativeItemCount,nativeItemCountAt:s.nativeItemCountAt}:{};return{version:VERSION,workEmailIngestionState:{...nativeWitness,provider:'outlook_web_rendered_ui',mailboxId:s.mailboxId,folderId:s.folderId,folderName:s.folderName,syncStatus:s.status,lastPageCursor:s.nonMailWitness==='outlook_notes_view'?'non_mail:outlook_notes_view':String(s.lastTop??''),deltaCursor:s.nonMailWitness==='outlook_notes_view'?'non_mail_excluded':s.lastKey||'',indexedCount:Number(s.seen?.length||0),lastSuccessAt:s.lastSuccessAt||undefined,lastError:s.lastError||'',updatedAt:new Date().toISOString()}}}
async function reportCrawl(s){try{await request(statePayload(s))}catch(_){/* Local checkpoint remains authoritative until bridge state ingestion is enabled. */}}
let crawlAbort=false;
// A native folder tree count is a coverage witness, not a fabricated count.
function explicitFolderItemCount(el){
    // Chromium may build the accessible folder name from a child count
    // badge rather than a single aria-label on the tree item. Read ONLY
    // the selected tree item's own labels, never its nested folder counts.
    const labels=[attr(el,'aria-label'),attr(el,'title'),attr(el,'aria-description')];
    // Outlook may put a total in an aria-describedby reference rather
    // than its accessible-name text. Unread counts remain ineligible.
    for(const node of el?.querySelectorAll?.('[aria-label],[title],[aria-description],[aria-describedby],span')||[]){
        if(node.closest?.('[role="treeitem"]')!==el)continue;
        labels.push(attr(node,'aria-label'),attr(node,'title'),attr(node,'aria-description'));
        if(!node.children?.length){const t=clean(node.innerText||node.textContent||'');if(/^\[?[0-9,]+\]?\s+items?$/i.test(t))labels.push(t);}
        const desc=attr(node,'aria-describedby').split(/\s+/).filter(Boolean);
        if(desc.length)labels.push(desc.map(id=>clean(document.getElementById(id)?.textContent||'')).join(' '));
    }
    const ids=(attr(el,'aria-labelledby')+' '+attr(el,'aria-describedby')).split(/\s+/).filter(Boolean);
    if(ids.length)labels.push(ids.map(id=>clean(document.getElementById(id)?.textContent||'')).join(' '));
    const counts=new Set();
    for(const label of labels){
        // Live Outlook UIA HelpText: Junk Email - 747 items (728 unread).
        // The total is explicitly labeled items; the unread suffix is not the total.
        const match=label.match(/(?:\[([0-9,]+)\]|(?:^|[ ,])([0-9,]+))\s+items?(?:\s*\([0-9,]+\s+unread\))?\s*$/i);
        if(!match)continue;
        const n=Number((match[1]||match[2]).replaceAll(',',''));
        if(Number.isSafeInteger(n)&&n>=0)counts.add(n);
    }
    return counts.size===1?[...counts][0]:null;
}
function currentFolderItemCount(){
    const c=selectedFolderCandidate();
    return c?explicitFolderItemCount(c._el):null;
}
function noteFolderCoverage(s){
    const n=crawlMatchesPage(s)?currentFolderItemCount():null;
    if(n!==null){s.nativeItemCount=n;s.nativeItemCountAt=new Date().toISOString();}
    return Number.isSafeInteger(s.nativeItemCount)?s.nativeItemCount:null;
}
function assertFolderCoverage(s){
    const count=noteFolderCoverage(s);
    if(count!==null&&s.seen.length<count)
        throw new Error(`Outlook shows ${count} folder items but only ${s.seen.length} distinct message IDs were indexed. Partial coverage retained; folder not marked complete.`);
}
function requeueShortCompletedFolders(ms){
    if(!mailboxMatches(ms))return 0;
    const counts=new Map(folderCandidates().map(c=>[c.key,explicitFolderItemCount(c._el)]));
    let changed=0;
    for(const f of ms.folders||[]){
        const n=counts.get(f.key);
        if(!Number.isSafeInteger(n)||f.status!=='complete'||Number(f.indexedCount||0)>=n)continue;
        f.status='error';f.nativeItemCount=n;f.lastError=`Source exposes ${n} items; previously indexed ${Number(f.indexedCount||0)}.`;
        f.navAttempts=0;f.crawlAttempts=0;changed++;
    }
    if(changed){ms.status='complete_with_errors';saveMailbox(ms)}
    return changed;
}
function newCrawl(){return{version:2,mailboxId:mailboxId(),folderId:folderId(),folderKey:currentFolderKey(),folderName:folderName(),mailboxHint:mailboxHint(),status:'pending',seen:[],steps:0,lastTop:0,lastKey:'',lastSuccessAt:'',lastError:'',startedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
function crawlMatchesPage(s){if(!s||s.mailboxId!==mailboxId())return false;const key=currentFolderKey();if(s.folderKey&&key)return s.folderKey===key;return s.folderId===folderId()}
async function paceIndexBatch(count){const key='mvciPostmasterIndexNextAtV1';const now=Date.now();const pending=Math.max(0,Math.min(65000,Number(GM_getValue(key,0)||0)-now));if(pending>0)await wait(pending);GM_setValue(key,Date.now()+3000+1200*Math.min(50,Math.max(1,count)));}
async function uploadNewRows(rows,s){const acknowledged=new Set(s.seen);const fresh=[...new Map(rows.filter(m=>m._strongId&&m.messageKey&&!acknowledged.has(m.messageKey)).map(m=>[m.messageKey,m])).values()];if(!fresh.length)return 0;let total=0;for(let i=0;i<fresh.length;i+=50){const batch=fresh.slice(i,i+50);const msgs=batch.map(({_strongId,...m})=>m);await paceIndexBatch(msgs.length);if(!crawlMatchesPage(s))throw new Error('Mailbox or folder changed during index pacing; no batch submitted.');if(crawlAbort)throw new Error('Folder sync paused before next batch.');const res=await request(makeCapture(msgs,'good',`Whole-folder index batch for ${s.folderName}; stable Outlook message IDs only. Read-only virtual-list crawl; no messages opened or mailbox state changed.`,s.folderName));if(!res?.workEmail?.accepted)throw new Error(res?.workEmail?.error||res?.workEmail?.reason||'Rebel Command did not accept the folder-index batch.');if(res.workEmail.messages!==msgs.length)throw new Error('Folder-index receipt did not acknowledge every unique native message; checkpoint unchanged.');for(const m of batch)if(!s.seen.includes(m.messageKey))s.seen.push(m.messageKey);s.lastKey=msgs[msgs.length-1]?.messageKey||s.lastKey;s.lastSuccessAt=new Date().toISOString();s.updatedAt=s.lastSuccessAt;if(s.seen.length>MAX_FOLDER_MESSAGES)throw new Error(`Folder crawl safety ceiling of ${MAX_FOLDER_MESSAGES} unique messages reached.`);saveCrawl(s);await reportCrawl(s);total+=msgs.length;}return total}
async function runFolderSync({fresh=false,managed=false}={}){if(!paired())throw new Error('Pairing not configured.');if(state.busy&&!managed)throw new Error('Postmaster is already busy.');if(!managed)state.busy=true;crawlAbort=false;render();let s=crawlState();try{if(fresh||!crawlMatchesPage(s)||s?.status==='complete'){s=newCrawl();clearCrawl();saveCrawl(s)}resetFailedCrawlCursor(s);s.status='running';s.lastError='';s.updatedAt=new Date().toISOString();noteFolderCoverage(s);saveCrawl(s);await reportCrawl(s);if(!s.seen.length&&await stableNonMailNotesView()&&crawlMatchesPage(s)){s.nonMailWitness='outlook_notes_view';s.status='complete';s.lastSuccessAt=new Date().toISOString();s.updatedAt=s.lastSuccessAt;saveCrawl(s);await reportCrawl(s);state.msg='Native Outlook Notes is not a mail folder; excluded from email indexing. Notes were not read or counted.';state.kind='info';return}let initial=await stableSnapshot(2600);if(!initial.messages.length&&await recoverEmptyResumeViewport(s))initial=await stableSnapshot(2600);if(!initial.messages.length){const stableEmpty=await stableEmptyFolder();if(stableEmpty&&crawlMatchesPage(s)){assertFolderCoverage(s);s.emptyWitness=true;s.status='complete';s.lastSuccessAt=new Date().toISOString();s.updatedAt=s.lastSuccessAt;saveCrawl(s);await reportCrawl(s);state.msg=`Folder index complete: 0 messages in ${s.folderName}.`;state.kind='success';return}throw sourceUnavailableError('No credible message rows were found after a stable wait; folder was not marked complete.')}if(initial.settled!==true||initial.assessment.validRows<1)throw sourceUnavailableError('Outlook displayed rows, but none had both a stable message ID and credible sender/subject structure. Folder was not marked complete.');await uploadNewRows(initial.messages.filter(credibleMessageRow),s);let scroller=listScroller();if(!scroller){const confirm=await stableSnapshot(2600),strong=confirm.messages.filter(credibleMessageRow);if(confirm.settled!==true)throw Error('Native non-scrolling list did not settle; partial coverage retained.');await uploadNewRows(strong,s);const firstKeys=initial.messages.filter(credibleMessageRow).map(m=>m.messageKey).sort().join('|'),secondKeys=strong.map(m=>m.messageKey).sort().join('|');if(confirm.settled===true&&!mailBusy()&&firstKeys&&firstKeys===secondKeys){assertFolderCoverage(s);s.status='complete';s.lastSuccessAt=new Date().toISOString();s.updatedAt=s.lastSuccessAt;saveCrawl(s);await reportCrawl(s);state.msg=`Folder index complete: ${s.seen.length} unique messages indexed from non-scrolling folder ${s.folderName}.`;state.kind='success';return}throw new Error('Outlook message rows were visible but no stable scroll container or stable non-scrolling list could be verified.')}if(fresh||s.steps===0||!Number.isFinite(Number(s.lastTop))){scroller.scrollTop=0;await wait(900)}else{scroller.scrollTop=Math.max(0,Number(s.lastTop)||0);await wait(700)}let noNew=0,noMove=0,lastTop=-1,bottomRetries=0;while(!crawlAbort&&s.steps<MAX_CRAWL_STEPS){if(!crawlMatchesPage(s))throw new Error('Mailbox or folder changed during sync. Return to the original folder and resume.');const activeScroller=listScroller();if(activeScroller&&activeScroller!==scroller){scroller=activeScroller;scroller.scrollTop=Math.min(Math.max(0,scroller.scrollHeight-scroller.clientHeight),Math.max(0,Number(s.lastTop)||0));await wait(650);noMove=0;}if(!scroller.isConnected)throw new Error('Outlook replaced the scrolling list before its new source could be confirmed. Partial coverage retained.');const strong=await stableCrawlViewport(s,scroller);const added=await uploadNewRows(strong,s);noNew=added?0:noNew+1;s.steps++;const before=scroller.scrollTop,max=Math.max(0,scroller.scrollHeight-scroller.clientHeight),nearBottom=before>=max-6;const step=Math.max(40,Math.floor(scroller.clientHeight*0.65));scroller.scrollTop=Math.min(max,before+step);await wait(650);const after=scroller.scrollTop;noMove=Math.abs(after-before)<3?noMove+1:0;s.lastTop=after;s.updatedAt=new Date().toISOString();saveCrawl(s);if(crawlAbort)break;if((nearBottom&&noNew>=3)||(noMove>=3&&noNew>=2)){
const expected=noteFolderCoverage(s);
if(expected!==null&&s.seen.length<expected&&bottomRetries<3){
    bottomRetries++;
    // Give a lazy-loading list another real end-of-list transition.
    scroller.scrollTop=Math.max(0,scroller.scrollTop-step);
    await wait(500);
    await uploadNewRows(await stableCrawlViewport(s,scroller),s);
    scroller.scrollTop=Math.max(0,scroller.scrollHeight-scroller.clientHeight);
    await wait(1800);
    noNew=0;noMove=0;continue;
}
if(!nearBottom&&scroller.scrollTop<Math.max(0,scroller.scrollHeight-scroller.clientHeight)-6)
    throw new Error('Outlook list stopped scrolling before its end. Partial coverage retained.');
assertFolderCoverage(s);s.status='complete';s.lastSuccessAt=new Date().toISOString();s.updatedAt=s.lastSuccessAt;saveCrawl(s);await reportCrawl(s);state.msg=`Folder index complete: ${s.seen.length} unique messages indexed from ${s.folderName}.`;state.kind='success';return}s.lastTop=after;lastTop=after;state.msg=`Indexing ${s.folderName}: ${s.seen.length} unique messages · step ${s.steps}.`;state.kind='info';render()}if(crawlAbort){s.status='paused';s.updatedAt=new Date().toISOString();saveCrawl(s);await reportCrawl(s);state.msg=`Folder sync paused at ${s.seen.length} unique messages.`;state.kind='info'}else throw new Error(`Folder crawl safety ceiling of ${MAX_CRAWL_STEPS} scroll steps reached.`)}catch(e){if(s){s.status=crawlAbort?'paused':'error';s.lastError=crawlAbort?'':clean(e?.message||e);s.updatedAt=new Date().toISOString();saveCrawl(s);await reportCrawl(s)}state.msg=crawlAbort?'Folder sync paused safely.':`Folder sync stopped: ${clean(e?.message||e)}`;state.kind=crawlAbort?'info':'error'}finally{if(!managed){state.busy=false;render()}}}
// Retry only twice without genuine new progress. Preserve partial checkpoints
// and continue other folders; a manual retry is still available.
function hiddenNativeSourceError(error){
    // A hidden document with an unavailable native list is not a folder error
    // that repeated navigation can repair. Use only the observed diagnostic.
    return /\[view=hidden;[^]*?credible=0;/.test(String(error||''));
}
function deferHiddenFolderRetry(target){
    if(!hiddenNativeSourceError(target?.lastError))return false;
    target.status='pending';
    target.crawlAttempts=Math.max(0,Number(target.crawlAttempts||0)-1);
    return true;
}
async function waitForDeferredNativeView(ms,target){
    state.msg='Outlook is hiding its native message list. Saved progress retained; waiting for the original Outlook view or its native list to recover.';
    state.kind='info';render();
    while(!mailboxAbort){
        if(!mailboxMatches(ms)||!targetMatchesPage(target))throw Error('Outlook mailbox or folder scope changed while waiting; saved progress retained. Resume the original folder manually.');
        if(document.visibilityState!=='hidden')return true;
        // Outlook can restore its virtual list while the tab is still hidden.
        // A credible native row is permission to retry the stable sampler,
        // not a receipt or proof that the entire folder was collected.
        const native=sourceAvailability();
        if(native.nativeRoots>0&&native.credibleRows>0&&!native.listBusy)return true;
        await wait(1500);
    }
    return false;
}
function canRetryFolder(f){return f?.status==='error'&&Number(f.navAttempts||0)<MAX_FOLDER_NAV_ATTEMPTS&&Number(f.crawlAttempts||0)<MAX_FOLDER_NO_PROGRESS_ATTEMPTS;}
function noteNewFolderProgress(target,after){if(!after||!Array.isArray(after.seen))return false;const count=new Set(after.seen.filter(Boolean)).size;if(count<=Number(target.indexedCount||0))return false;target.crawlAttempts=0;return true;}
function pauseFolderSync(){crawlAbort=true;const s=crawlState();if(s&&s.status==='running'){s.status='paused';s.updatedAt=new Date().toISOString();saveCrawl(s);reportCrawl(s)}state.msg='Pause requested. Postmaster will stop after the current safe batch.';state.kind='info';render()}
let mailboxAbort=false;
async function runMailboxSync({fresh=false,retryErrors=false}={}){if(!paired())throw new Error('Pairing not configured.');if(!mailboxId())throw new Error('Outlook account identity not confirmed. Finish signing in and reload Outlook.');if(state.busy)throw new Error('Postmaster is already busy.');state.busy=true;mailboxAbort=false;crawlAbort=false;render();let ms=mailboxState();trace('mailbox_start',{fresh:!!fresh,retryErrors:!!retryErrors,priorStatus:ms?.status||'',priorFolderCount:Array.isArray(ms?.folders)?ms.folders.length:0});try{if(fresh||!mailboxMatches(ms)||!Array.isArray(ms?.folders)||!ms.folders.length){const folders=await discoverMailboxFolders();if(!folders.length)throw new Error('No Outlook mail folders could be discovered. Expand the folder tree and try again.');trace('mailbox_discovered',{folderCount:folders.length,folders:folders.map(f=>({key:f.key,name:f.name,hasHref:!!f.href,hasDomId:!!f.domId})).slice(0,120)});ms=newMailbox(folders);reconcileCompletedCrawl(ms,crawlState());clearMailbox();saveMailbox(ms)}reconcileCompletedCrawl(ms,crawlState());requeueShortCompletedFolders(ms);if(retryErrors){for(const f of ms.folders)if(f.status==='error'||(f.status==='complete'&&Number(f.indexedCount||0)===0&&f.emptyWitness!==true&&f.nonMailWitness!=='outlook_notes_view')){f.status='pending';f.navAttempts=0;f.crawlAttempts=0;f.lastError='';f.emptyWitness=false}const prior=crawlState();if(prior?.status==='error'){prior.status='paused';prior.steps=0;prior.lastTop=0;prior.lastError='';prior.updatedAt=new Date().toISOString();saveCrawl(prior)}}ms.status='running';ms.lastError='';ms.updatedAt=new Date().toISOString();saveMailbox(ms);await reportMailboxManifest(ms);let guard=0;const orchestrationCeiling=MAX_MAILBOX_FOLDERS*4+20;for(;guard<orchestrationCeiling&&!mailboxAbort;guard++){const target=ms.folders.find(f=>['pending','navigating','running'].includes(f.status))||ms.folders.find(canRetryFolder);if(!target){const summary=mailboxSummary(ms);ms.status=summary.errors?'complete_with_errors':'complete';ms.updatedAt=new Date().toISOString();if(ms.status==='complete')ms.lastSuccessAt=ms.updatedAt;saveMailbox(ms);state.msg=`Mailbox index ${summary.errors?'finished with errors':'complete'}: ${summary.indexed} indexed across ${summary.complete}/${summary.folders} folders${summary.errors?` · ${summary.errors} folder errors`:''}.`;state.kind=summary.errors?'error':'success';await reportMailboxManifest(ms);trace('mailbox_complete',{status:ms.status,folders:summary.folders,complete:summary.complete,errors:summary.errors,indexed:summary.indexed});return}if(target.status==='pending'&&hiddenNativeSourceError(target.lastError)){if(!await waitForDeferredNativeView(ms,target))break;target.lastError='';ms.lastError='';saveMailbox(ms)}if(!targetMatchesPage(target)){if(Number(target.navAttempts||0)>=MAX_FOLDER_NAV_ATTEMPTS){target.status='error';target.lastError=`Folder navigation stopped after ${MAX_FOLDER_NAV_ATTEMPTS} attempts for ${target.name}.`;ms.lastError=target.lastError;ms.updatedAt=new Date().toISOString();saveMailbox(ms);await reportMailboxProgress(ms,target);continue}target.status='navigating';target.navAttempts=Number(target.navAttempts||0)+1;ms.currentKey=target.key;ms.updatedAt=new Date().toISOString();saveMailbox(ms);state.msg=`Mailbox sync: opening ${target.name} (${mailboxSummary(ms).complete}/${ms.folders.length} folders complete).`;state.kind='info';render();trace('folder_navigate_attempt',{key:target.key,name:target.name,navAttempt:target.navAttempts,currentFolder:folderName()});try{const stayed=await navigateToFolder(target);if(!stayed)return;if(!targetMatchesPage(target))throw new Error(`Folder ${target.name} did not become active.`)}catch(e){target.status='error';target.lastError=clean(e?.message||e);trace('folder_navigate_error',{key:target.key,name:target.name,error:target.lastError,navAttempts:target.navAttempts});ms.lastError=target.lastError;ms.updatedAt=new Date().toISOString();saveMailbox(ms);await reportMailboxProgress(ms,target);continue}}target.navAttempts=0;target.status='running';target.lastError='';ms.currentKey=target.key;ms.updatedAt=new Date().toISOString();saveMailbox(ms);let prior=crawlState();if(!crawlMatchesTarget(prior,target)){const saved=scopedPartialCheckpoint(target.crawlCheckpoint,target);if(saved&&crawlMatchesPage(saved)){saveCrawl(saved);prior=saved}}if(prior?.status==='complete'&&(Number(prior.seen?.length||0)>0||prior.emptyWitness===true||prior.nonMailWitness==='outlook_notes_view')&&crawlMatchesTarget(prior,target)&&(!Number.isSafeInteger(target.nativeItemCount)||prior.seen.length>=target.nativeItemCount)){target.status='complete';delete target.crawlCheckpoint;target.indexedCount=Number(prior.seen?.length||0);target.emptyWitness=!!prior.emptyWitness;target.nonMailWitness=prior.nonMailWitness||'';target.lastSuccessAt=prior.lastSuccessAt||new Date().toISOString();saveMailbox(ms);await reportMailboxProgress(ms);continue}const resumeExisting=!!prior&&['running','paused','error'].includes(prior.status)&&crawlMatchesTarget(prior,target)&&crawlMatchesPage(prior);target.crawlAttempts=Number(target.crawlAttempts||0)+1;saveMailbox(ms);await runFolderSync({fresh:!resumeExisting,managed:true});const after=crawlState();trace('folder_crawl_result',{key:target.key,name:target.name,status:after?.status||'missing',indexedCount:Number(after?.seen?.length||0),steps:Number(after?.steps||0),error:clean(after?.lastError||'')});if(after?.status==='complete'&&crawlMatchesTarget(after,target)){target.status='complete';delete target.crawlCheckpoint;target.indexedCount=Number(after.seen?.length||0);target.emptyWitness=!!after.emptyWitness;target.nonMailWitness=after.nonMailWitness||'';target.lastSuccessAt=after.lastSuccessAt||new Date().toISOString()}else{target.status='error';if(after&&crawlMatchesTarget(after,target)){const partial=scopedPartialCheckpoint(after,target);if(partial)target.crawlCheckpoint=partial;noteNewFolderProgress(target,after);target.indexedCount=Math.max(Number(target.indexedCount||0),Number(after.seen?.length||0));if(Number.isSafeInteger(after.nativeItemCount))target.nativeItemCount=after.nativeItemCount;}target.lastError=after?.lastError||'Folder crawl did not complete.';ms.lastError=target.lastError;if(after&&crawlMatchesTarget(after,target)&&!mailboxAbort){if(deferHiddenFolderRetry(target)){ms.updatedAt=new Date().toISOString();saveMailbox(ms);await reportMailboxProgress(ms);if(!await waitForDeferredNativeView(ms,target))break;target.lastError='';ms.lastError='';saveMailbox(ms);continue}}}ms.updatedAt=new Date().toISOString();saveMailbox(ms);await reportMailboxProgress(ms)}if(mailboxAbort){ms.status='paused';ms.updatedAt=new Date().toISOString();saveMailbox(ms);await reportMailboxManifest(ms);state.msg='Mailbox sync paused safely.';state.kind='info'}else if(guard>=orchestrationCeiling){ms.status='error';ms.lastError=`Mailbox orchestration safety ceiling of ${orchestrationCeiling} folder attempts reached.`;ms.updatedAt=new Date().toISOString();saveMailbox(ms);await reportMailboxManifest(ms);state.msg=`Mailbox sync stopped: ${ms.lastError}`;state.kind='error'}}catch(e){trace('mailbox_error',{error:clean(e?.message||e),status:ms?.status||'',currentKey:ms?.currentKey||''});if(ms){ms.status='error';ms.lastError=clean(e?.message||e);ms.updatedAt=new Date().toISOString();saveMailbox(ms);try{await reportMailboxManifest(ms)}catch(_){}}state.msg=`Mailbox sync stopped: ${clean(e?.message||e)}`;state.kind='error'}finally{state.busy=false;render()}}
function pauseMailboxSync(){mailboxAbort=true;crawlAbort=true;const ms=mailboxState();if(ms&&ms.status==='running'){ms.status='paused';ms.updatedAt=new Date().toISOString();saveMailbox(ms)}state.msg='Mailbox pause requested. Postmaster will stop after the current safe batch.';state.kind='info';render()}
async function captureList(){state.busy=true;render();try{const snap=await stableSnapshot();state.last=snap;if(!snap.messages.length)throw new Error('No credible visible message rows were found.');const messages=snap.messages.map(({_strongId,...m})=>m),a=snap.assessment,res=await request(makeCapture(messages,a.quality,`Production visible-list capture; ${a.validRows}/${a.total} structurally valid rows, ${a.strongIdRows}/${a.total} strong Outlook DOM IDs. No mailbox mutations performed.`));if(!res?.workEmail?.accepted)throw new Error(res?.workEmail?.error||res?.workEmail?.reason||'Rebel Command did not accept the capture.');state.msg=`Captured ${res.workEmail.messages??messages.length} visible messages as ${a.quality.toUpperCase()} evidence.`;state.kind='success'}catch(e){state.msg=`Capture stopped: ${clean(e?.message||e)}`;state.kind='error'}finally{state.busy=false;render()}}
async function captureOpen({automatic=false}={}){if(!paired()||state.busy)return false;try{await wait(260);const msg=parseOpenMessage(),seen=openedKeys();if(automatic&&seen.has(msg.messageKey))return true;const res=await request(makeCapture([msg],'good',`${automatic?'Automatic':'Manual'} opened-message capture. Body was read only from the message already displayed in Outlook; Postmaster did not open, send, move, flag, delete, or otherwise mutate the mailbox.`));if(!res?.workEmail?.accepted)throw new Error(res?.workEmail?.error||res?.workEmail?.reason||'Rebel Command did not accept the open message.');seen.add(msg.messageKey);saveOpened(seen);if(!automatic){state.msg=`Captured open message${msg.subject?`: ${msg.subject}`:''} including body text.`;state.kind='success';render()}return true}catch(e){if(!automatic){state.msg=`Open-message capture stopped: ${clean(e?.message||e)}`;state.kind='error';render()}return false}}

const PASSIVE_KEY='mvciPostmasterPassiveAckV1',PASSIVE_INTERVAL_MS=60000;
let passiveTimer=null,passiveBusy=false,passiveLastAt=0,passiveState='Waiting for an authenticated Outlook folder.';
function passiveScope(){
    const mailbox=mailboxId(),key=currentFolderKey(),folder=folderId();
    return mailbox&&key&&folder?{mailbox,key,folder}:null;
}
function passiveScopeSame(s){
    const now=passiveScope();
    return !!s&&!!now&&now.mailbox===s.mailbox&&now.key===s.key&&now.folder===s.folder;
}
function passiveAllowed(s){
    if(!paired()||state.busy||!passiveScopeSame(s)||mailBusy())return false;
    const ms=mailboxState(),cs=crawlState();
    return !(ms?.mailboxId===s.mailbox&&ms.status==='running')&&
        !(cs?.mailboxId===s.mailbox&&cs.status==='running');
}
function passiveAckKeys(s){
    const entries=GM_getValue(PASSIVE_KEY,[])||[];
    return new Set(Array.isArray(entries)?entries.filter(x=>x?.scope===s.mailbox+'|'+s.key).map(x=>x.key):[]);
}
function savePassiveAcks(s,keys){
    const scope=s.mailbox+'|'+s.key,entries=GM_getValue(PASSIVE_KEY,[])||[];
    const merged=new Map();
    for(const x of Array.isArray(entries)?entries:[])if(x?.scope&&x?.key)merged.set(x.scope+'\u0000'+x.key,x);
    for(const key of keys){const id=scope+'\u0000'+key;merged.delete(id);merged.set(id,{scope,key})}
    GM_setValue(PASSIVE_KEY,[...merged.values()].slice(-10000));
}
async function settledPassiveRows(s){
    let previous='',stable=0;
    for(let i=0;i<5;i++){
        if(!passiveAllowed(s))return [];
        const rows=snapshot().messages.filter(m=>credibleMessageRow(m)&&m.messageKey);
        const sig=JSON.stringify(rows.map(m=>m.messageKey));
        if(rows.length&&sig===previous)stable++;else stable=0;
        previous=sig;
        if(stable>=2)return rows;
        await wait(300);
    }
    return [];
}
async function collectPassiveVisible(){
    if(passiveBusy||openWatchBusy)return false;
    const scope=passiveScope();
    if(!passiveAllowed(scope))return false;
    passiveBusy=true;let sending=false;
    try{
        const rows=await settledPassiveRows(scope);
        if(!rows.length||!passiveAllowed(scope))return false;
        const known=passiveAckKeys(scope),cs=crawlState();
        // An exact folder crawl already acknowledged these IDs. Do not
        // upload them again or count this passive sample as folder coverage.
        if(cs?.mailboxId===scope.mailbox&&cs.folderKey===scope.key&&Array.isArray(cs.seen))
            for(const key of cs.seen)known.add(key);
        const fresh=[...new Map(rows.filter(m=>!known.has(m.messageKey)).map(m=>[m.messageKey,m])).values()].slice(0,50);
        if(!fresh.length){passiveState='Visible list up to date (not whole-mailbox coverage).';return false;}
        await paceIndexBatch(fresh.length);
        if(!passiveAllowed(scope))return false;
        // Reconfirm the exact visible IDs after network pacing: a user can
        // change folders or Outlook can recycle virtual rows in the interim.
        const current=await settledPassiveRows(scope);
        const present=new Set(current.map(m=>m.messageKey));
        if(!passiveAllowed(scope)||fresh.some(m=>!present.has(m.messageKey)))return false;
        const wanted=new Set(fresh.map(m=>m.messageKey));
        const msgs=[...new Map(current.filter(m=>wanted.has(m.messageKey)).map(m=>[m.messageKey,m])).values()].map(({_strongId,...m})=>m);
        state.busy=true;sending=true;
        const res=await request(makeCapture(msgs,'good','Automatic visible-list increment; exact Outlook account and folder, stable native message IDs. No folder navigation, opened messages, or mailbox mutations.'));
        const ack=res?.workEmail;
        if(!ack?.accepted||ack.messages!==msgs.length)throw Error('Visible-list receipt did not acknowledge every message.');
        savePassiveAcks(scope,msgs.map(m=>m.messageKey));
        passiveLastAt=Date.now();passiveState='Visible-list increment acknowledged.';
        trace('passive_list_ack',{count:msgs.length});
        return true;
    }catch(e){
        passiveState='Visible-list increment pending retry.';
        trace('passive_list_error',{error:clean(e?.message||e)});
        return false;
    }finally{if(sending)state.busy=false;passiveBusy=false;}
}
const PASSIVE_PRESENCE_KEY='mvciPostmasterPresenceAttemptV1',PASSIVE_PRESENCE_INTERVAL_MS=5*60000;
async function reportIdlePresence(s){
    if(!passiveAllowed(s)||passiveBusy||openWatchBusy)return false;
    const availability=sourceAvailability();
    if(!(availability.nativeRoots>0&&availability.credibleRows>0)&&!hasExplicitEmptyFolderWitness()&&!hasNativeNonMailNotesView())return false;
    if(!passiveAllowed(s))return false;
    const now=Date.now(),prior=GM_getValue(PASSIVE_PRESENCE_KEY,{});
    if(prior?.mailbox===s.mailbox&&Number.isFinite(prior.at)&&now>=prior.at&&now-prior.at<PASSIVE_PRESENCE_INTERVAL_MS)return false;
    GM_setValue(PASSIVE_PRESENCE_KEY,{mailbox:s.mailbox,at:now});
    try{
        const res=await verify();
        return res?.ok===true;
    }catch(e){trace('idle_presence_failed',{error:clean(e?.message||e)});return false;}
}
function startPassiveWatcher(){
    if(passiveTimer)return;
    // One existing Outlook userscript timer; no new tab, external worker,
    // folder navigation or changes to the native mailbox.
    passiveTimer=setInterval(()=>{
        const s=passiveScope();
        if(!s||!navigator.locks?.request)return;
        void navigator.locks.request('mvci-postmaster-visible-'+s.mailbox,{ifAvailable:true},async lock=>{
            if(!lock)return false;
            const captured=await collectPassiveVisible();
            return captured||await reportIdlePresence(s);
        }).catch(e=>trace('passive_lock_error',{error:clean(e?.message||e)}));
    },PASSIVE_INTERVAL_MS);
}
let openWatchSig='',openWatchTimer=null,uiWatchTimer=null;
function readingSignature(){try{const p=findReadingPane();if(!p)return'';const txt=rawText(p.innerText||p.textContent||'');if(txt.length<40)return'';return hash(`${attr(p,'data-itemid')}|${attr(p,'data-convid')}|${txt.slice(0,1800)}`)}catch(_){return''}}
let openWatchBusy=false,openWatchRetryAt=0;
function startOpenWatcher(){if(openWatchTimer)return;openWatchTimer=setInterval(async()=>{if(state.busy||passiveBusy||openWatchBusy||Date.now()<openWatchRetryAt)return;const sig=readingSignature();if(!sig||sig===openWatchSig)return;openWatchBusy=true;try{if(await captureOpen({automatic:true}))openWatchSig=sig;else openWatchRetryAt=Date.now()+30000;}finally{openWatchBusy=false}},2200)}
function bootResumeIntent(ms,cs){
    if(ms?.status==='running'&&ms.mailboxId)return {kind:'mailbox',mailbox:ms.mailboxId};
    if(cs?.status==='running'&&cs.mailboxId&&cs.folderKey&&!(ms?.mailboxId===cs.mailboxId&&['paused','error','complete_with_errors','complete'].includes(ms.status)))return {kind:'folder',mailbox:cs.mailboxId,folder:cs.folderKey};
    return null;
}
let pendingBootResume=null,bootResumeBusy=false;
function armBootResume(ms,cs){pendingBootResume=bootResumeIntent(ms,cs);}
async function tryBootResume(){
    const intent=pendingBootResume;
    if(!intent||bootResumeBusy)return false;
    if(state.busy){pendingBootResume=null;return false;}
    const stillPending=()=>{
        const current=bootResumeIntent(mailboxState(),crawlState());
        return !!current&&current.kind===intent.kind&&current.mailbox===intent.mailbox&&current.folder===intent.folder;
    };
    if(!stillPending()){pendingBootResume=null;return false;}
    if(!paired()||mailboxId()!==intent.mailbox||!selectedFolderCandidate()?.key||!navigator.locks?.request)return false;
    if(intent.kind==='folder'&&!crawlMatchesPage(crawlState()))return false;
    bootResumeBusy=true;
    try{
        return await navigator.locks.request('mvci-postmaster-visible-'+intent.mailbox,{ifAvailable:true},async lock=>{
            if(!lock)return false;
            if(state.busy||!stillPending()){pendingBootResume=null;return false;}
            if(!paired()||mailboxId()!==intent.mailbox||!selectedFolderCandidate()?.key||(intent.kind==='folder'&&!crawlMatchesPage(crawlState())))return false;
            pendingBootResume=null;
            if(intent.kind==='mailbox')await runMailboxSync({fresh:false});
            else await runFolderSync({fresh:false});
            return true;
        });
    }catch(e){trace('boot_resume_error',{error:clean(e?.message||e)});return false;}
    finally{bootResumeBusy=false;}
}
function startUiWatchdog(){if(uiWatchTimer)return;uiWatchTimer=setInterval(()=>{try{if(!uiHost?.isConnected||!document.getElementById(ROOT_ID))render();void tryBootResume()}catch(_){/* UI self-heal must never interrupt mail collection. */}},5000)}
let state={open:false,busy:false,msg:'Ready. Mailbox sync indexes every discoverable Outlook mail folder without opening messages; messages you open yourself are body-captured automatically.',last:null,kind:'info'};
function add(p,t,txt,c){const e=document.createElement(t);if(txt!=null)e.textContent=txt;if(c)e.className=c;p.appendChild(e);return e}
let uiHost=null,uiRoot=null,uiMount=null,uiGuardInstalled=false;
function ensureUi(){
    if(uiHost?.isConnected&&uiRoot&&uiMount)return uiMount;
    uiHost=document.getElementById(ROOT_ID);
    if(!uiHost){
        uiHost=document.createElement('div');
        uiHost.id=ROOT_ID;
        (document.body||document.documentElement).appendChild(uiHost);
    }
    uiHost.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483647;display:block;pointer-events:auto;isolation:isolate;';
    uiRoot=uiHost.shadowRoot||uiHost.attachShadow({mode:'open'});
    let styleEl=uiRoot.getElementById('pm-style');
    if(!styleEl){
        styleEl=document.createElement('style');
        styleEl.id='pm-style';
        styleEl.textContent=`:host{all:initial}.mount{font-family:Arial,sans-serif;color:#263746;pointer-events:auto}.mount *{box-sizing:border-box}.orb{width:54px;height:54px;min-width:54px;flex:none;box-sizing:border-box;border:2px solid #1b5a7a;border-radius:50%;background:#fff;color:#153e5c;box-shadow:0 5px 18px rgba(13,50,72,.28);cursor:pointer;padding:0;margin:0;display:flex;align-items:center;justify-content:center;overflow:hidden}.orb.header-orb{width:43px;height:43px;min-width:43px;border:2px solid rgba(255,255,255,.72);box-shadow:0 2px 8px rgba(0,0,0,.18)}.p{width:410px;max-width:calc(100vw - 24px);margin-bottom:8px;background:#f6f8f9;border:1px solid #cbd8df;border-radius:10px;box-shadow:0 10px 30px #0005;overflow:hidden}.h{background:#173e63;color:#fff;padding:12px 14px;display:flex;justify-content:space-between;gap:10px}.b{padding:12px}.a{width:100%;padding:10px;border-radius:8px;border:1px solid #173e63;background:#173e63;color:#fff;font-weight:800;cursor:pointer;margin-top:8px}.s{padding:8px;border-radius:8px;border:1px solid #cbd8df;background:#fff;color:#263746;cursor:pointer}.mount button:disabled{opacity:.45;cursor:not-allowed}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.m{margin-top:8px;padding:8px;border:1px solid #dce5ea;border-radius:8px;background:#fff;font-size:11px;line-height:1.4}.ok{border-color:#a7d9bd;background:#f0fbf5;color:#216340}.err{border-color:#efb2b2;background:#fff4f4;color:#8b2c2c}.note{margin-top:8px;font-size:10px;line-height:1.35;color:#607682}`;
        uiRoot.appendChild(styleEl);
    }
    uiMount=uiRoot.getElementById('pm-mount');
    if(!uiMount){uiMount=document.createElement('div');uiMount.id='pm-mount';uiMount.className='mount';uiRoot.appendChild(uiMount)}
    installUiGuard();
    return uiMount;
}
async function syncManualFolderWithManifest(){
    if(!paired())throw new Error('Pairing not configured.');
    if(state.busy)throw new Error('Postmaster is already busy.');
    let cs=crawlState(),same=crawlMatchesPage(cs),fresh=!(same&&cs&&['paused','error','running'].includes(cs.status));
    const ms=mailboxState(),selected=selectedFolderCandidate();
    const matches=mailboxMatches(ms)&&selected?.key?(ms.folders||[]).filter(f=>f.key===selected.key):[];
    if(matches.length!==1){await runFolderSync({fresh});return;}
    const target=matches[0],mailbox=ms.mailboxId,key=target.key;
    if(fresh){const saved=scopedPartialCheckpoint(target.crawlCheckpoint,target);if(saved&&crawlMatchesPage(saved)){saveCrawl(saved);cs=saved;fresh=false;}}
    const priorCount=Number(target.indexedCount||0);
    state.busy=true;
    target.status='running';target.lastError='';ms.status='running';ms.currentKey=key;
    ms.updatedAt=new Date().toISOString();saveMailbox(ms);render();
    const publish=async()=>{try{await reportMailboxManifest(ms)}catch(e){trace('manual_manifest_report_failed',{error:clean(e?.message||e)})}};
    let failure='';
    try{
        await publish();
        if(mailboxId()!==mailbox||selectedFolderCandidate()?.key!==key)throw new Error('Folder identity changed before manual sync.');
        await runFolderSync({fresh,managed:true});
    }catch(e){failure=clean(e?.message||e);}
    finally{
        try{
            const after=crawlState();
            const exact=after?.mailboxId===mailbox&&after?.folderKey===key;
            const n=exact&&Array.isArray(after.seen)?after.seen.length:0;
            if(!failure&&exact&&after.status==='complete'&&(n>0||after.emptyWitness===true||after.nonMailWitness==='outlook_notes_view')){
                target.status='complete';target.indexedCount=n;target.emptyWitness=!!after.emptyWitness;
                target.nonMailWitness=after.nonMailWitness||'';target.lastSuccessAt=after.lastSuccessAt||new Date().toISOString();
                target.lastError='';delete target.crawlCheckpoint;
            }else{
                target.status=exact&&after.status==='paused'?'paused':'error';
                target.indexedCount=Math.max(priorCount,n);
                target.lastError=failure||(exact?after.lastError:'')||'Manual folder coverage not confirmed.';
                if(exact){const partial=scopedPartialCheckpoint(after,target);if(partial)target.crawlCheckpoint=partial;}
            }
            const summary=mailboxSummary(ms);
            ms.status=summary.complete===summary.folders?'complete':summary.errors?'complete_with_errors':ms.folders.some(f=>f.status==='paused')?'paused':'error';
            ms.lastError=ms.status==='complete'?'':target.lastError||'Mailbox coverage incomplete.';
            ms.updatedAt=new Date().toISOString();
            if(ms.status==='complete')ms.lastSuccessAt=ms.updatedAt;
            saveMailbox(ms);await publish();
            if(failure){state.msg='Manual folder sync stopped: '+failure;state.kind='error';}
        }finally{state.busy=false;render()}
    }
}
async function handleUiAction(action){
    if(action==='toggle'){state.open=!state.open;render();return}
    if(action==='close'){state.open=false;render();return}
    if(action==='pause'){pauseFolderSync();return}
    if(action==='mailbox-pause'){pauseMailboxSync();return}
    if(action==='capture-list'){await captureList();return}
    if(action==='capture-open'){await captureOpen({automatic:false});return}
    if(action==='configure'){await configure();return}
    if(action==='update'){openManagedUpdate();return}
    if(action==='copy-diagnostics'){if(!navigator.clipboard?.writeText)throw new Error('Clipboard API unavailable.');await navigator.clipboard.writeText(traceExport());state.msg=`Copied ${traceRows().length} diagnostic trace rows.`;state.kind='success';render();return}
    if(action==='clear-diagnostics'){clearTrace();state.msg='Postmaster diagnostic trace cleared.';state.kind='info';render();return}
    if(action==='mailbox-sync'){const ms=mailboxState(),retryErrors=mailboxMatches(ms)&&mailboxNeedsRetry(ms);await runMailboxSync({fresh:!(mailboxMatches(ms)&&(['paused','error','running','complete_with_errors'].includes(ms?.status)||retryErrors)),retryErrors});return}
    if(action==='sync'){
        await syncManualFolderWithManifest();
    }
}
function installUiGuard(){
    if(uiGuardInstalled)return;
    const actionFromEvent=e=>(e.composedPath?.()||[]).find(el=>el?.dataset?.pmAction)?.dataset?.pmAction||'';
    const activate=e=>{
        const action=actionFromEvent(e);if(!action)return;
        const target=(e.composedPath?.()||[]).find(el=>el?.dataset?.pmAction);
        if(target?.disabled)return;
        Promise.resolve(handleUiAction(action)).catch(err=>{state.msg=`Postmaster control failed: ${clean(err?.message||err)}`;state.kind='error';render()});
    };
    window.addEventListener('pointerdown',e=>{
        const action=actionFromEvent(e);if(!action)return;
        e.preventDefault();e.stopImmediatePropagation();
        if(e.button===0)activate(e);
    },true);
    window.addEventListener('click',e=>{if(!actionFromEvent(e))return;e.preventDefault();e.stopImmediatePropagation();if(e.detail===0)activate(e)},true);
    uiGuardInstalled=true;
}
function render(){
    state.last=snapshot();const r=ensureUi();r.replaceChildren();const cs=crawlState(),same=crawlMatchesPage(cs),ms=mailboxState(),mb=mailboxSummary(ms),scopeOk=mailboxMatches(ms),needsVerification=mailboxHasUnverifiedEmpty(ms),retryNeeded=mailboxNeedsRetry(ms);
    if(state.open){
        const p=add(r,'div',null,'p'),h=add(p,'div',null,'h'),title=add(h,'div');add(title,'b','REBEL POSTMASTER');
        const sub=add(title,'div','v1.2.37 · read-only Outlook collector');sub.style.fontSize='10px';sub.style.opacity='.75';
        const close=add(h,'button','','orb header-orb');close.type='button';close.dataset.pmAction='close';close.title='Minimize Rebel Postmaster';close.setAttribute('aria-label','Minimize Rebel Postmaster');close.innerHTML=REBEL_SYMBOL_HTML;
        const b=add(p,'div',null,'b');
        add(b,'div',`Connection: ${paired()?'paired':'needed'} · Folder: ${folderName()}`,'note');
        if(ms)add(b,'div',`Mail index: ${(!scopeOk?'SCOPE UNVERIFIED':ms.status==='complete'&&needsVerification?'VERIFY REQUIRED':String(ms.status||'pending').toUpperCase())} · ${mb.complete}/${mb.folders} folders · ${mb.indexed} indexed${mb.excluded?' | '+mb.excluded+' non-mail excluded':''}${mb.errors?` · ${mb.errors} errors`:''}`,'m');
        if(same&&cs&&['running','paused','error'].includes(cs.status))add(b,'div',`Current folder: ${cs.status.toUpperCase()} · ${cs.seen?.length||0} unique`,'m');
        const mailbox=add(b,'button',scopeOk&&needsVerification&&ms?.status!=='running'?'VERIFY FOLDER INDEX':scopeOk&&retryNeeded&&ms?.status!=='running'?'RETRY MAIL ERRORS':scopeOk&&['paused','error','running','complete_with_errors'].includes(ms?.status)?(ms.status==='running'&&state.busy?'MAIL SYNC RUNNING':'RESUME MAIL SYNC'):'SYNC MAIL','a');
        mailbox.type='button';mailbox.dataset.pmAction='mailbox-sync';mailbox.disabled=state.busy||!paired();
        if(state.busy&&ms?.status==='running'){const mp=add(b,'button','PAUSE AFTER CURRENT BATCH','s');mp.type='button';mp.dataset.pmAction='mailbox-pause';mp.style.width='100%';mp.style.marginTop='8px'}
        const tools=add(b,'details');tools.style.marginTop='8px';const toolsTitle=add(tools,'summary','DIAGNOSTICS / CONNECTION','note');toolsTitle.style.cursor='pointer';toolsTitle.style.fontWeight='700';const toolBody=add(tools,'div');const nativeCount=currentFolderItemCount();add(toolBody,'div',`Source rows: ${state.last?.messages?.length||0}; credible: ${state.last?.assessment?.validRows||0}; native item count: ${nativeCount===null?'not exposed':nativeCount}`,'note');
        const sync=add(toolBody,'button',same&&cs&&['paused','error','running'].includes(cs.status)?(cs.status==='running'&&state.busy?'FOLDER SYNC RUNNING':'RESUME CURRENT FOLDER'):'SYNC CURRENT FOLDER','s');sync.type='button';sync.dataset.pmAction='sync';sync.disabled=state.busy||!paired();sync.style.width='100%';sync.style.marginTop='8px';
        const conf=add(toolBody,'button','CONNECTION','s');conf.type='button';conf.dataset.pmAction='configure';conf.style.width='100%';conf.style.marginTop='8px';
        const upd=add(toolBody,'button','CHECK FOR UPDATE','s');upd.type='button';upd.dataset.pmAction='update';upd.style.width='100%';upd.style.marginTop='8px';
        add(toolBody,'div',passiveState+(passiveLastAt?' Last acknowledged: '+new Date(passiveLastAt).toLocaleString():''),'note');
        add(b,'div',state.msg,`m ${state.kind==='success'?'ok':state.kind==='error'?'err':''}`);
        add(b,'div','Read-only collector. SYNC MAIL indexes Outlook folders for Rebel Command. Messages you personally open are captured automatically; Postmaster never opens unread mail for you.','note');
    }
    if(!state.open){const orb=add(r,'button','','orb');orb.type='button';orb.dataset.pmAction='toggle';orb.title='Open Rebel Postmaster';orb.setAttribute('aria-label','Open Rebel Postmaster');orb.innerHTML=REBEL_SYMBOL_HTML;}
}
async function configure(){try{const old=cfg();if(old.deviceId&&old.token){const a=prompt('Rebel Postmaster is paired. Type TEST, REPAIR, CLEAR, or leave blank to cancel.','TEST');if(a==null||!clean(a))return;const u=clean(a).toUpperCase();if(u==='TEST'){await verify();state.msg='Connection verified.';state.kind='success';render();return}if(u==='CLEAR'){GM_deleteValue(CFG_KEY);state.msg='Pairing cleared.';state.kind='info';render();return}if(u!=='REPAIR')return}const endpoint=prompt('Rebel Command telemetry endpoint',old.endpoint||DEFAULT_ENDPOINT);if(endpoint==null)return;const deviceId=prompt('Rebel Command device ID',old.deviceId||'');if(deviceId==null)return;const token=prompt('Private device token (stored only in Tampermonkey userscript storage)','');if(token==null)return;const next={endpoint:normalizeEndpoint(endpoint),deviceId:clean(deviceId),token:clean(token)};saveCfg(next);await verify();state.msg='Pairing saved and verified.';state.kind='success'}catch(e){state.msg=`Connection failed: ${clean(e?.message||e)}`;state.kind='error'}render()}
state.last=snapshot();render();startOpenWatcher();startUiWatchdog();startPassiveWatcher();
const aliasErrorState=mailboxState();if(!state.busy&&aliasErrorState?.status!=='running'&&requeueShortCompletedFolders(aliasErrorState)){void reportMailboxManifest(aliasErrorState).catch(e=>trace('coverage_manifest_report_failed',{error:clean(e?.message||e)}));}if(aliasErrorState?.status==='error'&&/multiple folders named/i.test(clean(aliasErrorState.lastError||'')))clearMailbox();
const bootMailbox=mailboxState(),bootCrawl=crawlState();if(bootMailbox?.status==='complete'&&mailboxHasUnverifiedEmpty(bootMailbox)&&mailboxMatches(bootMailbox)){bootMailbox.status='complete_with_errors';bootMailbox.lastError='Zero-message folders require explicit empty-state evidence.';saveMailbox(bootMailbox);reportMailboxManifest(bootMailbox).catch(()=>{});}armBootResume(bootMailbox,bootCrawl);setTimeout(()=>{void tryBootResume()},1800);
window.MVCI_REBEL_POSTMASTER={version:VERSION,snapshot,stableSnapshot,parseOpenMessage,captureList,captureOpen,runFolderSync,pauseFolderSync,runMailboxSync,pauseMailboxSync,discoverMailboxFolders,mailboxManifestPayload,configure,crawlState,mailboxState,traceRows,traceExport,clearTrace,status:()=>({paired:paired(),folder:folderName(),messages:state.last?.messages?.length||0,quality:state.last?.assessment?.quality||'unknown',crawl:crawlState(),mailbox:mailboxState(),traceCount:traceRows().length,url:location.href})};
})();
