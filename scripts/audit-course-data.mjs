#!/usr/bin/env node
/**
 * Phase A course-data audit entrypoint.
 * Runs the TypeScript auditor (reuses catalog/scorecard helpers).
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  process.execPath,
  [
    join(ROOT, 'node_modules/tsx/dist/cli.mjs'),
    join(ROOT, 'src/dev/auditCourseData.ts'),
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', cwd: ROOT },
);

process.exit(result.status ?? 1);
