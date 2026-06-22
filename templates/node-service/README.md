# node-service template

The scaffolder template offered in the portal's "New Service" wizard. It describes a
standard Node.js HTTP service that the platform knows how to build and run:

- listens on `containerPort` (default 8080)
- exposes `GET /healthz` for probes
- exposes `GET /metrics` in Prometheus format

The runnable skeleton lives in [`examples/sample-service`](../../examples/sample-service).
When you scaffold a service you point it at a Git repository (or the bundled
`bundled:sample-service`); the CI/CD pipeline builds that repo's `Dockerfile`, pushes the
image to the local registry, and the reconciler rolls it out.
