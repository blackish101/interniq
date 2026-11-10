import { getDb, migrate, resetDatabase } from './db.js';
import { seed } from '../db/seed.js';

const force = process.argv.includes('--force');

// Opening the cluster before wiping it re-creates the data dir mid-delete and aborts PGlite's initdb.
if (force) {
  await resetDatabase();
  console.log('dropped existing data directory');
}

let db = await getDb();
const existing = await db.query('select count(*)::int as n from pg_tables where tablename=\'app_user\' and schemaname=\'public\'').catch(() => ({ rows: [{ n: 0 }] }));

if (existing.rows[0].n === 0 || force) {
  await migrate(db);
  console.log('schema applied');
  const t0 = Date.now();
  const summary = await seed(db);
  console.log('seeded in', ((Date.now() - t0) / 1000).toFixed(1) + 's', summary);
}

const tables = [
  ['app_user', 'users'], ['student_profile', 'students'], ['employer_profile', 'employers'],
  ['mentor_profile', 'mentors'], ['skill', 'skills'], ['profile_skill', 'profile_skills'],
  ['internship', 'internships'], ['internship_skill', 'requirements'], ['application', 'applications'],
  ['application_event', 'status_events'], ['placement', 'placements'], ['connection', 'connections'],
  ['message', 'messages'], ['notification', 'notifications'], ['eval_case', 'eval_cases'],
];
const summary = {};
for (const [table, key] of tables) {
  const { rows } = await db.query(`select count(*)::int as n from ${table}`);
  summary[key] = rows[0].n;
}
const avg = await db.query('select round(avg(match_score),1) as avg_match from application');
summary.avg_match = Number(avg.rows[0].avg_match);
console.log(summary);
await db.close();
