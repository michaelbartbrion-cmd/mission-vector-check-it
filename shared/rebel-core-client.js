(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MVCIRebelCoreClient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.1.0';
  const DEFAULT_MAX_QUEUE = 300;
  const DEFAULT_BATCH_SIZE = 40;
  const DEFAULT_MAX_ATTEMPTS = 8;
  const DEFAULT_TIMEOUT_MS = 12000;
  const SENSITIVE_KEY_RE = /(password|passwd|cookie|authorization|bearer|secret|token|session[_-]?id|api[_-]?key)/i;

  const clean = value => String(value == null ? '' : value).trim();
  const nowIso = () => new Date().toISOString();

  function parseJson(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
  }

  function safeClone(value, depth = 0) {
    if (depth > 8) return '[depth-limited]';
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return value.length > 20000 ? value.slice(0, 20000) : value;
    if (Array.isArray(value)) return value.slice(0, 200).map(v => safeClone(v, depth + 1));
    if (typeof value === 'object') {
      const out = {};
      for (const [key, child] of Object.entries(value)) {
        if (SENSITIVE_KEY_RE.test(key)) continue;
        out[key] = safeClone(child, depth + 1);
      }
      return out;
    }
    return String(value).slice(0, 20000);
  }

  function randomId() {
    try { return crypto.randomUUID(); }
    catch (_) { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  }

  function backoffMs(attempts) {
    const base = Math.min(30 * 60 * 1000, 2000 * Math.pow(2, Math.max(0, attempts - 1)));
    return base + Math.floor(Math.random() * Math.min(5000, base * 0.15));
  }

  function create(options = {}) {
    const storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const fetchImpl = options.fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    const configKey = options.configKey || 'missionVectorRebelCorePairing_v1';
    const queueKey = options.queueKey || 'missionVectorRebelCoreQueue_v1';
    const statusKey = options.statusKey || 'missionVectorRebelCoreClientStatus_v1';
    const maxQueue = Math.max(10, Number(options.maxQueue || DEFAULT_MAX_QUEUE));
    const batchSize = Math.min(100, Math.max(1, Number(options.batchSize || DEFAULT_BATCH_SIZE)));
    const maxAttempts = Math.max(1, Number(options.maxAttempts || DEFAULT_MAX_ATTEMPTS));
    const timeoutMs = Math.max(1000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
    let flushing = null;

    function read(key, fallback) {
      if (!storage) return fallback;
      try { return parseJson(storage.getItem(key), fallback); }
      catch (_) { return fallback; }
    }

    function write(key, value) {
      if (!storage) return;
      try { storage.setItem(key, JSON.stringify(value)); }
      catch (_) {}
    }

    function remove(key) {
      if (!storage) return;
      try { storage.removeItem(key); }
      catch (_) {}
    }

    function getConfig() {
      const cfg = read(configKey, null);
      if (!cfg?.endpoint || !cfg?.token || !/^https:\/\//i.test(cfg.endpoint)) return null;
      return cfg;
    }

    function publicConfig() {
      const cfg = getConfig();
      return cfg ? { endpoint: cfg.endpoint, deviceId: cfg.deviceId || null, pairedAt: cfg.pairedAt || null } : null;
    }

    function getQueue() {
      const queue = read(queueKey, []);
      return Array.isArray(queue) ? queue : [];
    }

    function setQueue(queue) {
      write(queueKey, Array.isArray(queue) ? queue.slice(-maxQueue) : []);
    }

    function getStatus() {
      const s = read(statusKey, {});
      const queue = getQueue();
      return {
        version: VERSION,
        paired: !!getConfig(),
        queued: queue.length,
        lastAttemptAt: s.lastAttemptAt || null,
        lastSuccessAt: s.lastSuccessAt || null,
        lastErrorAt: s.lastErrorAt || null,
        lastError: s.lastError || null,
        accepted: Number(s.accepted || 0),
        dropped: Number(s.dropped || 0),
      };
    }

    function patchStatus(patch) {
      const prior = read(statusKey, {});
      const next = { ...prior, ...patch };
      write(statusKey, next);
      return getStatus();
    }

    function configure(payload) {
      const value = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (!value || typeof value !== 'object') throw new Error('Pairing payload must be an object or JSON string.');
      const endpoint = clean(value.endpoint);
      const token = clean(value.token);
      const deviceId = clean(value.deviceId || value.device_id);
      if (!/^https:\/\//i.test(endpoint)) throw new Error('Rebel Core endpoint must use HTTPS.');
      if (token.length < 32) throw new Error('Rebel Core device token is invalid.');
      write(configKey, { endpoint, token, deviceId, pairedAt: nowIso() });
      patchStatus({ lastError: null, lastErrorAt: null });
      return publicConfig();
    }

    function forget({ clearQueue = false } = {}) {
      remove(configKey);
      if (clearQueue) remove(queueKey);
      patchStatus({ lastError: null, lastErrorAt: null });
    }

    function enqueue(event) {
      if (!event || typeof event !== 'object' || !clean(event.kind)) throw new Error('Telemetry event requires kind.');
      const sanitized = safeClone(event);
      const queue = getQueue();
      let dropped = 0;
      queue.push({ id: randomId(), event: sanitized, attempts: 0, nextAttemptAt: 0, queuedAt: nowIso() });
      while (queue.length > maxQueue) { queue.shift(); dropped++; }
      setQueue(queue);
      if (dropped) patchStatus({ dropped: getStatus().dropped + dropped });
      return sanitized;
    }

    async function request(events) {
      const cfg = getConfig();
      if (!cfg) throw new Error('Rebel Core is not paired.');
      if (!fetchImpl) throw new Error('No fetch transport is available.');
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      patchStatus({ lastAttemptAt: nowIso() });
      try {
        const response = await fetchImpl(cfg.endpoint, {
          method: 'POST',
          mode: 'cors',
          credentials: 'omit',
          headers: { 'content-type': 'application/json', 'x-rebel-device-key': cfg.token },
          body: JSON.stringify(events.length === 1 ? events[0] : { events }),
          signal: controller?.signal,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(clean(body?.error || body?.detail || `HTTP ${response.status}`));
        return body;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    async function flush() {
      if (flushing) return flushing;
      flushing = (async () => {
        if (!getConfig()) return { paired: false, sent: 0, failed: 0, queued: getQueue().length };
        let queue = getQueue();
        const due = queue.filter(item => Number(item.nextAttemptAt || 0) <= Date.now()).slice(0, batchSize);
        if (!due.length) return { paired: true, sent: 0, failed: 0, queued: queue.length };
        try {
          const result = await request(due.map(item => item.event));
          const results = Array.isArray(result?.results) ? result.results : due.map(() => ({ ok: result?.ok !== false }));
          const successfulIds = new Set();
          const failedIds = new Set();
          due.forEach((item, index) => (results[index]?.ok === false ? failedIds : successfulIds).add(item.id));
          queue = queue.filter(item => !successfulIds.has(item.id));
          let dropped = 0;
          queue = queue.filter(item => {
            if (!failedIds.has(item.id)) return true;
            item.attempts = Number(item.attempts || 0) + 1;
            if (item.attempts >= maxAttempts) { dropped++; return false; }
            item.nextAttemptAt = Date.now() + backoffMs(item.attempts);
            return true;
          });
          setQueue(queue);
          const sent = successfulIds.size;
          const failed = failedIds.size;
          const prior = getStatus();
          patchStatus({
            lastSuccessAt: sent ? nowIso() : prior.lastSuccessAt,
            lastErrorAt: failed ? nowIso() : null,
            lastError: failed ? `${failed} telemetry event(s) were rejected and queued for retry.` : null,
            accepted: prior.accepted + sent,
            dropped: prior.dropped + dropped,
          });
          return { paired: true, sent, failed, dropped, queued: queue.length };
        } catch (error) {
          const dueIds = new Set(due.map(item => item.id));
          let dropped = 0;
          queue = queue.filter(item => {
            if (!dueIds.has(item.id)) return true;
            item.attempts = Number(item.attempts || 0) + 1;
            if (item.attempts >= maxAttempts) { dropped++; return false; }
            item.nextAttemptAt = Date.now() + backoffMs(item.attempts);
            return true;
          });
          setQueue(queue);
          const prior = getStatus();
          patchStatus({
            lastErrorAt: nowIso(),
            lastError: clean(error?.message || error).slice(0, 2000),
            dropped: prior.dropped + dropped,
          });
          return { paired: true, sent: 0, failed: due.length, dropped, queued: queue.length };
        }
      })();
      try { return await flushing; }
      finally { flushing = null; }
    }

    function emit(event, { flushNow = true } = {}) {
      enqueue(event);
      if (flushNow) setTimeout(() => flush().catch(() => {}), 0);
      return getStatus();
    }

    function heartbeat(fields = {}) {
      return emit({ ...safeClone(fields), kind: 'heartbeat', occurred_at: clean(fields.occurred_at) || nowIso() });
    }

    function usage(fields = {}) {
      return emit({ ...safeClone(fields), kind: 'usage', occurred_at: clean(fields.occurred_at) || nowIso() });
    }

    function suggestion(fields = {}) {
      return emit({ ...safeClone(fields), kind: 'suggestion', occurred_at: clean(fields.occurred_at) || nowIso() });
    }

    function startAutoFlush(intervalMs = 30000) {
      const ms = Math.max(10000, Number(intervalMs || 30000));
      const timer = setInterval(() => flush().catch(() => {}), ms);
      setTimeout(() => flush().catch(() => {}), 1000);
      return () => clearInterval(timer);
    }

    return {
      version: VERSION,
      configure,
      forget,
      publicConfig,
      status: getStatus,
      enqueue,
      emit,
      heartbeat,
      usage,
      suggestion,
      flush,
      startAutoFlush,
    };
  }

  return { version: VERSION, create };
});
