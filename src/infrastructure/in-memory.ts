import { randomUUID } from "node:crypto";
import type { Clock, IdGenerator, MenuCatalog, SessionRepository } from "../application/ports.js";
import type { MenuItem, TableSession } from "../domain/model.js";

export class InMemorySessionRepository implements SessionRepository {
  private readonly data = new Map<string, TableSession>();

  async getById(id: string): Promise<TableSession | null> {
    const session = this.data.get(id);
    return session ? structuredClone(session) : null;
  }

  async list(): Promise<TableSession[]> {
    return [...this.data.values()].map((session) => structuredClone(session));
  }

  async save(session: TableSession): Promise<void> {
    this.data.set(session.id, structuredClone(session));
  }
}

export class InMemoryMenuCatalog implements MenuCatalog {
  constructor(private readonly items: MenuItem[]) {}

  async getById(id: string): Promise<MenuItem | null> {
    const item = this.items.find((candidate) => candidate.id === id);
    return item ? structuredClone(item) : null;
  }

  async list(): Promise<MenuItem[]> {
    return structuredClone(this.items);
  }
}

export const systemClock: Clock = { now: () => new Date() };
export const uuidGenerator: IdGenerator = { next: (prefix) => `${prefix}_${randomUUID()}` };
