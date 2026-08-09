/**
 * Room registry: creation, lookup and collection.
 */

import { defaultSettings, type GameSettings } from '@lexo/core';
import { config } from './config.js';
import { makeRoomCode, Room } from './room.js';

export class RoomManager {
  private rooms = new Map<string, Room>();
  private sweeper: NodeJS.Timeout | null = null;

  get size(): number {
    return this.rooms.size;
  }

  create(settings: GameSettings = defaultSettings('es', 'classic')): Room | null {
    if (this.rooms.size >= config.maxRooms) return null;

    let code = makeRoomCode();
    for (let attempt = 0; this.rooms.has(code) && attempt < 20; attempt++) {
      code = makeRoomCode();
    }
    if (this.rooms.has(code)) return null;

    const room = new Room(code, settings);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase().trim());
  }

  /**
   * Drop rooms nobody has been connected to for a while, and expired
   * seats inside the rooms that remain.
   */
  sweep(now = Date.now()): void {
    for (const [code, room] of this.rooms) {
      room.prune(now);
      if (room.isEmpty && room.emptySince && now - room.emptySince > config.emptyRoomTtlMs) {
        room.dispose();
        this.rooms.delete(code);
      }
    }
  }

  startSweeper(intervalMs = 30_000): void {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => this.sweep(), intervalMs);
    this.sweeper.unref?.();
  }

  stop(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }
}
