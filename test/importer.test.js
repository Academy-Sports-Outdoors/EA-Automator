import test from 'node:test';
import assert from 'node:assert/strict';
import { PENDING_ARTICLE_UID, SHARED_RICH_TEXT } from '../scripts/lib/config.js';
import { applyImport, planImport } from '../scripts/lib/importer.js';
import { parseArticleDoc } from '../scripts/lib/parse-article-doc.js';
import { articleDoc, paragraph, sampleDoc } from './helpers/doc.js';

const articleType = { uid: 'bltguide', title: 'Buying Guide' };
const category = { uid: 'bltball', title: 'Basketball' };
const desktop = { uid: 'd1', filename: 'Hoop_image_1-desktop.png', url: 'https://images.example/d.png', content_type: 'image/png', _version: 1, publish_details: [] };
const mobile = { uid: 'm1', filename: 'Hoop_image_1-mobile.png', url: 'https://images.example/m.png', content_type: 'image/png', _version: 1, publish_details: [] };
const named = { uid: 'd2', filename: 'Hoop_image_2-desktop.png', url: 'https://images.example/d2.png', content_type: 'image/png', _version: 1, publish_details: [] };
const thumbnail = { uid: 't1', filename: 'Hoop_thumbnail.png', url: 'https://images.example/t.png', content_type: 'image/png', _version: 1, publish_details: [{ environment: 'bltdev' }] };
const unused = { uid: 'u1', filename: 'unused.png', url: 'https://images.example/u.png', content_type: 'image/png', _version: 1, publish_details: [] };

function titleMatches(entry, query) {
  if (typeof query.title === 'string') return entry.title === query.title;
  if (query.title?.$regex) return new RegExp(query.title.$regex, query.title.$options).test(entry.title);
  return false;
}

function fakeClient({ pages = [], assets = [desktop, mobile, named, thumbnail, unused], entries = [] } = {}) {
  const store = new Map(entries.map(entry => [entry.uid, entry]));
  for (const page of pages) store.set(page.uid, page);
  const calls = [];
  let bumpPage = false;
  return {
    calls,
    bump() { bumpPage = true; },
    async findEntries(type, query) {
      calls.push({ method: 'find', type, query });
      if (type === 'ea_content_type') return titleMatches(articleType, query) ? [articleType] : [];
      if (type === 'ea_category_l1') return titleMatches(category, query) ? [category] : [];
      if (type === 'ea_category_l2' || type === 'ea_category_l3') return [];
      if (type === 'expertAdvicePage' && query.url) return pages.filter(page => page.url === query.url);
      if (type === 'expertAdvicePage') return pages.filter(page => titleMatches(page, query));
      if (type === 'richText') return [...store.values()].filter(entry => entry.rich_text && titleMatches(entry, query));
      return [];
    },
    async getEntry(type, uid) {
      calls.push({ method: 'get', type, uid });
      const entry = store.get(uid);
      if (!entry) throw new Error(`missing ${uid}`);
      return bumpPage && uid === 'bltpage' ? { ...entry, _version: 99 } : structuredClone(entry);
    },
    async listFolderAssets(folderUid) {
      calls.push({ method: 'assets', folderUid });
      return assets;
    },
    async createEntry(type, entry) {
      calls.push({ method: 'create', type, entry });
      const created = { ...structuredClone(entry), uid: type === 'richText' ? 'bltnewrtf' : 'bltnewpage', _version: 1 };
      store.set(created.uid, created);
      return created;
    },
    async updateEntry(type, uid, entry) {
      calls.push({ method: 'update', type, uid, entry });
      const updated = { ...structuredClone(entry), uid, _version: (store.get(uid)?._version || 1) + 1 };
      store.set(uid, updated);
      return updated;
    },
    async publishEntry(type, uid, version, environments) {
      calls.push({ method: 'publishEntry', type, uid, version, environments });
      return { notice: 'ok' };
    },
    async publishAsset(uid, version, environments) {
      calls.push({ method: 'publishAsset', uid, version, environments });
      return { notice: 'ok' };
    },
    async waitForEntryPublication(type, uid, version, environment) {
      calls.push({ method: 'waitEntry', type, uid, version, environment });
    },
    async waitForAssetPublication(uid, version, environment) {
      calls.push({ method: 'waitAsset', uid, version, environment });
    }
  };
}

function existingPage() {
  return {
    uid: 'bltpage',
    _version: 4,
    title: 'How to Choose a Basketball Hoop',
    url: '/expert-advice/basketball/how-to-choose-a-basketball-hoop',
    page: 'Old page name',
    page_type: 'content',
    header_components: [{ uid: 'custom-header', _content_type_uid: 'header210' }],
    footer_components: [{ uid: 'custom-footer', _content_type_uid: 'footer210' }],
    main_components: [
      { uid: 'bltarticle', _content_type_uid: 'richText' },
      { uid: SHARED_RICH_TEXT.scripts, _content_type_uid: 'richText' }
    ],
    article_details: {
      article_author: 'Kelsy Kim',
      article_author_url: 'https://www.academy.com/expert-advice/board-of-experts#Kelsy Kim',
      article_title: 'Old title',
      enabled: false,
      view_count_enabled: false,
      keywords: ['keep'],
      content_card_information: { card_description: 'old', card_thumbnail_image: { uid: 'oldthumb' } }
    },
    seo_configuration: { title: 'old', description: 'old', keywords: 'old', url: '/expert-advice/basketball/how-to-choose-a-basketball-hoop' },
    page_configuration: { page_title: 'old', analytics_title: 'old', gtm_id: 'GTM-PRVTBFC', page_type: 'generic' },
    featured: false,
    do_not_update_publish_date: true,
    tags: ['keep-me']
  };
}

test('plans a new page and keeps an existing page author, header, and publish-date flag', async () => {
  const parsed = parseArticleDoc(sampleDoc());
  const created = await planImport(parsed, fakeClient());
  assert.equal(created.summary.action, 'create');
  assert.equal(created.proposedPage.main_components[2].uid, PENDING_ARTICLE_UID);
  assert.equal(created.proposedPage.article_details.article_types[0].uid, 'bltguide');
  assert.equal(created.proposedPage.article_details.associated_categories[0].uid, 'bltball');
  assert.equal(created.proposedPage.article_details.content_card_information.card_thumbnail_image, 't1');
  assert.equal(created.proposedPage.header_components[0].uid, 'blt5d9a3931d3da4c6e');
  assert.equal(created.assetReport.matched.length, 2);
  assert.deepEqual(created.assetReport.unused, ['unused.png']);
  assert.match(created.html, /https:\/\/images\.example\/d2\.png/);

  const withoutAuthor = articleDoc({ blocks: sampleDoc().body.content.filter(block => !block.paragraph?.elements?.[0]?.textRun?.content?.startsWith('Author')) });
  const update = await planImport(parseArticleDoc(withoutAuthor), fakeClient({
    pages: [existingPage()],
    entries: [{ uid: 'bltarticle', _version: 2, title: 'Old RTF', tags: [], rich_text: { text: '', custom_script: '<p>old</p>' } }]
  }));
  assert.equal(update.summary.action, 'update');
  assert.equal(update.proposedPage.article_details.article_author, 'Kelsy Kim');
  assert.equal(update.proposedPage.article_details.enabled, false);
  assert.equal(update.proposedPage.do_not_update_publish_date, true);
  assert.equal(update.proposedPage.header_components[0].uid, 'custom-header');
  assert.deepEqual(update.proposedPage.main_components.map(item => item.uid), [
    SHARED_RICH_TEXT.pseudoHeader,
    SHARED_RICH_TEXT.css,
    'bltarticle',
    SHARED_RICH_TEXT.scripts
  ]);
  assert.deepEqual(update.proposedPage.tags, ['keep-me', 'ea-importer']);
  assert.equal(update.proposedPage.page_configuration.gtm_id, 'GTM-PRVTBFC');
  assert.equal(update.proposedPage.seo_configuration.title, parsed.titleTag);
});

test('creates the rich text before the page and publishes assets, then the article, then the page', async () => {
  const client = fakeClient();
  const plan = await planImport(parseArticleDoc(sampleDoc()), client);
  const environments = [{ name: 'development', uid: 'bltdev' }];
  const result = await applyImport(plan, client, { publish: true, environments });
  const methods = client.calls.map(call => call.method === 'publishAsset' || call.method === 'publishEntry' || call.method === 'create' || call.method === 'waitAsset' || call.method === 'waitEntry' ? `${call.method}:${call.type || ''}${call.uid || ''}` : null).filter(Boolean);
  assert.deepEqual(methods, [
    'publishAsset:d1',
    'waitAsset:d1',
    'publishAsset:m1',
    'waitAsset:m1',
    'publishAsset:d2',
    'waitAsset:d2',
    'create:richText',
    'create:expertAdvicePage',
    'publishEntry:richTextbltnewrtf',
    'waitEntry:richTextbltnewrtf',
    'publishEntry:expertAdvicePagebltnewpage',
    'waitEntry:expertAdvicePagebltnewpage'
  ]);
  assert.equal(result.page.main_components[2].uid, 'bltnewrtf');
  assert.equal(client.calls.some(call => call.method === 'publishEntry' && call.uid === SHARED_RICH_TEXT.scripts), false);
  assert.equal(client.calls.some(call => call.method === 'publishAsset' && call.uid === 't1'), false);
});

test('does not write when an asset is missing or the page changed after planning', async () => {
  const missingClient = fakeClient({ assets: [thumbnail] });
  const missingPlan = await planImport(parseArticleDoc(sampleDoc()), missingClient);
  await assert.rejects(() => applyImport(missingPlan, missingClient), /Missing Contentstack assets/);
  assert.equal(missingClient.calls.some(call => call.method === 'create'), false);

  const client = fakeClient({
    pages: [existingPage()],
    entries: [{ uid: 'bltarticle', _version: 2, title: 'Old RTF', tags: [], rich_text: { text: '', custom_script: '' } }]
  });
  const plan = await planImport(parseArticleDoc(sampleDoc()), client);
  client.bump();
  await assert.rejects(() => applyImport(plan, client), /changed since planning/);
  assert.equal(client.calls.some(call => call.method === 'update'), false);
});

test('stops when a page has a non-rich-text main component or an unknown category', async () => {
  const page = existingPage();
  page.main_components.push({ uid: 'bltcrumb', _content_type_uid: 'breadCrumb210' });
  await assert.rejects(() => planImport(parseArticleDoc(sampleDoc()), fakeClient({ pages: [page] })), /non-rich-text/);
  const parsed = parseArticleDoc(sampleDoc());
  parsed.categories = ['Not A Category'];
  await assert.rejects(() => planImport(parsed, fakeClient()), /Category "Not A Category" was not found/);
});
