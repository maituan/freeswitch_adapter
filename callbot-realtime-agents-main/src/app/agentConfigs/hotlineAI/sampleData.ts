// Data structures for HotlineAI - Nhà xe Anh Huy Đất Cảng

// ========== INTERFACES ==========

export interface RouteSchedule {
  routeId: string;
  routeName: string;
  schedule: string | string[];
  frequency: string;
  duration: string;
  vehicleType: string;
  description?: string;
}

export interface PricingInfo {
  routeId: string;
  vehicleType: '11seat' | '27seat';
  prices: {
    front?: number; // 2 ghế đầu
    middle?: number; // 6 ghế giữa
    back?: number; // 3 ghế cuối
    standard?: number; // Giá đồng giá (xe 27 chỗ hoặc Cát Bà)
  };
}

export interface SurchargeZone {
  location: string;
  surcharge: number;
  note?: string;
}

export interface Promotion {
  id: string;
  name: string;
  description: string;
  discount: number;
  conditions: string[];
  applicableRoutes?: string[];
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  keywords: string[];
}

// ========== ROUTE SCHEDULES ==========

export const routeSchedules: RouteSchedule[] = [
  {
    routeId: 'HP-HN',
    routeName: 'Hải Phòng - Hà Nội',
    schedule: 'hourly', // 05:00 - 21:00
    frequency: 'Mỗi giờ 1 chuyến',
    duration: '1.5-2 giờ',
    vehicleType: 'Xe limousine 11 chỗ',
    description: 'Xe chạy từ 5h sáng đến 21h tối, đón trả tận nơi',
  },
  {
    routeId: 'HN-HP',
    routeName: 'Hà Nội - Hải Phòng',
    schedule: 'hourly',
    frequency: 'Mỗi giờ 1 chuyến',
    duration: '1.5-2 giờ',
    vehicleType: 'Xe limousine 11 chỗ',
  },
  {
    routeId: 'HP-HN-27',
    routeName: 'Hải Phòng - Hà Nội (Xe 27 chỗ)',
    schedule: ['06:00'],
    frequency: '1 chuyến duy nhất',
    duration: '1.5-2 giờ',
    vehicleType: 'Xe limousine 27 chỗ',
    description: 'Chuyến cố định 6h sáng, giá đồng giá 230.000đ',
  },
  {
    routeId: 'HN-CB',
    routeName: 'Hà Nội - Cát Bà',
    schedule: ['08:00', '11:00', '13:00', '15:00'],
    frequency: '4 chuyến/ngày',
    duration: '2.5-3 giờ',
    vehicleType: 'Xe limousine + Tàu cao tốc',
    description: 'Đưa đón tận nơi Hà Nội, di chuyển bằng tàu cao tốc sang Cát Bà',
  },
  {
    routeId: 'CB-HN',
    routeName: 'Cát Bà - Hà Nội',
    schedule: ['08:50', '12:10', '14:10', '15:50'],
    frequency: '4 chuyến/ngày',
    duration: '2.5-3 giờ',
    vehicleType: 'Tàu cao tốc + Xe limousine',
  },
];

// ========== PRICING DATA ==========

export const pricingData: PricingInfo[] = [
  {
    routeId: 'HP-HN',
    vehicleType: '11seat',
    prices: {
      front: 220000,
      middle: 250000,
      back: 230000,
    },
  },
  {
    routeId: 'HN-HP',
    vehicleType: '11seat',
    prices: {
      front: 220000,
      middle: 250000,
      back: 230000,
    },
  },
  {
    routeId: 'HP-HN-27',
    vehicleType: '27seat',
    prices: {
      standard: 230000,
    },
  },
  {
    routeId: 'HN-CB',
    vehicleType: '11seat',
    prices: {
      standard: 380000,
    },
  },
  {
    routeId: 'CB-HN',
    vehicleType: '11seat',
    prices: {
      standard: 380000,
    },
  },
];

// ========== SURCHARGE DATA ==========

export const pickupSurcharges: SurchargeZone[] = [
  // Miễn phí - Hà Nội nội thành
  { location: 'Quận Ba Đình', surcharge: 0 },
  { location: 'Quận Hoàn Kiếm', surcharge: 0 },
  { location: 'Quận Đống Đa', surcharge: 0 },
  { location: 'Quận Hai Bà Trưng', surcharge: 0 },
  { location: 'Quận Thanh Xuân', surcharge: 0 },
  { location: 'Quận Cầu Giấy', surcharge: 0 },
  { location: 'Quận Hoàng Mai', surcharge: 0 },
  { location: 'Quận Long Biên', surcharge: 0, note: 'Xa hơn AEON/Big C có phụ thu' },
  { location: 'Quận Bắc Từ Liêm', surcharge: 0 },
  { location: 'Quận Nam Từ Liêm', surcharge: 0 },
  { location: 'Quận Hà Đông', surcharge: 0, note: 'Xa hơn Bưu Điện Hà Đông có phụ thu' },
  { location: 'Quận Tây Hồ', surcharge: 0 },
  { location: 'Ocean Park 1', surcharge: 0 },
  { location: 'Đường Gom Ocean Park 2', surcharge: 0 },
  { location: 'Văn Phòng Cổ Linh', surcharge: 0 },
  {
    location: 'Huyện Đông Anh',
    surcharge: 0,
    note: 'Giới hạn: Đèn xanh Vĩnh Ngọc, Eurowindow',
  },

  // Có phụ thu - Hà Nội ngoại thành
  { location: 'Huyện Gia Lâm', surcharge: 50000 },
  { location: 'Ecopark', surcharge: 50000 },
  { location: 'Ocean Park 2', surcharge: 100000 },
  { location: 'Ocean Park 3', surcharge: 100000 },
  { location: 'Sân bay', surcharge: 230000, note: 'Tối đa 3 người' },
];

export const dropoffSurcharges: SurchargeZone[] = [
  // Hải Phòng - Miễn phí
  { location: 'Quận Hồng Bàng', surcharge: 0 },
  { location: 'Quận Lê Chân', surcharge: 0 },
  { location: 'Quận Ngô Quyền', surcharge: 0 },
  { location: 'Quận Hải An', surcharge: 0 },
  { location: 'Quận Kiến An', surcharge: 0, note: 'Ngã ba Quán Trữ' },
  { location: 'Quận Dương Kinh', surcharge: 0, note: 'Ngã tư Quang Thanh hoặc KS Pearl River' },
  { location: 'Quận Đồ Sơn', surcharge: 0, note: 'Khách sạn Pearl River' },
  { location: 'Huyện An Dương', surcharge: 0, note: 'Việt Tiệp 2 hoặc Đình Vân Tra' },
  { location: 'Huyện An Lão', surcharge: 0, note: 'Ngã tư Quang Thanh' },
  { location: 'Huyện Kiến Thụy', surcharge: 0, note: 'Khách sạn Pearl River' },
  {
    location: 'Huyện Thủy Nguyên',
    surcharge: 0,
    note: 'Xa hơn Ngã tư Trịnh Xá, Ngã ba Đông Sơn có phụ thu',
  },
];

// ========== PROMOTION DATA ==========

export const promotions: Promotion[] = [
  {
    id: 'early-bird-5am',
    name: 'Ưu đãi chuyến 5h sáng',
    description: 'Giảm giá đặc biệt cho chuyến 5h sáng Hải Phòng → Hà Nội',
    discount: 30000,
    conditions: [
      'Áp dụng cho chuyến 5h sáng từ Hải Phòng đi Hà Nội',
      'Giảm 30.000đ/vé một chiều',
      'Giảm 60.000đ/cặp vé khứ hồi (đi - về trong cùng một ngày)',
    ],
    applicableRoutes: ['HP-HN'],
  },
  {
    id: 'round-trip-7days',
    name: 'Vé khứ hồi trong 7 ngày',
    description: 'Giảm giá khi mua vé khứ hồi',
    discount: 30000,
    conditions: [
      'Giảm 30.000đ/cặp vé khứ hồi',
      'Áp dụng cho vé trong vòng 7 ngày',
      'Thanh toán ngay 1 lần cả chiều đi và về',
      'Khi đi chuyến về, gọi tổng đài đọc mã đặt chỗ, không cần thanh toán lại',
    ],
  },
];

// ========== FAQ DATA ==========

export const faqData: FAQ[] = [
  {
    id: 'faq-001',
    question: 'Xe chạy từ mấy giờ đến mấy giờ?',
    answer:
      'Xe chạy từ 5h sáng đến 21h tối, cách 1 tiếng 1 chuyến. Xe sẽ đi đón trước giờ xuất bến tầm 30-45 phút ạ.',
    category: 'schedule',
    keywords: ['giờ', 'lịch', 'chạy', 'sớm nhất', 'muộn nhất'],
  },
  {
    id: 'faq-002',
    question: 'Thời gian di chuyển mất bao lâu?',
    answer: 'Xe chạy dao động từ 1 tiếng rưỡi đến 2 tiếng đến nơi ạ.',
    category: 'schedule',
    keywords: ['thời gian', 'lâu', 'nhanh', 'mất bao lâu'],
  },
  {
    id: 'faq-003',
    question: 'Giá vé từ Hải Phòng đi Hà Nội',
    answer:
      'Em gửi bảng giá xe Hải Phòng - Hà Nội limousine 11 chỗ:\n- 2 ghế đầu: 220.000đ/ghế\n- 6 ghế giữa: 250.000đ/ghế\n- 3 ghế cuối: 230.000đ/ghế\n\nAnh chị muốn chọn ghế nào ạ?',
    category: 'pricing',
    keywords: ['giá', 'vé', 'tiền', 'bao nhiêu', 'hải phòng', 'hà nội'],
  },
  {
    id: 'faq-004',
    question: 'Giá vé từ Hà Nội đi Cát Bà',
    answer:
      'Giá vé tuyến Hà Nội - Cát Bà là 380.000đ/vé với xe limousine. Bên em có đưa đón tận nơi tại cả Hà Nội và Cát Bà. Di chuyển sang Cát Bà bằng tàu cao tốc mất khoảng 7-10 phút ạ.',
    category: 'pricing',
    keywords: ['giá', 'cát bà', 'hà nội', 'tàu'],
  },
  {
    id: 'faq-005',
    question: 'Lịch xe Hà Nội - Cát Bà',
    answer: 'Hà Nội - Cát Bà có các chuyến: 8 giờ, 11 giờ, 13 giờ, 15 giờ ạ.',
    category: 'schedule',
    keywords: ['lịch', 'cát bà', 'mấy giờ', 'chuyến'],
  },
  {
    id: 'faq-006',
    question: 'Lịch xe Cát Bà - Hà Nội',
    answer: 'Cát Bà - Hà Nội có các chuyến: 8 giờ 50, 12 giờ 10, 14 giờ 10, 15 giờ 50 ạ.',
    category: 'schedule',
    keywords: ['lịch', 'cát bà', 'hà nội', 'về', 'mấy giờ'],
  },
  {
    id: 'faq-007',
    question: 'Xe có đưa đón tận nơi không?',
    answer:
      'Có ạ, bên em đón trả tận nơi nội thành Hà Nội, Hải Phòng và một số điểm ngoại thành. Lái xe sẽ chủ động liên hệ trước 30-45 phút trước chuyến đi ạ.',
    category: 'service',
    keywords: ['đón', 'trả', 'tận nơi', 'liên hệ', 'lái xe'],
  },
  {
    id: 'faq-008',
    question: 'Xe 27 chỗ chạy chuyến nào?',
    answer:
      'Xe limousine 27 chỗ có chuyến cố định 6 giờ sáng từ Hải Phòng đi Hà Nội, giá đồng giá 230.000đ/ghế. Xe vẫn đón trả tận nơi như xe 11 chỗ ạ.',
    category: 'vehicle',
    keywords: ['27 chỗ', 'xe lớn', '6 giờ'],
  },
  {
    id: 'faq-009',
    question: 'Mang hành lý có phụ thu không?',
    answer:
      'Mỗi khách hàng được mang theo 1 kiện hành lý như vali hoặc balo miễn phí. Nếu phát sinh nhiều hơn 1 hành lý, nhà xe phụ thu 50.000đ/hành lý ạ.',
    category: 'policy',
    keywords: ['hành lý', 'vali', 'phụ thu', 'mang'],
  },
  {
    id: 'faq-010',
    question: 'Có được mang thú cưng không?',
    answer:
      'Khách hàng có thể mang chó bỏ vào balo chuyên dụng dành cho thú cưng. Tuy nhiên, hiện tại nhà em chưa hỗ trợ chở mèo khi đi cùng. Mong anh chị thông cảm ạ.',
    category: 'policy',
    keywords: ['chó', 'mèo', 'thú cưng', 'pet'],
  },
  {
    id: 'faq-011',
    question: 'Nhà xe có xuất vé/hóa đơn không?',
    answer:
      'Có ạ, nhà xe có xuất vé đầy đủ cho khách hàng. Nếu khách hàng cần xuất hóa đơn VAT thì sẽ cộng thêm 8% vào giá vé ạ.',
    category: 'policy',
    keywords: ['vé', 'hóa đơn', 'VAT', 'xuất'],
  },
  {
    id: 'faq-012',
    question: 'Văn phòng Hà Nội ở đâu?',
    answer: 'Văn phòng Hà Nội địa chỉ ở 114 Ngọc Trì, Cổ Linh, Quán Cà Phê Bảo Linh ạ.',
    category: 'info',
    keywords: ['văn phòng', 'địa chỉ', 'hà nội', 'cổ linh'],
  },
];

