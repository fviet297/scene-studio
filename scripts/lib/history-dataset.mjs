import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const flattenMessages = (messages) => (Array.isArray(messages) ? messages : [])
  .filter((message) => message && typeof message.content === 'string')
  .map((message) => `${message.role ?? 'message'}: ${message.content.trim()}`).join('\n');

export const normalizeRow = (row, id) => {
  if (typeof row === 'string') return { id, question: '', answer: row, content: row };
  const messages = flattenMessages(row?.messages);
  const question = row?.question ?? row?.prompt ?? row?.input ?? '';
  const answer = row?.answer ?? row?.response ?? row?.output ?? row?.completion ?? '';
  return { id, question: String(question), answer: String(answer), content: String(messages || [question, answer].filter(Boolean).join('\n')) };
};

const readJsonFile = (file) => {
  const value = JSON.parse(readFileSync(file, 'utf8'));
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.train)) return value.train;
  return [value];
};

export const readDataset = (dir) => {
  if (!existsSync(dir)) throw new Error(`Dataset directory not found: ${dir}`);
  const files = readdirSync(dir).filter((file) => /\.(json|jsonl)$/i.test(file));
  if (!files.length) throw new Error(`No JSON/JSONL files found in ${dir}`);
  const rows = [];
  for (const file of files) {
    const path = join(dir, file);
    if (file.endsWith('.jsonl')) readFileSync(path, 'utf8').split('\n').filter(Boolean).forEach((line) => rows.push(JSON.parse(line)));
    else rows.push(...readJsonFile(path));
  }
  return rows.map((row, index) => normalizeRow(row, `${files[0]}:${index + 1}`)).filter((row) => row.content.trim());
};
