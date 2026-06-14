import { env } from '../env';

/** RFC-1123 label: lowercase alphanumeric and '-', max 63 chars. */
export function toDnsLabel(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
}

/** Namespace for a service/environment pair, e.g. "payments-dev". */
export function namespaceFor(serviceSlug: string, envName: string): string {
  return toDnsLabel(`${serviceSlug}-${envName}`);
}

/** Public ingress hostname, e.g. "payments-dev.127.0.0.1.nip.io". */
export function hostFor(serviceSlug: string, envName: string): string {
  return `${namespaceFor(serviceSlug, envName)}.${env.INGRESS_DOMAIN}`;
}

/** Kubernetes object name for the workload (Deployment/Service), e.g. "payments". */
export function workloadName(serviceSlug: string): string {
  return toDnsLabel(serviceSlug);
}

/** Fully qualified image reference in the local registry. */
export function imageRef(serviceSlug: string, tag: string): string {
  return `${env.REGISTRY}/${toDnsLabel(serviceSlug)}:${tag}`;
}

/** Standard labels applied to every object the platform manages. */
export function managedLabels(serviceSlug: string, envName: string): Record<string, string> {
  return {
    'app.kubernetes.io/name': workloadName(serviceSlug),
    'app.kubernetes.io/instance': namespaceFor(serviceSlug, envName),
    'app.kubernetes.io/managed-by': 'idp',
    'idp.dev/service': serviceSlug,
    'idp.dev/environment': envName,
  };
}
