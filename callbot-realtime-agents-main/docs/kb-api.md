# KB Management API

## Base URL

Tất cả routes đều là relative URL. Khi gọi từ relay server cần prefix với `BASE_URL`.

---

## 1. `GET /api/bots`

Liệt kê tất cả bot đã đăng ký trong hệ thống.

**Response**
```json
{
  "bots": [
    {
      "botId": "leadgenTNDS",
      "label": "LeadGen TNDS",
      "isTextOnly": false,
      "isDefault": true
    },
    {
      "botId": "abicHotline",
      "label": "ABIC Hotline",
      "isTextOnly": false,
      "isDefault": false
    },
    {
      "botId": "carebotAuto365",
      "label": "Carebot Auto 365",
      "isTextOnly": true,
      "isDefault": false
    }
  ]
}
```

**Errors:** không có — luôn trả 200.

---

## 2. `GET /api/bots/{botId}/kb`

Liệt kê tất cả KB source của một bot. Tự động merge registry tĩnh + các thư mục có trong `data/kb/{botId}/`.

**Path params:** `botId` — key của bot (e.g. `leadgenTNDS`, `abicHotline`)

**Response**
```json
{
  "botId": "abicHotline",
  "sources": [
    {
      "kbId": "travel_kb",
      "label": "Travel KB Items",
      "type": "policy_docs",
      "searchApi": "/api/abic/travel/kb/search",
      "itemCount": 82
    },
    {
      "kbId": "travel_docs",
      "label": "Policy Docs (Markdown)",
      "type": "policy_docs",
      "itemCount": 6
    }
  ]
}
```

`itemCount` là số file JSON/MD đang có trên disk (sau khi seeded). Nếu chưa seeded thì `itemCount: 0`.

**Errors**

| Status | Điều kiện |
|--------|-----------|
| `404` | `botId` không tồn tại |

---

## 3. `GET /api/bots/{botId}/kb/{kbId}`

Lấy toàn bộ items của một KB source.

**Response**
```json
{
  "botId": "leadgenTNDS",
  "kbId": "faq",
  "items": [
    {
      "id": "faq-001",
      "question": "Bảo hiểm TNDS là gì?",
      "answer": "...",
      "keywords": ["TNDS", "bắt buộc"],
      "category": "about"
    }
  ]
}
```

Items trả về đúng structure như file JSON trên disk. Với KB mới chưa seeded thì `items: []`.

**Errors**

| Status | Điều kiện |
|--------|-----------|
| `404` | `botId` không tồn tại |

---

## 4. `POST /api/bots/{botId}/kb/{kbId}`

Tạo mới hoặc ghi đè một KB item. Body là JSON tùy ý — server lưu nguyên vẹn vào disk.

**Request body**
```json
{
  "id": "faq-custom-001",
  "title": "Tiêu đề item",
  "content": "Nội dung item",
  "keywords": ["từ khóa 1", "từ khóa 2"]
}
```

- `id` — nếu bỏ qua, server tự sinh ID dạng `item-{timestamp}-{random}`
- Các field còn lại là tùy ý, không có schema cố định — tùy theo structure của KB đó

**Response** `201 Created`
```json
{
  "ok": true,
  "item": {
    "id": "faq-custom-001",
    "title": "Tiêu đề item",
    "content": "Nội dung item",
    "keywords": ["từ khóa 1", "từ khóa 2"]
  }
}
```

**Errors**

| Status | Điều kiện |
|--------|-----------|
| `400` | Body thiếu cả `content` lẫn `answer` |
| `404` | `botId` không tồn tại |

---

## 5. `GET /api/bots/{botId}/kb/{kbId}/{itemId}`

Lấy một item theo ID.

**Response**
```json
{
  "botId": "abicHotline",
  "kbId": "travel_kb",
  "item": {
    "id": "intl_sum_insured_core",
    "scope": "TRAVEL_INTERNATIONAL",
    "title": "Du lịch quốc tế: số tiền bảo hiểm...",
    "content": "...",
    "source": "...",
    "keywords": ["du lịch quốc tế", "số tiền bảo hiểm"]
  }
}
```

**Errors**

| Status | Điều kiện |
|--------|-----------|
| `404` | `botId` hoặc `itemId` không tồn tại |

---

## 6. `PUT /api/bots/{botId}/kb/{kbId}/{itemId}`

Cập nhật item — merge field mới vào item cũ (partial update). `id` luôn được giữ từ URL, không thể thay đổi.

**Request body** — chỉ gửi các field cần thay đổi:
```json
{
  "content": "Nội dung mới",
  "keywords": ["từ khóa mới"]
}
```

**Response**
```json
{
  "ok": true,
  "item": {
    "id": "faq-custom-001",
    "title": "Tiêu đề cũ (giữ nguyên)",
    "content": "Nội dung mới",
    "keywords": ["từ khóa mới"]
  }
}
```

**Errors**

| Status | Điều kiện |
|--------|-----------|
| `400` | Body không phải JSON hợp lệ |
| `404` | `botId` không tồn tại |

---

## 7. `DELETE /api/bots/{botId}/kb/{kbId}/{itemId}`

Xóa một item khỏi disk.

**Response**
```json
{ "ok": true }
```

**Errors**

| Status | Điều kiện |
|--------|-----------|
| `404` | Item không tồn tại hoặc `botId` không hợp lệ |

---

## Internal Search Routes (dùng bởi agent tools)

Các route này không dành cho quản lý KB — chúng được tool của agent gọi khi cần tìm kiếm.

| Route | Bot | Search method |
|-------|-----|---------------|
| `POST /api/leadgen/faq/search` | leadgenTNDS | BM25 keyword |
| `POST /api/abic/travel/kb/search` | abicHotline | BM25 keyword |
| `POST /api/abic/travel/knowledge/search` | abicHotline | BM25 markdown chunks |
| `POST /api/bidv/kb/search` | bidvBot | OpenAI embeddings |
| `POST /api/carebot/kb/search` | carebotAuto365 | Keyword match |

Các route này tự động **seed dữ liệu** từ TypeScript defaults vào `data/kb/` lần đầu tiên được gọi (nếu thư mục còn trống). Sau đó chúng đọc từ `data/kb/` — nên nếu bạn update KB qua CRUD API, search routes sẽ tự pick up dữ liệu mới mà không cần restart server.

> **Lưu ý về cache:** `bidvBot` cache embedding index in-memory. Sau khi update KB qua API, cần restart server để embedding được build lại với dữ liệu mới.

---

## Cấu trúc lưu trữ

```
data/kb/
  {botId}/
    {kbId}/
      {itemId}.json   ← mỗi item là một file JSON
      {docId}.md      ← với travel_docs là file markdown
```

Thư mục `data/kb/` được tạo tự động khi seeding lần đầu. Sau đó có thể edit qua API mà không cần deploy lại.

### KB sources theo bot

| Bot | kbId | Type | Search API |
|-----|------|------|------------|
| `leadgenTNDS` | `faq` | faq | `/api/leadgen/faq/search` |
| `leadgenTNDS` | `pricing` | pricing | — |
| `abicHotline` | `travel_kb` | policy_docs | `/api/abic/travel/kb/search` |
| `abicHotline` | `travel_docs` | policy_docs (markdown) | `/api/abic/travel/knowledge/search` |
| `bidvBot` | `procedures` | procedural | `/api/bidv/kb/search` |
| `carebotAuto365` | `inline_faq` | faq | `/api/carebot/kb/search` |
