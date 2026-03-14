# HotlineAI RealtimeAgent Implementation Plan (Text-Only Version)

**Project**: Convert HotlineAI prompt → OpenAI RealtimeAgent SDK
**Mode**: Text-only (Voice integration later)
**Date**: 2025-11-13

---

## 1. Architecture Overview

### 1.1 Design Approach
- **Single Agent Architecture**: Một agent duy nhất xử lý tất cả flows (A/G/C/D/M/K)
- **Tool-based Data Access**: Tất cả data queries thông qua tools
- **Text-first**: Optimize cho text conversation, không cần TTS rules phức tạp
- **Stateless**: Agent không lưu trạng thái booking, chỉ thu thập thông tin

### 1.2 Component Breakdown

```
hotlineAI/
├── index.ts              # Export scenario + metadata
├── sampleData.ts         # Static data (routes, prices, FAQ, promotions)
├── tools.ts              # Function tools (6 tools)
└── hotlineAgent.ts       # Main RealtimeAgent với instructions
```

---

## 2. File Structure Details

### 2.1 Directory Creation
```bash
mkdir -p src/app/agentConfigs/hotlineAI
```

### 2.2 Files to Create
1. `sampleData.ts` - ~200 lines
2. `tools.ts` - ~300 lines  
3. `hotlineAgent.ts` - ~400 lines
4. `index.ts` - ~20 lines

---

## 3. Data Structures (`sampleData.ts`)

### 3.1 Route & Schedule Data

```typescript
export interface RouteSchedule {
  routeId: string;
  routeName: string;
  schedule: string | string[];
  frequency: string;
  duration: string;
  vehicleType: string;
  description?: string;
}

export const routeSchedules: RouteSchedule[] = [
  {
    routeId: "HP-HN",
    routeName: "Hải Phòng - Hà Nội",
    schedule: "hourly", // 05:00 - 21:00
    frequency: "Mỗi giờ 1 chuyến",
    duration: "1.5-2 giờ",
    vehicleType: "Xe limousine 11 chỗ",
    description: "Xe chạy từ 5h sáng đến 21h tối, đón trả tận nơi"
  },
  {
    routeId: "HN-HP",
    routeName: "Hà Nội - Hải Phòng",
    schedule: "hourly",
    frequency: "Mỗi giờ 1 chuyến",
    duration: "1.5-2 giờ",
    vehicleType: "Xe limousine 11 chỗ"
  },
  {
    routeId: "HP-HN-27",
    routeName: "Hải Phòng - Hà Nội (Xe 27 chỗ)",
    schedule: ["06:00"],
    frequency: "1 chuyến duy nhất",
    duration: "1.5-2 giờ",
    vehicleType: "Xe limousine 27 chỗ",
    description: "Chuyến cố định 6h sáng, giá đồng giá 230.000đ"
  },
  {
    routeId: "HN-CB",
    routeName: "Hà Nội - Cát Bà",
    schedule: ["08:00", "11:00", "13:00", "15:00"],
    frequency: "4 chuyến/ngày",
    duration: "2.5-3 giờ",
    vehicleType: "Xe limousine + Tàu cao tốc",
    description: "Đưa đón tận nơi Hà Nội, di chuyển bằng tàu cao tốc sang Cát Bà"
  },
  {
    routeId: "CB-HN",
    routeName: "Cát Bà - Hà Nội",
    schedule: ["08:50", "12:10", "14:10", "15:50"],
    frequency: "4 chuyến/ngày",
    duration: "2.5-3 giờ",
    vehicleType: "Tàu cao tốc + Xe limousine"
  }
];
```

### 3.2 Pricing Data

```typescript
export interface PricingInfo {
  routeId: string;
  vehicleType: "11seat" | "27seat";
  prices: {
    front?: number;    // 2 ghế đầu
    middle?: number;   // 6 ghế giữa
    back?: number;     // 3 ghế cuối
    standard?: number; // Giá đồng giá (xe 27 chỗ)
  };
}

export const pricingData: PricingInfo[] = [
  {
    routeId: "HP-HN",
    vehicleType: "11seat",
    prices: {
      front: 220000,
      middle: 250000,
      back: 230000
    }
  },
  {
    routeId: "HN-HP",
    vehicleType: "11seat",
    prices: {
      front: 220000,
      middle: 250000,
      back: 230000
    }
  },
  {
    routeId: "HP-HN-27",
    vehicleType: "27seat",
    prices: {
      standard: 230000
    }
  },
  {
    routeId: "HN-CB",
    vehicleType: "11seat",
    prices: {
      standard: 380000
    }
  },
  {
    routeId: "CB-HN",
    vehicleType: "11seat",
    prices: {
      standard: 380000
    }
  }
];
```

### 3.3 Surcharge Data

```typescript
export interface SurchargeZone {
  location: string;
  surcharge: number;
  note?: string;
}

export const pickupSurcharges: SurchargeZone[] = [
  // Miễn phí
  { location: "Quận Ba Đình", surcharge: 0 },
  { location: "Quận Hoàn Kiếm", surcharge: 0 },
  { location: "Quận Đống Đa", surcharge: 0 },
  { location: "Quận Hai Bà Trưng", surcharge: 0 },
  { location: "Quận Thanh Xuân", surcharge: 0 },
  { location: "Quận Cầu Giấy", surcharge: 0 },
  { location: "Quận Hoàng Mai", surcharge: 0 },
  { location: "Quận Long Biên", surcharge: 0, note: "Xa hơn AEON/Big C có phụ thu" },
  { location: "Quận Bắc Từ Liêm", surcharge: 0 },
  { location: "Quận Nam Từ Liêm", surcharge: 0 },
  { location: "Quận Hà Đông", surcharge: 0, note: "Xa hơn Bưu Điện Hà Đông có phụ thu" },
  { location: "Quận Tây Hồ", surcharge: 0 },
  { location: "Ocean Park 1", surcharge: 0 },
  { location: "Đường Gom Ocean Park 2", surcharge: 0 },
  { location: "Văn Phòng Cổ Linh", surcharge: 0 },
  { location: "Huyện Đông Anh", surcharge: 0, note: "Giới hạn: Đèn xanh Vĩnh Ngọc, Eurowindow" },
  
  // Có phụ thu
  { location: "Huyện Gia Lâm", surcharge: 50000 },
  { location: "Ecopark", surcharge: 50000 },
  { location: "Ocean Park 2", surcharge: 100000 },
  { location: "Ocean Park 3", surcharge: 100000 },
  { location: "Sân bay", surcharge: 230000, note: "Tối đa 3 người" }
];

export const dropoffSurcharges: SurchargeZone[] = [
  // Hải Phòng - Miễn phí
  { location: "Quận Hồng Bàng", surcharge: 0 },
  { location: "Quận Lê Chân", surcharge: 0 },
  { location: "Quận Ngô Quyền", surcharge: 0 },
  { location: "Quận Hải An", surcharge: 0 },
  { location: "Quận Kiến An", surcharge: 0, note: "Ngã ba Quán Trữ" },
  { location: "Quận Dương Kinh", surcharge: 0, note: "Ngã tư Quang Thanh hoặc KS Pearl River" },
  { location: "Quận Đồ Sơn", surcharge: 0, note: "Khách sạn Pearl River" },
  { location: "Huyện An Dương", surcharge: 0, note: "Việt Tiệp 2 hoặc Đình Vân Tra" },
  { location: "Huyện An Lão", surcharge: 0, note: "Ngã tư Quang Thanh" },
  { location: "Huyện Kiến Thụy", surcharge: 0, note: "Khách sạn Pearl River" },
  { location: "Huyện Thủy Nguyên", surcharge: 0, note: "Xa hơn Ngã tư Trịnh Xá, Ngã ba Đông Sơn có phụ thu" }
];
```

### 3.4 Promotion Data

```typescript
export interface Promotion {
  id: string;
  name: string;
  description: string;
  discount: number;
  conditions: string[];
  applicableRoutes?: string[];
}

export const promotions: Promotion[] = [
  {
    id: "early-bird-5am",
    name: "Ưu đãi chuyến 5h sáng",
    description: "Giảm giá đặc biệt cho chuyến 5h sáng Hải Phòng → Hà Nội",
    discount: 30000,
    conditions: [
      "Áp dụng cho chuyến 5h sáng từ Hải Phòng đi Hà Nội",
      "Giảm 30.000đ/vé một chiều",
      "Giảm 60.000đ/cặp vé khứ hồi (đi - về trong cùng một ngày)"
    ],
    applicableRoutes: ["HP-HN"]
  },
  {
    id: "round-trip-7days",
    name: "Vé khứ hồi trong 7 ngày",
    description: "Giảm giá khi mua vé khứ hồi",
    discount: 30000,
    conditions: [
      "Giảm 30.000đ/cặp vé khứ hồi",
      "Áp dụng cho vé trong vòng 7 ngày",
      "Thanh toán ngay 1 lần cả chiều đi và về",
      "Khi đi chuyến về, gọi tổng đài đọc mã đặt chỗ, không cần thanh toán lại"
    ]
  }
];
```

### 3.5 FAQ Data

```typescript
export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  keywords: string[];
}

export const faqData: FAQ[] = [
  {
    id: "faq-001",
    question: "Xe chạy từ mấy giờ đến mấy giờ?",
    answer: "Xe chạy từ 5h sáng đến 21h tối, cách 1 tiếng 1 chuyến. Xe sẽ đi đón trước giờ xuất bến tầm 30-45 phút ạ.",
    category: "schedule",
    keywords: ["giờ", "lịch", "chạy", "sớm nhất", "muộn nhất"]
  },
  {
    id: "faq-002",
    question: "Thời gian di chuyển mất bao lâu?",
    answer: "Xe chạy dao động từ 1 tiếng rưỡi đến 2 tiếng đến nơi ạ.",
    category: "schedule",
    keywords: ["thời gian", "lâu", "nhanh", "mất bao lâu"]
  },
  {
    id: "faq-003",
    question: "Giá vé từ Hải Phòng đi Hà Nội",
    answer: "Em gửi bảng giá xe Hải Phòng - Hà Nội limousine 11 chỗ:\n- 2 ghế đầu: 220.000đ/ghế\n- 6 ghế giữa: 250.000đ/ghế\n- 3 ghế cuối: 230.000đ/ghế\n\nAnh chị muốn chọn ghế nào ạ?",
    category: "pricing",
    keywords: ["giá", "vé", "tiền", "bao nhiêu", "hải phòng", "hà nội"]
  },
  {
    id: "faq-004",
    question: "Giá vé từ Hà Nội đi Cát Bà",
    answer: "Giá vé tuyến Hà Nội - Cát Bà là 380.000đ/vé với xe limousine. Bên em có đưa đón tận nơi tại cả Hà Nội và Cát Bà. Di chuyển sang Cát Bà bằng tàu cao tốc mất khoảng 7-10 phút ạ.",
    category: "pricing",
    keywords: ["giá", "cát bà", "hà nội", "tàu"]
  },
  {
    id: "faq-005",
    question: "Lịch xe Hà Nội - Cát Bà",
    answer: "Hà Nội - Cát Bà có các chuyến: 8 giờ, 11 giờ, 13 giờ, 15 giờ ạ.",
    category: "schedule",
    keywords: ["lịch", "cát bà", "mấy giờ", "chuyến"]
  },
  {
    id: "faq-006",
    question: "Lịch xe Cát Bà - Hà Nội",
    answer: "Cát Bà - Hà Nội có các chuyến: 8 giờ 50, 12 giờ 10, 14 giờ 10, 15 giờ 50 ạ.",
    category: "schedule",
    keywords: ["lịch", "cát bà", "hà nội", "về", "mấy giờ"]
  },
  {
    id: "faq-007",
    question: "Xe có đưa đón tận nơi không?",
    answer: "Có ạ, bên em đón trả tận nơi nội thành Hà Nội, Hải Phòng và một số điểm ngoại thành. Lái xe sẽ chủ động liên hệ trước 30-45 phút trước chuyến đi ạ.",
    category: "service",
    keywords: ["đón", "trả", "tận nơi", "liên hệ", "lái xe"]
  },
  {
    id: "faq-008",
    question: "Xe 27 chỗ chạy chuyến nào?",
    answer: "Xe limousine 27 chỗ có chuyến cố định 6 giờ sáng từ Hải Phòng đi Hà Nội, giá đồng giá 230.000đ/ghế. Xe vẫn đón trả tận nơi như xe 11 chỗ ạ.",
    category: "vehicle",
    keywords: ["27 chỗ", "xe lớn", "6 giờ"]
  },
  {
    id: "faq-009",
    question: "Mang hành lý có phụ thu không?",
    answer: "Mỗi khách hàng được mang theo 1 kiện hành lý như vali hoặc balo miễn phí. Nếu phát sinh nhiều hơn 1 hành lý, nhà xe phụ thu 50.000đ/hành lý ạ.",
    category: "policy",
    keywords: ["hành lý", "vali", "phụ thu", "mang"]
  },
  {
    id: "faq-010",
    question: "Có được mang thú cưng không?",
    answer: "Khách hàng có thể mang chó bỏ vào balo chuyên dụng dành cho thú cưng. Tuy nhiên, hiện tại nhà em chưa hỗ trợ chở mèo khi đi cùng. Mong anh chị thông cảm ạ.",
    category: "policy",
    keywords: ["chó", "mèo", "thú cưng", "pet"]
  },
  {
    id: "faq-011",
    question: "Nhà xe có xuất vé/hóa đơn không?",
    answer: "Có ạ, nhà xe có xuất vé đầy đủ cho khách hàng. Nếu khách hàng cần xuất hóa đơn VAT thì sẽ cộng thêm 8% vào giá vé ạ.",
    category: "policy",
    keywords: ["vé", "hóa đơn", "VAT", "xuất"]
  },
  {
    id: "faq-012",
    question: "Văn phòng Hà Nội ở đâu?",
    answer: "Văn phòng Hà Nội địa chỉ ở 114 Ngọc Trì, Cổ Linh, Quán Cà Phê Bảo Linh ạ.",
    category: "info",
    keywords: ["văn phòng", "địa chỉ", "hà nội", "cổ linh"]
  }
];
```

---

## 4. Tools Implementation (`tools.ts`)

### 4.1 Tool #1: lookupRoutePrice

```typescript
export const lookupRoutePriceTool = tool({
  name: 'lookupRoutePrice',
  description: 'Tra cứu giá vé theo tuyến đường và loại ghế. Sử dụng khi khách hỏi về giá vé.',
  parameters: {
    type: 'object',
    properties: {
      route: {
        type: 'string',
        enum: ['HP-HN', 'HN-HP', 'HP-HN-27', 'HN-CB', 'CB-HN'],
        description: 'Tuyến đường: HP-HN (Hải Phòng-Hà Nội), HN-HP (Hà Nội-Hải Phòng), HP-HN-27 (xe 27 chỗ), HN-CB (Hà Nội-Cát Bà), CB-HN (Cát Bà-Hà Nội)'
      }
    },
    required: ['route'],
    additionalProperties: false
  },
  execute: async (input: any) => {
    const { route } = input as { route: string };
    const pricing = pricingData.find(p => p.routeId === route);
    
    if (!pricing) {
      return { error: 'Không tìm thấy thông tin giá vé cho tuyến này.' };
    }
    
    return {
      route: route,
      vehicleType: pricing.vehicleType,
      prices: pricing.prices,
      formatted: formatPriceResponse(pricing)
    };
  }
});

function formatPriceResponse(pricing: PricingInfo): string {
  if (pricing.vehicleType === '27seat') {
    return `Xe limousine 27 chỗ: ${pricing.prices.standard?.toLocaleString('vi-VN')}đ/ghế (đồng giá)`;
  }
  
  const parts: string[] = [];
  if (pricing.prices.front) parts.push(`2 ghế đầu: ${pricing.prices.front.toLocaleString('vi-VN')}đ/ghế`);
  if (pricing.prices.middle) parts.push(`6 ghế giữa: ${pricing.prices.middle.toLocaleString('vi-VN')}đ/ghế`);
  if (pricing.prices.back) parts.push(`3 ghế cuối: ${pricing.prices.back.toLocaleString('vi-VN')}đ/ghế`);
  if (pricing.prices.standard) parts.push(`Giá: ${pricing.prices.standard.toLocaleString('vi-VN')}đ/vé`);
  
  return `Xe limousine 11 chỗ:\n${parts.join('\n')}`;
}
```

### 4.2 Tool #2: lookupSchedule

```typescript
export const lookupScheduleTool = tool({
  name: 'lookupSchedule',
  description: 'Tra cứu lịch chạy xe theo tuyến. Sử dụng khi khách hỏi về lịch xe, giờ chạy.',
  parameters: {
    type: 'object',
    properties: {
      route: {
        type: 'string',
        enum: ['HP-HN', 'HN-HP', 'HP-HN-27', 'HN-CB', 'CB-HN'],
        description: 'Tuyến đường cần tra cứu'
      }
    },
    required: ['route'],
    additionalProperties: false
  },
  execute: async (input: any) => {
    const { route } = input as { route: string };
    const schedule = routeSchedules.find(s => s.routeId === route);
    
    if (!schedule) {
      return { error: 'Không tìm thấy thông tin lịch chạy cho tuyến này.' };
    }
    
    return {
      routeName: schedule.routeName,
      schedule: schedule.schedule,
      frequency: schedule.frequency,
      duration: schedule.duration,
      vehicleType: schedule.vehicleType,
      description: schedule.description,
      formatted: formatScheduleResponse(schedule)
    };
  }
});

function formatScheduleResponse(schedule: RouteSchedule): string {
  let response = `Tuyến ${schedule.routeName}:\n`;
  
  if (schedule.schedule === 'hourly') {
    response += `- Lịch chạy: Từ 5h sáng đến 21h tối, ${schedule.frequency}\n`;
  } else if (Array.isArray(schedule.schedule)) {
    response += `- Các chuyến: ${schedule.schedule.join(', ')}\n`;
  }
  
  response += `- Thời gian: ${schedule.duration}\n`;
  response += `- Loại xe: ${schedule.vehicleType}`;
  
  if (schedule.description) {
    response += `\n- Ghi chú: ${schedule.description}`;
  }
  
  return response;
}
```

### 4.3 Tool #3: getNextAvailableTrip

```typescript
export const getNextAvailableTripTool = tool({
  name: 'getNextAvailableTrip',
  description: 'Tìm chuyến xe gần nhất/sớm nhất từ thời điểm hiện tại. Áp dụng logic khung phút: phút [00-10] báo chuyến tiếp theo, phút [11-59] chuyển tư vấn viên.',
  parameters: {
    type: 'object',
    properties: {
      route: {
        type: 'string',
        enum: ['HP-HN', 'HN-HP', 'HP-HN-27', 'HN-CB', 'CB-HN'],
        description: 'Tuyến đường'
      },
      currentTime: {
        type: 'string',
        description: 'Thời gian hiện tại format HH:mm (ví dụ: "14:35")'
      }
    },
    required: ['route', 'currentTime'],
    additionalProperties: false
  },
  execute: async (input: any) => {
    const { route, currentTime } = input as { route: string; currentTime: string };
    
    // Parse current time
    const [hours, minutes] = currentTime.split(':').map(Number);
    const currentMinutes = hours * 60 + minutes;
    
    const schedule = routeSchedules.find(s => s.routeId === route);
    if (!schedule) {
      return { error: 'Không tìm thấy thông tin lịch chạy.' };
    }
    
    // Logic khung phút
    const minuteInHour = minutes;
    
    if (minuteInHour >= 11 && minuteInHour <= 59) {
      // Phút [11-59]: Chuyển tư vấn viên
      return {
        needsTransfer: true,
        message: 'Cần chuyển tư vấn viên để xử lý chuyến gần nhất'
      };
    }
    
    // Phút [00-10]: Tính chuyến tiếp theo
    let nextTrip = '';
    
    if (schedule.schedule === 'hourly') {
      // Tuyến chạy mỗi giờ: làm tròn lên giờ tiếp theo
      let nextHour = hours;
      if (minutes > 10) {
        nextHour += 1;
      } else if (minutes > 0) {
        nextHour += 1;
      }
      
      if (nextHour <= 21) {
        nextTrip = `${String(nextHour).padStart(2, '0')}:00`;
      } else {
        // Sau 21h, báo chuyến sớm nhất ngày mai
        nextTrip = '05:00 ngày mai';
      }
      
      if (currentMinutes < 5 * 60) {
        // Trước 5h sáng
        nextTrip = '05:00';
      }
      
    } else if (Array.isArray(schedule.schedule)) {
      // Tuyến có giờ cố định
      const scheduleMinutes = schedule.schedule.map(time => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
      });
      
      const nextSchedule = scheduleMinutes.find(sm => sm > currentMinutes);
      
      if (nextSchedule) {
        const h = Math.floor(nextSchedule / 60);
        const m = nextSchedule % 60;
        nextTrip = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      } else {
        // Không còn chuyến hôm nay
        nextTrip = `${schedule.schedule[0]} ngày mai`;
      }
    }
    
    return {
      nextTrip: nextTrip,
      route: schedule.routeName,
      needsTransfer: false,
      formatted: `Chuyến gần nhất là chuyến ${nextTrip} ạ.`
    };
  }
});
```

### 4.4 Tool #4: checkPromotion

```typescript
export const checkPromotionTool = tool({
  name: 'checkPromotion',
  description: 'Kiểm tra các chương trình khuyến mãi có sẵn. Sử dụng khi khách hỏi về giảm giá, ưu đãi.',
  parameters: {
    type: 'object',
    properties: {
      route: {
        type: 'string',
        enum: ['HP-HN', 'HN-HP', 'HN-CB', 'CB-HN', 'all'],
        description: 'Tuyến đường, hoặc "all" để xem tất cả khuyến mãi'
      },
      tripType: {
        type: 'string',
        enum: ['oneWay', 'roundTrip', 'any'],
        description: 'Loại vé: một chiều, khứ hồi, hoặc bất kỳ'
      }
    },
    required: ['route', 'tripType'],
    additionalProperties: false
  },
  execute: async (input: any) => {
    const { route, tripType } = input as { route: string; tripType: string };
    
    let applicablePromotions = promotions.filter(promo => {
      // Filter by route
      if (route !== 'all' && promo.applicableRoutes && !promo.applicableRoutes.includes(route)) {
        return false;
      }
      
      // Filter by trip type
      if (tripType === 'oneWay' && promo.id === 'round-trip-7days') {
        return false;
      }
      if (tripType === 'roundTrip' && promo.id === 'early-bird-5am') {
        return false; // Chuyến 5h có khuyến mãi riêng cho khứ hồi
      }
      
      return true;
    });
    
    if (applicablePromotions.length === 0) {
      return {
        hasPromotion: false,
        message: 'Hiện tại không có chương trình khuyến mãi phù hợp.'
      };
    }
    
    return {
      hasPromotion: true,
      promotions: applicablePromotions,
      formatted: formatPromotionResponse(applicablePromotions)
    };
  }
});

function formatPromotionResponse(promotions: Promotion[]): string {
  if (promotions.length === 0) return '';
  
  let response = 'Các chương trình ưu đãi hiện có:\n\n';
  
  promotions.forEach((promo, index) => {
    response += `${index + 1}. ${promo.name}\n`;
    response += `   - ${promo.description}\n`;
    response += `   - Giảm: ${promo.discount.toLocaleString('vi-VN')}đ\n`;
    response += `   - Điều kiện:\n`;
    promo.conditions.forEach(condition => {
      response += `     + ${condition}\n`;
    });
    response += '\n';
  });
  
  return response.trim();
}
```

### 4.5 Tool #5: calculateSurcharge

```typescript
export const calculateSurchargeTool = tool({
  name: 'calculateSurcharge',
  description: 'Tính phụ thu theo điểm đón/trả. Sử dụng khi khách hỏi về phụ thu hoặc cung cấp địa điểm cụ thể.',
  parameters: {
    type: 'object',
    properties: {
      locationType: {
        type: 'string',
        enum: ['pickup', 'dropoff'],
        description: 'Loại địa điểm: pickup (đón) hoặc dropoff (trả)'
      },
      location: {
        type: 'string',
        description: 'Tên địa điểm/khu vực (ví dụ: "Ecopark", "Ocean Park 2", "Quận Đống Đa")'
      }
    },
    required: ['locationType', 'location'],
    additionalProperties: false
  },
  execute: async (input: any) => {
    const { locationType, location } = input as { locationType: string; location: string };
    
    const surchargeList = locationType === 'pickup' ? pickupSurcharges : dropoffSurcharges;
    
    // Tìm exact match hoặc partial match
    let found = surchargeList.find(s => 
      s.location.toLowerCase() === location.toLowerCase()
    );
    
    if (!found) {
      // Try partial match
      found = surchargeList.find(s => 
        s.location.toLowerCase().includes(location.toLowerCase()) ||
        location.toLowerCase().includes(s.location.toLowerCase())
      );
    }
    
    if (!found) {
      return {
        found: false,
        message: `Không tìm thấy thông tin phụ thu cho địa điểm "${location}". Vui lòng cung cấp địa điểm cụ thể hơn.`
      };
    }
    
    let message = `${found.location}: `;
    if (found.surcharge === 0) {
      message += 'Miễn phí phụ thu';
    } else {
      message += `Phụ thu ${found.surcharge.toLocaleString('vi-VN')}đ`;
    }
    
    if (found.note) {
      message += `\n(${found.note})`;
    }
    
    return {
      found: true,
      location: found.location,
      surcharge: found.surcharge,
      note: found.note,
      message: message
    };
  }
});
```

### 4.6 Tool #6: lookupFAQ

```typescript
export const lookupFAQTool = tool({
  name: 'lookupFAQ',
  description: 'Tìm kiếm câu trả lời từ FAQ dựa trên câu hỏi của khách. Sử dụng khi khách hỏi thông tin chung.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Câu hỏi hoặc từ khóa cần tìm kiếm'
      },
      category: {
        type: 'string',
        enum: ['schedule', 'pricing', 'service', 'vehicle', 'policy', 'info', 'any'],
        description: 'Danh mục FAQ (tùy chọn)'
      }
    },
    required: ['query'],
    additionalProperties: false
  },
  execute: async (input: any) => {
    const { query, category = 'any' } = input as { query: string; category?: string };
    
    // Simple keyword matching
    const queryLower = query.toLowerCase();
    
    let results = faqData.filter(faq => {
      // Filter by category
      if (category !== 'any' && faq.category !== category) {
        return false;
      }
      
      // Check if query matches question or keywords
      const matchQuestion = faq.question.toLowerCase().includes(queryLower);
      const matchKeywords = faq.keywords.some(kw => 
        queryLower.includes(kw.toLowerCase())
      );
      
      return matchQuestion || matchKeywords;
    });
    
    // Sort by relevance (simple scoring)
    results.sort((a, b) => {
      const scoreA = a.question.toLowerCase().includes(queryLower) ? 2 : 1;
      const scoreB = b.question.toLowerCase().includes(queryLower) ? 2 : 1;
      return scoreB - scoreA;
    });
    
    if (results.length === 0) {
      return {
        found: false,
        message: 'Không tìm thấy thông tin phù hợp. Anh chị có thể hỏi cụ thể hơn không ạ?'
      };
    }
    
    // Return top 3 results
    return {
      found: true,
      results: results.slice(0, 3),
      topAnswer: results[0].answer,
      formatted: formatFAQResponse(results.slice(0, 3))
    };
  }
});

function formatFAQResponse(faqs: FAQ[]): string {
  if (faqs.length === 1) {
    return faqs[0].answer;
  }
  
  let response = '';
  faqs.forEach((faq, index) => {
    response += `${faq.answer}\n\n`;
  });
  
  return response.trim();
}
```

---

## 5. Main Agent Instructions (`hotlineAgent.ts`)

### 5.1 Instructions Structure

```typescript
const instructions = `
# IDENTITY & ROLE
Bạn là nhân viên tổng đài thông minh HotlineAI của Nhà xe Anh Huy Đất Cảng.

Nhiệm vụ: Hỗ trợ khách hàng đặt vé, tra cứu thông tin và định hướng cuộc gọi một cách chuyên nghiệp.

Phục vụ các tuyến:
- Hải Phòng ⇄ Hà Nội
- Hà Nội ⇄ Cát Bà

# LỜI CHÀO BẮT BUỘC
Mọi cuộc hội thoại PHẢI bắt đầu bằng: "Dạ Nhà xe Anh Huy Đất Cảng xin nghe"

# NGUYÊN TẮC CỐT LÕI

## 1. KHÔNG LẶP LẠI THÔNG TIN
- Chỉ ghi nhận ngắn gọn, không xác nhận lại toàn bộ
- Tạo cảm giác hội thoại tự nhiên, không máy móc
- Chuyển thẳng sang câu hỏi tiếp theo

## 2. KHÔNG HỎI LẠI THÔNG TIN ĐÃ CÓ
- Nếu khách đã nói điểm đón → KHÔNG hỏi lại
- Nếu khách đã nói số người → KHÔNG hỏi lại
- Nếu khách đã nói ngày giờ → KHÔNG hỏi lại
- Suy nghĩ kỹ trước khi hỏi để tránh hỏi lại

## 3. XỬ LÝ THÔNG TIN THÔNG MINH
- Khách nói "3 vé" = 3 người đi
- Khách nói "sáng mai 9 giờ" = đã có ngày và giờ
- Khách nói "đi ngay/đi luôn/bây giờ" = không hỏi giờ nữa
- Khách nói "về Hải Phòng" = thiếu điểm đón, hỏi từ đâu
- Khách nói "từ Hà Nội" = thiếu điểm đến, hỏi về đâu

## 4. LINH HOẠT VÀ THÍCH ỨNG
- Khách cung cấp thông tin không theo thứ tự → vẫn ghi nhận được
- Biết ưu tiên thông tin quan trọng
- Bỏ qua câu hỏi đã được trả lời
- Trả lời linh hoạt dựa trên thông tin đang có

# CÔNG CỤ HỖ TRỢ (TOOLS)

Bạn có 6 công cụ để tra cứu thông tin:

1. **lookupRoutePrice**: Tra giá vé theo tuyến
2. **lookupSchedule**: Tra lịch chạy xe
3. **getNextAvailableTrip**: Tìm chuyến gần nhất từ thời gian hiện tại
4. **checkPromotion**: Kiểm tra khuyến mãi
5. **calculateSurcharge**: Tính phụ thu theo địa điểm
6. **lookupFAQ**: Tra cứu FAQ

Luôn sử dụng tools khi cần tra cứu thông tin chính xác. KHÔNG bịa đặt thông tin.

# LUỒNG HỘI THOẠI

## Flow A - Đặt Vé (Ưu tiên cao nhất)

Các bước thu thập thông tin:

**A1. Tuyến đi (PHẢI ĐỦ điểm đón + điểm trả)**
- Hỏi: "Anh chị muốn đi từ đâu tới đâu ạ? Mình cho em xin điểm đón trả cụ thể với ạ"
- Nếu thiếu điểm đón: "Anh chị cho em xin điểm đón cụ thể ạ"
- Nếu thiếu điểm trả: "Mình về đâu ạ?"

**A2. Ngày & Giờ**
- Hỏi: "Mình đi vào ngày nào và tầm mấy giờ ạ?"
- Nếu khách nói "đi luôn/đi ngay/bây giờ" → KHÔNG hỏi giờ, ghi nhận "đi ngay"
- Nếu khách nói "hôm nay/ngày nay/sáng mai/chiều nay/tối nay" → đã có ngày, không hỏi lại

**A3. Số người**
- Hỏi: "Chuyến này mình đi mấy người ạ?"
- Skip nếu khách đã nói số vé/số ghế/số người

**A4. Vị trí ghế**
- Xe 11 chỗ: "Mình muốn ngồi ghế nào ạ? Bên em có 2 ghế đầu, 6 ghế giữa và 3 ghế cuối ạ"
- Xe 27 chỗ: "Mình muốn ngồi ghế nào ạ"

Xử lý đặc biệt:
- "Ghế nào cũng được" → ghi nhận y như vậy
- "Ghế đầu/phía trên" → hiểu là ghế đầu và giữa
- "Ghế sau/phía cuối" → hiểu là ghế cuối và giữa
- "Không ngồi cùng lái xe" → không muốn ghế đầu
- Khách đi 1 người nói "6 ghế giữa" → hiểu là 1 ghế giữa

**A5. Tên khách**
- Hỏi: "Mình cho em xin tên để em hoàn tất thông tin đặt vé nhé ạ"

**A6. Gợi mở trước kết thúc**
- "Em đã ghi nhận thông tin đặt vé. Anh chị để ý máy để bên em gọi lại xác nhận vé cho mình. Ngoài ra anh chị còn cần em hỗ trợ thông tin gì không ạ?"
- Câu "Em đã ghi nhận..." CHỈ dùng ở bước này, KHÔNG dùng ở các bước trước

**A7. Kết thúc**
- "Em cảm ơn anh chị. Em chào anh chị."

### Quy tắc quan trọng Flow A:
- Cuộc gọi CHỈ được kết thúc khi đã có đủ: A1, A2, A3, A4, A5
- Mỗi câu hỏi chỉ hỏi 1 thông tin duy nhất
- KHÔNG gộp nhiều câu hỏi trong 1 câu
- KHÔNG xin số điện thoại (hệ thống đã có)
- KHÔNG cam kết giữ chỗ/đã đặt vé

## Flow G - Hỏi Thông Tin (FAQ)

Khi khách hỏi thông tin:
1. Sử dụng tools phù hợp để tra cứu
2. Trả lời chính xác dựa trên kết quả tool
3. Nếu khách chưa nói rõ ý định: "Anh chị cần em hỗ trợ gì thêm không ạ?"
4. Nếu khách từ chối: "Cảm ơn anh chị đã gọi tới nhà xe Anh Huy Đất Cảng. Nếu cần hỗ trợ thêm, anh chị cứ liên hệ lại tổng đài giúp em. Em chào anh chị ạ"

## Flow C - Kiểm Tra/Đổi/Hủy Vé

Khi khách muốn đổi/kiểm tra vé:
1. Xác nhận: "Anh chị cần đổi vé, hủy vé hay kiểm tra lại thông tin gì ạ?"
2. Ghi nhận thông tin thay đổi
3. "Em đã ghi nhận thông tin. Anh chị để ý máy để bên em gọi lại xác nhận cho mình nhé. Em cảm ơn anh chị. Em chào anh chị."

## Flow M - Gửi Hàng

Khi khách hỏi về gửi hàng:
1. M1: "Mình cần gửi hàng từ đâu về đâu ạ?"
2. M2: "Anh chị muốn gửi hàng vào ngày nào và khoảng mấy giờ ạ?"
3. M3: "Em ghi nhận xong rồi ạ. Trước khi tới lấy hàng tài xế sẽ liên hệ mình. Em chào anh chị."

## Flow K - Khiếu Nại

Khi khách khiếu nại:
1. K1: "Em rất xin lỗi về sự bất tiện. Anh chị có thể cho em biết rõ hơn vấn đề gặp phải không ạ?"
2. K2: "Em ghi nhận thông tin của anh chị và sẽ chuyển cho bộ phận phụ trách xử lý ngay ạ"
3. K3: "Em sẽ nhờ nhân viên liên hệ lại để giải quyết chi tiết. Cảm ơn anh chị đã phản hồi cho nhà xe ạ. Anh chị còn cần hỗ trợ vấn đề gì khác không ạ?"

## Flow D - Ý Định Không Rõ

Nếu khách nói mơ hồ:
1. D1: "Xin lỗi anh chị, vừa rồi tín hiệu đường truyền hơi kém, em chưa nghe rõ. Anh chị nhắc lại giúp em với ạ"
2. Nếu vẫn không rõ sau 2 lần hỏi: "Em sẽ nhờ nhân viên gọi lại hỗ trợ cụ thể hơn cho anh chị sau nhé. Em chào anh chị."

## Xử Lý Không Phải Đặt Vé / Không Xử Lý Được

Nếu vượt quá khả năng xử lý:
"Em sẽ chuyển thông tin cho nhân viên tư vấn gọi lại quý khách trong vòng 5 phút. Cảm ơn quý khách đã sử dụng dịch vụ của bên em ạ."

# XỬ LÝ ĐẶC BIỆT

## Chuyến Gần Nhất / Chuyến Sớm Nhất

Khi khách hỏi "chuyến gần nhất" hoặc "chuyến sớm nhất":
1. Sử dụng tool getNextAvailableTrip với thời gian hiện tại
2. Nếu tool trả về needsTransfer=true: "Em xin phép chuyển cuộc gọi cho tư vấn viên để liên hệ lại ngay hỗ trợ chuyến gần nhất cho mình. Anh chị vui lòng đợi một chút nhé. Em cảm ơn anh chị ạ."
3. Nếu có chuyến cụ thể: Báo giờ và hỏi "Anh chị muốn đi chuyến này không ạ?" → tiếp tục thu thập thông tin còn thiếu

## Khuyến Mãi

### Chuyến 5h Sáng (HP → HN)
Khi khách hỏi về chuyến 5h sáng HOẶC đặt vé chuyến 5h:
- Chủ động thông báo: "Chuyến 5 giờ sáng từ Hải Phòng đi Hà Nội đang áp dụng chương trình giảm giá đặc biệt. Nếu anh chị đi khứ hồi trong cùng một ngày sẽ được giảm 60.000đ cho cặp vé. Nếu chưa chắc chắn chiều về, vẫn được giảm 30.000đ cho vé chiều đi. Anh chị quay về trong ngày hay đi một chiều ạ?"

### Vé Khứ Hồi 7 Ngày
Khi khách hỏi về vé khứ hồi:
- Thông báo: "Chương trình mua vé khứ hồi bên em có ưu đãi giảm 30.000đ cho cặp vé khứ hồi trong vòng 7 ngày ạ. Anh chị thanh toán một lần cho cả chiều đi và về qua tổng đài hoặc có thể lên xe thanh toán cho lái xe. Khi đi chiều về, anh chị chỉ cần gọi tổng đài và đọc mã đặt chỗ, không cần thanh toán thêm cho lái xe ạ."

## Xe 27 Chỗ

Xe limousine 27 chỗ chỉ có 1 chuyến duy nhất: 6h sáng Hải Phòng → Hà Nội
- Không có chuyến ngược lại
- Giá đồng giá: 230.000đ/ghế
- Vẫn đón trả tận nơi

Nếu khách đặt vé khứ hồi mà chỉ có chiều đi là xe 27 chỗ:
- Xác nhận: "Mình muốn sáng đi xe 27 chỗ, về đi xe 11 chỗ đúng không ạ?"
- Tính giá: giá xe 27 chỗ + giá xe 11 chỗ (KHÔNG nhân đôi xe 27 chỗ)

## Địa Điểm Đặc Biệt

- KCN Tràng Duệ ~17:00: Có thể đi chuyến 17:00 (cách bến 15 phút)
- Cầu vượt Lương Quán về 233 Chiến Thắng: Vẫn trong tuyến
- Từ Mỹ Đình: Ghi nhận điểm đón là Mỹ Đình, không ghi nhận điểm khác

# PHONG CÁCH GIAO TIẾP

## Tone
- Thân thiện, lịch sự, chuyên nghiệp
- Tự nhiên như nhân viên thật, không máy móc
- Kiên nhẫn và thấu hiểu
- KHÔNG xưng "Dạ", "Dạ vâng" ở đầu câu (trừ lời chào)

## Ngôn ngữ
- Tiếng Việt chuẩn, dễ hiểu
- Tránh từ viết tắt, từ lóng
- Text-friendly (có thể dùng bullet points khi cần)

## Empathy
- Ghi nhận cảm xúc (bức xúc, vội vàng, lo lắng)
- Thấu hiểu và trấn an
- Nếu khách cáu/khó chịu: "Em sẽ nhờ nhân viên gọi lại ngay để hỗ trợ mình ạ. Em chào anh chị."

# GHI NHỚ

## Luôn Nhớ
- Lời chào bắt buộc ở đầu
- Không lặp lại thông tin
- Không hỏi lại điều đã biết
- Mỗi câu hỏi = 1 thông tin
- Sử dụng tools để tra cứu chính xác
- Không bịa đặt thông tin

## Không Bao Giờ
- Cam kết đã đặt vé thành công
- Xin số điện thoại
- Hỏi lại thông tin khách đã cung cấp
- Bỏ qua câu hỏi của khách
- Bịa đặt giá vé, lịch chạy

# VÍ DỤ HỘI THOẠI

## Ví dụ 1: Đặt vé đơn giản

User: Cho tôi đặt 3 vé sáng mai 9 giờ từ Hải Phòng về Hà Nội
Assistant: Dạ Nhà xe Anh Huy Đất Cảng xin nghe. Anh chị cho em xin điểm đón trả cụ thể ạ?
User: Đón ở ga Hải Phòng, trả ở Mỹ Đình
Assistant: Mình muốn ngồi ghế nào ạ? Bên em có 2 ghế đầu, 6 ghế giữa và 3 ghế cuối ạ.
User: 3 ghế giữa
Assistant: Mình cho em xin tên để em hoàn tất thông tin đặt vé nhé ạ?
User: Nguyễn Văn A
Assistant: Em đã ghi nhận thông tin đặt vé. Anh chị để ý máy để bên em gọi lại xác nhận vé cho mình. Ngoài ra anh chị còn cần em hỗ trợ thông tin gì không ạ?
User: Không
Assistant: Em cảm ơn anh chị. Em chào anh chị.

## Ví dụ 2: Hỏi giá vé

User: Giá vé từ Hải Phòng đi Hà Nội bao nhiêu?
Assistant: Dạ Nhà xe Anh Huy Đất Cảng xin nghe. [Call lookupRoutePrice tool]
Assistant: Em gửi bảng giá xe Hải Phòng - Hà Nội limousine 11 chỗ ạ:
- 2 ghế đầu: 220.000đ/ghế
- 6 ghế giữa: 250.000đ/ghế  
- 3 ghế cuối: 230.000đ/ghế
Anh chị cần em hỗ trợ gì thêm không ạ?

## Ví dụ 3: Hỏi chuyến gần nhất

User: Chuyến gần nhất từ Hải Phòng đi Hà Nội là mấy giờ?
Assistant: Dạ Nhà xe Anh Huy Đất Cảng xin nghe. [Call getNextAvailableTrip tool]
Assistant: Chuyến gần nhất là chuyến 15:00 ạ. Anh chị muốn đi chuyến này không ạ?

## Ví dụ 4: Thông tin không theo thứ tự (Quan trọng)

User: Cho tôi 2 vé chiều nay 5 giờ
Assistant: Dạ Nhà xe Anh Huy Đất Cảng xin nghe. Anh chị muốn đi từ đâu tới đâu ạ? Mình cho em xin điểm đón trả cụ thể với ạ.
User: Từ Mỹ Đình về Hải Phòng
Assistant: Anh chị muốn về đâu Hải Phòng ạ?
User: Trung tâm thành phố
Assistant: Mình muốn ngồi ghế nào ạ? Bên em có 2 ghế đầu, 6 ghế giữa và 3 ghế cuối ạ.
User: Ghế nào cũng được
Assistant: Mình cho em xin tên để em hoàn tất thông tin đặt vé nhé ạ?
User: Mai
Assistant: Em đã ghi nhận thông tin đặt vé. Anh chị để ý máy để bên em gọi lại xác nhận vé cho mình. Ngoài ra anh chị còn cần em hỗ trợ thông tin gì không ạ?
`;

export const hotlineAgent = new RealtimeAgent({
  name: 'hotlineAI',
  voice: 'sage',
  instructions: instructions,
  handoffs: [],
  tools: [
    lookupRoutePriceTool,
    lookupScheduleTool,
    getNextAvailableTripTool,
    checkPromotionTool,
    calculateSurchargeTool,
    lookupFAQTool
  ],
  handoffDescription: 'Trợ lý tổng đài thông minh cho Nhà xe Anh Huy Đất Cảng'
});
```

---

## 6. Index File (`index.ts`)

```typescript
import { hotlineAgent } from './hotlineAgent';

export const hotlineAIScenario = [hotlineAgent];

// Mark as text-only
export const hotlineAIMetadata = {
  isTextOnly: true
};

export default hotlineAIScenario;
```

---

## 7. Integration (`agentConfigs/index.ts`)

Update file `/src/app/agentConfigs/index.ts`:

```typescript
import { simpleHandoffScenario } from './simpleHandoff';
import { customerServiceRetailScenario } from './customerServiceRetail';
import { chatSupervisorScenario } from './chatSupervisor';
import { textOnlyScenario, textOnlyMetadata } from './textOnly';
import { hotlineAIScenario, hotlineAIMetadata } from './hotlineAI';  // ADD THIS

import type { RealtimeAgent } from '@openai/agents/realtime';

export const allAgentSets: Record<string, RealtimeAgent[]> = {
  simpleHandoff: simpleHandoffScenario,
  customerServiceRetail: customerServiceRetailScenario,
  chatSupervisor: chatSupervisorScenario,
  textOnly: textOnlyScenario,
  hotlineAI: hotlineAIScenario,  // ADD THIS
};

export const agentSetMetadata: Record<string, { isTextOnly?: boolean }> = {
  textOnly: textOnlyMetadata,
  hotlineAI: hotlineAIMetadata,  // ADD THIS
};

export const defaultAgentSetKey = 'hotlineAI';  // CHANGE THIS (optional)
```

---

## 8. Implementation Checklist

### Phase 1: Data Layer (Est. 2-3 hours)
- [ ] Create `hotlineAI` folder
- [ ] Implement `sampleData.ts`
  - [ ] `routeSchedules` array (5 routes)
  - [ ] `pricingData` array
  - [ ] `pickupSurcharges` array (~20 entries)
  - [ ] `dropoffSurcharges` array (~10 entries)
  - [ ] `promotions` array (2 promotions)
  - [ ] `faqData` array (~12 FAQs)
  - [ ] Export all interfaces

### Phase 2: Tools Layer (Est. 3-4 hours)
- [ ] Implement `tools.ts`
  - [ ] `lookupRoutePriceTool` + helper function
  - [ ] `lookupScheduleTool` + helper function
  - [ ] `getNextAvailableTripTool` (khung phút logic)
  - [ ] `checkPromotionTool` + helper function
  - [ ] `calculateSurchargeTool`
  - [ ] `lookupFAQTool` + helper function
  - [ ] Test each tool independently

### Phase 3: Agent Layer (Est. 2-3 hours)
- [ ] Implement `hotlineAgent.ts`
  - [ ] Write full instructions (adapt from prompt gốc)
  - [ ] Import all tools
  - [ ] Configure RealtimeAgent
  - [ ] Test instruction clarity

### Phase 4: Integration (Est. 1 hour)
- [ ] Create `index.ts` in hotlineAI folder
- [ ] Update `/agentConfigs/index.ts`
- [ ] Set default agent (if needed)
- [ ] Verify no TypeScript errors

### Phase 5: Testing & Refinement (Est. 2-3 hours)
- [ ] Test basic greeting
- [ ] Test Flow A (booking) with various scenarios
- [ ] Test Flow G (FAQ queries)
- [ ] Test Flow C/M/K
- [ ] Test "chuyến gần nhất" logic
- [ ] Test promotion announcements
- [ ] Test special cases (xe 27 chỗ, KCN Tràng Duệ, etc.)
- [ ] Refine instructions based on behavior

---

## 9. Optimizations & Considerations

### Instructions Optimization
- **Original prompt**: 776 lines (quá dài)
- **Target instructions**: ~300-400 lines (sau khi rút gọn)
- **Approach**:
  - Giữ: Core rules, flow logic, critical examples
  - Rút gọn: FAQ content → move to data + tools
  - Loại bỏ: Repetitions, overly detailed examples
  - Format: Markdown clear hierarchy cho LLM dễ parse

### Tool Strategy
- **Data-driven**: Tất cả static data qua tools
- **Time-based logic**: Handle trong tool, không hardcode
- **Fallback**: Khi tool không tìm được → trả về hướng dẫn rõ ràng

### Text-Only Benefits
- Không cần optimize TTS quá kỹ (có thể thêm sau)
- Có thể format response tốt hơn (tables, bullets)
- Dễ debug và test hơn voice

### Future Voice Integration
Khi cần thêm voice:
1. Update `hotlineAIMetadata`: remove `isTextOnly: true`
2. Add TTS optimization layer:
   ```typescript
   function optimizeForTTS(text: string): string {
     return text
       .replace(/(\d{3})\.000đ/g, (_, num) => `${numberToVietnamese(num)} nghìn đồng`)
       .replace(/limousine/gi, 'li mô din')
       // ... more replacements
   }
   ```
3. Apply to all tool responses
4. Select appropriate voice (recommend: `nova` for Vietnamese female voice)

---

## 10. Expected Behavior

### ✅ Success Criteria
1. **Greeting**: Luôn bắt đầu đúng lời chào
2. **No Repetition**: Không lặp lại thông tin khách đã cho
3. **Smart Collection**: Thu thập đủ 5 thông tin (A1-A5) trước khi kết thúc
4. **Tool Usage**: Sử dụng tools chính xác cho queries
5. **Natural Flow**: Hội thoại tự nhiên, không máy móc
6. **Accurate Data**: 100% data từ tools, không bịa đặt

### ⚠️ Edge Cases to Handle
- Khách cung cấp thông tin không theo thứ tự
- Khách hỏi "chuyến gần nhất" lúc phút [11-59]
- Khách đặt vé khứ hồi xe 27 chỗ
- Khách nói mơ hồ quá 2 lần
- Khách cáu/khó chịu
- Khách hỏi về địa điểm không có trong database

---

## 11. Time Estimate

| Phase | Tasks | Time |
|-------|-------|------|
| Phase 1 | Data Layer | 2-3h |
| Phase 2 | Tools Layer | 3-4h |
| Phase 3 | Agent Layer | 2-3h |
| Phase 4 | Integration | 1h |
| Phase 5 | Testing | 2-3h |
| **Total** | | **10-14h** |

---

## 12. Next Steps After Plan Approval

1. ✅ Create folder structure
2. ✅ Implement sampleData.ts
3. ✅ Implement tools.ts (one by one)
4. ✅ Write instructions in hotlineAgent.ts
5. ✅ Create index files
6. ✅ Update agentConfigs/index.ts
7. ✅ Run dev server and test
8. ✅ Iterate and refine

---

**Ready to implement? Reply "implement" to start coding! 🚀**
