import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  executePhase1Migration,
  Phase1MigrationExecutionError,
} from './phase1-migration-diagnostics.js';

function descriptor(source: string) {
  const directory = mkdtempSync(join(tmpdir(), 'phase1-migration-'));
  const absolutePath = join(directory, '0021_diagnostics_fixture.sql');
  writeFileSync(absolutePath, source, 'utf8');
  return {
    entry: { idx: 21, tag: '0021_diagnostics_fixture' },
    absolutePath,
    relativePath: 'packages/db/drizzle/0021_diagnostics_fixture.sql',
  };
}

test('migration failure preserves migration number, file, error metadata, and bounded SQL context', async () => {
  const markers: string[] = [];
  const source = `CREATE TABLE phase1_fixture (\n  id uuid,\n  CONSTRAINT broken\n);\n${'x'.repeat(900)}`;
  await assert.rejects(
    () => executePhase1Migration(
      {
        async unsafe() {
          throw {
            code: '42601',
            message: 'syntax error at or near "constraint"',
            position: String(source.indexOf('CONSTRAINT') + 1),
            routine: 'scanner_yyerror',
          };
        },
      },
      descriptor(source),
      (marker) => markers.push(marker),
    ),
    (error: unknown) => {
      assert.ok(error instanceof Phase1MigrationExecutionError);
      assert.equal(error.evidence.phase, 'migration');
      assert.equal(error.evidence.migration, '0021');
      assert.equal(error.evidence.order, 21);
      assert.equal(error.evidence.file, '0021_diagnostics_fixture.sql');
      assert.equal(error.evidence.path, 'packages/db/drizzle/0021_diagnostics_fixture.sql');
      assert.equal(error.evidence.postgresCode, '42601');
      assert.equal(error.evidence.position, String(source.indexOf('CONSTRAINT') + 1));
      assert.equal(error.evidence.routine, 'scanner_yyerror');
      assert.match(error.evidence.sqlContext, /CONSTRAINT broken/);
      assert.ok(error.evidence.sqlContext.length <= 482);
      return true;
    },
  );
  assert.deepEqual(markers, ['PHASE1_MIGRATION_START=0021_diagnostics_fixture.sql']);
});

test('successful migration emits ordered start and pass markers; a NOTICE does not fail it', async () => {
  const markers: string[] = [];
  await executePhase1Migration(
    { async unsafe() { return { code: '00000', severity: 'NOTICE' }; } },
    descriptor('DROP POLICY IF EXISTS old_policy ON phase1_fixture;'),
    (marker) => markers.push(marker),
  );
  assert.deepEqual(markers, [
    'PHASE1_MIGRATION_START=0021_diagnostics_fixture.sql',
    'PHASE1_MIGRATION_PASS=0021_diagnostics_fixture.sql',
  ]);
});
