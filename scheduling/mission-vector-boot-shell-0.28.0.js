(function(){
  'use strict';
  const VERSION='0.28.0-dev';
  const STYLE_ID='mvci-quiet-boot-v0280';
  if(window.top!==window.self||window.MVCI_QUIET_BOOT_0280)return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    #mvci-live-loader-status-v103,
    #mvci-live-loader-status-v104,
    #mvci-vs-open,
    #mvci-vs-panel,
    #vs-vector-bridge-v0190,
    #vs-vector-bridge-v0200,
    #vector-staffing-collector-status,
    #vector-overtime-collector-status,
    #mvci-global-launcher-v0230,
    #mvci-control-panel-v0240,
    #mvci-control-panel-v0250,
    #mvci-command-center-v0270 { display:none !important; }
  `;
  document.documentElement.appendChild(style);
  for(const id of ['mvci-live-loader-status-v103','mvci-live-loader-status-v104']){
    try{document.getElementById(id)?.remove();}catch(_){}
  }
  window.MVCI_QUIET_BOOT_0280={version:VERSION};
})();
