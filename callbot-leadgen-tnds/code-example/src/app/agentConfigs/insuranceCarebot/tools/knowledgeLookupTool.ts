import { tool } from '@/app/agentConfigs/types';

type KnowledgeItem = {
  topic: string;
  answer: string;
  keywords: string[];
};

const carebotKnowledgeBase: KnowledgeItem[] = [
  {
    topic: 'collision_handling',
    answer:
      'Neu co va cham, khong tu thoa thuan boi thuong tai hien truong. Goi ngay hotline de duoc huong dan.',
    keywords: ['va cham', 'boi thuong', 'hien truong', 'hotline'],
  },
  {
    topic: 'repair_policy',
    answer: 'Khong tu sua xe khi chua co huong dan tu giam dinh vien cua bao hiem.',
    keywords: ['sua xe', 'giam dinh', 'hu hong'],
  },
  {
    topic: 'digital_card',
    answer:
      'Bao hiem dien tu da duoc chap nhan. Nen luu anh giay chung nhan vao muc yeu thich tren dien thoai.',
    keywords: ['dien tu', 'giay chung nhan', 'canh sat giao thong'],
  },
  {
    topic: 'traffic365',
    answer:
      'Dich vu Giao thong 365 giup canh bao phat nguoi dinh ky qua Zalo va nhac nho thong tin can luu y.',
    keywords: ['giao thong 365', 'phat nguoi', 'zalo'],
  },
];

export const knowledgeLookupTool = tool({
  name: 'knowledgeLookup',
  description: 'Lookup internal FAQ by topic or keyword.',
  parameters: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
    },
    required: ['topic'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const topic = String((args as { topic: string }).topic || '')
      .trim()
      .toLowerCase();
    const hit = carebotKnowledgeBase.find(
      (item) => item.topic.includes(topic) || item.keywords.some((kw) => topic.includes(kw)),
    );

    if (!hit) {
      return {
        found: false,
        message: 'Khong tim thay muc phu hop trong FAQ noi bo.',
      };
    }
    return {
      found: true,
      item: hit,
    };
  },
});
