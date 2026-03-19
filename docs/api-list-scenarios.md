# API Danh Sách Kịch Bản (Scenarios)

## Endpoint

```
GET /api/bots
Host: <nextjs-host>:8088
```

---

## Response — HTTP 200

```json
{
  "bots": [
    {
      "botId":      "leadgenTNDS",
      "label":      "LeadGen TNDS",
      "isTextOnly": false,
      "isDefault":  true
    },
    {
      "botId":      "leadgenMultiAgent",
      "label":      "Leadgen TNDS Multi-Agent",
      "isTextOnly": false,
      "isDefault":  false
    },
    {
      "botId":      "abicHotline",
      "label":      "ABIC Hotline",
      "isTextOnly": false,
      "isDefault":  false
    },
    {
      "botId":      "carebotAuto365",
      "label":      "Carebot Auto 365",
      "isTextOnly": false,
      "isDefault":  false
    },
    {
      "botId":      "hotlineAI",
      "label":      "Hotline AI",
      "isTextOnly": false,
      "isDefault":  false
    },
    {
      "botId":      "motheAI",
      "label":      "Mothe AI",
      "isTextOnly": false,
      "isDefault":  false
    },
    {
      "botId":      "bidvBot",
      "label":      "BIDV Bot",
      "isTextOnly": false,
      "isDefault":  false
    },
    {
      "botId":      "customerServiceRetail",
      "label":      "Customer Service Retail",
      "isTextOnly": false,
      "isDefault":  false
    },
    {
      "botId":      "chatSupervisor",
      "label":      "Chat Supervisor",
      "isTextOnly": false,
      "isDefault":  false
    },
    {
      "botId":      "simpleHandoff",
      "label":      "Simple Handoff",
      "isTextOnly": false,
      "isDefault":  false
    }
  ]
}
```

### Mô tả các field

| Field | Type | Mô tả |
|---|---|---|
| `botId` | string | Key kịch bản — dùng làm giá trị `scenario` khi gọi `POST /api/call` |
| `label` | string | Tên hiển thị |
| `isTextOnly` | boolean | `true` nếu kịch bản chỉ hỗ trợ text, không hỗ trợ voice |
| `isDefault` | boolean | `true` cho kịch bản mặc định (hiện tại: `leadgenTNDS`) |

---

## Ví dụ

```bash
curl http://nextjs-host:8088/api/bots
```

---

## Lưu ý

- `botId` trả về trực tiếp dùng được làm giá trị `scenario` trong `POST /api/call`.
- Kịch bản có `isTextOnly: true` không dùng được cho outbound voice call.
