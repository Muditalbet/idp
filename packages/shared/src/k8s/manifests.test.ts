import { describe, expect, it } from 'vitest';
import { hostFor, imageRef, namespaceFor, toDnsLabel } from './names';
import { buildInfraManifests, buildWorkloadManifests } from './manifests';

describe('names', () => {
  it('slugifies arbitrary text into a DNS-1123 label', () => {
    expect(toDnsLabel('My Cool Service!')).toBe('my-cool-service');
    expect(toDnsLabel('--Payments API--')).toBe('payments-api');
  });

  it('derives namespace and host', () => {
    expect(namespaceFor('payments', 'dev')).toBe('payments-dev');
    expect(hostFor('payments', 'dev')).toBe('payments-dev.127.0.0.1.nip.io');
  });

  it('targets the local registry for images', () => {
    expect(imageRef('payments', 'abc1234')).toBe('localhost:5001/payments:abc1234');
  });
});

describe('infra manifests', () => {
  const kinds = buildInfraManifests({ serviceSlug: 'payments', envName: 'dev' }).map((m) => m.kind);

  it('includes the multi-tenant baseline', () => {
    expect(kinds).toContain('Namespace');
    expect(kinds).toContain('ResourceQuota');
    expect(kinds).toContain('LimitRange');
    expect(kinds).toContain('NetworkPolicy');
    expect(kinds).toContain('ServiceAccount');
  });
});

describe('workload manifests', () => {
  const manifests = buildWorkloadManifests({
    serviceSlug: 'payments',
    envName: 'dev',
    image: 'localhost:5001/payments:abc1234',
    replicas: 3,
    containerPort: 8080,
  });

  it('renders Deployment, Service and Ingress', () => {
    expect(manifests.map((m) => m.kind)).toEqual(['Deployment', 'Service', 'Ingress']);
  });

  it('sets the desired image, replicas and prometheus annotations', () => {
    const dep = manifests.find((m) => m.kind === 'Deployment') as Record<string, any>;
    expect(dep.spec.replicas).toBe(3);
    expect(dep.spec.template.spec.containers[0].image).toBe('localhost:5001/payments:abc1234');
    expect(dep.spec.template.metadata.annotations['prometheus.io/scrape']).toBe('true');
  });

  it('routes the ingress host to the service', () => {
    const ing = manifests.find((m) => m.kind === 'Ingress') as Record<string, any>;
    expect(ing.spec.rules[0].host).toBe('payments-dev.127.0.0.1.nip.io');
    expect(ing.spec.ingressClassName).toBe('nginx');
  });
});
