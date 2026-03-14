# 🛡️ Guardrails Configuration Changes

## 📋 **Tóm tắt thay đổi:**

### **1. App.tsx - Conditional Guardrails**

**✅ DISABLED guardrails cho text-only agents (hotlineAI, textOnly)**

**Before:**
```typescript
const guardrail = createModerationGuardrail(companyName);

await connect({
  // ...
  outputGuardrails: [guardrail], // Always applied
});
```

**After:**
```typescript
// Only use guardrails for complex agents
const needsGuardrail = !isTextOnlyMode && 
  ['customerServiceRetail', 'chatSupervisor'].includes(agentSetKey);
const guardrails = needsGuardrail ? [createModerationGuardrail(companyName)] : [];

await connect({
  // ...
  outputGuardrails: guardrails, // Conditional
});
```

**Lý do:**
- ✅ **Text-only agents đơn giản** không cần moderation phức tạp
- ✅ **Giảm latency** - không gọi thêm API moderation
- ✅ **Giảm cost** - không tốn tokens cho guardrail classifier
- ✅ **Instructions đã rõ ràng** về phong cách giao tiếp
- ✅ **Tối ưu performance** cho HotlineAI

---

### **2. guardrails.ts - Enhanced Categories**

**✅ ADDED category "UNPROFESSIONAL"**

```typescript
<output_classes>
- OFFENSIVE: Content that includes hate speech, discriminatory language, insults, slurs, or harassment.
- OFF_BRAND: Content that discusses competitors in a disparaging way.
- VIOLENCE: Content that includes explicit threats, incitement of harm, or graphic descriptions of physical injury or violence.
- UNPROFESSIONAL: Content that is rude, dismissive, or lacks professionalism in customer service context. // ← NEW
- NONE: If no other classes are appropriate and the message is fine.
</output_classes>
```

**Lý do:**
- ✅ Phù hợp với **customer service context**
- ✅ Catch các response **thiếu chuyên nghiệp**
- ✅ Better cho agents tương tác với khách hàng

---

### **3. guardrails.ts - HotlineAI Helpers**

**✅ ADDED specific helpers cho HotlineAI**

```typescript
// Company name for HotlineAI
export const hotlineAICompanyName = 'Nhà xe Anh Huy Đất Cảng';

// Create guardrail specifically for HotlineAI
export function createHotlineAIGuardrail() {
  return createModerationGuardrail(hotlineAICompanyName);
}
```

**Usage (nếu muốn enable):**
```typescript
import { createHotlineAIGuardrail } from "@/app/agentConfigs/guardrails";

// In App.tsx
const guardrails = agentSetKey === 'hotlineAI' 
  ? [createHotlineAIGuardrail()] 
  : [];
```

**⚠️ Note:** Hiện tại **DISABLED** by default cho HotlineAI vì không cần thiết.

---

## 📊 **Impact:**

| Agent | Guardrails | Reason |
|-------|-----------|--------|
| `hotlineAI` | ❌ **Disabled** | Text-only, simple, instructions-based |
| `textOnly` | ❌ **Disabled** | Text-only, basic assistant |
| `customerServiceRetail` | ✅ **Enabled** | Complex, needs moderation |
| `chatSupervisor` | ✅ **Enabled** | Complex, needs moderation |
| `simpleHandoff` | ❌ **Disabled** | Simple agent |

---

## 💰 **Cost Savings:**

**Per request with guardrail:**
- Guardrail classifier call: ~500-1000 tokens
- Cost: ~$0.0006-0.0012 (gpt-4o-mini)

**For HotlineAI (text-only):**
- **100 requests/day** = ~$0.06-0.12 saved/day
- **1000 requests/day** = ~$0.60-1.20 saved/day
- **30,000 requests/month** = ~$18-36 saved/month

---

## 🚀 **Testing:**

```bash
npm run dev
```

**Test cases:**

1. **HotlineAI** - No guardrail overhead
```
✅ Faster responses
✅ Lower token usage
✅ No guardrail calls in logs
```

2. **customerServiceRetail** - Guardrail active
```
✅ Moderation checks working
✅ Guardrail events in logs
✅ Protection against inappropriate content
```

---

## 🔄 **Để enable guardrail cho HotlineAI (nếu cần):**

**Option A: Update App.tsx**
```typescript
const needsGuardrail = !isTextOnlyMode && 
  ['customerServiceRetail', 'chatSupervisor', 'hotlineAI'].includes(agentSetKey);
  //                                            ↑ Add this
```

**Option B: Specific logic**
```typescript
import { createHotlineAIGuardrail } from "@/app/agentConfigs/guardrails";

let guardrails = [];
if (agentSetKey === 'hotlineAI') {
  guardrails = [createHotlineAIGuardrail()];
} else if (needsGuardrail) {
  guardrails = [createModerationGuardrail(companyName)];
}
```

---

## ✅ **Kết luận:**

1. ✅ **Guardrails tắt** cho text-only agents (hotlineAI, textOnly)
2. ✅ **Enhanced categories** với UNPROFESSIONAL
3. ✅ **Helper functions** ready nếu cần enable sau
4. ✅ **Cost optimization** cho high-volume text-only usage
5. ✅ **No breaking changes** - các agent khác hoạt động bình thường

**Status:** ✅ **Production Ready**

