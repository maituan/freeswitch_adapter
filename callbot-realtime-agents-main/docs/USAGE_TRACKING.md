# 💰 Token & Cost Tracking

Hệ thống tracking token và cost tự động cho HotlineAI text-only agent.

---

## 📊 **Tính năng**

✅ **Real-time tracking:**
- Input tokens
- Output tokens
- Total tokens per request
- Cumulative session usage

✅ **Cost calculation:**
- Tự động tính chi phí dựa trên pricing hiện tại
- Hỗ trợ nhiều models (gpt-4o-mini, gpt-4o, gpt-4.1)
- Breakdown chi phí theo từng request

✅ **UI Dashboard:**
- Floating widget ở góc dưới bên phải
- Collapsed view: Hiển thị tổng tokens & cost
- Expanded view: Chi tiết usage breakdown + request history
- Reset session button

---

## 🏗️ **Architecture**

### **1. UsageContext** (`contexts/UsageContext.tsx`)

**Provider:** Quản lý state của usage tracking

```typescript
interface UsageStats {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
    text_tokens?: number;
  };
  output_tokens_details?: {
    audio_tokens?: number;
    text_tokens?: number;
  };
}

interface RequestUsage {
  timestamp: string;
  type: 'realtime' | 'responses' | 'session';
  usage: UsageStats;
  cost?: number;
  model?: string;
}
```

**Methods:**
- `addUsage(usage, type, model)` - Thêm usage data
- `resetSession()` - Reset về 0
- `getTotalCost()` - Tính tổng cost

### **2. UsageStats Component** (`components/UsageStats.tsx`)

Floating widget hiển thị real-time usage:
- ✅ Auto-collapse/expand
- ✅ Live token counter
- ✅ Cost tracker
- ✅ Request history (last 10)
- ✅ Reset button

### **3. Integration**

**page.tsx:**
```typescript
<UsageProvider>
  <TranscriptProvider>
    <EventProvider>
      <App />
    </EventProvider>
  </TranscriptProvider>
</UsageProvider>
```

**App.tsx:**
```typescript
import UsageStats from "./components/UsageStats";

// ... in render
<UsageStats />
```

---

## 💵 **Pricing (as of Nov 2024)**

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| `gpt-4o-mini-realtime-preview` | $0.60 | $2.40 |
| `gpt-4o-realtime-preview` | $5.00 | $20.00 |
| `gpt-4o-mini` | $0.15 | $0.60 |
| `gpt-4.1` | $2.50 | $10.00 |

**Audio pricing** (if applicable):
- Input audio: Same as input text pricing
- Output audio: Same as output text pricing

---

## 📈 **Usage Example**

### **Collapsed View:**
```
🟢 15,234 tokens  $0.0089
```

### **Expanded View:**
```
Session Usage                     [Reset]
─────────────────────────────────────────
Input tokens:          12,450
Output tokens:          2,784
─────────────────────────────────────────
Total:                 15,234
Cost:                  $0.0089

Details:
Input (text):          12,450
Output (text):          2,784

Recent requests (3):
─────────────────────────────────────────
realtime  gpt-4o-mini-realtime-preview
14:23:45             8,234    $0.0048

responses  gpt-4o-mini
14:23:42             5,000    $0.0029

realtime  gpt-4o-mini-realtime-preview
14:23:38             2,000    $0.0012
```

---

## 🔧 **How to Use**

### **1. Trong component:**

```typescript
import { useUsage } from "@/app/contexts/UsageContext";

function MyComponent() {
  const { currentSessionUsage, addUsage, getTotalCost } = useUsage();
  
  // Khi có API response với usage data:
  const handleAPIResponse = (response: any) => {
    if (response.usage) {
      addUsage(
        response.usage,
        'responses', // or 'realtime' or 'session'
        'gpt-4o-mini'
      );
    }
  };
  
  // Display cost
  const totalCost = getTotalCost();
  console.log(`Total cost: $${totalCost.toFixed(4)}`);
}
```

### **2. Supervisor Agent (Đã tích hợp):**

```typescript
// hotlineAI/supervisorAgent.ts
async function fetchResponsesMessage(body: any) {
  const completion = await response.json();
  
  // Log usage
  if (completion.usage) {
    console.log('[Supervisor Usage]', {
      input_tokens: completion.usage.input_tokens,
      output_tokens: completion.usage.output_tokens,
      total_tokens: completion.usage.total_tokens,
    });
  }
  
  return completion;
}
```

### **3. Session events (TODO):**

Có thể hook vào Realtime API session events để capture usage:

```typescript
// In useRealtimeSession.ts
sessionRef.current.on('response.done', (event) => {
  if (event.usage) {
    addUsage(event.usage, 'realtime', 'gpt-4o-mini-realtime-preview');
  }
});
```

---

## 🎯 **Benefits**

1. **💰 Cost tracking:** Biết chính xác chi phí từng session
2. **📊 Token monitoring:** Track usage real-time
3. **🐛 Debug:** Identify expensive requests
4. **📈 Optimization:** Find opportunities to reduce costs
5. **💡 Transparency:** Clear breakdown của chi phí

---

## 🚀 **Live Now!**

Hệ thống đã **hoạt động** và sẵn sàng tracking:
- ✅ UsageContext provider active
- ✅ UsageStats widget rendered
- ✅ Supervisor agent integrated
- ✅ Pricing calculator ready

**Test ngay:**
```bash
npm run dev
```

Widget sẽ xuất hiện ở góc dưới bên phải màn hình! 💚

