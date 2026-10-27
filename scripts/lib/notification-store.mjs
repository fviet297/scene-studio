// Panel notification history, kept per project in a JSON file under tmp/ (see projectPaths) so it
// outlives a page reload. Newest first, capped at NOTIFICATION_LIMIT. The panel generates each
// id, so a retried POST never stores the same notification twice.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const NOTIFICATION_LIMIT = 50;
const MAX_TITLE = 120;
const MAX_MESSAGE = 2000;
const MAX_ACTION_LABEL = 80;
const MAX_ACTION_SCENES = 500;

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

const sanitizeAction = (action) => {
  if (!action || typeof action.label !== 'string' || !Array.isArray(action.scenes)) return undefined;
  const scenes = action.scenes.filter(Number.isInteger).slice(0, MAX_ACTION_SCENES);
  return { label: text(action.label, MAX_ACTION_LABEL), scenes };
};

// The stored shape of one notification, or null when the input is not one.
export const sanitizeNotification = (input) => {
  const id = text(input?.id, 64);
  const message = text(input?.message, MAX_MESSAGE);
  if (!id || !message) return null;
  const at = Number.isNaN(Date.parse(input.at)) ? new Date().toISOString() : input.at;
  const clean = { id, at, ok: input.ok !== false, message };
  const title = text(input.title, MAX_TITLE);
  if (title) clean.title = title;
  const action = sanitizeAction(input.action);
  if (action) clean.action = action;
  return clean;
};

export const readNotifications = (file) => {
  try {
    const list = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
};

const writeNotifications = (file, list) => {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(list, null, 2)}\n`);
  renameSync(tmp, file);
};

// Adds `notification` at the front unless its id is already stored; returns the stored list.
export const appendNotification = (file, notification) => {
  const list = readNotifications(file);
  if (list.some((n) => n.id === notification.id)) return list;
  const next = [notification, ...list].slice(0, NOTIFICATION_LIMIT);
  writeNotifications(file, next);
  return next;
};

export const clearNotifications = (file) => writeNotifications(file, []);
