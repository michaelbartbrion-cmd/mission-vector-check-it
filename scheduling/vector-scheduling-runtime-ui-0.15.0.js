(function(){
'use strict';
const VERSION='0.15.0-dev';
if(window.top!==window.self||window.__mvciVectorUi0150)return;
window.__mvciVectorUi0150={version:VERSION,startedAt:Date.now()};
function wire(){
 const panel=document.getElementById('mvci-vs-panel');if(!panel)return;
 const loader=window.__mvciLiveLoader||{};
 const runtime=loader.runtimeVersion||VERSION;
 const loaderVersion=loader.loaderVersion||'unknown';
 const strong=panel.querySelector('.vs-head strong');
 if(strong){
   const sig=`${runtime}|${loaderVersion}`;
   if(strong.dataset.mvciRuntimeLabel!==sig){
     strong.dataset.mvciRuntimeLabel=sig;
     strong.innerHTML=`Vector Scheduling DEV <span style="opacity:.75;font-size:11px">runtime ${runtime} · loader ${loaderVersion}</span>`;
   }
 }
 const button=document.getElementById('vs-update');
 if(button&&window.MVCI_SCHEDULER_CHECK_UPDATE&&button.dataset.mvciRuntimeUpdate!==runtime){
   button.dataset.mvciRuntimeUpdate=runtime;
   button.title=`Check the live scheduler manifest. Running ${runtime}.`;
   button.onclick=()=>window.MVCI_SCHEDULER_CHECK_UPDATE();
 }
 let card=panel.querySelector('#vs-authoritative-build-v0150');
 if(!card){
   card=document.createElement('div');card.id='vs-authoritative-build-v0150';card.className='vs-card';
   const first=panel.querySelector('.vs-card');
   if(first)first.insertAdjacentElement('beforebegin',card);else panel.appendChild(card);
 }
 const status=window.MVCI_VECTOR_READER_0150?'precision reader active':window.MVCI_VECTOR_READER_0120?'base reader active':'reader loading';
 const sig=`${runtime}|${loaderVersion}|${status}`;
 if(card.dataset.sig!==sig){
   card.dataset.sig=sig;
   card.innerHTML=`<h3>Live build status</h3><div><b>Runtime:</b> ${runtime}</div><div><b>Loader:</b> ${loaderVersion}</div><div><b>Reader:</b> ${status}</div><div class="vs-muted" style="margin-top:5px">This card is the authoritative build display; older component version labels identify individual modules, not the overall running runtime.</div>`;
 }
}
setInterval(wire,900);setTimeout(wire,180);
})();
