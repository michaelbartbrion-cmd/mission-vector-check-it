(function(){
  'use strict';
  const VERSION='0.26.0-dev';
  const ROOT_ID='mvci-control-panel-v0250';
  const BUTTON_ID='vs-update';
  if(window.top!==window.self||window.__mvciUpdateButton0260)return;
  window.__mvciUpdateButton0260={version:VERSION,startedAt:Date.now()};

  function inject(){
    const root=document.getElementById(ROOT_ID);
    const foot=root?.querySelector('.foot');
    if(!foot)return;
    let button=foot.querySelector(`#${BUTTON_ID}`);
    if(!button){
      button=document.createElement('button');
      button.id=BUTTON_ID;
      button.className='btn secondary';
      button.textContent='Update';
      button.style.flex='1';
      foot.prepend(button);
    }
    if(button.dataset.mvciUpdate0260==='1')return;
    button.dataset.mvciUpdate0260='1';
    button.title='Check the live Mission Vector manifest and reload the newest runtime';
    button.onclick=async()=>{
      const original=button.textContent;
      button.disabled=true;
      button.textContent='Checking…';
      try{
        const fn=window.MVCI_SCHEDULER_CHECK_UPDATE;
        if(typeof fn==='function')await fn();
        else if(confirm('The live loader update function is not available yet. Reload this CrewSense tab now?'))location.reload();
      }catch(err){alert(`Mission Vector update check failed.\n\n${err?.message||err}`)}
      finally{button.disabled=false;button.textContent=original||'Update'}
    };
  }

  const observer=new MutationObserver(()=>setTimeout(inject,0));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setInterval(inject,700);
  setTimeout(inject,300);
  window.MVCI_UPDATE_BUTTON_0260={version:VERSION,inject};
})();
