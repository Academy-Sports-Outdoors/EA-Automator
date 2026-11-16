const FILENAME_PATTERN = /[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:png|jpe?g|gif|webp|mp4|webm|mov)/i;

export function assetFolderUidFrom(value) {
  const text = String(value || '').trim();
  if (/^blt[a-z0-9]+$/i.test(text)) return text;
  const match = text.match(/\/assets\/(blt[a-z0-9]+)/i);
  if (match) return match[1];
  throw new Error('Asset Folder must be a Contentstack folder UID or assets URL.');
}

export function filenameToken(text) {
  return String(text || '').match(FILENAME_PATTERN)?.[0] || null;
}

export function isThumbnail(filename) {
  return /thumbnail/i.test(filename || '');
}

export function indexFromFilename(filename) {
  const match = String(filename || '').match(/image[_-]?(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function roleFromFilename(filename) {
  if (/-desktop(?=\.[^.]+$)/i.test(filename || '')) return 'desktop';
  if (/-mobile(?=\.[^.]+$)/i.test(filename || '')) return 'mobile';
  return 'single';
}

export function assetKind(asset) {
  const type = asset?.content_type || '';
  const name = asset?.filename || '';
  if (type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(name)) return 'video';
  return 'image';
}

export function organizeAssets(assets) {
  const files = (assets || []).filter(asset => asset?.filename && !asset.is_dir);
  const thumbnail = files.find(asset => isThumbnail(asset.filename)) || null;
  const body = files.filter(asset => asset !== thumbnail);
  const byIndex = new Map();
  const named = new Map();
  for (const asset of body) {
    named.set(asset.filename.toLowerCase(), asset);
    const index = indexFromFilename(asset.filename);
    if (index == null) continue;
    const slot = byIndex.get(index) || { index, desktop: null, mobile: null, single: null };
    slot[roleFromFilename(asset.filename)] = asset;
    byIndex.set(index, slot);
  }
  return { thumbnail, byIndex, named, files: body };
}

function pairFor(asset, organized) {
  const index = indexFromFilename(asset.filename);
  const pair = index == null ? null : organized.byIndex.get(index);
  const role = roleFromFilename(asset.filename);
  if (role === 'mobile') return { desktop: pair?.desktop || asset, mobile: asset };
  if (role === 'desktop') return { desktop: asset, mobile: pair?.mobile || asset };
  return { desktop: asset, mobile: asset };
}

export function resolveAssetSlots(slots, organized) {
  const used = new Set();
  if (organized.thumbnail?.uid) used.add(organized.thumbnail.uid);
  const resolved = slots.map(slot => {
    let desktop = null;
    let mobile = null;
    let via = null;
    if (slot.filename) {
      const named = organized.named.get(slot.filename.toLowerCase());
      if (named) {
        ({ desktop, mobile } = pairFor(named, organized));
        via = 'filename';
      }
    }
    if (!desktop) {
      const pair = organized.byIndex.get(slot.slot);
      if (pair) {
        desktop = pair.desktop || pair.single || pair.mobile;
        mobile = pair.mobile || pair.single || desktop;
        via = 'index';
      }
    }
    if (desktop?.uid) used.add(desktop.uid);
    if (mobile?.uid) used.add(mobile.uid);
    return { ...slot, desktop, mobile: mobile || desktop, via, missing: !desktop };
  });
  const unused = organized.files.filter(asset => !used.has(asset.uid)).map(asset => asset.filename);
  return { resolved, unused, thumbnail: organized.thumbnail };
}

export function publishedEnvironments(asset) {
  return new Set((asset?.publish_details || []).map(item => item.environment).filter(Boolean));
}
