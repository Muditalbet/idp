# Demo script

A 5-minute walkthrough that shows the whole platform end-to-end.

## 0. Start everything

```bash
npm install
npm run setup     # kind + ingress + metrics-server + registry + Postgres/Redis + migrate/seed
npm run dev       # api (:4000), worker, portal (:3000)
```

Open http://localhost:3000 and sign in as **dev@idp.local / dev123**.

## 1. Self-service provisioning (Crossplane-style)

1. Click **New Service**. Name it `payments`, keep the repo as `bundled:sample-service`,
   choose the `dev` environment, and **Create & Provision**.
2. You land on the service page. Watch the **Overview → Provisioned infrastructure** card fill
   in live (Socket.io): Namespace, ResourceQuota, LimitRange, NetworkPolicy, ServiceAccount.
   The claim flips `Pending → Provisioning → Provisioned`.

```bash
kubectl get ns payments-dev
kubectl get resourcequota,networkpolicy -n payments-dev
```

## 2. CI/CD pipeline (push-button)

1. On the service page, click **Deploy**.
2. Open the **Pipelines** tab and watch the live log stream:
   `CLONE → BUILD → PUSH → DEPLOY`. An image is built and pushed to `localhost:5001`.
3. The reconciler rolls it out; the service flips to **Synced / Healthy**.

```bash
kubectl get deploy,po,ingress -n payments-dev
curl http://payments-dev.127.0.0.1.nip.io/      # the app, live in the cluster
```

## 3. Observability (built-in)

Open the **Observability** tab:

- Requests/sec, average latency, CPU and memory charts (the sample app generates self-traffic).
- **Live pod logs** streaming from the cluster.

## 4. GitOps self-healing (ArgoCD-style)

Break the desired state and watch the reconciler fix it within ~30s:

```bash
kubectl scale deploy/payments --replicas=5 -n payments-dev
# Overview briefly shows OutOfSync, then self-heals back to Synced/Healthy (replicas = 1)

kubectl delete deploy/payments -n payments-dev
# Reconciler recreates it on the next sweep
```

## 5. Platform admin

Sign in as **admin@idp.local / admin123** and open **Admin**:
cluster nodes, environment health rollup, and the full **audit log** of platform actions.

## Bonus: real `git push → deploy`

1. Push `examples/sample-service` to a GitHub repo.
2. Create a service pointing at that repo URL (instead of `bundled:`).
3. Expose the API webhook publicly (e.g. `npx smee-client --url <channel> --target
   http://localhost:4000/api/webhooks/github`) and add a push webhook in GitHub using
   `GITHUB_WEBHOOK_SECRET`.
4. `git push` → the webhook triggers the same pipeline automatically.
