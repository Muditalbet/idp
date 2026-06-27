'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/lib/hooks';
import { useServicesRealtime } from '@/lib/realtime';
import { PageHeader } from '@/components/Shell';
import { ServiceCard } from '@/components/ServiceCard';
import { Button, EmptyState, Input, Spinner } from '@/components/ui';

export default function ServicesPage() {
  const { data: services, isLoading } = useServices();
  const qc = useQueryClient();
  const [q, setQ] = useState('');

  const serviceIds = useMemo(() => (services ?? []).map((s) => s.id), [services]);
  useServicesRealtime(serviceIds, () => qc.invalidateQueries({ queryKey: ['services'] }));

  const filtered = (services ?? []).filter(
    (s) =>
      s.name.toLowerCase().includes(q.toLowerCase()) ||
      s.slug.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Service Catalog"
        description="Every service registered in the platform."
        action={
          <Link href="/services/new">
            <Button>New Service</Button>
          </Link>
        }
      />

      <div className="mb-4 max-w-xs">
        <Input placeholder="Search services…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={q ? 'No matching services' : 'No services yet'}
          description={q ? undefined : 'Scaffold your first service to get started.'}
          action={
            !q ? (
              <Link href="/services/new">
                <Button>Create a service</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <ServiceCard key={s.id} service={s} />
          ))}
        </div>
      )}
    </div>
  );
}
