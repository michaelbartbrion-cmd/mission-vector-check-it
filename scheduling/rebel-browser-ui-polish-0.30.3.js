(function () {
  'use strict';
  // EMERGENCY QUARANTINE 2026-09-17: previous implementation observed the entire
  // document and unconditionally wrote title.innerHTML and textContent from its
  // MutationObserver callback. Those writes trigger the observer again, potentially
  // freezing CrewSense/Vector. Do not install observers, timers, alter the DOM, or
  // change CrewSense through this module until an isolated, idempotent UI fix is
  // reviewed and tested. Keep the module filename in the pinned manifest to avoid
  // misreporting the 27-module runtime as incomplete. Existing tabs require closure.
  if (window.top !== window.self) return;
  window.MVCI_REBEL_BROWSER_POLISH_0303 = {
    version: '0.30.3-ui-quarantined',
    enabled: false,
    reason: 'MutationObserver feedback loop; disabled pending offline verification'
  };
})();
