# sample-service

A tiny Express service used to demo the IDP end-to-end. The platform clones/copies
this, builds a container image, pushes it to the local registry, and deploys it.

## Endpoints

| Path | Purpose |
| --- | --- |
| `GET /` | Hello payload (service, environment, hostname) |
| `GET /healthz` | Readiness/liveness probe target |
| `GET /work` | Synthetic work (variable latency, ~8% errors) |
| `GET /metrics` | Prometheus metrics |

## Metrics exposed

- `http_requests_total{method,route,code}` — counter
- `http_request_duration_seconds{...}` — histogram (`_sum` / `_count` used for avg latency)
- Node.js default metrics (CPU, heap, event loop)

The service generates light self-traffic on a timer so dashboards show data without
manual load (set `SELF_TRAFFIC=false` to disable).

## Using it as your own repo

To exercise the **git push → webhook → deploy** flow, push this folder to a GitHub repo
and create a service in the portal pointing at that repo URL (instead of the default
`bundled:sample-service`). Configure a push webhook to `POST /api/webhooks/github`.
