import { existsSync, readFileSync } from 'node:fs';

const query = process.argv.slice(2).join(' ').trim();
const file = process.env.HISTORY_INDEX ?? 'data/vietnam-history/history.jsonl';
if (!query) throw new Error('Usage: node scripts/search-history.mjs <topic>');
if (!existsSync(file)) throw new Error(`Index not found: ${file}. Run import-history-dataset.mjs first.`);
const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 1);
const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const results = rows.map((row) => ({ ...row, score: terms.reduce((total, term) => total + (row.content.toLowerCase().split(term).length - 1), 0) }))
  .filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
console.log(JSON.stringify(results, null, 2));
