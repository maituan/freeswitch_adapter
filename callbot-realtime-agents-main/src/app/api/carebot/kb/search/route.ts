import { NextRequest, NextResponse } from 'next/server';
import { readKbItems, seedIfEmpty } from '@/app/lib/kbReader';

export const runtime = 'nodejs';

type KnowledgeItem = {
  id: string;
  topic: string;
  answer: string;
  keywords: string[];
};

const DEFAULT_KB: KnowledgeItem[] = [
  {
    id: 'collision_handling',
    topic: 'collision_handling',
    answer:
      'Neu co va cham, khong tu thoa thuan boi thuong tai hien truong. Goi ngay hotline de duoc huong dan.',
    keywords: ['va cham', 'boi thuong', 'hien truong', 'hotline'],
  },
  {
    id: 'repair_policy',
    topic: 'repair_policy',
    answer: 'Khong tu sua xe khi chua co huong dan tu giam dinh vien cua bao hiem.',
    keywords: ['sua xe', 'giam dinh', 'hu hong'],
  },
  {
    id: 'digital_card',
    topic: 'digital_card',
    answer:
      'Bao hiem dien tu da duoc chap nhan. Nen luu anh giay chung nhan vao muc yeu thich tren dien thoai.',
    keywords: ['dien tu', 'giay chung nhan', 'canh sat giao thong'],
  },
  {
    id: 'traffic365',
    topic: 'traffic365',
    answer:
      'Dich vu Giao thong 365 giup canh bao phat nguoi dinh ky qua Zalo va nhac nho thong tin can luu y.',
    keywords: ['giao thong 365', 'phat nguoi', 'zalo'],
  },
];

async function loadKbItems(): Promise<KnowledgeItem[]> {
  await seedIfEmpty('carebotAuto365', 'inline_faq', DEFAULT_KB);
  const items = await readKbItems<KnowledgeItem>('carebotAuto365', 'inline_faq');
  return items.length ? items : DEFAULT_KB;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const topic = String(body?.topic ?? '').trim().toLowerCase();

    if (!topic) {
      return NextResponse.json({ error: 'topic_required' }, { status: 400 });
    }

    const items = await loadKbItems();
    const hit = items.find(
      (item) => item.topic.includes(topic) || item.keywords.some((kw) => topic.includes(kw)),
    );

    if (!hit) {
      return NextResponse.json({
        found: false,
        message: 'Khong tim thay muc phu hop trong FAQ noi bo.',
      });
    }

    return NextResponse.json({ found: true, item: hit });
  } catch (err: any) {
    console.error('[Carebot KB Search] error', err);
    return NextResponse.json(
      { error: 'failed', details: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
