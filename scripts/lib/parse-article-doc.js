import { canonicalArticleType, ARTICLE_TYPES } from './config.js';
import { assetFolderUidFrom, filenameToken } from './assets.js';

export class ArticleDocError extends Error {
  constructor(message, { missing = [] } = {}) {
    super(message);
    this.name = 'ArticleDocError';
    this.missing = missing;
  }
}

const KEYS = new Map([
  ['url', 'url'],
  ['asset folder', 'assetFolder'],
  ['article type', 'articleType'],
  ['category', 'category'],
  ['title tag', 'titleTag'],
  ['meta description', 'metaDescription'],
  ['author', 'author'],
  ['author url', 'authorUrl'],
  ['keywords', 'keywords'],
  ['page name', 'pageName'],
  ['minute reads', 'minuteReads']
]);

export function documentData(doc) {
  if (Array.isArray(doc?.tabs) && doc.tabs.length) {
    const tabs = [];
    const collect = tab => {
      const data = tab.documentTab;
      if (data?.body?.content?.some(block => block.table || block.paragraph?.elements?.some(el => el.textRun?.content?.trim() || el.inlineObjectElement))) tabs.push(data);
      for (const child of tab.childTabs || []) collect(child);
    };
    for (const tab of doc.tabs) collect(tab);
    if (tabs.length !== 1) throw new ArticleDocError(`Expected one populated Google Doc tab; found ${tabs.length}.`);
    return tabs[0];
  }
  if (doc?.body?.content?.length) return doc;
  throw new ArticleDocError('Google Doc has no body content.');
}

export function paragraphText(paragraph) {
  return (paragraph?.elements || []).map(element => element.textRun?.content || '').join('').replace(/\u00a0/g, ' ').trim();
}

function clean(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\*+[ \t]*$/g, '').replace(/\*+$/g, '').trim();
}

export function normalizeArticleUrl(value) {
  const text = clean(value);
  let path;
  if (text.startsWith('/')) path = text;
  else {
    let url;
    try { url = new URL(text); } catch { throw new ArticleDocError(`Article URL is not a valid expert advice path: ${text}`); }
    if (!['http:', 'https:'].includes(url.protocol) || !['academy.com', 'www.academy.com'].includes(url.hostname)) {
      throw new ArticleDocError(`Article URL must point to academy.com: ${text}`);
    }
    path = url.pathname;
  }
  path = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (!/^\/expert-advice\/[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(path) || path.includes('..')) {
    throw new ArticleDocError(`Article URL must be an /expert-advice/... path: ${text}`);
  }
  return path;
}

function inlineRuns(paragraph) {
  const runs = [];
  for (const element of paragraph?.elements || []) {
    if (!element.textRun) continue;
    const text = (element.textRun.content || '').replace(/\n$/, '');
    if (!text) continue;
    const style = element.textRun.textStyle || {};
    runs.push({
      text,
      bold: Boolean(style.bold),
      italic: Boolean(style.italic),
      href: style.link?.url || null
    });
  }
  return runs;
}

function cellInlines(cell) {
  const inlines = [];
  for (const block of cell?.content || []) {
    if (!block.paragraph) continue;
    const part = inlineRuns(block.paragraph);
    if (!part.some(run => run.text.trim())) continue;
    if (inlines.length) inlines.push({ break: true, text: '' });
    inlines.push(...part);
  }
  return inlines;
}

function isOrdered(paragraph, lists) {
  const bullet = paragraph.bullet;
  if (!bullet) return false;
  const level = bullet.nestingLevel || 0;
  const glyph = lists?.[bullet.listId]?.listProperties?.nestingLevels?.[level]?.glyphType || '';
  return /DECIMAL|ALPHA|ROMAN/.test(glyph);
}

function graphicAlt(text) {
  const inner = text.match(/\[Graphic:\s*([\s\S]*?)\]/i)?.[1] || '';
  return inner
    .replace(/[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:png|jpe?g|gif|webp|mp4|webm|mov)/gi, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeAuthorUrl(value) {
  const text = clean(value);
  let url;
  try { url = new URL(text); } catch { throw new ArticleDocError(`Author URL must be an http(s) URL: ${text}`); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ArticleDocError(`Author URL must be an http(s) URL: ${text}`);
  return url.href;
}

export function bodyWordCount(blocks) {
  const words = [];
  const walk = inlines => {
    for (const inline of inlines || []) if (!inline.break && inline.text) words.push(inline.text);
  };
  for (const block of blocks) {
    if (block.type === 'heading') words.push(block.text);
    else if (block.type === 'image' && block.alt) words.push(block.alt);
    else if (block.type === 'paragraph') walk(block.inlines);
    else if (block.type === 'list') for (const item of block.items) walk(item);
    else if (block.type === 'table') for (const row of block.rows) for (const cell of row) walk(cell);
  }
  return words.join(' ').trim().split(/\s+/).filter(Boolean).length;
}

export function imageSlots(parsed) {
  return parsed.blocks.filter(block => block.type === 'image');
}

export function parseArticleDoc(doc) {
  const data = documentData(doc);
  const source = data.body.content || [];
  const fields = {};
  const categories = [];
  const related = [];
  let expectUrl = false;
  let relatedMode = false;
  let title = '';
  let titleIndex = -1;

  const setUrl = value => {
    const url = normalizeArticleUrl(value);
    if (fields.url && fields.url !== url) throw new ArticleDocError(`The Doc has two different article URLs: ${fields.url} and ${url}.`);
    fields.url = url;
  };
  const addRelated = value => {
    const url = normalizeArticleUrl(value);
    if (!related.includes(url)) related.push(url);
  };

  for (let index = 0; index < source.length; index++) {
    const paragraph = source[index].paragraph;
    if (!paragraph) continue;
    const style = paragraph.paragraphStyle?.namedStyleType;
    const text = clean(paragraphText(paragraph));
    if (style === 'HEADING_1' && text) {
      title = text;
      titleIndex = index;
      break;
    }
    if (!text) continue;
    if (/update to the current version/i.test(text)) {
      relatedMode = false;
      const found = text.match(/https?:\/\/\S+|\/expert-advice\/\S+/);
      if (found) {
        setUrl(found[0]);
        expectUrl = false;
      } else expectUrl = true;
      continue;
    }
    if (expectUrl) {
      if (/^https?:\/\//.test(text) || text.startsWith('/expert-advice')) {
        setUrl(text);
        expectUrl = false;
        continue;
      }
      throw new ArticleDocError('The update note must be followed by the article URL.');
    }
    if (/^related articles\b/i.test(text)) {
      relatedMode = true;
      continue;
    }
    if (relatedMode && (paragraph.bullet || /^https?:\/\//.test(text) || text.startsWith('/expert-advice'))) {
      addRelated(text);
      continue;
    }
    relatedMode = false;
    if (/^meta data\b/i.test(text)) continue;
    const match = text.match(/^([^:]+):\s*(.*)$/);
    const key = match && KEYS.get(clean(match[1]).toLowerCase());
    if (!key) throw new ArticleDocError(`Unexpected text before the article title: ${text.slice(0, 80)}`);
    const value = clean(match[2]);
    if (!value) throw new ArticleDocError(`${clean(match[1])} cannot be empty.`);
    if (key === 'category') categories.push(value);
    else if (key === 'url') setUrl(value);
    else if (fields[key] !== undefined) throw new ArticleDocError(`Duplicate metadata field: ${clean(match[1])}.`);
    else fields[key] = value;
  }

  const missing = [];
  if (!fields.url) missing.push('URL');
  if (!fields.assetFolder) missing.push('Asset Folder');
  if (!fields.articleType) missing.push('Article Type');
  if (!categories.length) missing.push('Category');
  if (!fields.titleTag) missing.push('Title Tag');
  if (!fields.metaDescription) missing.push('Meta Description');
  if (missing.length || !title) {
    const parts = [];
    if (missing.length) parts.push(`Missing required article metadata: ${missing.join(', ')}.`);
    if (!title) parts.push('A Heading 1 article title is required.');
    throw new ArticleDocError(parts.join(' '), { missing });
  }
  if (expectUrl) throw new ArticleDocError('The update note must be followed by the article URL.');

  const articleType = canonicalArticleType(fields.articleType);
  if (!articleType) throw new ArticleDocError(`Article Type must be one of: ${ARTICLE_TYPES.join(', ')}.`);
  const assetFolderUid = assetFolderUidFrom(fields.assetFolder);
  let minuteReads = null;
  if (fields.minuteReads !== undefined) {
    if (!/^[1-9]\d*$/.test(fields.minuteReads)) throw new ArticleDocError('Minute Reads must be a positive whole number.');
    minuteReads = Number(fields.minuteReads);
  }
  const authorUrl = fields.authorUrl ? safeAuthorUrl(fields.authorUrl) : null;
  const keywords = fields.keywords === undefined ? null : fields.keywords.split(',').map(item => item.trim()).filter(Boolean);

  const blocks = [];
  let list = null;
  let slot = 0;
  const flushList = () => {
    if (!list) return;
    if (list.items.length) blocks.push(list);
    list = null;
  };
  const pushImage = (alt, filename) => {
    slot += 1;
    blocks.push({ type: 'image', slot, alt: alt || 'Article image', filename: filename || null });
  };

  for (const block of source.slice(titleIndex + 1)) {
    if (block.table) {
      flushList();
      const rows = [];
      for (const row of block.table.tableRows || []) {
        const cells = (row.tableCells || []).map(cellInlines);
        if (cells.every(cell => !cell.some(inline => inline.text?.trim()))) continue;
        rows.push(cells);
      }
      if (rows.length) blocks.push({ type: 'table', rows });
      continue;
    }
    const paragraph = block.paragraph;
    if (!paragraph) continue;
    const style = paragraph.paragraphStyle?.namedStyleType;
    const text = clean(paragraphText(paragraph));
    const images = (paragraph.elements || []).filter(element => element.inlineObjectElement);
    if (images.length || /\[Graphic:/i.test(text)) {
      flushList();
      const named = filenameToken(text);
      const alt = (/\[Graphic:/i.test(text) ? graphicAlt(text) : '') || 'Article image';
      if (images.length) {
        for (const element of images) {
          const object = data.inlineObjects?.[element.inlineObjectElement.inlineObjectId]?.inlineObjectProperties?.embeddedObject;
          pushImage(alt !== 'Article image' ? alt : (object?.description || object?.title || alt), named);
        }
      } else pushImage(alt, named);
      if (text && !/^\s*\[Graphic:[\s\S]*\]\s*$/i.test(text)) {
        const inlines = inlineRuns(paragraph);
        if (inlines.some(run => run.text.trim())) blocks.push({ type: 'paragraph', inlines });
      }
      continue;
    }
    if (style === 'HEADING_1' || style === 'HEADING_2' || style === 'HEADING_3' || style === 'HEADING_4') {
      flushList();
      if (!text) throw new ArticleDocError('A heading cannot be empty.');
      blocks.push({ type: 'heading', level: style === 'HEADING_3' || style === 'HEADING_4' ? 3 : 2, text });
      continue;
    }
    if (paragraph.bullet) {
      if (!text) continue;
      const ordered = isOrdered(paragraph, data.lists);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { type: 'list', ordered, items: [] };
      }
      list.items.push(inlineRuns(paragraph));
      continue;
    }
    if (!text) continue;
    flushList();
    blocks.push({ type: 'paragraph', inlines: inlineRuns(paragraph) });
  }
  flushList();
  if (!blocks.length) throw new ArticleDocError('Article body is empty.');

  const words = bodyWordCount(blocks);
  return {
    docTitle: doc.title || '',
    title,
    url: fields.url,
    assetFolderUid,
    articleType,
    categories,
    titleTag: fields.titleTag,
    metaDescription: fields.metaDescription,
    author: fields.author || null,
    authorUrl,
    keywords,
    pageName: fields.pageName || fields.titleTag,
    minuteReads: minuteReads || Math.max(1, Math.round(words / 200)),
    related,
    blocks,
    inlineObjects: data.inlineObjects || {},
    lists: data.lists || {}
  };
}
