import type { SqlDb } from '../../identity/store';

/** expo-sqlite's async API over Node's built-in SQLite, in memory: the real SQL runs in tests. */
export function memoryDb(): SqlDb {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  return {
    execAsync: async (sql) => void db.exec(sql),
    runAsync: async (sql, params) => {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getAllAsync: async (sql, params) => db.prepare(sql).all(...params),
  };
}
