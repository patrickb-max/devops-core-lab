const target = process.env.MONITOR_URL || 'http://127.0.0.1:3102/health/ready';
const interval = Number(process.env.MONITOR_INTERVAL_MS || 5000);
const timeout = Number(process.env.MONITOR_TIMEOUT_MS || 4000);
const threshold = 2;
if (!Number.isFinite(interval) || interval < 100 || !Number.isFinite(timeout) || timeout < 100) {
  throw new Error('Monitor interval and timeout must be at least 100ms');
}
let state = 'UNKNOWN';
let failures = 0;
let successes = 0;
let running = true;
let sleepTimer;
let wake;
const emit = (event, details = {}) => console.log(JSON.stringify({
  time: new Date().toISOString(), event, state, target, ...details
}));
const stop = () => { running = false; clearTimeout(sleepTimer); wake?.(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
emit('MONITOR_STARTED', { intervalMs: interval, timeoutMs: timeout, failureThreshold: threshold, recoveryThreshold: threshold });
while (running) {
  const started = performance.now();
  let ok = false;
  let reason;
  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(timeout) });
    if (!response.ok) reason = `HTTP_${response.status}`;
    else {
      const body = await response.json();
      ok = body.status === 'ready';
      if (!ok) reason = 'BODY_NOT_READY';
    }
  } catch (error) { reason = error.name; }
  if (!running) break;
  if (ok) {
    successes++;
    failures = 0;
    if (state === 'UNKNOWN') { state = 'OK'; emit('HEALTHY'); }
    else if (state === 'ALARM' && successes >= threshold) { state = 'OK'; emit('RECOVERED'); }
  } else {
    failures++;
    successes = 0;
    if (failures >= threshold && state !== 'ALARM') { state = 'ALARM'; emit('ALARM', { reason }); }
  }
  emit('CHECK', { ok, reason, consecutiveFailures: failures, consecutiveSuccesses: successes, durationMs: Math.round(performance.now() - started) });
  if (running) await new Promise(resolve => { wake = resolve; sleepTimer = setTimeout(resolve, interval); });
}
emit('MONITOR_STOPPED');
