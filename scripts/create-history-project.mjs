import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const get = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const subject = get('--subject');
const slug = get('--slug', subject?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
if (!subject || !slug) throw new Error('Usage: node scripts/create-history-project.mjs --subject "Le Loi" [--slug le-loi]');
const dir = join('projects', slug);
mkdirSync(dir, { recursive: true });
const scene = (number, title, cue, narration) => `## scene ${number}\n\ntitle: ${title}\ncue: ${cue}\nhost:\nnarration: ${narration}\nchar: char-a\nprompt:\nmotion:\n`;
const plan = `# ${subject}\n\n## characters\n\nchar-a = public/projects/${slug}/characters/${slug}.png\n\n${scene(1, 'Mo dau', `Hook ve ${subject}`, `${subject} la ai, va vi sao cau chuyen cua nhan vat nay van con y nghia hom nay?`)}\n${scene(2, 'Boi canh', 'Thoi dai va hoan canh', `Hay gioi thieu ngan gon boi canh lich su da dinh hinh con duong cua ${subject}.`)}\n${scene(3, 'Buoc ngoat', 'Quyet dinh quan trong', `Mot buoc ngoat da dua ${subject} tro thanh nguoi co anh huong lon.`)}\n${scene(4, 'Di san', 'Dieu con lai', `Di san cua ${subject} duoc nhin nhan nhu the nao trong lich su Viet Nam?`)}\n`;
writeFileSync(join(dir, 'scene-plan.md'), plan);
writeFileSync('projects/active.json', `${JSON.stringify({ active: slug }, null, 2)}\n`);
try { execFileSync('node', ['scripts/parse-scene-plan.mjs', join(dir, 'scene-plan.md')], { stdio: 'inherit' }); } catch { console.error('Project created; parse after adding character profile.'); }
console.log(`Created project: ${dir}`);
