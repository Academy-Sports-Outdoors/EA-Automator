#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertSupportedEnvironments, PAGE_TYPE, RICH_TEXT_TYPE } from './lib/config.js';
import { ContentstackClient, editUrl } from './lib/contentstack.js';
import { docIdFromInput, getGoogleDoc } from './lib/google-docs.js';
import { previewDocument } from './lib/html-article.js';
import { applyImport, changeReport, planImport, previewPayload, previewPlan } from './lib/importer.js';
import { parseArticleDoc } from './lib/parse-article-doc.js';

function usage() {
  return `Usage:
  node scripts/import.js --doc <Google Doc ID or URL>
  node scripts/import.js --doc <Google Doc ID or URL> --apply
  node scripts/import.js --doc <Google Doc ID or URL> --apply --publish --environment <name[,name...]>
  node scripts/import.js --doc-json <Docs API JSON file>

The Doc supplies the article URL, asset folder, article type, category, and SEO fields.
Preview Only is the default. --apply saves a Contentstack draft. --publish also requires --apply and --environment.`;
}

function argsFrom(argv) {
  const args = { dryRun: true, out: 'out', environments: [] };
  const values = new Set(['--doc', '--doc-json', '--out', '--environment']);
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (values.has(arg)) {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`${arg} requires a value.`);
      const value = argv[++index];
      if (arg === '--environment') args.environments.push(...value.split(',').map(item => item.trim()).filter(Boolean));
      else args[{ '--doc': 'doc', '--doc-json': 'docJson', '--out': 'out' }[arg]] = value;
    } else if (arg === '--apply') args.dryRun = false;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--publish') args.publish = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.help) return args;
  if (Boolean(args.doc) === Boolean(args.docJson)) throw new Error('Provide exactly one of --doc or --doc-json.');
  if (args.publish && args.dryRun) throw new Error('--publish requires --apply.');
  if (args.publish && !args.environments.length) throw new Error('--publish requires --environment.');
  if (args.docJson && !args.dryRun) throw new Error('--doc-json is for dry-run previews only.');
  return args;
}

async function writeSummary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

function summaryLines({ args, plan, environments, result }) {
  const mode = args.dryRun ? 'Preview Only (no Contentstack writes)' : args.publish ? `Publish to ${environments.map(item => item.name).join(', ')}` : 'Save Draft';
  const lines = ['### Expert Advice import', `- Mode: ${mode}`];
  if (!plan) return lines;
  lines.push(`- Article: ${plan.parsed.title}`, `- URL: ${plan.parsed.url}`, `- Action: ${plan.summary.action}`);
  const pageUid = result?.page.uid || plan.summary.pageUid;
  const richTextUid = result?.richText.uid || plan.summary.richTextUid;
  if (pageUid) lines.push(`- Page: [Open in Contentstack](${editUrl(PAGE_TYPE, pageUid)})`);
  if (richTextUid) lines.push(`- Article rich text: [Open in Contentstack](${editUrl(RICH_TEXT_TYPE, richTextUid)})`);
  lines.push(`- Assets matched: ${plan.assetReport.matched.length}`, `- Assets missing: ${plan.assetReport.missing.length}`);
  if (plan.assetReport.missing.length) lines.push(`- Missing slots: ${plan.assetReport.missing.map(slot => slot.slot).join(', ')}`);
  return lines;
}

async function main() {
  const args = argsFrom(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const source = args.docJson
    ? { doc: JSON.parse(await readFile(resolve(args.docJson), 'utf8')), id: 'local-fixture' }
    : await getGoogleDoc(args.doc);
  if (args.doc) docIdFromInput(args.doc);
  const parsed = parseArticleDoc(source.doc);
  const hasCredentials = Boolean(process.env.CS_API_KEY && process.env.CS_AUTHTOKEN);
  if (!args.dryRun && !hasCredentials) throw new Error('CS_API_KEY and CS_AUTHTOKEN are required to save a draft.');
  const client = hasCredentials ? new ContentstackClient() : null;
  const plan = client ? await planImport(parsed, client) : previewPlan(parsed);
  let environments = [];
  if (args.publish) environments = assertSupportedEnvironments(await client.validateEnvironments(args.environments));
  const output = resolve(args.out);
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(resolve(output, 'preview.html'), previewDocument({ title: parsed.title, articleHtml: plan.html, unresolved: plan.unresolved })),
    writeFile(resolve(output, 'payload.json'), `${JSON.stringify(previewPayload(plan), null, 2)}\n`),
    writeFile(resolve(output, 'report.json'), `${JSON.stringify(changeReport(plan), null, 2)}\n`)
  ]);
  console.log(`Preview: ${output}/preview.html`);
  console.log(`Payload: ${output}/payload.json`);
  console.log(`Report: ${output}/report.json`);
  console.log(JSON.stringify(plan.summary, null, 2));
  if (args.dryRun) {
    await writeSummary(summaryLines({ args, plan, environments }));
    return;
  }
  const result = await applyImport(plan, client, {
    environments,
    publish: Boolean(args.publish),
    onProgress: message => console.log(message)
  });
  console.log(JSON.stringify({ pageUid: result.page.uid, richTextUid: result.richText.uid, pageVersion: result.page._version, richTextVersion: result.richText._version }, null, 2));
  await writeSummary(summaryLines({ args, plan, environments, result }));
}

main().catch(async error => {
  const lines = ['### Expert Advice import failed', `- ${error.message}`];
  if (error.missing?.length) lines.push(`- Missing metadata: ${error.missing.join(', ')}`);
  await writeSummary(lines);
  console.error(`Import failed: ${error.message}`);
  process.exitCode = 1;
});
