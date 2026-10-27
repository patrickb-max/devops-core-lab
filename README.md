> UPDATE: Source now uses MongoDB. Start with DATABASE-LAB.md; the instructions below describe the earlier in-memory stage. Database runtime verification is pending a Docker Hub download issue.

# DevOps core-service lab

This is an independent practice project with no Keydemand dependencies or credentials.

## Run locally (PowerShell)

    cd D:\devops-core-lab
    $env:ENABLE_DRILLS = 'true'
    npm start

In another PowerShell terminal:

    Invoke-RestMethod http://localhost:3100/health
    Invoke-RestMethod http://localhost:3100/health/ready
    $result = Invoke-RestMethod http://localhost:3100/tasks -Method Post -ContentType application/json -Body '{"title":"Learn monitoring"}'
    Invoke-RestMethod http://localhost:3100/tasks
    Invoke-RestMethod "http://localhost:3100/tasks/$($result.task.id)" -Method Patch

Watch the server terminal for JSON logs. Match requestId in the response to the access log.

## Incident exercises

1. GET /drills/error: intentional HTTP 500; match the error log to the access log by requestId.
2. GET /drills/slow: HTTP 200 after approximately 2.5 seconds; inspect durationMs.
3. POST /drills/readiness: toggles simulated dependency availability. While unavailable, /health is 200, /health/ready is 503, and /tasks is 503. POST again to recover.
4. Stop the server with Ctrl+C; verify that requests fail. Restart and check health.

PowerShell reports non-success HTTP responses as errors; this is expected in the drills.
Record symptom, evidence, cause, recovery and verification for each exercise.
Failure endpoints are disabled unless ENABLE_DRILLS=true. Keep them disabled on a public deployment.

## Docker

Stop the Node process first to free port 3100. With the Docker engine running:

    docker build -t devops-core-lab:local .
    docker run --rm --name devops-core-lab -p 127.0.0.1:3100:3100 -e ENABLE_DRILLS=true devops-core-lab:local

In another terminal:

    docker logs devops-core-lab

## Current scope

Stage 1 uses memory: tasks disappear on restart. Readiness is a deliberate simulation,
not a real database check. There is no authentication. Local binding is loopback by default.

Next stages: persistent database and real dependency readiness; meaningful automated tests;
GitHub Actions; personal AWS account deployment through ECR/ECS and a load balancer;
CloudWatch logs, metrics, dashboard and alarms; SNS email; one scheduled job; rollback drills.
These cloud resources and workflows have not been created yet.
