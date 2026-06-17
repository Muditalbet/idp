export interface Template {
  id: string;
  name: string;
  description: string;
  language: string;
  defaultPort: number;
  tags: string[];
  /** Example repo a developer can fork to try the platform. */
  exampleRepo: string;
}

export const TEMPLATES: Template[] = [
  {
    id: 'node-service',
    name: 'Node.js HTTP Service',
    description:
      'Express service with /healthz, /metrics (Prometheus) and a Dockerfile — ready to build and deploy.',
    language: 'TypeScript',
    defaultPort: 8080,
    tags: ['express', 'rest', 'prometheus', 'docker'],
    exampleRepo: 'https://github.com/idp-demo/sample-service',
  },
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
