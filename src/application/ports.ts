import type { MenuItem, TableSession } from "../domain/model.js";

export interface SessionRepository {
  getById(id: string): Promise<TableSession | null>;
  list(): Promise<TableSession[]>;
  save(session: TableSession): Promise<void>;
}

export interface MenuCatalog {
  getById(id: string): Promise<MenuItem | null>;
  list(): Promise<MenuItem[]>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(prefix: string): string;
}
