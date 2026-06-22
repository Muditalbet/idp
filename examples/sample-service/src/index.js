'use strict';

const os = require('node:os');
const express = require('express');
const client = require('prom-client');

const port = Number(process.env.PORT) || 8080;
const serviceName = process.env.SERVICE_NAME || 'sample-service';
const environment = process.env.ENVIRONMENT || 'dev';

// ── Prometheus metrics (names the IDP metrics scraper looks for) ──
const register = new client.Registry();
register.setDefaultLabels({ service: serviceName, environment });
client.collectDefaultMetrics({ register });

const httpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'code'],
  registers: [register],
});
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [register],
});

const app = express();

// Per-request instrumentation.
app.use((req, res, next) => {
  const endTimer = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path ?? req.path;
    const labels = { method: req.method, route, code: String(res.statusCode) };
    httpRequests.inc(labels);
    endTimer(labels);
  });
  next();
});

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

app.get('/', (_req, res) =>
  res.json({
    service: serviceName,
    environment,
    message: 'Hello from the Internal Developer Platform 👋',
    hostname: os.hostname(),
    time: new Date().toISOString(),
  }),
);

// Synthetic work endpoint with variable latency + occasional errors.
app.get('/work', async (_req, res) => {
  await new Promise((r) => setTimeout(r, Math.random() * 250));
  if (Math.random() < 0.08) return res.status(500).json({ error: 'synthetic failure' });
  res.json({ ok: true });
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`${serviceName}[${environment}] listening on :${port}`);
});

// Generate a little self-traffic so observability dashboards show data even
// without external load. Disable with SELF_TRAFFIC=false.
if (process.env.SELF_TRAFFIC !== 'false') {
  setInterval(() => {
    fetch(`http://localhost:${port}/work`).catch(() => undefined);
  }, 1500);
}
