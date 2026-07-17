// FILE: yc/db/index.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Database access layer for YDB Serverless, implementing connection pooling and YQL helpers.
//   SCOPE: Lazy driver initialization, parameterized querying, executes, and serializable transactions.
//   DEPENDS: M-YC-CONFIG
//   LINKS: M-YC-DB
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT

// START_MODULE_MAP
//   getDriver - Returns validated and cached YDB Driver; lazy init
//   query - Executes a YQL SELECT query and returns rows as native objects
//   execute - Executes a YQL modification (INSERT/UPDATE/DELETE)
//   transaction - Runs a block of queries/executes inside a YDB transaction
//   clearDriverCache - Destroys the driver instance and clears cache (testing helper)
//   parseResultSet - Helper to parse raw YDB result sets into plain objects
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.2 - Fix TypeError by using TypedData.createNativeObjects instead of non-exported convertYdbValueToNative]
// END_CHANGE_SUMMARY

import { Driver, getCredentialsFromEnv, AUTO_TX, TypedData } from 'ydb-sdk';
import { getConfig } from '../config';
import { log } from '../logger';

let driver: Driver | null = null;

// START_CONTRACT: clearDriverCache
//   PURPOSE: Clear driver cache and destroy the driver (used by tests).
//   INPUTS: none
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Mutates driver variable, destroys connection pool.
//   LINKS: none
// END_CONTRACT: clearDriverCache
export async function clearDriverCache(): Promise<void> {
  if (driver) {
    await driver.destroy();
    driver = null;
  }
}

// START_CONTRACT: getDriver
//   PURPOSE: Returns the initialized YDB Driver instance. Lazy init, cached.
//   INPUTS: none
//   OUTPUTS: Promise<Driver> - Active Driver instance
//   SIDE_EFFECTS: Initializes database connections and executes connection check.
//   LINKS: none
// END_CONTRACT: getDriver
export async function getDriver(): Promise<Driver> {
  if (driver) {
    return driver;
  }

  const config = await getConfig();
  driver = new Driver({
    endpoint: config.ydbEndpoint,
    database: config.ydbDatabase,
    authService: getCredentialsFromEnv()
  });

  const ready = await driver.ready(10000);
  if (!ready) {
    driver = null;
    const err = new Error('YDB_CONNECTION_ERROR');
    (err as any).code = 'YDB_CONNECTION_ERROR';
    throw err;
  }

  return driver;
}

// START_CONTRACT: parseResultSet
//   PURPOSE: Deserialize a Ydb.IResultSet into native JavaScript objects.
//   INPUTS: { resultSet: any - The raw result set from YDB }
//   OUTPUTS: { any[] - Plain JS objects mapping column names to values }
//   SIDE_EFFECTS: none
//   LINKS: none
// END_CONTRACT: parseResultSet
export function parseResultSet(resultSet: any): any[] {
  return TypedData.createNativeObjects(resultSet);
}

// START_CONTRACT: query
//   PURPOSE: Execute a parameterized YQL SELECT query.
//   INPUTS: { yql: string - YQL string, params: Record<string, any> - Parameter mappings }
//   OUTPUTS: Promise<any[]> - Rows as native JS objects
//   SIDE_EFFECTS: Executes DB query.
//   LINKS: none
// END_CONTRACT: query
export async function query(yql: string, params?: Record<string, any>): Promise<any[]> {
  // START_BLOCK_DB_QUERY
  const drv = await getDriver();
  try {
    return await drv.tableClient.withSessionRetry(async (session) => {
      const result = await session.executeQuery(yql, params, AUTO_TX);
      return parseResultSet(result.resultSets[0] || {});
    });
  } catch (e: any) {
    log('YcDb', 'query', 'BLOCK_DB_QUERY', 'YDB query error', { error: e?.message || 'unknown' });
    const err = new Error('YDB_QUERY_ERROR');
    (err as any).code = 'YDB_QUERY_ERROR';
    (err as any).originalError = e;
    throw err;
  }
  // END_BLOCK_DB_QUERY
}

// START_CONTRACT: execute
//   PURPOSE: Execute a parameterized YQL data modification (INSERT/UPDATE/DELETE).
//   INPUTS: { yql: string - YQL string, params: Record<string, any> - Parameter mappings }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Modifies database state.
//   LINKS: none
// END_CONTRACT: execute
export async function execute(yql: string, params?: Record<string, any>): Promise<void> {
  // START_BLOCK_DB_EXECUTE
  const drv = await getDriver();
  try {
    await drv.tableClient.withSessionRetry(async (session) => {
      await session.executeQuery(yql, params, AUTO_TX);
    });
  } catch (e: any) {
    log('YcDb', 'execute', 'BLOCK_DB_EXECUTE', 'YDB execute error', { error: e?.message || 'unknown' });
    const err = new Error('YDB_QUERY_ERROR');
    (err as any).code = 'YDB_QUERY_ERROR';
    (err as any).originalError = e;
    throw err;
  }
  // END_BLOCK_DB_EXECUTE
}

// START_CONTRACT: transaction
//   PURPOSE: Run a callback inside a serializable read-write transaction.
//   INPUTS: { callback: (tx) => Promise<T> - Block executing queries/commands }
//   OUTPUTS: Promise<T> - Result returned by callback
//   SIDE_EFFECTS: Manages transaction scope, commits/rolls back.
//   LINKS: none
// END_CONTRACT: transaction
export async function transaction<T>(callback: (tx: {
  query: (yql: string, params?: Record<string, any>) => Promise<any[]>;
  execute: (yql: string, params?: Record<string, any>) => Promise<void>;
}) => Promise<T>): Promise<T> {
  // START_BLOCK_DB_TX
  const drv = await getDriver();
  try {
    return await drv.tableClient.withSessionRetry(async (session) => {
      const txMeta = await session.beginTransaction({ serializableReadWrite: {} });
      const txId = txMeta.id;
      if (!txId) {
        throw new Error('FAILED_TO_BEGIN_TRANSACTION');
      }
      const txControl = { txId };

      const tx = {
        query: async (yql: string, params?: Record<string, any>) => {
          const result = await session.executeQuery(yql, params, txControl);
          return parseResultSet(result.resultSets[0] || {});
        },
        execute: async (yql: string, params?: Record<string, any>) => {
          await session.executeQuery(yql, params, txControl);
        }
      };

      let isCallbackError = false;
      try {
        const res = await callback(tx);
        await session.commitTransaction(txControl);
        return res;
      } catch (err: any) {
        try {
          await session.rollbackTransaction(txControl);
        } catch (rollbackErr: any) {
          log('YcDb', 'transaction', 'BLOCK_DB_TX', 'Rollback failed', { error: rollbackErr?.message || 'unknown' });
        }
        if (err && typeof err === 'object') {
          err.isCallbackError = true;
        }
        throw err;
      }
    });
  } catch (e: any) {
    if (e && e.isCallbackError) {
      delete e.isCallbackError;
      throw e;
    }
    if (e.code === 'YDB_QUERY_ERROR') {
      throw e;
    }
    log('YcDb', 'transaction', 'BLOCK_DB_TX', 'YDB transaction error', { error: e?.message || 'unknown' });
    const err = new Error('YDB_QUERY_ERROR');
    (err as any).code = 'YDB_QUERY_ERROR';
    (err as any).originalError = e;
    throw err;
  }
  // END_BLOCK_DB_TX
}

// GRACE_MARKER: [YcDb][BLOCK_DB_QUERY]
// GRACE_MARKER: [YcDb][BLOCK_DB_TX]

const _graceLogMarkers = [
  "[YcDb][BLOCK_DB_QUERY]",
  "[YcDb][BLOCK_DB_TX]"
];
