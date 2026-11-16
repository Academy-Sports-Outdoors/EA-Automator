import { organizeAssets, resolveAssetSlots, assetKind, publishedEnvironments } from './assets.js';
import {
  ARTICLE_TYPE_CONTENT_TYPE, CATEGORY_TYPES, DEFAULT_AUTHOR, DEFAULT_AUTHOR_URL, FOOTER_COMPONENTS,
  HEADER_COMPONENTS, IMPORTER_TAG, PAGE_CONFIGURATION_DEFAULTS, PAGE_TYPE, PENDING_ARTICLE_UID,
  RICH_TEXT_TYPE, mainComponents, richTextTitle
} from './config.js';
import { stripSystemFields } from './contentstack.js';
import { renderArticle } from './html-article.js';
import { imageSlots } from './parse-article-doc.js';

export function titleFromPath(path) {
  const slug = String(path || '').split('/').filter(Boolean).at(-1) || 'Article';
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function refs(list) {
  return (list || []).filter(item => item?.uid && item._content_type_uid).map(item => ({
    uid: item.uid,
    _content_type_uid: item._content_type_uid
  }));
}

function fileUid(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.uid || null;
}

function withTag(tags) {
  return [...new Set([...(tags || []), IMPORTER_TAG])];
}

export function articleRichTextRef(page) {
  const components = page?.main_components || [];
  const foreign = components.filter(item => item._content_type_uid && item._content_type_uid !== RICH_TEXT_TYPE);
  if (foreign.length) {
    const types = [...new Set(foreign.map(item => item._content_type_uid))].join(', ');
    throw new Error(`Page ${page.uid} has non-rich-text main components (${types}).`);
  }
  const articles = components.filter(item => item.uid && !mainComponents('').some(shared => shared.uid === item.uid));
  if (articles.length > 1) throw new Error(`Page ${page.uid} has ${articles.length} article rich text entries; expected one.`);
  return articles[0] || null;
}

async function findByTitle(client, type, title) {
  const wanted = title.trim().toLowerCase();
  const select = entries => entries.filter(entry => entry.title?.trim().toLowerCase() === wanted);
  const exact = select(await client.findEntries(type, { title: title.trim() }));
  if (exact.length) return exact;
  const escaped = title.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return select(await client.findEntries(type, { title: { $regex: `^${escaped}$`, $options: 'i' } }));
}

async function resolveArticleType(client, title) {
  const matches = await findByTitle(client, ARTICLE_TYPE_CONTENT_TYPE, title);
  if (matches.length !== 1) {
    throw new Error(matches.length ? `Article Type "${title}" matched ${matches.length} entries.` : `Article Type "${title}" was not found.`);
  }
  return { uid: matches[0].uid, _content_type_uid: ARTICLE_TYPE_CONTENT_TYPE };
}

async function resolveCategory(client, title) {
  const found = [];
  for (const type of CATEGORY_TYPES) {
    for (const entry of await findByTitle(client, type, title)) found.push({ uid: entry.uid, _content_type_uid: type });
  }
  if (found.length !== 1) {
    throw new Error(found.length ? `Category "${title}" matched ${found.length} entries (${found.map(item => item._content_type_uid).join(', ')}).` : `Category "${title}" was not found.`);
  }
  return found[0];
}

async function resolveRelated(client, paths) {
  const related = [];
  for (const path of paths) {
    const matches = client ? await client.findEntries(PAGE_TYPE, { url: path }, { limit: 2 }) : [];
    if (matches.length > 1) throw new Error(`Multiple expert advice pages use related URL ${path}.`);
    const entry = matches[0];
    related.push({
      path,
      href: `https://www.academy.com${path}`,
      title: entry?.article_details?.article_title || entry?.title || titleFromPath(path)
    });
  }
  return related;
}

function resolutionsFrom(resolved) {
  const resolutions = {};
  for (const slot of resolved) {
    if (slot.missing || !slot.desktop?.url) {
      resolutions[slot.slot] = { missing: true };
      continue;
    }
    const mobile = slot.mobile?.url ? slot.mobile : slot.desktop;
    resolutions[slot.slot] = {
      missing: false,
      kind: assetKind(slot.desktop),
      desktopUrl: slot.desktop.url,
      mobileUrl: mobile.url,
      desktopType: slot.desktop.content_type || '',
      mobileType: mobile.content_type || ''
    };
  }
  return resolutions;
}

function summarize(resolved, unused, thumbnail, folderUid) {
  return {
    folderUid,
    thumbnail,
    resolved,
    unused,
    matched: resolved.filter(slot => slot.desktop?.url).map(slot => ({
      slot: slot.slot,
      alt: slot.alt,
      via: slot.via,
      desktop: slot.desktop.filename,
      mobile: (slot.mobile || slot.desktop).filename
    })),
    missing: resolved.filter(slot => !slot.desktop?.url).map(slot => ({
      slot: slot.slot,
      alt: slot.alt,
      filename: slot.filename
    }))
  };
}

function referencedAssets(report) {
  const assets = [];
  const seen = new Set();
  const add = asset => {
    if (!asset?.uid || seen.has(asset.uid)) return;
    seen.add(asset.uid);
    assets.push(asset);
  };
  for (const slot of report.resolved) {
    if (!slot.desktop?.url) continue;
    add(slot.desktop);
    add(slot.mobile);
  }
  add(report.thumbnail);
  return assets;
}

export function richTextEntry(parsed, html, existing) {
  return {
    title: richTextTitle(parsed.title),
    rich_text: { text: '', custom_script: html },
    tags: withTag(existing?.tags)
  };
}

export function buildPageEntry({ parsed, existing, articleUid, articleTypeRef, categoryRefs, thumbnail }) {
  const base = existing ? stripSystemFields(existing) : {};
  const details = { ...(base.article_details || {}) };
  const card = { ...(details.content_card_information || {}) };
  const seo = { ...(base.seo_configuration || {}) };
  const pageConfiguration = { ...(existing ? base.page_configuration : PAGE_CONFIGURATION_DEFAULTS) };

  details.article_title = parsed.title;
  details.article_types = [articleTypeRef];
  details.associated_categories = categoryRefs;
  details.minute_reads = parsed.minuteReads;
  card.card_description = parsed.metaDescription;
  if (thumbnail?.uid) {
    card.card_thumbnail_image = thumbnail.uid;
    card.card_thumbnail_image_alt_text = parsed.title;
  } else if (card.card_thumbnail_image) card.card_thumbnail_image = fileUid(card.card_thumbnail_image);
  details.content_card_information = card;

  if (!existing) {
    details.article_author = parsed.author || DEFAULT_AUTHOR;
    details.article_author_url = parsed.authorUrl || DEFAULT_AUTHOR_URL;
    details.enabled = true;
    details.view_count_enabled = true;
    details.breadcrumb_links = { breadcrumb_link: [{ title: 'Expert Advice', href: '/expert-advice' }] };
    if (!parsed.keywords) details.keywords = [];
  } else {
    if (parsed.author) details.article_author = parsed.author;
    if (parsed.authorUrl) details.article_author_url = parsed.authorUrl;
  }
  if (parsed.keywords) details.keywords = parsed.keywords;

  seo.title = parsed.titleTag;
  seo.description = parsed.metaDescription;
  seo.url = parsed.url;
  if (parsed.keywords) seo.keywords = parsed.keywords.join(', ');
  else if (!existing) seo.keywords = parsed.title;

  pageConfiguration.page_title = parsed.titleTag;
  pageConfiguration.analytics_title = parsed.titleTag;

  const header = refs(existing?.header_components);
  const footer = refs(existing?.footer_components);
  return {
    ...base,
    title: parsed.title,
    url: parsed.url,
    page: parsed.pageName,
    page_type: existing?.page_type || 'content',
    header_components: header.length ? header : HEADER_COMPONENTS.map(item => ({ ...item })),
    footer_components: footer.length ? footer : FOOTER_COMPONENTS.map(item => ({ ...item })),
    main_components: mainComponents(articleUid),
    expert_advice_nesting_removed: true,
    article_details: details,
    seo_configuration: seo,
    page_configuration: pageConfiguration,
    featured: existing ? Boolean(existing.featured) : false,
    do_not_update_publish_date: existing ? Boolean(existing.do_not_update_publish_date) : false,
    tags: withTag(base.tags)
  };
}

function renderPlan(parsed, report, related) {
  const rendered = renderArticle({
    title: parsed.title,
    url: parsed.url,
    blocks: parsed.blocks,
    related,
    resolutions: resolutionsFrom(report.resolved)
  });
  return rendered;
}

export function previewPlan(parsed) {
  const empty = resolveAssetSlots(imageSlots(parsed), organizeAssets([]));
  const report = summarize(empty.resolved, empty.unused, null, parsed.assetFolderUid);
  const related = parsed.related.map(path => ({ path, href: `https://www.academy.com${path}`, title: titleFromPath(path) }));
  const rendered = renderPlan(parsed, report, related);
  return {
    offline: true,
    parsed,
    page: null,
    articleRichText: null,
    html: rendered.html,
    unresolved: rendered.unresolved,
    assetReport: report,
    referencedAssets: [],
    related,
    proposedPage: null,
    proposedRichText: richTextEntry(parsed, rendered.html, null),
    summary: {
      offline: true,
      action: 'offline',
      url: parsed.url,
      title: parsed.title,
      pageUid: null,
      richTextUid: null,
      missingAssets: report.missing.length
    }
  };
}

async function assertTitleAvailable(client, type, title, currentUid) {
  const clash = (await findByTitle(client, type, title)).filter(entry => entry.uid !== currentUid);
  if (clash.length) throw new Error(`${type} title "${title}" is already used by ${clash[0].uid}.`);
}

export async function planImport(parsed, client) {
  const articleTypeRef = await resolveArticleType(client, parsed.articleType);
  const categoryRefs = [];
  for (const category of parsed.categories) categoryRefs.push(await resolveCategory(client, category));
  const pages = await client.findEntries(PAGE_TYPE, { url: parsed.url }, { limit: 2 });
  if (pages.length > 1) throw new Error(`Multiple expert advice pages use ${parsed.url}.`);
  const page = pages[0] || null;
  await assertTitleAvailable(client, PAGE_TYPE, parsed.title, page?.uid);
  const articleRef = page ? articleRichTextRef(page) : null;
  const articleRichText = articleRef ? await client.getEntry(RICH_TEXT_TYPE, articleRef.uid) : null;
  await assertTitleAvailable(client, RICH_TEXT_TYPE, richTextTitle(parsed.title), articleRichText?.uid);

  const organized = organizeAssets(await client.listFolderAssets(parsed.assetFolderUid));
  const slots = resolveAssetSlots(imageSlots(parsed), organized);
  const report = summarize(slots.resolved, slots.unused, organized.thumbnail, parsed.assetFolderUid);
  const related = await resolveRelated(client, parsed.related);
  const rendered = renderPlan(parsed, report, related);
  const articleUid = articleRichText?.uid || PENDING_ARTICLE_UID;
  return {
    offline: false,
    parsed,
    page,
    articleRichText,
    articleTypeRef,
    categoryRefs,
    html: rendered.html,
    unresolved: rendered.unresolved,
    assetReport: report,
    referencedAssets: referencedAssets(report),
    related,
    proposedPage: buildPageEntry({
      parsed, existing: page, articleUid, articleTypeRef, categoryRefs, thumbnail: organized.thumbnail
    }),
    proposedRichText: richTextEntry(parsed, rendered.html, articleRichText),
    summary: {
      offline: false,
      action: page ? 'update' : 'create',
      url: parsed.url,
      title: parsed.title,
      pageUid: page?.uid || null,
      richTextUid: articleRichText?.uid || null,
      missingAssets: report.missing.length
    }
  };
}

function withArticleUid(page, uid) {
  return {
    ...page,
    main_components: page.main_components.map(item => item.uid === PENDING_ARTICLE_UID ? { ...item, uid } : item)
  };
}

async function assertUnchanged(client, plan) {
  if (plan.page) {
    const latest = await client.getEntry(PAGE_TYPE, plan.page.uid);
    if (latest._version !== plan.page._version) {
      throw new Error(`expertAdvicePage ${plan.page.uid} changed since planning; rerun the import.`);
    }
  }
  if (plan.articleRichText) {
    const latest = await client.getEntry(RICH_TEXT_TYPE, plan.articleRichText.uid);
    if (latest._version !== plan.articleRichText._version) {
      throw new Error(`richText ${plan.articleRichText.uid} changed since planning; rerun the import.`);
    }
  }
}

function missingEnvironments(asset, environments) {
  const published = publishedEnvironments(asset);
  return environments.filter(environment => !published.has(environment.uid) && !published.has(environment.name));
}

async function publishReferencedAssets(client, assets, environments, onProgress) {
  for (const asset of assets) {
    const missing = missingEnvironments(asset, environments);
    if (!missing.length) continue;
    const names = missing.map(environment => environment.name);
    const version = asset._version || 1;
    onProgress(`Publishing asset ${asset.filename || asset.uid} to ${names.join(', ')}`);
    await client.publishAsset(asset.uid, version, names);
    for (const environment of missing) await client.waitForAssetPublication(asset.uid, version, environment.name);
  }
}

async function publishAndWait(client, type, entry, environments, onProgress) {
  const names = environments.map(environment => environment.name);
  onProgress(`Publishing ${type} ${entry.uid} to ${names.join(', ')}`);
  await client.publishEntry(type, entry.uid, entry._version, names);
  for (const environment of environments) await client.waitForEntryPublication(type, entry.uid, entry._version, environment.name);
}

export async function applyImport(plan, client, { environments = [], publish = false, onProgress = () => {} } = {}) {
  if (plan.offline) throw new Error('Contentstack credentials are required to save a draft.');
  if (plan.assetReport.missing.length) {
    const slots = plan.assetReport.missing.map(slot => `${slot.slot}${slot.filename ? ` (${slot.filename})` : ''}`).join(', ');
    throw new Error(`Missing Contentstack assets for image slots: ${slots}.`);
  }
  await assertUnchanged(client, plan);
  if (publish) await publishReferencedAssets(client, plan.referencedAssets, environments, onProgress);
  const richText = plan.articleRichText
    ? await client.updateEntry(RICH_TEXT_TYPE, plan.articleRichText.uid, plan.proposedRichText)
    : await client.createEntry(RICH_TEXT_TYPE, plan.proposedRichText);
  const pageBody = withArticleUid(plan.proposedPage, richText.uid);
  const page = plan.page
    ? await client.updateEntry(PAGE_TYPE, plan.page.uid, pageBody)
    : await client.createEntry(PAGE_TYPE, pageBody);
  if (publish) {
    await publishAndWait(client, RICH_TEXT_TYPE, richText, environments, onProgress);
    await publishAndWait(client, PAGE_TYPE, page, environments, onProgress);
  }
  return { page, richText };
}

export function changeReport(plan) {
  return {
    offline: Boolean(plan.offline),
    action: plan.summary.action,
    url: plan.parsed.url,
    title: plan.parsed.title,
    pageUid: plan.summary.pageUid,
    richTextUid: plan.summary.richTextUid,
    assets: {
      folderUid: plan.assetReport.folderUid,
      thumbnail: plan.assetReport.thumbnail?.filename || null,
      matched: plan.assetReport.matched,
      missing: plan.assetReport.missing,
      unused: plan.assetReport.unused
    },
    related: plan.related.map(item => ({ url: item.path, title: item.title }))
  };
}

export function previewPayload(plan) {
  return {
    page: plan.proposedPage,
    richText: plan.proposedRichText,
    related: plan.related
  };
}
