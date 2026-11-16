import test from 'node:test';
import assert from 'node:assert/strict';
import { assetFolderUidFrom, organizeAssets, resolveAssetSlots } from '../scripts/lib/assets.js';

const desktop = { uid: 'd1', filename: 'BBCORbats_image_1-desktop.png', url: 'https://images.example/d.png', content_type: 'image/png' };
const mobile = { uid: 'm1', filename: 'BBCORbats_image_1-mobile.png', url: 'https://images.example/m.png', content_type: 'image/png' };
const second = { uid: 'd2', filename: 'BBCORbats_image_2-desktop.png', url: 'https://images.example/d2.png', content_type: 'image/png' };
const video = { uid: 'v3', filename: 'BBCORbats_image_3-desktop.mp4', url: 'https://images.example/v.mp4', content_type: 'video/mp4' };
const thumb = { uid: 't1', filename: 'BBCORbats_thumbnail.png', url: 'https://images.example/t.png', content_type: 'image/png' };
const unused = { uid: 'u1', filename: 'notes.png', url: 'https://images.example/u.png', content_type: 'image/png' };

test('reads a folder UID from a UID or a Contentstack assets URL', () => {
  assert.equal(assetFolderUidFrom('blta5172dec2dcd9599'), 'blta5172dec2dcd9599');
  assert.equal(
    assetFolderUidFrom('https://app.contentstack.com/#!/stack/blt964243cdd7810dea/assets/blta5172dec2dcd9599/browse?page=1'),
    'blta5172dec2dcd9599'
  );
  assert.throws(() => assetFolderUidFrom('https://example.com/folder'), /Asset Folder/);
});

test('pairs numbered desktop and mobile files and prefers an explicit filename', () => {
  const organized = organizeAssets([thumb, unused, mobile, desktop, second, video]);
  assert.equal(organized.thumbnail.uid, 't1');
  const slots = [
    { slot: 1, alt: 'Hero', filename: null },
    { slot: 2, alt: 'Named', filename: 'BBCORbats_image_2-desktop.png' },
    { slot: 3, alt: 'Clip', filename: null },
    { slot: 4, alt: 'Missing', filename: 'not-there.png' }
  ];
  const { resolved, unused: unusedNames } = resolveAssetSlots(slots, organized);
  assert.equal(resolved[0].desktop.uid, 'd1');
  assert.equal(resolved[0].mobile.uid, 'm1');
  assert.equal(resolved[0].via, 'index');
  assert.equal(resolved[1].desktop.uid, 'd2');
  assert.equal(resolved[1].via, 'filename');
  assert.equal(resolved[2].desktop.uid, 'v3');
  assert.equal(resolved[3].missing, true);
  assert.deepEqual(unusedNames, ['notes.png']);
});
