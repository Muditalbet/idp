import { spawn } from 'node:child_process';
import { env } from '../env';
import { childLogger } from '../logger';

const log = childLogger('k8s');

export interface K8sObject {
  apiVersion: string;
  kind: string;
  metadata: { name: string; namespace?: string; [k: string]: unknown };
  [k: string]: unknown;
}

export class KubectlError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'KubectlError';
  }
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Thin, version-stable wrapper around `kubectl`. Every cluster mutation and
 * read flows through here, which keeps the control plane debuggable and the
 * manifests first-class (exactly what a GitOps engine does under the hood).
 */
export class KubeClient {
  constructor(private readonly context: string = env.KUBE_CONTEXT) {}

  private exec(args: string[], input?: string): Promise<ExecResult> {
    const fullArgs = ['--context', this.context, ...args];
    return new Promise((resolve, reject) => {
      const child = spawn('kubectl', fullArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', (err) => reject(err));
      child.on('close', (code) => resolve({ stdout, stderr, code }));
      if (input !== undefined) {
        child.stdin.write(input);
      }
      child.stdin.end();
    });
  }

  /** Run kubectl, throwing on a non-zero exit code. */
  async run(args: string[], input?: string): Promise<string> {
    const res = await this.exec(args, input);
    if (res.code !== 0) {
      throw new KubectlError(`kubectl ${args.join(' ')} failed`, res.code, res.stderr.trim());
    }
    return res.stdout;
  }

  /** Verify the cluster/context is reachable. */
  async ping(): Promise<boolean> {
    try {
      await this.run(['version', '--output=json']);
      return true;
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'cluster unreachable');
      return false;
    }
  }

  /**
   * Server-side apply one or more manifests. Objects are wrapped in a List and
   * piped as JSON, so no YAML serializer is needed. `--force-conflicts` makes
   * the platform the authoritative field manager (ArgoCD-style ownership).
   */
  async apply(objects: K8sObject | K8sObject[], fieldManager = 'idp'): Promise<void> {
    const items = Array.isArray(objects) ? objects : [objects];
    if (items.length === 0) return;
    const list = { apiVersion: 'v1', kind: 'List', items };
    await this.run(
      [
        'apply',
        '--server-side',
        `--field-manager=${fieldManager}`,
        '--force-conflicts',
        '-f',
        '-',
      ],
      JSON.stringify(list),
    );
  }

  /** Get an object as parsed JSON, or null when it does not exist. */
  async get<T = Record<string, unknown>>(
    kind: string,
    name: string,
    namespace?: string,
  ): Promise<T | null> {
    const args = ['get', kind, name, '-o', 'json'];
    if (namespace) args.push('-n', namespace);
    const res = await this.exec(args);
    if (res.code !== 0) {
      if (/NotFound|not found/i.test(res.stderr)) return null;
      throw new KubectlError(`kubectl get ${kind}/${name} failed`, res.code, res.stderr.trim());
    }
    return JSON.parse(res.stdout) as T;
  }

  /** List objects of a kind (optionally namespaced / label-selected). */
  async list<T = Record<string, unknown>>(
    kind: string,
    namespace?: string,
    labelSelector?: string,
  ): Promise<T[]> {
    const args = ['get', kind, '-o', 'json'];
    if (namespace) args.push('-n', namespace);
    if (labelSelector) args.push('-l', labelSelector);
    const res = await this.exec(args);
    if (res.code !== 0) {
      if (/NotFound|not found/i.test(res.stderr)) return [];
      throw new KubectlError(`kubectl get ${kind} failed`, res.code, res.stderr.trim());
    }
    const parsed = JSON.parse(res.stdout) as { items?: T[] };
    return parsed.items ?? [];
  }

  /** Delete an object; ignores NotFound. */
  async delete(kind: string, name: string, namespace?: string): Promise<void> {
    const args = ['delete', kind, name, '--ignore-not-found'];
    if (namespace) args.push('-n', namespace);
    await this.run(args);
  }

  /** Raw GET against the Kubernetes API (pod-proxy /metrics, metrics.k8s.io, ...). */
  async raw(path: string): Promise<string> {
    return this.run(['get', '--raw', path]);
  }

  async rawJson<T = Record<string, unknown>>(path: string): Promise<T> {
    return JSON.parse(await this.raw(path)) as T;
  }

  /**
   * Stream pod logs by label selector. Returns a stop() handle.
   * `onLine` is invoked per log line; `onClose` when the stream ends.
   */
  streamLogs(
    namespace: string,
    labelSelector: string,
    opts: { tailLines?: number; container?: string },
    onLine: (line: string) => void,
    onClose?: () => void,
  ): { stop: () => void } {
    const args = [
      '--context',
      this.context,
      'logs',
      '-n',
      namespace,
      '-l',
      labelSelector,
      '--follow',
      '--max-log-requests=10',
      `--tail=${opts.tailLines ?? 100}`,
      '--prefix=true',
    ];
    if (opts.container) args.push('-c', opts.container);
    const child = spawn('kubectl', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let buffer = '';
    child.stdout.on('data', (d) => {
      buffer += d.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) onLine(line);
    });
    child.on('close', () => {
      if (buffer.trim()) onLine(buffer);
      onClose?.();
    });
    child.on('error', () => onClose?.());
    return {
      stop: () => {
        child.kill('SIGTERM');
      },
    };
  }
}

export const kube = new KubeClient();
