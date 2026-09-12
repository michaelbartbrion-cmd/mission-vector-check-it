(function(){
  'use strict';
  const VERSION='0.12.0-dev';
  if(window.top!==window.self||window.__mvciVectorUi0120)return;
  window.__mvciVectorUi0120={version:VERSION,startedAt:Date.now()};
  function wire(){
    const panel=document.getElementById('mvci-vs-panel');if(!panel)return;
    const strong=panel.querySelector('.vs-head strong');
    if(strong&&strong.dataset.mvciRuntimeLabel!==VERSION){
      strong.dataset.mvciRuntimeLabel=VERSION;
      strong.innerHTML=`Vector Scheduling DEV <span style="opacity:.7;font-size:11px">${VERSION}</span>`;
    }
    const button=document.getElementById('vs-update');
    if(button&&window.MVCI_SCHEDULER_CHECK_UPDATE&&button.dataset.mvciRuntimeUpdate!==VERSION){
      button.dataset.mvciRuntimeUpdate=VERSION;
      button.title='Check the live scheduler manifest and reload the newest build';
      button.onclick=()=>window.MVCI_SCHEDULER_CHECK_UPDATE();
    }
  }
  setInterval(wire,1000);setTimeout(wire,200);
})();
