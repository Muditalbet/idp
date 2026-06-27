'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type CreateServiceInput } from './api';

export function useServices() {
  return useQuery({ queryKey: ['services'], queryFn: () => api.services().then((r) => r.services) });
}

export function useService(id: string) {
  return useQuery({
    queryKey: ['service', id],
    queryFn: () => api.service(id).then((r) => r.service),
    enabled: Boolean(id),
  });
}

export function useTemplates() {
  return useQuery({ queryKey: ['templates'], queryFn: () => api.templates().then((r) => r.templates) });
}

export function useTeams() {
  return useQuery({ queryKey: ['teams'], queryFn: () => api.teams().then((r) => r.teams) });
}

export function useServicePipelines(id: string) {
  return useQuery({
    queryKey: ['pipelines', id],
    queryFn: () => api.servicePipelines(id).then((r) => r.pipelineRuns),
    enabled: Boolean(id),
  });
}

export function usePipeline(id: string | undefined) {
  return useQuery({
    queryKey: ['pipeline', id],
    queryFn: () => api.pipeline(id!).then((r) => r.pipelineRun),
    enabled: Boolean(id),
  });
}

export function useEnvironmentMetrics(envId: string, range: string) {
  return useQuery({
    queryKey: ['metrics', envId, range],
    queryFn: () => api.metrics(envId, range),
    enabled: Boolean(envId),
    refetchInterval: 15_000,
  });
}

export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceInput) => api.createService(input).then((r) => r.service),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useDeploy(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (envId: string) => api.deploy(envId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service', serviceId] });
      qc.invalidateQueries({ queryKey: ['pipelines', serviceId] });
    },
  });
}

export function useReconcile(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (envId: string) => api.reconcile(envId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service', serviceId] }),
  });
}

export function useRollback(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (envId: string) => api.rollback(envId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service', serviceId] }),
  });
}

export function useAdminCluster() {
  return useQuery({
    queryKey: ['admin', 'cluster'],
    queryFn: () => api.adminCluster(),
    refetchInterval: 10_000,
  });
}

export function useAdminAudit() {
  return useQuery({ queryKey: ['admin', 'audit'], queryFn: () => api.adminAudit().then((r) => r.logs) });
}
