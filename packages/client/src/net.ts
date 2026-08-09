/**
 * WebSocket transport.
 *
 * Two jobs beyond sending JSON:
 *
 *   - reconnect on its own, replaying the `hello` with the saved token,
 *     so a phone that locked mid-game comes back to its seat and score;
 *   - track clock skew, so countdowns drawn from server deadlines do not
 *     jump on a device whose clock is minutes off.
 */

import type { ClientMessage, ServerMessage } from '@lexo/core';

export type Status = 'connecting' | 'open' | 'closed';

type Hello = Extract<ClientMessage, { t: 'hello' }>;

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000];

export function socketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

export class Connection {
  private socket: WebSocket | null = null;
  private hello: Hello | null = null;
  private queue: ClientMessage[] = [];
  private messageListeners = new Set<(message: ServerMessage) => void>();
  private statusListeners = new Set<(status: Status) => void>();
  private retries = 0;
  private retryTimer: number | null = null;
  private disposed = false;
  private skewMs = 0;

  constructor(private readonly url = socketUrl()) {}

  /** Server time, corrected for this device's clock. */
  now(): number {
    return Date.now() + this.skewMs;
  }

  onMessage(listener: (message: ServerMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatus(listener: (status: Status) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Open the connection and identify. Safe to call again to re-identify. */
  start(hello: Hello): void {
    this.hello = hello;
    this.disposed = false;
    this.connect();
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      this.queue.push(message);
    }
  }

  close(): void {
    this.disposed = true;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.close(1000, 'bye');
    this.socket = null;
    this.emitStatus('closed');
  }

  private connect(): void {
    if (this.disposed || !this.hello) return;
    this.emitStatus('connecting');

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.retries = 0;
      socket.send(JSON.stringify(this.hello));
      for (const queued of this.queue.splice(0)) socket.send(JSON.stringify(queued));
      this.emitStatus('open');
    });

    socket.addEventListener('message', (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }

      if (message.t === 'welcome') {
        this.skewMs = message.serverNow - Date.now();
        // Reconnects must resume the same seat, not claim a new one.
        this.hello = { ...this.hello!, token: message.you.token, roomCode: message.room.code };
      }
      for (const listener of this.messageListeners) listener(message);
    });

    socket.addEventListener('close', (event) => {
      this.socket = null;
      this.emitStatus('closed');
      // 4003/4004 mean the server refused us — retrying would just loop.
      if (this.disposed || event.code === 4003 || event.code === 4004) return;
      this.scheduleRetry();
    });

    socket.addEventListener('error', () => socket.close());
  }

  private scheduleRetry(): void {
    const delay = BACKOFF_MS[Math.min(this.retries, BACKOFF_MS.length - 1)];
    this.retries += 1;
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }

  private emitStatus(status: Status): void {
    for (const listener of this.statusListeners) listener(status);
  }
}
