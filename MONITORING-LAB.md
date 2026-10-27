# Automatic local monitoring

Run in a separate PowerShell terminal and leave it open:

    cd D:\devops-core-lab
    node monitor.mjs

The monitor checks /health/ready on port 3102, waits five seconds between checks,
and times out a check after four seconds. Two consecutive failures trigger ALARM;
two consecutive successes after an alarm trigger RECOVERED. Individual CHECK events
continue while the problem persists, but the ALARM transition is only emitted once.
Initial successful state is HEALTHY, not RECOVERED. Stop with Ctrl+C.

## Exercise (second terminal in this folder)

    docker compose stop mongo

Watch the monitor for failed CHECK events followed by ALARM. Detection may take
roughly 10-20 seconds depending on check timing and database/network timeouts.
Then recover:

    docker compose start mongo

Wait for MongoDB startup and two successful checks. Expect RECOVERED.
Verify tasks are still available:

    Invoke-RestMethod http://localhost:3102/tasks

## What this monitors

This is a synthetic readiness check, not an error-rate or latency alarm. /drills/error
does not trigger this monitor while readiness stays healthy. Every CHECK includes
its duration, but no latency threshold is configured yet.

This monitor prints JSON in the terminal only: it sends no email and does not restart
services. Closing the terminal stops monitoring. The later AWS stage will use managed
alarms and notifications.

Optional override (current terminal only):

    $env:MONITOR_URL = 'http://127.0.0.1:3102/health/ready'

Timing overrides for testing: MONITOR_INTERVAL_MS and MONITOR_TIMEOUT_MS.
