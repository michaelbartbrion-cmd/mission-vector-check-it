(function(){
'use strict';
const VERSION='0.16.0-dev';
if(window.top!==window.self||window.__mvciVectorUi0160)return;
window.__mvciVectorUi0160={version:VERSION,startedAt:Date.now()};
function wire(){
 const panel=document.getElementById('mvci-vs-panel');if(!panel)return;
 const loader=window.__mvciLiveLoader||{};
 const runtime=loader.runtimeVersion||document.documentElement.dataset.mvciRuntimeVersion||VERSION;
 const loaderVersion=loader.loaderVersion||document.documentElement.dataset.mvciLoaderVersion||'unknown';
 const failures=Number(document.documentElement.dataset.mvciLoaderFailures||0);
 const loaded=Number(document.documentElement.dataset.mvciLoaderLoaded||0);
 const strong=panel.querySelector('.vs-head strong');
 if(strong){
   const sig=`${runtime}|${loaderVersion}|${failures}|${loaded}`;
   if(strong.dataset.mvciRuntimeLabel!==sig){
     strong.dataset.mvciRuntimeLabel=sig;
     strong.innerHTML=`Vector Scheduling DEV <span style="opacity:.75;font-size:11px">runtime ${runtime} · loader ${loaderVersion}${loaded?` · ${loaded} modules`:''}${failures?` · ${failures} failed`:''}</span>`;
   }
 }
 const button=document.getElementById('vs-update');
 if(button&&window.MVCI_SCHEDULER_CHECK_UPDATE&&button.dataset.mvciRuntimeUpdate!==runtime){
   button.dataset.mvciRuntimeUpdate=runtime;
   button.title=`Check the live scheduler manifest. Running ${runtime}.`;
   button.onclick=()=>window.MVCI_SCHEDULER_CHECK_UPDATE();
 }
 let card=panel.querySelector('#vs-authoritative-build-v0150')||panel.querySelector('#vs-authoritative-build-v0160');
 if(!card){
   card=document.createElement('div');card.id='vs-authoritative-build-v0160';card.className='vs-card';
   const first=panel.querySelector('.vs-card');if(first)first.insertAdjacentElement('beforebegin',card);else panel.appendChild(card);
 } else { card.id='vs-authoritative-build-v0160'; }
 const reader=window.MVCI_VECTOR_READER_0160?'multi-row precision reader active':window.MVCI_VECTOR_READER_0150?'precision reader active':window.MVCI_VECTOR_READER_0120?'base reader active':'reader loading';
 const reconciliation=window.MVCI_VECTOR_RECONCILIATION_0150?'reconciliation active':'reconciliation loading';
 const sig=`${runtime}|${loaderVersion}|${reader}|${reconciliation}|${failures}|${loaded}`;
 if(card.dataset.sig!==sig){
   card.dataset.sig=sig;
   card.innerHTML=`<h3>Live build status</h3><div><b>Runtime:</b> ${runtime}</div><div><b>Loader:</b> ${loaderVersion}</div><div><b>Modules:</b> ${loaded||'loading'} loaded${failures?` · ${failures} failed`:''}</div><div><b>Reader:</b> ${reader}</div><div><b>Reconciliation:</b> ${reconciliation}</div><div class="vs-muted" style="margin-top:5px">This card is the authoritative build display; older component labels identify individual modules only.</div>`;
 }
}
setInterval(wire,900);setTimeout(wire,180);
})();