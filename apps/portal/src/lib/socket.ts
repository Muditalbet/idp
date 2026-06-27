'use client';

import { io, type Socket } from 'socket.io-client';
import { API_URL, getToken } from './api';

let socket: Socket | null = null;

/** Lazily create a singleton authenticated socket connection. */
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(API_URL, {
    auth: { token: getToken() },
    transports: ['websocket'],
    autoConnect: true,
  });
  return socket;
}

export function resetSocket(): void {
  socket?.disconnect();
  socket = null;
}
