#!/usr/bin/env node
/**
 * Phase A course-data audit (read-only).
 *
 * Run:
 *   node scripts/audit-course-data.mjs
 *   node scripts/audit-course-data.mjs --out=reports/course-data-audit.ndjson
 *
 * Hand-off (package.json shared/forbidden for this agent):
 *   add "audit:course-data": "node scripts/audit-course-data.mjs"
 *
 * Outputs:
 *   - NDJSON → reports/course-data-audit.ndjson (gitignored)
 *   - Markdown → scripts/course-data-audit-report.md (commit)
 *   - JSON → scripts/course-data-audit-summary.json (commit)
 *
 * Does NOT modify public/golf/catalog.us.json or any course data files.
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
