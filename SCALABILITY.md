# Scalability Design Notes

This project was built as a working prototype, not a production system. This
document is a deliberately honest analysis of what the current architecture
already scales well, where it would break under real load, and how I'd evolve
it — the kind of design review a senior engineer would do before taking a
system from "demo" to "production."

## Current Pipeline

```
Browser --PUT (presigned URL)--> S3 --OBJECT_CREATED--> SQS --poll--> Lambda
                                                                         |
                                                                         v
                                                              Bedrock (Claude)
                                                                         |
                                                                         v
                                                                    DynamoDB
                                                                         ^
                                                                         |
Browser --poll every 3s--> Next.js API route (get-analysis) ------------+
```

## What Already Scales Well

- **Direct-to-S3 upload via presigned URLs.** The app server never touches
  file bytes — upload bandwidth and memory pressure don't grow with traffic
  because clients talk to S3 directly.
- **SQS as a buffer in front of Lambda.** A standard SQS queue absorbs bursts
  (thousands of uploads at once) without dropping work; Lambda drains it at
  whatever rate is safe, instead of every upload triggering synchronous
  processing.
- **Lambda concurrency model.** Each concurrent Lambda invocation handles one
  resume end-to-end. AWS scales the number of concurrent invocations
  automatically as the queue grows — this is horizontal scaling with no
  server fleet to manage.
- **DynamoDB partition key.** `application_id` is derived from
  `timestamp-filename`, so writes are naturally spread across partitions —
  no hot-key risk even at high write volume. `PAY_PER_REQUEST` billing means
  no capacity planning is needed up front.

## Where It Breaks at Scale

1. **Polling doesn't scale to many concurrent users.** Every client hits
   `/api/get-analysis` every 3 seconds regardless of whether anything
   changed. At 10 users this is noise; at 10,000 concurrent users it's a
   constant, mostly-wasted request load on the Next.js server and DynamoDB.
   → Fix: push-based updates — DynamoDB Streams → Lambda → WebSocket API (or
   AppSync subscriptions) so the client is notified instead of asking.

2. **No dead-letter queue.** If Bedrock throttles or a Lambda invocation
   times out repeatedly, SQS just keeps redelivering the message until the
   queue's retention period expires — a bad file (or a Bedrock outage) can
   loop silently and burn invocations without anyone noticing.
   → Fix: DLQ with `maxReceiveCount`, plus a CloudWatch alarm on DLQ depth.

3. **Lambda concurrency isn't coordinated with Bedrock's throughput quota.**
   Bedrock enforces its own requests-per-minute / tokens-per-minute limits
   per model. A burst of uploads could spin up more concurrent Lambdas than
   Bedrock will accept, producing `ThrottlingException` errors instead of
   graceful backpressure.
   → Fix: cap the Lambda's reserved concurrency to match the account's
   Bedrock quota, so SQS queues the overflow instead of every extra
   invocation failing.

4. **No authentication or per-user data isolation.** Any caller can request
   a presigned upload URL or query any `applicationId` — there's no identity
   layer, no ownership check, and no rate limit on either endpoint. At scale
   this is both a cost risk (someone can drive unlimited Bedrock invocations
   for free) and a privacy issue (resume analyses aren't scoped to a user).
   → Fix: Cognito-backed auth, IAM/API Gateway throttling and usage plans,
   and scoping DynamoDB reads/writes to the authenticated user.

5. **No index for per-user history.** `application_id` is the only key —
   there's no way to answer "show me all of this user's past uploads"
   without a full table scan.
   → Fix: add a GSI, e.g. `user_id` (partition) + `created_at` (sort).

6. **The Next.js API layer couples frontend hosting to backend AWS calls.**
   Both API routes call the AWS SDK directly from the Next.js server using
   long-lived credentials in `.env.local`. This makes the frontend and the
   AWS access layer scale (and get redeployed) together, and makes local
   credential management a production security concern.
   → Fix: move these behind API Gateway + Lambda with a Cognito authorizer,
   so the frontend can become a static, CDN-hosted build with no AWS
   credentials in it at all.

7. **No observability.** There are no CloudWatch alarms, no dashboards, and
   no distributed tracing across S3 → SQS → Lambda → Bedrock → DynamoDB. A
   stuck resume today can only be debugged by reading raw Lambda logs.
   → Fix: X-Ray tracing end-to-end, a dashboard on queue depth / Lambda
   error rate / Bedrock throttle rate, alarms wired to paging.

8. **On-demand invocation of a single, larger model for every request.**
   Every resume — regardless of complexity — goes through the same
   full-size model synchronously. At high volume this is the dominant cost
   driver.
   → Fix: tier models (a cheaper/faster model for a first pass, escalate to
   Sonnet for deeper analysis), or move bulk/non-interactive workloads to
   Bedrock's batch inference API instead of per-request `invoke_model`.

## Priority If I Were Building This Out

- **P0 (cheap, prevents silent failure):** DLQ + alarm, reserved concurrency
  sized to the Bedrock quota, basic auth so the pipeline can't be abused for
  free compute.
- **P1 (needed for real multi-user usage):** push-based status updates, GSI
  for per-user history, move the AWS-calling API behind API Gateway +
  Cognito instead of the Next.js server.
- **P2 (needed at real production volume):** model tiering / batch
  inference, full tracing and dashboards, multi-region if latency or
  availability requirements demand it.

## How I'd Answer "How Would You Scale This?" in an Interview

1. State what already scales and *why* (presigned uploads, SQS buffering,
   Lambda's concurrency model, DynamoDB's key design) — this shows the
   design wasn't accidental.
2. Name the specific bottleneck that breaks first under load (polling, or
   the missing DLQ, depending on what "scale" means in the question — more
   users vs. more traffic per user vs. reliability under failure).
3. Give the concrete fix, not a buzzword — e.g. "replace polling with
   DynamoDB Streams feeding a WebSocket API" rather than "add caching."
4. Acknowledge the tradeoff — e.g. push-based updates add infrastructure
   (a WebSocket API, connection management) in exchange for removing
   constant polling load; that's worth it past some user count, not before.
