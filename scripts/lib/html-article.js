const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

const SOCIAL_ICONS = Object.freeze({
  facebook: 'https://images.contentstack.io/v3/assets/blt964243cdd7810dea/blt1dae9dd55c9b795b/f_logo_RGB-Black_250.png',
  twitter: 'https://images.contentstack.io/v3/assets/blt964243cdd7810dea/blt2cb3fe0f11ccffa6/2021-Twitter-logo-black.png',
  pinterest: 'https://images.contentstack.io/v3/assets/blt964243cdd7810dea/blt7eda6813106644af/P-Badge-Cosmicore-Black-900.png',
  email: 'https://images.contentstack.io/v3/assets/blt964243cdd7810dea/blt2a36834242c98259/email_icon.png'
});

function safeHref(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (value.startsWith('#') && /^#[A-Za-z0-9_-]+$/.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//') && !/[\\\u0000-\u001f]/.test(value)) return value;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function plainInlines(inlines) {
  return (inlines || []).map(inline => inline.break ? ' ' : inline.text).join('').replace(/\s+/g, ' ').trim();
}

export function splitQuestion(text) {
  const match = String(text || '').match(/^(.+?\?)\s+(\S[\s\S]*)$/);
  if (!match) return null;
  return { question: match[1].trim(), answer: match[2].trim() };
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function slugify(text) {
  return normalize(text).replace(/ /g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'section';
}

function renderInlines(inlines) {
  return (inlines || []).map(inline => {
    if (inline.break) return '<br>';
    let html = escapeText(inline.text);
    if (inline.italic) html = `<em>${html}</em>`;
    if (inline.bold) html = `<strong>${html}</strong>`;
    const href = safeHref(inline.href);
    if (href) html = `<a href="${escapeText(href)}">${html}</a>`;
    return html;
  }).join('');
}

function paragraphGroup(inner) {
  return `<div><div class="row mb-2 mb-md-3"><div class="col-12">${inner}</div></div></div>`;
}

function headingHtml(level, text, id) {
  const tag = level === 3 ? 'h3' : 'h2';
  return `<div class="heading-component"><div class="row anchor-tag sectionheader" id="${escapeText(id)}"></div><div class="row sectionheader"><div class="col-12"><${tag} class="color-dark-blue">${escapeText(text)}</${tag}></div></div></div>`;
}

function isKeyTakeaways(text) {
  return /^key takeaways$/i.test(text);
}

function isFaq(text) {
  return /^frequently asked questions$/i.test(text);
}

function expandBlocks(blocks) {
  const nodes = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    if (block.type === 'heading' && isKeyTakeaways(block.text)) {
      const items = [];
      const after = [];
      index += 1;
      while (index < blocks.length && blocks[index].type !== 'heading') {
        const current = blocks[index];
        if (current.type === 'list') items.push(...current.items);
        else if (current.type === 'paragraph') items.push(current.inlines);
        else after.push(current);
        index += 1;
      }
      nodes.push({ type: 'takeaways', items });
      nodes.push(...after);
      continue;
    }
    if (block.type === 'heading' && block.level === 2 && isFaq(block.text)) {
      nodes.push(block);
      index += 1;
      while (index < blocks.length && !(blocks[index].type === 'heading' && blocks[index].level === 2)) {
        const current = blocks[index];
        if (current.type === 'paragraph') {
          const split = splitQuestion(plainInlines(current.inlines));
          if (split) {
            nodes.push({ type: 'heading', level: 3, text: split.question });
            nodes.push({ type: 'paragraph', inlines: [{ text: split.answer }] });
          } else nodes.push(current);
        } else nodes.push(current);
        index += 1;
      }
      continue;
    }
    nodes.push(block);
    index += 1;
  }
  return groupParagraphs(nodes);
}

function groupParagraphs(nodes) {
  const grouped = [];
  let index = 0;
  while (index < nodes.length) {
    if (nodes[index].type !== 'paragraph') {
      grouped.push(nodes[index++]);
      continue;
    }
    const items = [];
    while (index < nodes.length && nodes[index].type === 'paragraph') items.push(nodes[index++]);
    grouped.push({ type: 'paragraphs', items });
  }
  return grouped;
}

function assignHeadingIds(nodes) {
  const used = new Set();
  const headings = [];
  for (const node of nodes) {
    if (node.type !== 'heading') continue;
    const base = slugify(node.text);
    let id = base;
    let count = 2;
    while (used.has(id)) id = `${base}-${count++}`;
    used.add(id);
    node.id = id;
    headings.push(node);
  }
  return headings;
}

function matchHeading(question, headings) {
  const wanted = normalize(question);
  if (wanted.length < 8) return null;
  let best = null;
  for (const heading of headings) {
    const candidate = normalize(heading.text);
    if (candidate.length < 8) continue;
    if (wanted === candidate || wanted.includes(candidate) || candidate.includes(wanted)) {
      if (!best || candidate.length > normalize(best.text).length) best = heading;
    }
  }
  return best;
}

function takeawaysHtml(items, headings) {
  const rows = items.filter(inlines => plainInlines(inlines)).map(inlines => {
    const text = plainInlines(inlines);
    const split = splitQuestion(text);
    if (!split) return `<li>${renderInlines(inlines)}</li>`;
    const heading = matchHeading(split.question, headings);
    const question = escapeText(split.question);
    const answer = escapeText(split.answer);
    const label = heading ? `<a href="#${escapeText(heading.id)}"><strong>${question}</strong></a>` : `<strong>${question}</strong>`;
    return `<li>${label} — ${answer}</li>`;
  }).join('');
  return `<div class="corners"><div class="row"><div class="col-12 pl-md-3 pl-1 pr-3 pt-3 bg-light-blue"><h2 class="color-dark-blue">Key Takeaways</h2></div></div><div class="row"><div class="col-12 pl-md-3 pr-md-3 pb-3 mb-2 mb-md-3 bg-light-blue"><ul>${rows}</ul></div></div></div>`;
}

function imageHtml(slot, resolution) {
  if (!resolution || resolution.missing) {
    return `<p class="ea-unresolved-asset"><strong>Unresolved asset ${slot.slot}:</strong> ${escapeText(slot.alt)}</p>`;
  }
  if (resolution.kind === 'video') {
    const type = typeAttribute(resolution.desktopType);
    const mobileType = typeAttribute(resolution.mobileType);
    return `<div><div class="row mb-2 mb-md-3"><div class="col-12"><video class="w100-hauto shadow-img br-8" controls playsinline preload="metadata"><source src="${escapeText(resolution.desktopUrl)}" media="(min-width: 768px)"${type}><source src="${escapeText(resolution.mobileUrl)}" media="(max-width: 767px)"${mobileType}></video></div></div></div>`;
  }
  return `<div><div class="row mb-2 mb-md-3"><div class="col-12"><picture><source srcset="${escapeText(resolution.desktopUrl)}" media="(min-width: 768px)"><source srcset="${escapeText(resolution.mobileUrl)}" media="(max-width: 767px)"><img alt="${escapeText(slot.alt)}" class="w100-hauto shadow-img br-8" loading="lazy" srcset="${escapeText(resolution.mobileUrl)}"></picture></div></div></div>`;
}

function typeAttribute(value) {
  return value && /^[\w.+-]+\/[\w.+-]+$/.test(value) ? ` type="${escapeText(value)}"` : '';
}

function tableHtml(table) {
  const [header, ...body] = table.rows;
  const head = `<thead><tr>${header.map(cell => `<th>${renderInlines(cell)}</th>`).join('')}</tr></thead>`;
  const rows = body.map(row => `<tr>${row.map(cell => `<td>${renderInlines(cell)}</td>`).join('')}</tr>`).join('');
  return `<table class="mb-2 mb-md-3">${head}<tbody>${rows}</tbody></table>`;
}

function listHtml(list) {
  const tag = list.ordered ? 'ol' : 'ul';
  const items = list.items.map(item => `<li>${renderInlines(item)}</li>`).join('');
  return paragraphGroup(`<${tag}>${items}</${tag}>`);
}

function sidebarHtml(related, title, pageUrl) {
  const links = related.map(item => `<li><a href="${escapeText(item.href)}">${escapeText(item.title)}</a></li>`).join('');
  const encodedTitle = encodeURIComponent(title);
  const encodedUrl = encodeURIComponent(pageUrl);
  return `<div id="layout-sidebar" class="layout-sidebar col-12 col-xl-3 px-0"><div class="sidebar-content p-1 ms-0 ms-xl-3"><div class="sidebar-related mb-5"><h2 class="color-dark-blue text-left">Related Articles</h2><ul class="sidebar-links">${links}</ul></div><div id="ea-sidebar-recs" class="sidebar-shop-recs mb-5"></div><div id="ea-sidebar-socials" class="sidebar-socials mb-5"><h3 class="color-dark-blue text-left">Share</h3><div class="d-flex justify-content-around"><a target="_blank" rel="noopener" id="ea-facebook-share" href="https://www.facebook.com/Academy/" title="Facebook" aria-label="Share Expert Advice Article on Facebook" class="ea-social-links"><img src="${SOCIAL_ICONS.facebook}" alt="Facebook Social Icon"></a><a id="ea-twitter-share" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?hashtags=HaveFunOutThere&amp;text=${encodedTitle}&amp;url=${encodedUrl}" aria-label="Share this page with Twitter" class="ea-social-links"><img src="${SOCIAL_ICONS.twitter}" alt="Twitter Social Icon"></a><a target="_blank" rel="noopener" href="https://www.pinterest.com/academy/" title="Pinterest" aria-label="Pinterest" class="ea-social-links"><img src="${SOCIAL_ICONS.pinterest}" alt="Pinterest Social Icon"></a><a id="ea-email-share" target="_blank" rel="noopener" href="mailto:?subject=${encodeURIComponent('Check out this Expert Advice article from Academy.com.')}&amp;body=${encodeURIComponent(`${title}: ${pageUrl}`)}" title="Email" aria-label="Email an Expert Advice Article" class="ea-social-links"><img src="${SOCIAL_ICONS.email}" alt="Email Share Icon"></a></div></div></div></div>`;
}

export function renderArticle({ title, url, blocks, related = [], resolutions = {} }) {
  const nodes = expandBlocks(blocks);
  const headings = assignHeadingIds(nodes);
  const unresolved = [];
  const content = [];
  for (const node of nodes) {
    if (node.type === 'takeaways') {
      content.push(takeawaysHtml(node.items, headings));
      continue;
    }
    if (node.type === 'heading') {
      content.push(headingHtml(node.level, node.text, node.id));
      continue;
    }
    if (node.type === 'paragraphs') {
      content.push(paragraphGroup(node.items.map(item => `<p>${renderInlines(item.inlines)}</p>`).join('')));
      continue;
    }
    if (node.type === 'list') {
      content.push(listHtml(node));
      continue;
    }
    if (node.type === 'table') {
      content.push(tableHtml(node));
      continue;
    }
    if (node.type === 'image') {
      const resolution = resolutions[node.slot];
      if (!resolution || resolution.missing) unresolved.push({ slot: node.slot, alt: node.alt, filename: node.filename || null });
      content.push(imageHtml(node, resolution));
    }
  }
  const pageUrl = `https://www.academy.com${url}`;
  const html = `<div id="ea-parentId" class="ea-parentId" style="display:none"></div><div class="expert-advice-container"><div class="container-1280"><div class="row"><div class="layout-main col-12 col-xl-9"><div class="ea-content">${content.join('')}</div></div>${sidebarHtml(related, title, pageUrl)}</div></div></div>`;
  return { html, unresolved };
}

export function previewDocument({ title, articleHtml, unresolved = [] }) {
  const warning = unresolved.length
    ? `<div class="ea-preview-warnings"><p><strong>Unresolved assets:</strong> ${unresolved.map(item => `slot ${item.slot} (${escapeText(item.alt)})`).join(', ')}</p></div>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeText(title)}</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet"><link href="https://assets.contentstack.io/v3/assets/blt964243cdd7810dea/bltc870d51ff149602e/aso-main.css" rel="stylesheet"><link href="https://assets.contentstack.io/v3/assets/blt964243cdd7810dea/blt3d75682cdc4aa3e8/expert-advice-2022.css" rel="stylesheet"><style>.ea-preview-warnings{max-width:1280px;margin:1rem auto;padding:1rem;background:#fff4d6;border:1px solid #e0b44f}.ea-unresolved-asset{padding:1rem;background:#fff4d6}</style></head><body>${warning}${articleHtml}</body></html>\n`;
}
