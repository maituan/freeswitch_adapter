export type AbicTravelDocScope = 'TRAVEL_INTERNATIONAL' | 'TRAVEL_DOMESTIC';

export type AbicTravelDoc = {
  docId: '2399' | '2400' | '2403' | '2401' | '2402' | '2404';
  title: string;
  scope: AbicTravelDocScope;
  /**
   * Taken from column "Khi nào thì sử dụng tài liệu này" in:
   * `docs/abic/ABIC - GenAI OpenAI SDK - Tài liệu BH du lịch.csv`
   */
  whenToUse: string;
};

export const abicTravelDocs: AbicTravelDoc[] = [
  {
    docId: '2399',
    title: '2399 - Bảo hiểm du lịch quốc tế',
    scope: 'TRAVEL_INTERNATIONAL',
    whenToUse:
      'Sử dụng khi đã xác định được khách hàng quan tâm bảo hiểm du lịch quốc tế cần thông tin chung về quy định, quy trình, hồ sơ, thủ tục. ' +
      'Đây là tài liệu pháp lý gốc, dùng để tra cứu chính xác điều kiện tham gia, điều khoản loại trừ, thủ tục giải quyết quyền lợi bảo hiểm, hủy bỏ và chấm dứt hợp đồng, quy trình giải quyết. ' +
      'Ưu tiên dùng khi cần độ chính xác cao hoặc khi tài liệu triển khai không đáp ứng hoặc không đủ chi tiết.',
  },
  {
    docId: '2400',
    title: '2400 - Điều khoản bảo hiểm bổ sung áp dụng cho du lịch quốc tế',
    scope: 'TRAVEL_INTERNATIONAL',
    whenToUse:
      'Sử dụng khi đã xác định được khách hàng quan tâm bảo hiểm du lịch quốc tế cần tra cứu quyền lợi mở rộng theo điều khoản bổ sung (BS một đến BS mười hai), ' +
      'hoặc điều kiện hồ sơ giải quyết của các quyền lợi mở rộng như: ngộ độc, thể thao nguy hiểm, chậm hành lý, mất giấy tờ, cắt ngắn hoặc hủy chuyến, trì hoãn chuyến, trách nhiệm bên thứ ba, cứu trợ y tế và hỗ trợ du lịch. ' +
      'Không dùng cho câu hỏi giới thiệu chung nếu không nhắc tới các quyền lợi mở rộng.',
  },
  {
    docId: '2403',
    title: '2403 - Thông báo triển khai sản phẩm và hướng dẫn áp dụng du lịch quốc tế',
    scope: 'TRAVEL_INTERNATIONAL',
    whenToUse:
      'Sử dụng khi đã xác định được khách hàng quan tâm bảo hiểm du lịch quốc tế cần thông tin chung về phạm vi, quyền lợi, chi phí, phí bồi thường. ' +
      'Ưu tiên dùng khi khách hỏi giới thiệu chung, quy định chung, hướng dẫn triển khai, bên mua/người được bảo hiểm/đối tượng/độ tuổi, phạm vi và quyền lợi ở mức tổng quan, số tiền bảo hiểm và phí bảo hiểm. ' +
      'Chỉ khi không tìm thấy hoặc không đủ chi tiết trong tài liệu triển khai thì mới chuyển sang dùng quy tắc.',
  },
  {
    docId: '2401',
    title: '2401 - Bảo hiểm du lịch trong nước',
    scope: 'TRAVEL_DOMESTIC',
    whenToUse:
      'Sử dụng khi đã xác định được khách hàng quan tâm bảo hiểm du lịch trong nước cần thông tin chung về quy định, quy trình, hồ sơ, thủ tục. ' +
      'Đây là tài liệu pháp lý gốc, dùng để tra cứu chính xác điều kiện tham gia, điều khoản loại trừ, thủ tục giải quyết quyền lợi bảo hiểm, hủy bỏ và chấm dứt hợp đồng, quy trình giải quyết. ' +
      'Ưu tiên dùng khi cần độ chính xác cao hoặc khi tài liệu triển khai không đáp ứng hoặc không đủ chi tiết.',
  },
  {
    docId: '2402',
    title: '2402 - Điều khoản bảo hiểm bổ sung cho du lịch trong nước',
    scope: 'TRAVEL_DOMESTIC',
    whenToUse:
      'Sử dụng khi đã xác định được khách hàng quan tâm bảo hiểm du lịch trong nước cần tra cứu quyền lợi mở rộng theo điều khoản bổ sung (BS một đến BS chín), ' +
      'như: ngộ độc, thể thao nguy hiểm, chậm hành lý, mất giấy tờ, cắt ngắn chuyến, hủy chuyến, trì hoãn chuyến, cứu trợ y tế. ' +
      'Không dùng cho câu hỏi giới thiệu chung nếu không đề cập đến các quyền lợi mở rộng.',
  },
  {
    docId: '2404',
    title: '2404 - Thông báo triển khai sản phẩm và hướng dẫn áp dụng du lịch trong nước',
    scope: 'TRAVEL_DOMESTIC',
    whenToUse:
      'Sử dụng khi đã xác định được khách hàng quan tâm bảo hiểm du lịch trong nước cần thông tin chung về phạm vi, quyền lợi, chi phí, phí bồi thường. ' +
      'Ưu tiên dùng khi khách hỏi giới thiệu chung, quy định chung, hướng dẫn triển khai, bên mua/người được bảo hiểm/đối tượng/độ tuổi, phạm vi và quyền lợi ở mức tổng quan, số tiền bảo hiểm và phí bảo hiểm. ' +
      'Chỉ khi không tìm thấy hoặc không đủ chi tiết trong tài liệu triển khai thì mới chuyển sang dùng quy tắc.',
  },
];

