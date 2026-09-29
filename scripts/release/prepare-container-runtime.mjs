import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const component = process.argv[2];
if (!['api', 'worker'].includes(component)) {
  throw new Error('Expected runtime component api or worker');
}

const root = process.cwd();
const appRoot = join(root, 'apps');
for (const app of await readdir(appRoot, { withFileTypes: true })) {
  if (!app.isDirectory()) continue;
  const appPath = join(appRoot, app.name);
  if (app.name !== component) {
    await rm(appPath, { recursive: true, force: true });
    continue;
  }
  for (const entry of await readdir(appPath, { withFileTypes: true })) {
    if (!['package.json', 'dist'].includes(entry.name)) {
      await rm(join(appPath, entry.name), { recursive: true, force: true });
    }
  }
}

const packagesRoot = join(root, 'packages');
for (const workspace of await readdir(packagesRoot, { withFileTypes: true })) {
  if (!workspace.isDirectory()) continue;
  const workspacePath = join(packagesRoot, workspace.name);
  for (const entry of await readdir(workspacePath, { withFileTypes: true })) {
    const required =
      entry.name === 'package.json' ||
      entry.name === 'dist' ||
      (workspace.name === 'db' && entry.name === 'drizzle');
    if (!required) {
      await rm(join(workspacePath, entry.name), { recursive: true, force: true });
    }
  }
}

await rm(join(root, 'scripts'), { recursive: true, force: true });
