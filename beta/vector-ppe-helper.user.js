// ==UserScript==
// @name         Vector Check It - PPE Helper
// @namespace    mission-ppe
// @version      2.3.2
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-ppe-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-ppe-helper.user.js
// @homepageURL  https://github.com/michaelbartbrion-cmd/mission-vector-check-it
// @supportURL   https://github.com/michaelbartbrion-cmd/mission-vector-check-it/issues
// @description  Vector Rebel — v2.3.2 transition build with Item Log completion verification and simplified completion UI
// @match        https://checkitapp.targetsolutions.com/*
// @require      https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/72a22dc4c81380300c24cb17feec13c279f49c20/beta/vector-ppe-helper.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Transition wrapper: the pinned core above is the validated v2.3.1
    // Item Log/UI-fix build. The wrapper gives Tampermonkey a real version
    // bump so installations that already had an earlier 2.3.1 can update.
    const BRIDGE_VERSION = '2.3.2';

    if (window.__vectorRebelInstance) {
        window.__vectorRebelInstance.version = BRIDGE_VERSION;
    }

    const patchVisibleVersion = () => {
        const panel = document.getElementById('vector-ppe-helper-v23');
        if (!panel) return false;
        for (const el of panel.querySelectorAll('div')) {
            if ((el.textContent || '').trim() === 'Vector Rebel v2.3.1') {
                el.textContent = `Vector Rebel v${BRIDGE_VERSION}`;
                return true;
            }
        }
        return false;
    };

    patchVisibleVersion();
    setTimeout(patchVisibleVersion, 500);
    setTimeout(patchVisibleVersion, 1500);
})();
