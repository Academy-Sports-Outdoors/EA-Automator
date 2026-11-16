export const LOCALE = 'en-us';
export const STACK_UID = 'blt964243cdd7810dea';
export const PAGE_TYPE = 'expertAdvicePage';
export const RICH_TEXT_TYPE = 'richText';
export const ARTICLE_TYPE_CONTENT_TYPE = 'ea_content_type';
export const CATEGORY_TYPES = Object.freeze(['ea_category_l1', 'ea_category_l2', 'ea_category_l3']);

export const SHARED_RICH_TEXT = Object.freeze({
  pseudoHeader: 'bltcf00e51d7a0b693b',
  css: 'bltef0d0c8687f59f71',
  scripts: 'bltbb74414bbe12c0f9'
});

export const SHARED_RICH_TEXT_UIDS = Object.freeze(new Set(Object.values(SHARED_RICH_TEXT)));

export const HEADER_COMPONENTS = Object.freeze([
  { uid: 'blt5d9a3931d3da4c6e', _content_type_uid: 'header210' },
  { uid: 'blt38886c43f628d05f', _content_type_uid: 'banner210' },
  { uid: 'bltcd3a8a991c4ec3ed', _content_type_uid: 'findAStoreModalRTwo' },
  { uid: 'blt07100485cdc89d20', _content_type_uid: 'labelPlaceholder' },
  { uid: 'blt5abf3ee161e9971c', _content_type_uid: 'messagePlaceholder' }
]);

export const FOOTER_COMPONENTS = Object.freeze([
  { uid: 'bltc148d462dba22a17', _content_type_uid: 'feedback_and_chat_component' },
  { uid: 'blt6b9ea142ea3d3fcb', _content_type_uid: 'footer210' }
]);

export const DEFAULT_AUTHOR = 'Academy Staff';
export const DEFAULT_AUTHOR_URL = 'https://www.academy.com/expert-advice/board-of-experts';
export const IMPORTER_TAG = 'ea-importer';
export const PENDING_ARTICLE_UID = 'PENDING_ARTICLE_RICH_TEXT';

export const ARTICLE_TYPES = Object.freeze([
  'Buying Guide', 'How To', 'Checklist', 'Explore', 'Video', 'Outdoors'
]);

export const PUBLISH_ENVIRONMENTS = Object.freeze(['development', 'production', 'prod2', 'uat5']);

export const PAGE_CONFIGURATION_DEFAULTS = Object.freeze({
  page_type: 'generic',
  inject_data_layer_script: true,
  disable_promotion: false,
  disable_live_chat: false,
  disable_gtm: false,
  gtm_id: 'GTM-PRVTBFC',
  gtm_id_production: 'GTM-TLDXCRM',
  enable_monetate: true,
  defer_tealium_view: false,
  enable_promo_tracking: false,
  disable_monetate: false,
  disable_indexing: false,
  disable_follow: false,
  disable_monetate_page_type: false,
  monetate_page_type: 'expertadvice',
  disable_monetate_page_reimplementation: false,
  disable_custom_app_install_banner: false,
  cms_page_type: '',
  track_inp_event: false,
  enable_personalization_analytics: false,
  enable_rmn: false
});

export function canonicalArticleType(value) {
  const key = String(value || '').trim().toLowerCase();
  return ARTICLE_TYPES.find(type => type.toLowerCase() === key) || null;
}

export function assertSupportedEnvironments(environments) {
  for (const environment of environments) {
    if (!PUBLISH_ENVIRONMENTS.includes(environment.name)) {
      throw new Error(`Publish environment "${environment.name}" is not supported. Use ${PUBLISH_ENVIRONMENTS.join(', ')}.`);
    }
  }
  return environments;
}

export function richTextTitle(title) {
  return `Expert Advice - ${title} - RTF`;
}

export function mainComponents(articleUid) {
  return [
    { uid: SHARED_RICH_TEXT.pseudoHeader, _content_type_uid: RICH_TEXT_TYPE },
    { uid: SHARED_RICH_TEXT.css, _content_type_uid: RICH_TEXT_TYPE },
    { uid: articleUid, _content_type_uid: RICH_TEXT_TYPE },
    { uid: SHARED_RICH_TEXT.scripts, _content_type_uid: RICH_TEXT_TYPE }
  ];
}
