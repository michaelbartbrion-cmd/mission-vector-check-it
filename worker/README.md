# Mission Vector Check It: Enterprise Slow Background Worker

**Canonical Project:** Mission Vector Check It. **Sole PRIMARY:** Mission Vector Check It - PRIMARY. This is an owned support component, not a new PRIMARY.

## Purpose and responsibilities

A small Node.js process on Enterprise coordinates two existing **read-only, signed-in browser collectors**. A Captain on another computer performs any required physical checks and submits official forms in Vector. Rebel Command stores the verified native Item Log evidence once collected; the local coordinator does **not** create inspections, calculate PASS without a real record, change CrewSense, save credentials, or send email.

- **Staffing:** Rebel Scout 1.1.53 uses one designated, authenticated CrewSense tab for exactly one full-census ListView capture of the current 07:00-to-07:00 operational date. Morning due after 07:05 Central; afternoon eligible after 13:00. Existing Scout full-census validation and Rebel Command ingestion remain in control.
- **PPE:** Vector Rebel 3.2.88 uses one designated, authenticated Vector tab and the existing native Item Log read-only workflow. Current implementation is **C-shift pilot scope**, not department-wide PPE ingestion. One **person's next outstanding asset** per pass, rotating between known working people. A single person's native gear links may be discovered once if missing.
- **Headquarters/RC:** continues retaining source-backed records. Captain and BC should read cached results and show source freshness. Unknown or unreadable remains unknown. No unattended physical inspection submissions.
- **Resources:** one global lease; PPE at least 9 minutes between starts and at most 90 per operational day; local broker idle poll 20 s, client heartbeat/poll 25 s; 20-minute lease timeouts, retry backoff. Source browser tabs stay distinct from a Captain's active inspection tab and respect existing busy guards.
- **Privacy:** Node never stores authentication tokens, cookies, names, SCBA/gear serial numbers, or native inspection bodies. Local state contains only roles, timestamps and outcomes. The service binds only to 127.0.0.1:18764. It never exposes a LAN listener.

## Enterprise installation

Requires Node.js and a signed-in Windows user profile. From an administrative or regular PowerShell in this repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\worker\install-enterprise.ps1 -StartNow
Invoke-RestMethod http://127.0.0.1:18764/health
```

The install copies the immutable broker source to `%LOCALAPPDATA%\MissionVectorCheckItWorker\bin`, creates the user-logon Scheduled Task `MissionVectorCheckIt-BackgroundWorker`, and starts it. It **does not** open Chrome, add browser extensions, retrieve credentials or activate a source scan by itself.

## One-time dedicated authenticated browser tabs

After the respective beta userscripts are updated and **after any current interactive Captain Check finishes**:

1. On **Enterprise** open a **separate** CrewSense ListView tab using your normal signed-in browser. Add `mvci_worker=staffing` to that tab's URL query string. The Rebel Scout 1.1.53 local bridge enables itself only in that designated tab. Keep this tab signed in.
2. On **Enterprise** open a **separate** Vector Check It PPE tab using your usual authenticated Vector session. Add `mvci_worker=ppe` to its URL query string. The Vector Rebel 3.2.88 bridge enables itself only in this designated tab. Keep this tab signed in.
3. Leave both tabs open. They are a work source; **do not use them to submit inspections**. An ordinary firefighter's existing Vector page or Captain device has no localhost worker and does not perform these background jobs.
4. Watch the `/health` source states: `ready` means a designated authenticated browser worker has reported in. `offline` means no recent heartbeat; `not_ready` means the tab is present but source auth or prerequisites are absent. **A ready heartbeat does not prove a successful source capture.** Last success timestamps are the evidence.

Network credentials remain under the site and userscript's existing authenticated session, not in Node. Both sites may require occasional human reauthentication. If that happens the worker reports stale/offline rather than guessing.

## Server migration

Copy the `worker/` source to the server. Run under a low-privilege dedicated user and install a service manager (systemd or Windows Scheduled Task/Service). Keep 127.0.0.1 binding and the single global lease. Set `MVCI_WORKER_HOME` for state, `MVCI_WORKER_PORT` if needed. Run dedicated *authenticated* browser tabs on that same host. Do not export Chrome cookies, passwords, RC tokens, or Tampermonkey storage from Enterprise.

## Release and acceptance limitations

- The Enterprise broker alone is not source collection. **The two authenticated browser bridges must check in and yield successful real captures** before calling the background system working.
- The PPE bridge currently uses the **existing C-shift pilot** and only known verified native routes. Complete general department PPE receipt ingestion and additional C tours before closing production acceptance.
- RC's legacy `PpePilotItem.status=verified` without `native_completion_date` is not proof of a tour inspection. New reads may be marked successful work cycles, not safety passes.
- The Scout staffing capture is a *source schedule*, not confirmed who actually arrived. The Captain/BC verifies attendance for current shift.
- No CrewSense writes, no RC fabricated inspections, no emails.

## Read-only health checks

```powershell
Invoke-RestMethod http://127.0.0.1:18764/health | ConvertTo-Json -Depth 5
Get-ScheduledTask -TaskName 'MissionVectorCheckIt-BackgroundWorker'
node --test .\worker\tests\*.test.mjs
```
