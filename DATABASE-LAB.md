# Stage 2: real database monitoring

Status: source updated and syntax checked; runtime verification is pending because
Docker Hub failed to download mongo:8.0 with TLS/HTTPS errors.
The earlier image/container on port 3101 still runs the in-memory version.

## Start (PowerShell)

    cd D:\devops-core-lab
    docker compose up -d --build
    docker compose ps
    Invoke-RestMethod http://localhost:3102/health/ready

Compose starts a separate API on port 3102 and MongoDB with a named data volume.
MongoDB is not published to a host port. This is a local lab without authentication;
do not deploy this configuration publicly.

## Create a persistent task

    $result = Invoke-RestMethod http://localhost:3102/tasks -Method Post -ContentType application/json -Body '{"title":"Verify database persistence"}'
    Invoke-RestMethod http://localhost:3102/tasks
    docker compose restart api
    Invoke-RestMethod http://localhost:3102/tasks

Wait briefly if the request arrives before the API finishes restarting.
Your task should still be present because it is stored in MongoDB.

## Real dependency outage

    docker compose stop mongo
    Invoke-RestMethod http://localhost:3102/health
    Invoke-RestMethod http://localhost:3102/health/ready
    Invoke-RestMethod http://localhost:3102/tasks
    docker compose logs --tail 25 api

Expected: liveness 200, readiness 503, task request 503. Database checks may take
several seconds to time out. This differs from the earlier simulated toggle.

## Recovery

    docker compose start mongo
    docker compose ps
    Invoke-RestMethod http://localhost:3102/health/ready
    Invoke-RestMethod http://localhost:3102/tasks

Retry after a few seconds while MongoDB starts and the driver reconnects.
Readiness and task listing should recover without restarting the API.

## Stop the lab

    docker compose down

The named database volume is retained. Do not add -v if you want to retain tasks.

## Troubleshooting image downloads

TLS errors or 'HTTP response to HTTPS client' during image pull occur before the
application starts. Check Docker Desktop proxy/network configuration and retry
from a working connection. Do not disable TLS verification.

The README describes the earlier in-memory stage. Current source requires MongoDB;
use this Compose setup rather than npm start unless you supply a reachable MONGODB_URI.
