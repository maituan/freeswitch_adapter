export type KbSourceType =
  | 'faq'
  | 'pricing'
  | 'policy_docs'
  | 'procedural'
  | 'embedded'
  | 'custom';

export type KbSource = {
  kbId: string;
  label: string;
  type: KbSourceType;
  /** API route for search, if the KB has a dedicated search endpoint */
  searchApi?: string;
};

/**
 * Static manifest mapping each botId to its known KB sources.
 * All KB data lives in data/kb/{botId}/{kbId}/ on disk.
 * When adding a new KB source, register it here.
 */
export const kbRegistry: Record<string, KbSource[]> = {
  leadgenTNDS: [
    { kbId: 'faq', label: 'FAQ TNDS', type: 'faq' },
    { kbId: 'pricing', label: 'Bảng giá xe', type: 'pricing' },
  ],
  abicHotline: [
    {
      kbId: 'travel_kb',
      label: 'Travel KB Items',
      type: 'policy_docs',
      searchApi: '/api/abic/travel/knowledge/search',
    },
    {
      kbId: 'travel_docs',
      label: 'Policy Docs (Markdown)',
      type: 'policy_docs',
    },
  ],
  bidvBot: [
    {
      kbId: 'procedures',
      label: 'Procedural Steps',
      type: 'procedural',
      searchApi: '/api/bidv/kb/search',
    },
  ],
  carebotAuto365: [
    { kbId: 'inline_faq', label: 'Inline FAQ', type: 'faq' },
  ],
};
