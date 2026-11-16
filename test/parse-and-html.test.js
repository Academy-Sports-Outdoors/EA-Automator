import test from 'node:test';
import assert from 'node:assert/strict';
import { docIdFromInput } from '../scripts/lib/google-docs.js';
import { renderArticle } from '../scripts/lib/html-article.js';
import { ArticleDocError, parseArticleDoc } from '../scripts/lib/parse-article-doc.js';
import { articleDoc, paragraph, sampleDoc } from './helpers/doc.js';

test('reads a Doc ID from a raw ID or a Doc URL', () => {
  assert.equal(docIdFromInput('1XvosdQYBHwwROZh-JkX9PoQSk7FVIYtlHbFmhQXitAw'), '1XvosdQYBHwwROZh-JkX9PoQSk7FVIYtlHbFmhQXitAw');
  assert.equal(docIdFromInput('https://docs.google.com/document/d/1XvosdQYBHwwROZh-JkX9PoQSk7FVIYtlHbFmhQXitAw/edit?tab=t.0'), '1XvosdQYBHwwROZh-JkX9PoQSk7FVIYtlHbFmhQXitAw');
  assert.throws(() => docIdFromInput('https://example.com/document/d/abc'), /docs\.google\.com/);
});

test('parses the sample metadata block, body, and image slots', () => {
  const parsed = parseArticleDoc(sampleDoc());
  assert.equal(parsed.url, '/expert-advice/basketball/how-to-choose-a-basketball-hoop');
  assert.equal(parsed.assetFolderUid, 'blta5172dec2dcd9599');
  assert.equal(parsed.articleType, 'Buying Guide');
  assert.deepEqual(parsed.categories, ['Basketball']);
  assert.equal(parsed.titleTag, 'How to Choose a Basketball Hoop | Academy Sports + Outdoors');
  assert.equal(parsed.title, 'How to Choose a Basketball Hoop');
  assert.deepEqual(parsed.keywords, ['basketball', 'hoop']);
  assert.deepEqual(parsed.related, [
    '/expert-advice/basketball-equipment-list',
    '/expert-advice/basketball/how-to-choose-the-best-basketball-shoes'
  ]);
  assert.equal(parsed.minuteReads >= 1, true);
  const images = parsed.blocks.filter(block => block.type === 'image');
  assert.deepEqual(images.map(image => image.filename), [null, 'Hoop_image_2-desktop.png']);
  assert.equal(images[1].alt, 'A hoop at sunset');
  assert.equal(parsed.blocks.some(block => block.type === 'table'), true);
  assert.equal(parsed.blocks.some(block => block.type === 'list' && block.ordered), true);
});

test('names every missing metadata label and accepts an explicit minute count', () => {
  const doc = articleDoc({
    blocks: [
      paragraph('Article Type: Not A Type'),
      paragraph('Title Tag: Title'),
      paragraph('A title', { style: 'HEADING_1' }),
      paragraph('Body copy.')
    ]
  });
  assert.throws(() => parseArticleDoc(doc), error => {
    assert.ok(error instanceof ArticleDocError);
    assert.deepEqual(error.missing, ['URL', 'Asset Folder', 'Category', 'Meta Description']);
    return true;
  });
  const typed = articleDoc({
    blocks: [
      paragraph('URL: /expert-advice/holiday/turkey'),
      paragraph('Asset Folder: blta5172dec2dcd9599'),
      paragraph('Article Type: How To'),
      paragraph('Category: Holiday'),
      paragraph('Category: Outdoors'),
      paragraph('Title Tag: Turkey'),
      paragraph('Meta Description: Check the thigh.'),
      paragraph('Minute Reads: 6'),
      paragraph('Where to Test Turkey Temperature', { style: 'HEADING_1' }),
      paragraph('Use a thermometer.')
    ]
  });
  const parsed = parseArticleDoc(typed);
  assert.equal(parsed.articleType, 'How To');
  assert.deepEqual(parsed.categories, ['Holiday', 'Outdoors']);
  assert.equal(parsed.minuteReads, 6);
  assert.throws(() => parseArticleDoc(articleDoc({
    blocks: [
      paragraph('URL: /expert-advice/holiday/turkey'),
      paragraph('Asset Folder: blta5172dec2dcd9599'),
      paragraph('Article Type: Recipe'),
      paragraph('Category: Holiday'),
      paragraph('Title Tag: Turkey'),
      paragraph('Meta Description: Check the thigh.'),
      paragraph('Turkey', { style: 'HEADING_1' }),
      paragraph('Body.')
    ]
  })), /Article Type must be one of/);
});

test('renders BBCOR article HTML with takeaways, assets, tables, and escaped text', () => {
  const parsed = parseArticleDoc(sampleDoc());
  const { html, unresolved } = renderArticle({
    title: parsed.title,
    url: parsed.url,
    blocks: parsed.blocks,
    related: [{ href: 'https://www.academy.com/expert-advice/basketball-equipment-list', title: 'Basketball Equipment List' }],
    resolutions: {
      1: {
        missing: false,
        kind: 'image',
        desktopUrl: 'https://images.example/desktop.png',
        mobileUrl: 'https://images.example/mobile.png'
      },
      2: { missing: true }
    }
  });
  assert.match(html, /class="corners"/);
  assert.match(html, /<a href="#tempered-glass"><strong>Which is better, tempered glass\?<\/strong><\/a>/);
  assert.match(html, /id="tempered-glass"/);
  assert.match(html, /srcset="https:\/\/images\.example\/desktop\.png" media="\(min-width: 768px\)"/);
  assert.match(html, /Unresolved asset 2:/);
  assert.match(html, /<thead><tr><th>Feature<\/th><th>Tempered Glass<\/th><th>Acrylic<\/th><\/tr><\/thead>/);
  assert.match(html, /<strong>the right hoop<\/strong>/);
  assert.match(html, /href="https:\/\/www\.academy\.com\/c\/sports\/basketball"/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /<h3 class="color-dark-blue">How much space do I need\?<\/h3>/);
  assert.match(html, /A two-car driveway is enough\./);
  assert.match(html, /Basketball Equipment List/);
  assert.match(html, /<ol><li>Check the base\.<\/li><\/ol>/);
  assert.equal(unresolved.length, 1);
  assert.equal(parsed.blocks.filter(block => block.type === 'heading' && block.text === 'How to Choose a Basketball Hoop').length, 0);
});

test('renders a video slot with source types', () => {
  const { html } = renderArticle({
    title: 'Video',
    url: '/expert-advice/video-tip',
    blocks: [{ type: 'image', slot: 1, alt: 'Swing', filename: null }, { type: 'paragraph', inlines: [{ text: 'Watch the swing.' }] }],
    resolutions: {
      1: {
        missing: false,
        kind: 'video',
        desktopUrl: 'https://images.example/swing.mp4',
        mobileUrl: 'https://images.example/swing.mp4',
        desktopType: 'video/mp4',
        mobileType: 'video/mp4'
      }
    }
  });
  assert.match(html, /<video class="w100-hauto shadow-img br-8" controls playsinline preload="metadata">/);
  assert.match(html, /type="video\/mp4"/);
});
