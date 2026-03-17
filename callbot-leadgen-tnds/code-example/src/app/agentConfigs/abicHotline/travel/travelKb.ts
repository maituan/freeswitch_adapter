export type AbicTravelScope = 'TRAVEL_DOMESTIC' | 'TRAVEL_INTERNATIONAL' | 'TRAVEL_FLIGHT';

export type AbicTravelKbItem = {
  id: string;
  scope: AbicTravelScope;
  title: string;
  /**
   * Voice-friendly content:
   * - No abbreviations
   * - Never contains the string "ABIC"
   * - Numbers written out where feasible for TTS
   */
  content: string;
  source: string;
  keywords: string[];
};

export const abicTravelKbItems: AbicTravelKbItem[] = [
  {
    id: 'intl_sum_insured_core',
    scope: 'TRAVEL_INTERNATIONAL',
    title: 'Du lịch quốc tế: số tiền bảo hiểm tai nạn cá nhân và chi phí y tế (tóm lược)',
    content:
      'Dạ về bảo hiểm du lịch quốc tế, số tiền bảo hiểm tai nạn cá nhân tối đa là năm tỷ năm trăm triệu đồng cho mỗi người trong trường hợp cấp đơn một trăm phần trăm hoặc đồng bảo hiểm với tỷ lệ bằng hoặc lớn hơn năm mươi phần trăm. Nếu đồng bảo hiểm với tỷ lệ nhỏ hơn năm mươi phần trăm thì tối đa ba tỷ đồng cho mỗi người ạ.\n' +
      'Ngoài ra, chi phí y tế do tai nạn hoặc bệnh tối đa bằng năm mươi phần trăm số tiền bảo hiểm tai nạn cá nhân và không quá ba tỷ đồng cho mỗi người ạ.',
    source:
      'ABIC - GenAI OpenAI SDK - Tài liệu bảo hiểm du lịch.csv (bảng quyền lợi du lịch quốc tế: mục số tiền bảo hiểm)',
    keywords: [
      'du lịch quốc tế',
      'số tiền bảo hiểm',
      'tai nạn cá nhân',
      'chi phí y tế',
      'tối đa',
      'năm tỷ năm trăm triệu',
      'ba tỷ',
      'đồng bảo hiểm',
    ],
  },
  {
    id: 'delay_benefit_amounts',
    scope: 'TRAVEL_FLIGHT',
    title: 'Trì hoãn chuyến đi: mức chi trả tham khảo theo điều khoản bổ sung',
    content:
      'Dạ với quyền lợi chuyến đi du lịch bị trì hoãn, mức chi trả tối đa là hai triệu năm trăm nghìn đồng cho mỗi sáu giờ liên tục bị trì hoãn. Ngoài ra, tối đa năm triệu đồng đối với chi phí đi lại bằng phương tiện giao thông công cộng, trong trường hợp phát sinh trực tiếp do việc trì hoãn và người được bảo hiểm buộc phải thay đổi hành trình di chuyển ạ.',
    source:
      'ABIC - GenAI OpenAI SDK - Tài liệu bảo hiểm du lịch.csv (quyền lợi BS mười: chuyến đi du lịch bị trì hoãn)',
    keywords: [
      'trễ chuyến',
      'chậm chuyến',
      'delay',
      'trì hoãn chuyến đi',
      'mức chi trả',
      'sáu giờ',
      'hai triệu năm trăm nghìn',
      'phương tiện giao thông công cộng',
      'năm triệu',
    ],
  },
  {
    id: 'delay_conditions_and_documents',
    scope: 'TRAVEL_FLIGHT',
    title: 'Trì hoãn chuyến đi: nguyên nhân, điều kiện áp dụng và hồ sơ cơ bản',
    content:
      'Dạ trường hợp chuyến đi bị trì hoãn trong thời hạn bảo hiểm do điều kiện thời tiết xấu, đình công, sự cố kỹ thuật hoặc lỗi máy móc của phương tiện vận chuyển thì có thể được xem xét chi trả theo hợp đồng hoặc giấy chứng nhận ạ.\n' +
      'Về điều kiện áp dụng, thời gian bị trì hoãn cần kéo dài hơn số giờ trì hoãn liên tục theo quy định; và sự trì hoãn không phát sinh từ việc người được bảo hiểm quên xác nhận đặt vé trước hoặc làm thủ tục trước chuyến đi không đúng quy định ạ.\n' +
      'Về hồ sơ cơ bản, thường cần có lịch trình chuyến đi; giấy tờ liên quan đến chuyến đi như thẻ lên máy bay hoặc vé hành khách; và xác nhận từ hãng vận chuyển về lịch trình, lý do trễ chuyến và số giờ trễ ạ.',
    source:
      'ABIC - GenAI OpenAI SDK - Tài liệu bảo hiểm du lịch.csv (điều khoản bổ sung: chuyến đi du lịch bị trì hoãn)',
    keywords: [
      'điều kiện',
      'nguyên nhân',
      'thời tiết xấu',
      'đình công',
      'sự cố kỹ thuật',
      'lỗi máy móc',
      'hồ sơ',
      'thẻ lên máy bay',
      'xác nhận hãng vận chuyển',
      'lịch trình',
    ],
  },
];

