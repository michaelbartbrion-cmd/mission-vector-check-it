(function(){
'use strict';
const VERSION='0.29.0-dev';
const STYLE_ID='mvci-quiet-boot-v0290';
if(window.top!==window.self||window.MVCI_QUIET_BOOT_0290)return;
const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
#mvci-live-loader-status-v103,#mvci-live-loader-status-v104,
#mvci-vs-open,#mvci-vs-panel,#vs-vector-bridge-v0190,#vs-vector-bridge-v0200,
#vector-staffing-collector-status,#vector-overtime-collector-status,
#mvci-global-launcher-v0230,#mvci-control-panel-v0240,#mvci-control-panel-v0250,
#mvci-command-center-v0270,#mvci-command-center-v0280{display:none!important}
`;document.documentElement.appendChild(s);
for(const id of['mvci-live-loader-status-v103','mvci-live-loader-status-v104','mvci-command-center-v0270','mvci-command-center-v0280']){try{document.getElementById(id)?.remove()}catch(_){}}
window.MVCI_QUIET_BOOT_0290={version:VERSION};
})();