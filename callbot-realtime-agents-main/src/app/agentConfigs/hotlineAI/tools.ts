import { tool } from '../types';
import {
  routeSchedules,
  pricingData,
  pickupSurcharges,
  dropoffSurcharges,
  promotions,
  faqData,
  type RouteSchedule,
  type PricingInfo,
  type Promotion,
  type FAQ,
} from './sampleData';

// ========== HELPER FUNCTIONS ==========

function getCurrentTimeVietnam(): string {
  // Get current time in Vietnam (GMT+7)
  const now = new Date();
  const vietnamTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const hours = vietnamTime.getUTCHours();
  const minutes = vietnamTime.getUTCMinutes();
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatPriceResponse(pricing: PricingInfo): string {
  if (pricing.vehicleType === '27seat') {
    return `Xe limousine 27 chỗ: ${pricing.prices.standard?.toLocaleString('vi-VN')}đ/ghế (đồng giá)`;
  }

  const parts: string[] = [];
  if (pricing.prices.front)
    parts.push(`2 ghế đầu: ${pricing.prices.front.toLocaleString('vi-VN')}đ/ghế`);
  if (pricing.prices.middle)
    parts.push(`6 ghế giữa: ${pricing.prices.middle.toLocaleString('vi-VN')}đ/ghế`);
  if (pricing.prices.back)
    parts.push(`3 ghế cuối: ${pricing.prices.back.toLocaleString('vi-VN')}đ/ghế`);
  if (pricing.prices.standard)
    parts.push(`Giá: ${pricing.prices.standard.toLocaleString('vi-VN')}đ/vé`);

  return `Xe limousine 11 chỗ:\n${parts.join('\n')}`;
}

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

function formatPromotionResponse(promos: Promotion[]): string {
  if (promos.length === 0) return '';

  let response = 'Các chương trình ưu đãi hiện có:\n\n';

  promos.forEach((promo, index) => {
    response += `${index + 1}. ${promo.name}\n`;
    response += `   - ${promo.description}\n`;
    response += `   - Giảm: ${promo.discount.toLocaleString('vi-VN')}đ\n`;
    response += `   - Điều kiện:\n`;
    promo.conditions.forEach((condition) => {
      response += `     + ${condition}\n`;
    });
    response += '\n';
  });

  return response.trim();
}

function formatFAQResponse(faqs: FAQ[]): string {
  if (faqs.length === 1) {
    return faqs[0].answer;
  }

  let response = '';
  faqs.forEach((faq) => {
    response += `${faq.answer}\n\n`;
  });

  return response.trim();
}

// ========== TOOL #0: getCurrentTime ==========

export const getCurrentTimeTool = tool({
  name: 'getCurrentTime',
  description:
    'Lấy thời gian hiện tại (GMT+7 - Việt Nam). Sử dụng khi khách hỏi về giờ hiện tại hoặc cần biết thời gian để tìm chuyến gần nhất.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  execute: async () => {
    const currentTime = getCurrentTimeVietnam();
    const now = new Date();
    const vietnamTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    
    const dayOfWeek = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    const day = vietnamTime.getUTCDate();
    const month = vietnamTime.getUTCMonth() + 1;
    const year = vietnamTime.getUTCFullYear();
    const weekday = dayOfWeek[vietnamTime.getUTCDay()];
    
    return {
      currentTime: currentTime,
      fullDateTime: `${weekday}, ${day}/${month}/${year} - ${currentTime}`,
      timestamp: vietnamTime.toISOString(),
      formatted: `Hiện tại là ${currentTime} (${weekday}, ngày ${day} tháng ${month} năm ${year})`,
    };
  },
});

// ========== TOOL #1: lookupRoutePrice ==========

export const lookupRoutePriceTool = tool({
  name: 'lookupRoutePrice',
  description: 'Tra cứu giá vé theo tuyến đường và loại ghế. Sử dụng khi khách hỏi về giá vé.',
  parameters: {
    type: 'object',
    properties: {
      route: {
        type: 'string',
        enum: ['HP-HN', 'HN-HP', 'HP-HN-27', 'HN-CB', 'CB-HN'],
        description:
          'Tuyến đường: HP-HN (Hải Phòng-Hà Nội), HN-HP (Hà Nội-Hải Phòng), HP-HN-27 (xe 27 chỗ), HN-CB (Hà Nội-Cát Bà), CB-HN (Cát Bà-Hà Nội)',
      },
    },
    required: ['route'],
    additionalProperties: false,
  },
  execute: async (input: any) => {
    const { route } = input as { route: string };
    const pricing = pricingData.find((p) => p.routeId === route);

    if (!pricing) {
      return { error: 'Không tìm thấy thông tin giá vé cho tuyến này.' };
    }

    return {
      route: route,
      vehicleType: pricing.vehicleType,
      prices: pricing.prices,
      formatted: formatPriceResponse(pricing),
    };
  },
});

// ========== TOOL #2: lookupSchedule ==========

export const lookupScheduleTool = tool({
  name: 'lookupSchedule',
  description: 'Tra cứu lịch chạy xe theo tuyến. Sử dụng khi khách hỏi về lịch xe, giờ chạy.',
  parameters: {
    type: 'object',
    properties: {
      route: {
        type: 'string',
        enum: ['HP-HN', 'HN-HP', 'HP-HN-27', 'HN-CB', 'CB-HN'],
        description: 'Tuyến đường cần tra cứu',
      },
    },
    required: ['route'],
    additionalProperties: false,
  },
  execute: async (input: any) => {
    const { route } = input as { route: string };
    const schedule = routeSchedules.find((s) => s.routeId === route);

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
      formatted: formatScheduleResponse(schedule),
    };
  },
});

// ========== TOOL #3: getNextAvailableTrip ==========

export const getNextAvailableTripTool = tool({
  name: 'getNextAvailableTrip',
  description:
    'Tìm chuyến xe gần nhất/sớm nhất từ thời điểm hiện tại. Trả về thời gian chuyến tiếp theo.',
  parameters: {
    type: 'object',
    properties: {
      route: {
        type: 'string',
        enum: ['HP-HN', 'HN-HP', 'HP-HN-27', 'HN-CB', 'CB-HN'],
        description: 'Tuyến đường',
      },
      currentTime: {
        type: 'string',
        description: 'Thời gian hiện tại format HH:mm (ví dụ: "14:35")',
      },
    },
    required: ['route', 'currentTime'],
    additionalProperties: false,
  },
  execute: async (input: any) => {
    const { route, currentTime } = input as { route: string; currentTime: string };

    // Parse current time
    const [hours, minutes] = currentTime.split(':').map(Number);
    const currentMinutes = hours * 60 + minutes;

    const schedule = routeSchedules.find((s) => s.routeId === route);
    if (!schedule) {
      return { error: 'Không tìm thấy thông tin lịch chạy.' };
    }

    let nextTrip = '';
    let additionalInfo = '';

    if (schedule.schedule === 'hourly') {
      // Tuyến chạy mỗi giờ (HP-HN, HN-HP): tính chuyến gần nhất
      let nextHour = hours;
      
      // Nếu đã qua đầu giờ, lấy giờ tiếp theo
      if (minutes > 0) {
        nextHour += 1;
      }

      // Check trong khung giờ hoạt động (5h-21h)
      if (nextHour >= 5 && nextHour <= 21) {
        nextTrip = `${String(nextHour).padStart(2, '0')}:00`;
      } else if (nextHour > 21 || nextHour < 5) {
        // Ngoài giờ hoạt động
        nextTrip = '05:00 sáng mai';
        additionalInfo = ' (chuyến đầu tiên trong ngày)';
      }
    } else if (Array.isArray(schedule.schedule)) {
      // Tuyến có giờ cố định (HN-CB, CB-HN, HP-HN-27)
      const scheduleMinutes = schedule.schedule.map((time) => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
      });

      // Tìm chuyến tiếp theo sau thời điểm hiện tại
      const nextSchedule = scheduleMinutes.find((sm) => sm > currentMinutes);

      if (nextSchedule) {
        const h = Math.floor(nextSchedule / 60);
        const m = nextSchedule % 60;
        nextTrip = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      } else {
        // Không còn chuyến hôm nay, lấy chuyến đầu ngày mai
        nextTrip = `${schedule.schedule[0]} sáng mai`;
        additionalInfo = ' (chuyến đầu tiên trong ngày)';
      }
    }

    return {
      nextTrip: nextTrip,
      route: schedule.routeName,
      currentTime: currentTime,
      additionalInfo: additionalInfo,
      formatted: `Chuyến gần nhất ${schedule.routeName} là lúc ${nextTrip}${additionalInfo}.`,
    };
  },
});

// ========== TOOL #4: checkPromotion ==========

export const checkPromotionTool = tool({
  name: 'checkPromotion',
  description:
    'Kiểm tra các chương trình khuyến mãi có sẵn. Sử dụng khi khách hỏi về giảm giá, ưu đãi.',
  parameters: {
    type: 'object',
    properties: {
      route: {
        type: 'string',
        enum: ['HP-HN', 'HN-HP', 'HN-CB', 'CB-HN', 'all'],
        description: 'Tuyến đường, hoặc "all" để xem tất cả khuyến mãi',
      },
      tripType: {
        type: 'string',
        enum: ['oneWay', 'roundTrip', 'any'],
        description: 'Loại vé: một chiều, khứ hồi, hoặc bất kỳ',
      },
    },
    required: ['route', 'tripType'],
    additionalProperties: false,
  },
  execute: async (input: any) => {
    const { route, tripType } = input as { route: string; tripType: string };

    const applicablePromotions = promotions.filter((promo) => {
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
        message: 'Hiện tại không có chương trình khuyến mãi phù hợp.',
      };
    }

    return {
      hasPromotion: true,
      promotions: applicablePromotions,
      formatted: formatPromotionResponse(applicablePromotions),
    };
  },
});

// ========== TOOL #5: calculateSurcharge ==========

export const calculateSurchargeTool = tool({
  name: 'calculateSurcharge',
  description:
    'Tính phụ thu theo điểm đón/trả. Sử dụng khi khách hỏi về phụ thu hoặc cung cấp địa điểm cụ thể.',
  parameters: {
    type: 'object',
    properties: {
      locationType: {
        type: 'string',
        enum: ['pickup', 'dropoff'],
        description: 'Loại địa điểm: pickup (đón) hoặc dropoff (trả)',
      },
      location: {
        type: 'string',
        description: 'Tên địa điểm/khu vực (ví dụ: "Ecopark", "Ocean Park 2", "Quận Đống Đa")',
      },
    },
    required: ['locationType', 'location'],
    additionalProperties: false,
  },
  execute: async (input: any) => {
    const { locationType, location } = input as { locationType: string; location: string };

    const surchargeList = locationType === 'pickup' ? pickupSurcharges : dropoffSurcharges;

    // Tìm exact match hoặc partial match
    let found = surchargeList.find((s) => s.location.toLowerCase() === location.toLowerCase());

    if (!found) {
      // Try partial match
      found = surchargeList.find(
        (s) =>
          s.location.toLowerCase().includes(location.toLowerCase()) ||
          location.toLowerCase().includes(s.location.toLowerCase())
      );
    }

    if (!found) {
      return {
        found: false,
        message: `Không tìm thấy thông tin phụ thu cho địa điểm "${location}". Vui lòng cung cấp địa điểm cụ thể hơn.`,
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
      message: message,
    };
  },
});

// ========== TOOL #6: lookupFAQ ==========

export const lookupFAQTool = tool({
  name: 'lookupFAQ',
  description:
    'Tìm kiếm câu trả lời từ FAQ dựa trên câu hỏi của khách. Sử dụng khi khách hỏi thông tin chung.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Câu hỏi hoặc từ khóa cần tìm kiếm',
      },
      category: {
        type: 'string',
        enum: ['schedule', 'pricing', 'service', 'vehicle', 'policy', 'info', 'any'],
        description: 'Danh mục FAQ (tùy chọn)',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  execute: async (input: any) => {
    const { query, category = 'any' } = input as { query: string; category?: string };

    // Simple keyword matching
    const queryLower = query.toLowerCase();

    const results = faqData.filter((faq) => {
      // Filter by category
      if (category !== 'any' && faq.category !== category) {
        return false;
      }

      // Check if query matches question or keywords
      const matchQuestion = faq.question.toLowerCase().includes(queryLower);
      const matchKeywords = faq.keywords.some((kw) => queryLower.includes(kw.toLowerCase()));

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
        message: 'Không tìm thấy thông tin phù hợp. Anh chị có thể hỏi cụ thể hơn không ạ?',
      };
    }

    // Return top 3 results
    return {
      found: true,
      results: results.slice(0, 3),
      topAnswer: results[0].answer,
      formatted: formatFAQResponse(results.slice(0, 3)),
    };
  },
});

