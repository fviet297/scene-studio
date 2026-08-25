import { mkdirSync, writeFileSync } from 'node:fs';
import { readDataset } from './lib/history-dataset.mjs';

const input = process.argv[2] ?? 'data/Vietnam-History-200K-Vi';
const output = process.argv[3] ?? 'data/vietnam-history/history.jsonl';
const rows = readDataset(input);
mkdirSync(output.slice(0, output.lastIndexOf('/')), { recursive: true });
writeFileSync(output, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
console.log(`Imported ${rows.length} records -> ${output}`);
