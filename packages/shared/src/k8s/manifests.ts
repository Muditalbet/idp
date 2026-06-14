import type { K8sObject } from './client';
import { hostFor, managedLabels, namespaceFor, workloadName } from './names';

export interface InfraSpec {
  serviceSlug: string;
  envName: string;
  /** App container port — allowed through the network policy for probes/proxy/ingress. */
  containerPort?: number;
}

export interface WorkloadSpec {
  serviceSlug: string;
  envName: string;
  image: string;
  replicas: number;
  containerPort: number;
  /** HTTP path used for readiness/liveness probes. */
  healthPath?: string;
}

// ───────────────────────── Infra (provisioner) ─────────────────────────────

export function buildNamespace({ serviceSlug, envName }: InfraSpec): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: namespaceFor(serviceSlug, envName),
      labels: managedLabels(serviceSlug, envName),
    },
  };
}

export function buildResourceQuota({ serviceSlug, envName }: InfraSpec): K8sObject {
  const ns = namespaceFor(serviceSlug, envName);
  return {
    apiVersion: 'v1',
    kind: 'ResourceQuota',
    metadata: { name: `${ns}-quota`, namespace: ns, labels: managedLabels(serviceSlug, envName) },
    spec: {
      hard: {
        'requests.cpu': '2',
        'requests.memory': '2Gi',
        'limits.cpu': '4',
        'limits.memory': '4Gi',
        pods: '20',
      },
    },
  };
}

export function buildLimitRange({ serviceSlug, envName }: InfraSpec): K8sObject {
  const ns = namespaceFor(serviceSlug, envName);
  return {
    apiVersion: 'v1',
    kind: 'LimitRange',
    metadata: { name: `${ns}-limits`, namespace: ns, labels: managedLabels(serviceSlug, envName) },
    spec: {
      limits: [
        {
          type: 'Container',
          default: { cpu: '250m', memory: '256Mi' },
          defaultRequest: { cpu: '50m', memory: '64Mi' },
        },
      ],
    },
  };
}

/**
 * Multi-tenant baseline: restrict cross-namespace traffic, but explicitly allow
 *  - same-namespace pods,
 *  - the ingress-nginx controller namespace, and
 *  - the app's container port from any source (so kubelet health probes and the
 *    apiserver pod-proxy /metrics scrape are never blocked when the CNI enforces
 *    NetworkPolicy, e.g. kindnet).
 */
export function buildNetworkPolicy({ serviceSlug, envName, containerPort }: InfraSpec): K8sObject {
  const ns = namespaceFor(serviceSlug, envName);
  const ingress: unknown[] = [
    { from: [{ podSelector: {} }] },
    {
      from: [
        { namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'ingress-nginx' } } },
      ],
    },
  ];
  if (containerPort) {
    // No `from` ⇒ allow this port from all sources (probes, proxy, ingress).
    ingress.push({ ports: [{ port: containerPort }] });
  }
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: { name: `${ns}-baseline`, namespace: ns, labels: managedLabels(serviceSlug, envName) },
    spec: {
      podSelector: {},
      policyTypes: ['Ingress'],
      ingress,
    },
  };
}

export function buildServiceAccount({ serviceSlug, envName }: InfraSpec): K8sObject {
  const ns = namespaceFor(serviceSlug, envName);
  return {
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: {
      name: workloadName(serviceSlug),
      namespace: ns,
      labels: managedLabels(serviceSlug, envName),
    },
  };
}

/** All namespace-scoped infra a new environment claim provisions. */
export function buildInfraManifests(spec: InfraSpec): K8sObject[] {
  return [
    buildNamespace(spec),
    buildResourceQuota(spec),
    buildLimitRange(spec),
    buildNetworkPolicy(spec),
    buildServiceAccount(spec),
  ];
}

// ───────────────────────── Workload (reconciler) ───────────────────────────

export function buildDeployment(spec: WorkloadSpec): K8sObject {
  const { serviceSlug, envName, image, replicas, containerPort } = spec;
  const ns = namespaceFor(serviceSlug, envName);
  const name = workloadName(serviceSlug);
  const labels = managedLabels(serviceSlug, envName);
  const selector = {
    'app.kubernetes.io/name': labels['app.kubernetes.io/name'],
    'app.kubernetes.io/instance': labels['app.kubernetes.io/instance'],
  };
  const healthPath = spec.healthPath ?? '/healthz';
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name, namespace: ns, labels },
    spec: {
      replicas,
      selector: { matchLabels: selector },
      template: {
        metadata: {
          labels,
          annotations: {
            'prometheus.io/scrape': 'true',
            'prometheus.io/path': '/metrics',
            'prometheus.io/port': String(containerPort),
          },
        },
        spec: {
          serviceAccountName: name,
          containers: [
            {
              name: 'app',
              image,
              imagePullPolicy: 'IfNotPresent',
              ports: [{ name: 'http', containerPort }],
              env: [
                { name: 'PORT', value: String(containerPort) },
                { name: 'NODE_ENV', value: 'production' },
                { name: 'SERVICE_NAME', value: serviceSlug },
                { name: 'ENVIRONMENT', value: envName },
              ],
              resources: {
                requests: { cpu: '50m', memory: '64Mi' },
                limits: { cpu: '250m', memory: '256Mi' },
              },
              readinessProbe: {
                httpGet: { path: healthPath, port: 'http' },
                initialDelaySeconds: 3,
                periodSeconds: 5,
              },
              livenessProbe: {
                httpGet: { path: healthPath, port: 'http' },
                initialDelaySeconds: 10,
                periodSeconds: 15,
              },
            },
          ],
        },
      },
    },
  };
}

export function buildService(spec: WorkloadSpec): K8sObject {
  const { serviceSlug, envName, containerPort } = spec;
  const ns = namespaceFor(serviceSlug, envName);
  const name = workloadName(serviceSlug);
  const labels = managedLabels(serviceSlug, envName);
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name, namespace: ns, labels },
    spec: {
      selector: {
        'app.kubernetes.io/name': labels['app.kubernetes.io/name'],
        'app.kubernetes.io/instance': labels['app.kubernetes.io/instance'],
      },
      ports: [{ name: 'http', port: 80, targetPort: containerPort }],
    },
  };
}

export function buildIngress(spec: WorkloadSpec): K8sObject {
  const { serviceSlug, envName } = spec;
  const ns = namespaceFor(serviceSlug, envName);
  const name = workloadName(serviceSlug);
  const host = hostFor(serviceSlug, envName);
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name,
      namespace: ns,
      labels: managedLabels(serviceSlug, envName),
      annotations: { 'nginx.ingress.kubernetes.io/rewrite-target': '/' },
    },
    spec: {
      ingressClassName: 'nginx',
      rules: [
        {
          host,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: { service: { name, port: { number: 80 } } },
              },
            ],
          },
        },
      ],
    },
  };
}

/** Desired workload state the reconciler drives the cluster towards. */
export function buildWorkloadManifests(spec: WorkloadSpec): K8sObject[] {
  return [buildDeployment(spec), buildService(spec), buildIngress(spec)];
}
