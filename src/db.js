/**
 * Persistent document storage backed by a local SQLite database.
 *
 * The application uses a small collection-style surface internally.
 * Keeping that surface here lets the storage engine remain an implementation
 * detail while SQLite provides durable, transactional, zero-service storage.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import config from './config.js';

let sqlite = null;
let db = null;
let databasePath = null;

const uniqueIndexes = new Map();
const ttlIndexes = new Map();

const DATE_MARKER = '__otrust_date';
const BUFFER_MARKER = '__otrust_buffer';
const FIELD_PATTERN = /^[A-Za-z0-9_]+$/;
const LEGACY_MONGO_ENV = ['MONGODB_URL', 'MONGODB_URI', 'MONGO_URL'];

function encodeValue(value) {
  if (value instanceof Date) {
    return { [DATE_MARKER]: value.toISOString() };
  }
  if (Buffer.isBuffer(value)) {
    return { [BUFFER_MARKER]: value.toString('base64') };
  }
  if (Array.isArray(value)) {
    return value.map(encodeValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, encodeValue(item)])
    );
  }
  return value;
}

function decodeValue(value) {
  if (Array.isArray(value)) {
    return value.map(decodeValue);
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 1 && typeof value[DATE_MARKER] === 'string') {
      return new Date(value[DATE_MARKER]);
    }
    if (keys.length === 1 && typeof value[BUFFER_MARKER] === 'string') {
      return Buffer.from(value[BUFFER_MARKER], 'base64');
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, decodeValue(item)])
    );
  }
  return value;
}

function serializeDocument(document) {
  return JSON.stringify(encodeValue(document));
}

function deserializeDocument(body) {
  return decodeValue(JSON.parse(body));
}

function cloneValue(value) {
  return decodeValue(encodeValue(value));
}

function getPathValues(value, pathSegments) {
  if (pathSegments.length === 0) return [value];
  if (Array.isArray(value)) {
    return value.flatMap((item) => getPathValues(item, pathSegments));
  }
  if (!value || typeof value !== 'object') return [];

  const [head, ...tail] = pathSegments;
  if (!Object.prototype.hasOwnProperty.call(value, head)) return [];
  return getPathValues(value[head], tail);
}

function valuesAtPath(document, field) {
  return getPathValues(document, String(field).split('.'));
}

function comparable(value) {
  if (value instanceof Date) return value.getTime();
  return value;
}

function valuesEqual(left, right) {
  if (left instanceof Date || right instanceof Date) {
    const leftTime = left instanceof Date ? left.getTime() : new Date(left).getTime();
    const rightTime = right instanceof Date ? right.getTime() : new Date(right).getTime();
    return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
  }
  if (Buffer.isBuffer(left) || Buffer.isBuffer(right)) {
    return Buffer.isBuffer(left) && Buffer.isBuffer(right) && left.equals(right);
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    return serializeDocument(left) === serializeDocument(right);
  }
  return left === right;
}

function anyValue(values, predicate) {
  return values.some((value) => {
    if (Array.isArray(value)) return value.some(predicate);
    return predicate(value);
  });
}

function matchesCondition(values, expected) {
  if (expected instanceof RegExp) {
    return anyValue(values, (value) => {
      expected.lastIndex = 0;
      return typeof value === 'string' && expected.test(value);
    });
  }

  if (expected && typeof expected === 'object' && !(expected instanceof Date) && !Buffer.isBuffer(expected)) {
    const operators = Object.keys(expected).filter((key) => key.startsWith('$'));
    if (operators.length === 0) {
      return anyValue(values, (value) => valuesEqual(value, expected));
    }

    return operators.every((operator) => {
      const operand = expected[operator];
      switch (operator) {
        case '$exists':
          return (values.length > 0) === Boolean(operand);
        case '$in':
          return Array.isArray(operand) && anyValue(values, (value) => operand.some((item) => valuesEqual(value, item)));
        case '$ne':
          return !anyValue(values, (value) => valuesEqual(value, operand));
        case '$lt':
          return anyValue(values, (value) => comparable(value) < comparable(operand));
        case '$lte':
          return anyValue(values, (value) => comparable(value) <= comparable(operand));
        case '$gt':
          return anyValue(values, (value) => comparable(value) > comparable(operand));
        case '$gte':
          return anyValue(values, (value) => comparable(value) >= comparable(operand));
        case '$regex': {
          const expression = operand instanceof RegExp
            ? operand
            : new RegExp(String(operand), expected.$options || '');
          return anyValue(values, (value) => {
            expression.lastIndex = 0;
            return typeof value === 'string' && expression.test(value);
          });
        }
        case '$options':
          return '$regex' in expected;
        case '$type':
          return anyValue(values, (value) => {
            if (operand === 'string') return typeof value === 'string';
            if (operand === 'number') return typeof value === 'number';
            if (operand === 'bool' || operand === 'boolean') return typeof value === 'boolean';
            if (operand === 'date') return value instanceof Date;
            return false;
          });
        default:
          return false;
      }
    });
  }

  return anyValue(values, (value) => valuesEqual(value, expected));
}

function matchesQuery(document, query = {}) {
  return Object.entries(query).every(([field, expected]) => {
    if (field === '$or') {
      return Array.isArray(expected) && expected.some((part) => matchesQuery(document, part));
    }
    if (field === '$and') {
      return Array.isArray(expected) && expected.every((part) => matchesQuery(document, part));
    }
    return matchesCondition(valuesAtPath(document, field), expected);
  });
}

function sqliteString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonPath(field, marker = null) {
  if (!FIELD_PATTERN.test(field)) return null;
  return marker ? `$.\"${field}\".\"${marker}\"` : `$.\"${field}\"`;
}

function valueExpression(field) {
  const basePath = jsonPath(field);
  const datePath = jsonPath(field, DATE_MARKER);
  if (!basePath || !datePath) return null;
  return `COALESCE(json_extract(body, ${sqliteString(datePath)}), json_extract(body, ${sqliteString(basePath)}))`;
}

function sqliteParameter(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === undefined) return null;
  return value;
}

function compileQuery(query = {}) {
  const params = [];

  function compileObject(current) {
    const clauses = [];
    for (const [field, expected] of Object.entries(current)) {
      if (field === '$or' || field === '$and') {
        if (!Array.isArray(expected) || expected.length === 0) return null;
        const parts = expected.map(compileObject);
        if (parts.some((part) => !part)) return null;
        clauses.push(`(${parts.join(field === '$or' ? ' OR ' : ' AND ')})`);
        continue;
      }

      if (!FIELD_PATTERN.test(field) || expected instanceof RegExp || Buffer.isBuffer(expected)) return null;
      const expression = valueExpression(field);
      const basePath = jsonPath(field);
      if (!expression || !basePath) return null;

      if (expected instanceof Date) {
        clauses.push(`${expression} = ?`);
        params.push(expected.toISOString());
        continue;
      }

      if (expected && typeof expected === 'object') {
        const operators = Object.keys(expected);
        if (operators.length === 0 || operators.some((operator) => !operator.startsWith('$'))) return null;

        for (const operator of operators) {
          const operand = expected[operator];
          if (operator === '$exists') {
            clauses.push(`json_type(body, ${sqliteString(basePath)}) IS ${operand ? 'NOT ' : ''}NULL`);
          } else if (operator === '$in') {
            if (!Array.isArray(operand) || operand.length === 0 || operand.some((item) => item && typeof item === 'object' && !(item instanceof Date))) return null;
            clauses.push(`${expression} IN (${operand.map(() => '?').join(', ')})`);
            params.push(...operand.map(sqliteParameter));
          } else if (operator === '$ne') {
            clauses.push(`(json_type(body, ${sqliteString(basePath)}) IS NULL OR ${expression} <> ?)`);
            params.push(sqliteParameter(operand));
          } else if (['$lt', '$lte', '$gt', '$gte'].includes(operator)) {
            const sqlOperator = { $lt: '<', $lte: '<=', $gt: '>', $gte: '>=' }[operator];
            clauses.push(`${expression} ${sqlOperator} ?`);
            params.push(sqliteParameter(operand));
          } else if (operator === '$type' && operand === 'string') {
            clauses.push(`json_type(body, ${sqliteString(basePath)}) = 'text'`);
          } else {
            return null;
          }
        }
        continue;
      }

      if (expected === null) {
        clauses.push(`(json_type(body, ${sqliteString(basePath)}) IS NULL OR ${expression} IS NULL)`);
      } else {
        clauses.push(`${expression} = ?`);
        params.push(sqliteParameter(expected));
      }
    }
    return clauses.length > 0 ? clauses.join(' AND ') : '1 = 1';
  }

  const sql = compileObject(query);
  return sql ? { sql, params } : null;
}

function sortDocuments(rows, spec = {}) {
  const fields = Object.entries(spec);
  if (fields.length === 0) return rows;

  return [...rows].sort((left, right) => {
    for (const [field, direction] of fields) {
      const leftValue = comparable(valuesAtPath(left, field)[0]);
      const rightValue = comparable(valuesAtPath(right, field)[0]);
      if (leftValue < rightValue) return Number(direction) < 0 ? 1 : -1;
      if (leftValue > rightValue) return Number(direction) < 0 ? -1 : 1;
    }
    return 0;
  });
}

function selectRows(collectionName, query = {}, sort = {}, limit = null) {
  const compiled = compileQuery(query);
  let rawRows;

  if (compiled) {
    let sql = `SELECT row_id, body FROM documents WHERE collection_name = ? AND (${compiled.sql})`;
    const params = [collectionName, ...compiled.params];
    const sortEntries = Object.entries(sort);
    if (sortEntries.length > 0 && sortEntries.every(([field]) => FIELD_PATTERN.test(field))) {
      sql += ` ORDER BY ${sortEntries.map(([field, direction]) => `${valueExpression(field)} ${Number(direction) < 0 ? 'DESC' : 'ASC'}`).join(', ')}, row_id ASC`;
    }
    if (Number.isInteger(limit) && limit >= 0) {
      sql += ' LIMIT ?';
      params.push(limit);
    }
    rawRows = sqlite.prepare(sql).all(...params);
  } else {
    rawRows = sqlite.prepare('SELECT row_id, body FROM documents WHERE collection_name = ? ORDER BY row_id ASC').all(collectionName);
  }

  let rows = rawRows
    .map((row) => ({ rowId: Number(row.row_id), document: deserializeDocument(row.body) }))
    .filter((row) => matchesQuery(row.document, query));

  if (!compiled || (Object.keys(sort).length > 0 && !Object.keys(sort).every((field) => FIELD_PATTERN.test(field)))) {
    const sorted = sortDocuments(rows.map((row) => row.document), sort);
    const byId = new Map(rows.map((row) => [row.document._id, row]));
    rows = sorted.map((document) => byId.get(document._id));
  }

  if (Number.isInteger(limit) && limit >= 0 && (!compiled || rows.length > limit)) {
    rows = rows.slice(0, limit);
  }
  return rows;
}

function duplicateError(message = 'Duplicate key') {
  const error = new Error(message);
  error.code = 11000;
  return error;
}

function mapSqliteError(error) {
  if (/UNIQUE constraint failed/i.test(error?.message || '')) {
    return duplicateError();
  }
  return error;
}

function indexList(map, collectionName) {
  if (!map.has(collectionName)) map.set(collectionName, []);
  return map.get(collectionName);
}

function enforceUniqueIndexes(collectionName, document, ignoredRowId = null) {
  for (const fields of indexList(uniqueIndexes, collectionName)) {
    const query = Object.fromEntries(fields.map((field) => {
      const values = valuesAtPath(document, field);
      return [field, values.length > 0 ? values[0] : null];
    }));
    const duplicate = selectRows(collectionName, query, {}, 2)
      .some((row) => ignoredRowId === null || row.rowId !== ignoredRowId);
    if (duplicate) throw duplicateError(`Duplicate value for ${collectionName}.${fields.join('+')}`);
  }
}

function transaction(action) {
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    sqlite.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      sqlite.exec('ROLLBACK');
    } catch {
      // The original error is more useful than a rollback error.
    }
    throw mapSqliteError(error);
  }
}

function timestampValue(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function purgeExpired(collectionName) {
  const definitions = indexList(ttlIndexes, collectionName);
  if (definitions.length === 0) return;

  const now = Date.now();
  const expiredIds = [];
  const rows = sqlite.prepare('SELECT row_id, body FROM documents WHERE collection_name = ?').all(collectionName);
  for (const row of rows) {
    const document = deserializeDocument(row.body);
    const expired = definitions.some(({ field, expireAfterSeconds }) => {
      const value = valuesAtPath(document, field)[0];
      const timestamp = timestampValue(value);
      return timestamp !== null && timestamp + expireAfterSeconds * 1000 <= now;
    });
    if (expired) expiredIds.push(Number(row.row_id));
  }

  if (expiredIds.length > 0) {
    const remove = sqlite.prepare('DELETE FROM documents WHERE row_id = ?');
    transaction(() => expiredIds.forEach((rowId) => remove.run(rowId)));
  }
}

function positionalIndex(array, arrayField, query) {
  const conditions = Object.entries(query)
    .filter(([field]) => field.startsWith(`${arrayField}.`))
    .map(([field, expected]) => [field.slice(arrayField.length + 1), expected]);
  if (conditions.length === 0) return -1;
  return array.findIndex((item) => conditions.every(([field, expected]) => matchesCondition(valuesAtPath(item, field), expected)));
}

function setPath(document, field, value, query) {
  const segments = field.split('.');
  let target = document;
  let currentPath = '';

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    currentPath = currentPath ? `${currentPath}.${segment}` : segment;
    const next = segments[index + 1];

    if (next === '$') {
      if (!Array.isArray(target[segment])) return;
      const itemIndex = positionalIndex(target[segment], currentPath, query);
      if (itemIndex < 0) return;
      target = target[segment][itemIndex];
      index += 1;
      continue;
    }

    if (!target[segment] || typeof target[segment] !== 'object') target[segment] = {};
    target = target[segment];
  }
  target[segments.at(-1)] = cloneValue(value);
}

function applyUpdate(document, update, query, inserting = false) {
  const next = cloneValue(document);
  if (inserting && update.$setOnInsert) {
    for (const [field, value] of Object.entries(update.$setOnInsert)) setPath(next, field, value, query);
  }
  if (update.$set) {
    for (const [field, value] of Object.entries(update.$set)) setPath(next, field, value, query);
  }
  if (update.$inc) {
    for (const [field, amount] of Object.entries(update.$inc)) {
      const current = valuesAtPath(next, field)[0];
      setPath(next, field, (Number(current) || 0) + Number(amount), query);
    }
  }
  return next;
}

function upsertBase(query) {
  const document = {};
  for (const [field, expected] of Object.entries(query)) {
    if (field.startsWith('$')) continue;
    if (expected === null || typeof expected !== 'object' || expected instanceof Date) {
      setPath(document, field, expected, query);
    }
  }
  return document;
}

function runAggregation(documents, pipeline) {
  let rows = documents;
  for (const stage of pipeline) {
    if (stage.$match) {
      rows = rows.filter((document) => matchesQuery(document, stage.$match));
    } else if (stage.$sort) {
      rows = sortDocuments(rows, stage.$sort);
    } else if (stage.$limit) {
      rows = rows.slice(0, Math.max(0, Number(stage.$limit) || 0));
    } else if (stage.$group) {
      const groupSpec = stage.$group;
      const groups = new Map();
      for (const document of rows) {
        const groupValue = typeof groupSpec._id === 'string' && groupSpec._id.startsWith('$')
          ? valuesAtPath(document, groupSpec._id.slice(1))[0]
          : groupSpec._id;
        const key = serializeDocument(groupValue);
        if (!groups.has(key)) groups.set(key, { _id: cloneValue(groupValue) });
        const group = groups.get(key);
        for (const [outputField, accumulator] of Object.entries(groupSpec)) {
          if (outputField === '_id') continue;
          if (accumulator.$sum !== undefined) {
            const amount = accumulator.$sum === 1
              ? 1
              : Number(valuesAtPath(document, String(accumulator.$sum).replace(/^\$/, ''))[0]) || 0;
            group[outputField] = (group[outputField] || 0) + amount;
          } else if (accumulator.$max) {
            const candidate = valuesAtPath(document, String(accumulator.$max).replace(/^\$/, ''))[0];
            if (group[outputField] === undefined || comparable(candidate) > comparable(group[outputField])) {
              group[outputField] = cloneValue(candidate);
            }
          }
        }
      }
      rows = [...groups.values()];
    } else {
      throw new Error(`Unsupported aggregation stage: ${Object.keys(stage)[0] || 'unknown'}`);
    }
  }
  return rows;
}

function createCollection(collectionName) {
  return {
    insertOne: async (input) => {
      purgeExpired(collectionName);
      const document = cloneValue(input);
      document._id = document._id || crypto.randomUUID();
      return transaction(() => {
        enforceUniqueIndexes(collectionName, document);
        const now = Date.now();
        sqlite.prepare(`
          INSERT INTO documents (collection_name, document_id, body, created_ms, updated_ms)
          VALUES (?, ?, ?, ?, ?)
        `).run(collectionName, String(document._id), serializeDocument(document), now, now);
        return { acknowledged: true, insertedId: document._id };
      });
    },

    findOne: async (query = {}, options = {}) => {
      purgeExpired(collectionName);
      const row = selectRows(collectionName, query, options.sort || {}, 1)[0];
      return row ? cloneValue(row.document) : null;
    },

    find: (query = {}) => {
      let sort = {};
      let limit = null;
      const cursor = {
        sort: (spec = {}) => {
          sort = spec;
          return cursor;
        },
        limit: (value) => {
          limit = Math.max(0, Number(value) || 0);
          return cursor;
        },
        toArray: async () => {
          purgeExpired(collectionName);
          return selectRows(collectionName, query, sort, limit).map((row) => cloneValue(row.document));
        }
      };
      return cursor;
    },

    updateOne: async (query, update, options = {}) => {
      purgeExpired(collectionName);
      return transaction(() => {
        const found = selectRows(collectionName, query, {}, 1)[0];
        if (!found && !options.upsert) {
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        }

        if (!found) {
          const base = upsertBase(query);
          base._id = base._id || crypto.randomUUID();
          const inserted = applyUpdate(base, update, query, true);
          enforceUniqueIndexes(collectionName, inserted);
          const now = Date.now();
          sqlite.prepare(`
            INSERT INTO documents (collection_name, document_id, body, created_ms, updated_ms)
            VALUES (?, ?, ?, ?, ?)
          `).run(collectionName, String(inserted._id), serializeDocument(inserted), now, now);
          return {
            acknowledged: true,
            matchedCount: 0,
            modifiedCount: 0,
            upsertedCount: 1,
            upsertedId: inserted._id
          };
        }

        const updated = applyUpdate(found.document, update, query, false);
        enforceUniqueIndexes(collectionName, updated, found.rowId);
        sqlite.prepare('UPDATE documents SET document_id = ?, body = ?, updated_ms = ? WHERE row_id = ?')
          .run(String(updated._id), serializeDocument(updated), Date.now(), found.rowId);
        return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
      });
    },

    findOneAndUpdate: async (query, update, options = {}) => {
      purgeExpired(collectionName);
      return transaction(() => {
        const found = selectRows(collectionName, query, {}, 1)[0];
        if (!found) return null;
        const original = cloneValue(found.document);
        const updated = applyUpdate(found.document, update, query, false);
        enforceUniqueIndexes(collectionName, updated, found.rowId);
        sqlite.prepare('UPDATE documents SET document_id = ?, body = ?, updated_ms = ? WHERE row_id = ?')
          .run(String(updated._id), serializeDocument(updated), Date.now(), found.rowId);
        return options.returnDocument === 'before' ? original : cloneValue(updated);
      });
    },

    deleteOne: async (query = {}) => {
      purgeExpired(collectionName);
      return transaction(() => {
        const found = selectRows(collectionName, query, {}, 1)[0];
        if (!found) return { acknowledged: true, deletedCount: 0 };
        sqlite.prepare('DELETE FROM documents WHERE row_id = ?').run(found.rowId);
        return { acknowledged: true, deletedCount: 1 };
      });
    },

    deleteMany: async (query = {}) => {
      purgeExpired(collectionName);
      return transaction(() => {
        const rows = selectRows(collectionName, query);
        const remove = sqlite.prepare('DELETE FROM documents WHERE row_id = ?');
        rows.forEach((row) => remove.run(row.rowId));
        return { acknowledged: true, deletedCount: rows.length };
      });
    },

    countDocuments: async (query = {}) => {
      purgeExpired(collectionName);
      return selectRows(collectionName, query).length;
    },

    aggregate: (pipeline = []) => ({
      toArray: async () => {
        purgeExpired(collectionName);
        const documents = selectRows(collectionName).map((row) => row.document);
        return runAggregation(documents, pipeline).map(cloneValue);
      }
    }),

    createIndex: async (spec, options = {}) => {
      const fields = Object.keys(spec || {});
      if (fields.length === 0 || fields.some((field) => !FIELD_PATTERN.test(field))) {
        throw new Error('SQLite indexes require simple field names');
      }

      const suffix = options.unique ? '_unique' : '';
      const indexName = `idx_${collectionName}_${fields.join('_')}${suffix}`.slice(0, 120);
      if (options.unique) {
        const definitions = indexList(uniqueIndexes, collectionName);
        if (!definitions.some((entry) => entry.join('\0') === fields.join('\0'))) definitions.push(fields);
        const expressions = fields.map((field) => valueExpression(field)).join(', ');
        try {
          sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS \"${indexName}\" ON documents (${expressions}) WHERE collection_name = ${sqliteString(collectionName)}`);
        } catch (error) {
          throw mapSqliteError(error);
        }
      }

      if (options.expireAfterSeconds !== undefined) {
        const definitions = indexList(ttlIndexes, collectionName);
        const definition = { field: fields[0], expireAfterSeconds: Number(options.expireAfterSeconds) || 0 };
        const existing = definitions.findIndex((entry) => entry.field === definition.field);
        if (existing >= 0) definitions[existing] = definition;
        else definitions.push(definition);
      }
      return indexName;
    },

    dropIndex: async (name) => {
      if (typeof name === 'string' && /^[A-Za-z0-9_]+$/.test(name)) {
        sqlite.exec(`DROP INDEX IF EXISTS \"${name}\"`);
      }
      return { ok: 1 };
    }
  };
}

function createDatabaseFacade() {
  const collections = new Map();
  return {
    adapter: 'sqlite',
    path: databasePath,
    collection(name) {
      if (typeof name !== 'string' || !/^[A-Za-z0-9_]+$/.test(name)) {
        throw new Error('Invalid collection name');
      }
      if (!collections.has(name)) collections.set(name, createCollection(name));
      return collections.get(name);
    }
  };
}

async function createIndexes(database) {
  const claims = database.collection('claims');
  await claims.createIndex({ hash: 1 });
  await claims.createIndex({ pubkey: 1 });
  await claims.createIndex({ hash: 1, pubkey: 1 }, { unique: true });
  await claims.createIndex({ created_at: 1 });

  const challenges = database.collection('pow_challenges');
  await challenges.createIndex({ challenge: 1 }, { unique: true });
  await challenges.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });

  const notifications = database.collection('email_notifications');
  await notifications.createIndex({ claim_id: 1 }, { unique: true });
  await notifications.createIndex({ created_at: 1 }, { expireAfterSeconds: 604800 });

  const auditLog = database.collection('audit_log');
  await auditLog.createIndex({ event_type: 1 });
  await auditLog.createIndex({ severity: 1 });
  await auditLog.createIndex({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

  const authBranding = database.collection('auth_branding');
  await authBranding.createIndex({ client_id: 1, theme_id: 1 }, { unique: true });
  await authBranding.createIndex({ client_id: 1 });
  await authBranding.createIndex({ updated_at: -1 });

  const timeCommitments = database.collection('time_commitments');
  await timeCommitments.createIndex({ id: 1 }, { unique: true });
  await timeCommitments.createIndex({ reveal_at: 1 });

  const organizations = database.collection('organizations');
  await organizations.createIndex({ id: 1 }, { unique: true });
  await organizations.createIndex({ created_at: -1, id: -1 });

  const apiKeys = database.collection('api_keys');
  await apiKeys.createIndex({ key_hash: 1 }, { unique: true });
  await apiKeys.createIndex({ org_id: 1 });
  await apiKeys.createIndex({ key_id: 1 }, { unique: true });

  const webhookEndpoints = database.collection('webhook_endpoints');
  await webhookEndpoints.createIndex({ endpoint_id: 1 }, { unique: true });
  await webhookEndpoints.createIndex({ org_id: 1 });

  const webhookDeliveries = database.collection('webhook_deliveries');
  await webhookDeliveries.createIndex({ delivery_id: 1 }, { unique: true });
  await webhookDeliveries.createIndex({ org_id: 1, created_at: -1, delivery_id: -1 });
  await webhookDeliveries.createIndex({ status: 1, next_retry_at: 1 });

  const idempotencyKeys = database.collection('idempotency_keys');
  await idempotencyKeys.createIndex({ key: 1 }, { unique: true });
  await idempotencyKeys.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
}

export async function createDb() {
  if (db) return db;

  const configuredPath = process.env.OTRUST_DB_PATH?.trim();
  databasePath = configuredPath || (process.env.NODE_ENV === 'test'
    ? ':memory:'
    : config.database.path || path.join(process.cwd(), 'data', 'otrust.sqlite'));

  if (databasePath !== ':memory:') {
    const resolvedPath = path.resolve(databasePath);
    const railwayRuntime = Boolean(
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RAILWAY_ENVIRONMENT_ID ||
      process.env.RAILWAY_SERVICE_ID
    );
    const legacyMongoConfigured = LEGACY_MONGO_ENV.some((name) => process.env[name]?.trim());
    if (
      process.env.NODE_ENV === 'production' &&
      railwayRuntime &&
      !fs.existsSync(resolvedPath) &&
      process.env.OTRUST_ALLOW_EMPTY_DB !== 'true'
    ) {
      throw new Error(
        legacyMongoConfigured
          ? 'MongoDB migration required: refusing to create an empty SQLite database on Railway'
          : 'Railway storage initialization required: refusing to create an empty SQLite database'
      );
    }
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  sqlite = new DatabaseSync(databasePath);
  sqlite.exec('PRAGMA busy_timeout = 5000');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec('PRAGMA secure_delete = ON');
  if (databasePath !== ':memory:') {
    sqlite.exec('PRAGMA journal_mode = WAL');
    sqlite.exec('PRAGMA synchronous = FULL');
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      row_id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_name TEXT NOT NULL,
      document_id TEXT NOT NULL,
      body TEXT NOT NULL CHECK (json_valid(body)),
      created_ms INTEGER NOT NULL,
      updated_ms INTEGER NOT NULL,
      UNIQUE (collection_name, document_id)
    );
    CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents (collection_name, row_id);
  `);

  uniqueIndexes.clear();
  ttlIndexes.clear();
  db = createDatabaseFacade();
  await createIndexes(db);

  console.log(`[DB] SQLite ready (${databasePath === ':memory:' ? 'memory' : databasePath})`);
  return db;
}

export async function logSecurityEvent(eventType, severity, details = {}) {
  try {
    await getDb().collection('audit_log').insertOne({
      event_type: eventType,
      severity,
      timestamp: new Date(),
      details
    });
  } catch (error) {
    console.error('[AUDIT] Error logging security event:', error.message);
  }
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call createDb() first.');
  return db;
}

export async function closeDb() {
  if (sqlite) {
    try {
      if (databasePath !== ':memory:') {
        sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      }
    } finally {
      sqlite.close();
      sqlite = null;
      console.log('[DB] SQLite connection closed');
    }
  }
  db = null;
  databasePath = null;
  uniqueIndexes.clear();
  ttlIndexes.clear();
}
