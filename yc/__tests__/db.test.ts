// FILE: yc/__tests__/db.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for yc/db/index.ts YDB query and transaction client.
//   SCOPE: Validate lazy init, successful query/execute calls, transactions with commit/rollback, and query error wrapping.
//   DEPENDS: M-YC-DB
//   LINKS: V-M-YC-DB
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.1 - Mock TypedData.createNativeObjects instead of non-exported convertYdbValueToNative]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { query, execute, transaction, getDriver, clearDriverCache } from '../db/index';

const mockReady = vi.fn().mockResolvedValue(true);
const mockDestroy = vi.fn().mockResolvedValue(undefined);
const mockExecuteQuery = vi.fn();
const mockBeginTransaction = vi.fn().mockResolvedValue({ id: 'tx-123' });
const mockCommitTransaction = vi.fn().mockResolvedValue(undefined);
const mockRollbackTransaction = vi.fn().mockResolvedValue(undefined);

const mockSession = {
  executeQuery: mockExecuteQuery,
  beginTransaction: mockBeginTransaction,
  commitTransaction: mockCommitTransaction,
  rollbackTransaction: mockRollbackTransaction
};

const mockWithSessionRetry = vi.fn((callback) => callback(mockSession));

vi.mock('ydb-sdk', () => {
  return {
    getCredentialsFromEnv: () => ({}),
    AUTO_TX: { auto: true },
    TypedData: {
      createNativeObjects: (resultSet: any) => {
        if (!resultSet || !resultSet.columns || !resultSet.rows) {
          return [];
        }
        const columns = resultSet.columns;
        return resultSet.rows.map((row: any) => {
          const obj: any = {};
          row.items.forEach((value: any, index: number) => {
            const column = columns[index];
            if (column.name && column.type) {
              obj[column.name] = value;
            }
          });
          return obj;
        });
      }
    },
    Driver: class {
      tableClient = {
        withSessionRetry: mockWithSessionRetry
      };
      ready = mockReady;
      destroy = mockDestroy;
    }
  };
});

beforeEach(async () => {
  vi.clearAllMocks();
  await clearDriverCache();
  
  // Set all 14 config fields required by getConfig()
  process.env.VK_APP_ID = '54669660';
  process.env.VK_ID_SALT = 'test_salt';
  process.env.JWT_SECRET = 'test_jwt_secret';
  process.env.VK_OAUTH_REDIRECT_URL = 'http://localhost';
  process.env.VK_SERVICE_TOKEN = 'test_service_token';
  process.env.VK_CLIENT_SECRET = 'test_client_secret';
  process.env.VK_API_VERSION = '5.131';
  process.env.CLIENT_ORIGIN = 'http://localhost';
  process.env.YDB_ENDPOINT = 'ydb_endpoint';
  process.env.YDB_DATABASE = 'ydb_db';
  process.env.S3_ACCESS_KEY_ID = 's3_key';
  process.env.S3_SECRET_ACCESS_KEY = 's3_secret';
  process.env.S3_BUCKET_STATIC = 'static';
  process.env.S3_BUCKET_TEMP = 'temp';
});

describe('M-YC-DB - YDB Query Client', () => {
  it('should successfully establish YDB connection and lazy load the driver', async () => {
    mockReady.mockResolvedValueOnce(true);
    const drv1 = await getDriver();
    const drv2 = await getDriver();
    
    expect(mockReady).toHaveBeenCalledTimes(1);
    expect(drv1).toBe(drv2);
  });

  it('should throw YDB_CONNECTION_ERROR if driver ready check fails', async () => {
    mockReady.mockResolvedValueOnce(false);
    await expect(getDriver()).rejects.toThrow('YDB_CONNECTION_ERROR');
  });

  it('should run query and return parsed results', async () => {
    mockExecuteQuery.mockResolvedValueOnce({
      resultSets: [
        {
          columns: [{ name: 'id', type: 1 }, { name: 'name', type: 2 }],
          rows: [
            { items: ['10', 'Template A'] },
            { items: ['20', 'Template B'] }
          ]
        }
      ]
    });

    const rows = await query('SELECT * FROM templates');
    expect(rows).toEqual([
      { id: '10', name: 'Template A' },
      { id: '20', name: 'Template B' }
    ]);
    expect(mockExecuteQuery).toHaveBeenCalledWith('SELECT * FROM templates', undefined, { auto: true });
  });

  it('should run execute successfully without returning rows', async () => {
    mockExecuteQuery.mockResolvedValueOnce({});
    await execute('INSERT INTO templates (id) VALUES (1)');
    expect(mockExecuteQuery).toHaveBeenCalledWith('INSERT INTO templates (id) VALUES (1)', undefined, { auto: true });
  });

  it('should execute queries within a transaction block and commit on success', async () => {
    mockExecuteQuery.mockResolvedValue({ resultSets: [] });
    
    const result = await transaction(async (tx) => {
      await tx.execute('INSERT INTO templates (id) VALUES (1)');
      await tx.query('SELECT * FROM templates');
      return 'success';
    });

    expect(result).toBe('success');
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1);
    expect(mockCommitTransaction).toHaveBeenCalledWith({ txId: 'tx-123' });
    expect(mockRollbackTransaction).not.toHaveBeenCalled();
    expect(mockExecuteQuery).toHaveBeenCalledWith('INSERT INTO templates (id) VALUES (1)', undefined, { txId: 'tx-123' });
    expect(mockExecuteQuery).toHaveBeenCalledWith('SELECT * FROM templates', undefined, { txId: 'tx-123' });
  });

  it('should rollback transaction if callback throws error', async () => {
    mockExecuteQuery.mockResolvedValue({ resultSets: [] });
    
    await expect(transaction(async (tx) => {
      await tx.execute('INSERT INTO templates (id) VALUES (1)');
      throw new Error('something went wrong');
    })).rejects.toThrow('something went wrong');

    expect(mockBeginTransaction).toHaveBeenCalledTimes(1);
    expect(mockRollbackTransaction).toHaveBeenCalledWith({ txId: 'tx-123' });
    expect(mockCommitTransaction).not.toHaveBeenCalled();
  });

  it('should wrap execution errors in YDB_QUERY_ERROR', async () => {
    mockExecuteQuery.mockRejectedValueOnce(new Error('Syntax error'));
    await expect(query('SELECT *')).rejects.toThrow('YDB_QUERY_ERROR');
  });
});
