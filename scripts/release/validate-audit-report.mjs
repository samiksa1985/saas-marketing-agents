import { readFile } from 'node:fs/promises';

const file = process.argv[2];
if (!file) throw new Error('Pass the saved npm audit JSON report');
const report = JSON.parse(await readFile(file, 'utf8'));
const counts = report.metadata?.vulnerabilities;
if (
  !counts ||
  !['info', 'low', 'moderate', 'high', 'critical'].every((key) => Number.isInteger(counts[key]))
) {
  throw new Error('npm audit did not return a valid vulnerability summary');
}
process.stdout.write(
  `Dependency audit recorded: critical=${counts.critical}, high=${counts.high}, moderate=${counts.moderate}, low=${counts.low}, info=${counts.info}\n`,
);
