// ==UserScript==
// @name         Mission Vector Check It - Vector Scheduling DEV Loader
// @namespace    mission-vector-check-it-scheduling-loader
// @version      0.5.0-dev
// @description  One-time Tampermonkey loader for the Mission Vector Check It scheduling development assistant.
// @homepageURL  https://github.com/michaelbartbrion-cmd/mission-vector-check-it
// @supportURL   https://github.com/michaelbartbrion-cmd/mission-vector-check-it/issues
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-loader.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-loader.user.js
// @match        https://crewsense.com/*
// @match        https://*.crewsense.com/*
// @require      https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/rotation-engine.js?v=0.5.0-dev
// @require      https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/horizon-planner.js?v=0.5.0-dev
// @require      https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-assistant.user.js?v=0.5.0-dev
// @require      https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-runtime-patch-0.5.0.js?v=0.5.0-dev
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const LOADER_URL = 'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-loader.user.js';

  function wireUpdateButton() {
    const button = document.getElementById('vs-update');
    if (!button || button.dataset.mvciLoaderWired === '1') return;
    button.dataset.mvciLoaderWired = '1';
    button.title = 'Install/check the newest Vector Scheduling development build';
    button.onclick = () => window.open(LOADER_URL, '_blank', 'noopener');
  }

  const observer = new MutationObserver(wireUpdateButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  wireUpdateButton();
})();