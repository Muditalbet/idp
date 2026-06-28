'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useCreateService, useTeams, useTemplates } from '@/lib/hooks';
import { PageHeader } from '@/components/Shell';
import { Button, Card, CardHeader, Field, Input, Select, Spinner } from '@/components/ui';
import { ApiError } from '@/lib/api';

const ENV_OPTIONS = ['dev', 'staging', 'prod'];

export default function NewServicePage() {
  const router = useRouter();
  const { data: templates } = useTemplates();
  const { data: teams } = useTeams();
  const create = useCreateService();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('bundled:sample-service');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [template, setTemplate] = useState('node-service');
  const [containerPort, setContainerPort] = useState(8080);
  const [teamId, setTeamId] = useState('');
  const [environments, setEnvironments] = useState<string[]>(['dev']);
  const [error, setError] = useState<string | null>(null);

  const toggleEnv = (env: string) => {
    setEnvironments((prev) =>
      prev.includes(env) ? prev.filter((e) => e !== env) : [...prev, env],
    );
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Name is required');
    if (environments.length === 0) return setError('Select at least one environment');
    try {
      const service = await create.mutateAsync({
        name: name.trim(),
        description,
        repoUrl,
        defaultBranch,
        template,
        containerPort,
        teamId: teamId || undefined,
        environments,
      });
      router.push(`/services/${service.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create service');
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Scaffold a Service"
        description="The platform will provision a namespace, CI/CD, DNS and observability automatically."
      />

      <Card>
        <CardHeader title="Service definition" />
        <form onSubmit={onSubmit} className="space-y-5 p-5">
          <Field label="Name" hint="A DNS-safe slug is generated from this.">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="payments-api" />
          </Field>

          <Field label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Handles payment intents"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Template">
              <Select value={template} onChange={(e) => setTemplate(e.target.value)}>
                {(templates ?? [{ id: 'node-service', name: 'Node.js Service' }]).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Container port">
              <Input
                type="number"
                value={containerPort}
                onChange={(e) => setContainerPort(Number(e.target.value))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Git repository" hint="Pushes to this repo trigger CI/CD.">
              <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
            </Field>
            <Field label="Default branch">
              <Input value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)} />
            </Field>
          </div>

          <Field label="Team">
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">My team</option>
              {(teams ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Environments</span>
            <div className="flex gap-2">
              {ENV_OPTIONS.map((env) => {
                const active = environments.includes(env);
                return (
                  <button
                    type="button"
                    key={env}
                    onClick={() => toggleEnv(env)}
                    className={clsx(
                      'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                      active
                        ? 'border-brand-500 bg-brand-600/15 text-brand-300'
                        : 'border-slate-700 text-slate-400 hover:border-slate-600',
                    )}
                  >
                    {env}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-4">
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create &amp; Provision
            </Button>
          </div>
        </form>
      </Card>

      {!templates && (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <Spinner className="h-3 w-3" /> loading templates…
        </div>
      )}
    </div>
  );
}
