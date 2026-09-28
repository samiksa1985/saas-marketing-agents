import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMigrationSql } from './migration-sql.js';

test('normalizes exactly one leading UTF-8 BOM from migration SQL', () => {
  assert.equal(normalizeMigrationSql('\uFEFFCREATE TABLE example ();'), 'CREATE TABLE example ();');
});

test('leaves SQL without a leading BOM unchanged', () => {
  const source = 'CREATE TABLE example ();\n';
  assert.equal(normalizeMigrationSql(source), source);
});

test('does not strip a BOM-like character that occurs inside migration SQL', () => {
  const source = "SELECT 'before\uFEFFafter';";
  assert.equal(normalizeMigrationSql(source), source);
});
