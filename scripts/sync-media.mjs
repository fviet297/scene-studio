// Pull generated media of chosen projects from another copy of this repo (default: the Mac's
// share). Only the projects you pick are synced. See lib/media-sync.mjs for the copy rules.
//
// Run: node scripts/sync-media.mjs --list
//      node scripts/sync-media.mjs --project gia-long,ngo-quyen [--dry-run] [--source <path>]
//      node scripts/sync-media.mjs                      (picks from a numbered list in a terminal)
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { applyProjectSync, listSourceProjects, planProjectSync, sourceRoot } from './lib/media-sync.mjs';

const MB = 1024 * 1024;
const mb = (bytes) => `${(bytes / MB).toFixed(1)} MB`;

const parseArgs = (argv) => {
  const options = { projects: [], list: false, dryRun: false, source: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list') options.list = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--source') options.source = argv[++i];
    else if (arg === '--project') options.projects.push(...String(argv[++i] ?? '').split(','));
    else if (arg.startsWith('--project=')) options.projects.push(...arg.slice('--project='.length).split(','));
    else throw new Error(`tham số không hợp lệ: ${arg}`);
  }
  return { ...options, projects: options.projects.map((slug) => slug.trim()).filter(Boolean) };
};

const hasLocalMedia = (slug) => existsSync(join('public', 'projects', slug));

const printList = (slugs) => {
  slugs.forEach((slug, index) => {
    console.log(`${String(index + 1).padStart(2)}. ${slug}${hasLocalMedia(slug) ? '' : '  (chưa có ở máy này)'}`);
  });
};

const pickProjects = async (slugs) => {
  if (!process.stdin.isTTY) throw new Error('không ở terminal: truyền --project <slug>[,<slug>] hoặc dùng --list');
  printList(slugs);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Chọn project (số hoặc slug, cách nhau bằng dấu phẩy; "all" = tất cả): ');
  rl.close();
  if (answer.trim() === 'all') return slugs;
  return answer.split(',').map((item) => item.trim()).filter(Boolean)
    .map((item) => slugs[Number(item) - 1] ?? item);
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const root = options.source ?? sourceRoot();
  const slugs = listSourceProjects(root);
  console.log(`Nguồn: ${root}`);
  if (options.list) {
    printList(slugs);
    return;
  }
  const chosen = options.projects.length > 0 ? options.projects : await pickProjects(slugs);
  const unknown = chosen.filter((slug) => !slugs.includes(slug));
  if (unknown.length > 0) throw new Error(`nguồn không có project: ${unknown.join(', ')}`);
  if (chosen.length === 0) throw new Error('chưa chọn project nào');

  for (const slug of [...new Set(chosen)]) {
    const plan = planProjectSync(slug, { root });
    const summary = `${plan.copy.length} file cần chép (${mb(plan.bytes)}), ${plan.upToDate} đã mới nhất, ${plan.localNewer} local mới hơn (giữ nguyên)`;
    if (options.dryRun) {
      console.log(`[dry-run] ${slug}: ${summary}`);
      plan.copy.forEach((file) => console.log(`  ${file.reason === 'missing' ? '+' : '~'} ${file.rel}`));
      continue;
    }
    console.log(`${slug}: ${summary}`);
    applyProjectSync(plan, (file, index) => {
      if ((index + 1) % 20 === 0 || index + 1 === plan.copy.length) console.log(`  ${index + 1}/${plan.copy.length}`);
    });
  }
};

main().catch((error) => {
  console.error(`Lỗi: ${error.message}`);
  process.exit(1);
});
