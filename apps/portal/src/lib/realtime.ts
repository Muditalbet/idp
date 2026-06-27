'use client';

import { useEffect, useRef } from 'react';
import { getSocket } from './socket';
import type { IdpEvent, PodLogEvent } from './types';

interface Handlers {
  onEvent?: (e: IdpEvent) => void;
  onPodLog?: (e: PodLogEvent) => void;
}

/** Subscribe to a single service's room and receive its live events. */
export function useServiceRealtime(serviceId: string | undefined, handlers: Handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!serviceId) return;
    const socket = getSocket();

    const subscribe = () => socket.emit('subscribe:service', serviceId);
    if (socket.connected) subscribe();
    socket.on('connect', subscribe);

    const onEvent = (e: IdpEvent) => {
      if (e.serviceId === serviceId) ref.current.onEvent?.(e);
    };
    const onPodLog = (e: PodLogEvent) => {
      if (e.serviceId === serviceId) ref.current.onPodLog?.(e);
    };
    socket.on('event', onEvent);
    socket.on('pod.log', onPodLog);

    return () => {
      socket.emit('unsubscribe:service', serviceId);
      socket.off('connect', subscribe);
      socket.off('event', onEvent);
      socket.off('pod.log', onPodLog);
    };
  }, [serviceId]);
}

/** Subscribe to many service rooms (catalog / dashboard live updates). */
export function useServicesRealtime(serviceIds: string[], onEvent: (e: IdpEvent) => void) {
  const ref = useRef(onEvent);
  ref.current = onEvent;
  const key = serviceIds.slice().sort().join(',');

  useEffect(() => {
    if (serviceIds.length === 0) return;
    const socket = getSocket();
    const subscribe = () => serviceIds.forEach((id) => socket.emit('subscribe:service', id));
    if (socket.connected) subscribe();
    socket.on('connect', subscribe);

    const handler = (e: IdpEvent) => ref.current(e);
    socket.on('event', handler);

    return () => {
      serviceIds.forEach((id) => socket.emit('unsubscribe:service', id));
      socket.off('connect', subscribe);
      socket.off('event', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Start/stop live pod-log tailing for an environment. */
export function startPodLogs(environmentId: string) {
  getSocket().emit('logs:start', environmentId);
}
export function stopPodLogs(environmentId: string) {
  getSocket().emit('logs:stop', environmentId);
}
