export type FaqEntry = {
  intentId: string;
  category: 'san_pham' | 'quyen_loi' | 'thu_tuc' | 'dich_vu';
  keywords: string[];
  question: string;
  description: string;
  replyText: string;
};

export const faqEntries: FaqEntry[] = [
  // ═══════════════════════════════════
  // NHÓM SẢN PHẨM
  // ═══════════════════════════════════
  {
    intentId: 'tnds_bat_buoc',
    category: 'san_pham',
    keywords: ['bắt buộc', 'phải mua không', 'có cần mua không', 'bắt buộc không'],
    question: 'Bảo hiểm này có bắt buộc không?',
    description: 'Khách hỏi BH TNDS có bắt buộc theo luật không',
    replyText:
      'Dạ bảo hiểm trách nhiệm dân sự là bắt buộc theo quy định khi tham gia giao thông {gender} ạ. Nếu không có thì khi bị kiểm tra sẽ bị phạt từ 400 nghìn đến 600 nghìn ạ.',
  },
  {
    intentId: 'tnds_thoi_han',
    category: 'san_pham',
    keywords: ['thời hạn', 'bao lâu', 'mấy năm', 'hạn bao lâu'],
    question: 'Bảo hiểm có thời hạn bao lâu?',
    description: 'Khách hỏi thời hạn BH là bao lâu (1 năm, 2 năm, 3 năm)',
    replyText: 'Dạ thông thường thời hạn bảo hiểm là 1 năm {gender} ạ. Mình cũng có thể mua 2 hoặc 3 năm luôn ạ.',
  },
  {
    intentId: 'tnds_hieu_luc',
    category: 'san_pham',
    keywords: ['hiệu lực', 'có hiệu lực khi nào', 'bắt đầu từ khi nào'],
    question: 'Bảo hiểm có hiệu lực khi nào?',
    description: 'Khách hỏi BH bắt đầu có hiệu lực từ thời điểm nào',
    replyText: 'Dạ bảo hiểm có hiệu lực theo thời gian ghi trên giấy chứng nhận bảo hiểm {gender} ạ.',
  },
  {
    intentId: 'tnds_hieu_luc_24_7',
    category: 'san_pham',
    keywords: ['ban đêm', '24/7', 'đêm có được không', 'lúc nào cũng được'],
    question: 'Bảo hiểm có áp dụng ban đêm không?',
    description: 'Khách hỏi BH có hiệu lực ban đêm / 24/7 không',
    replyText: 'Dạ bảo hiểm có hiệu lực 24 trên 7 {gender} ạ, mình cứ yên tâm ạ.',
  },
  {
    intentId: 'tnds_pham_vi_toan_quoc',
    category: 'san_pham',
    keywords: ['toàn quốc', 'ở tỉnh', 'tỉnh xa', 'nơi khác'],
    question: 'Bảo hiểm có áp dụng toàn quốc không?',
    description: 'Khách hỏi BH có hiệu lực ở tỉnh khác / toàn quốc không',
    replyText: 'Dạ bảo hiểm có hiệu lực trên toàn quốc {gender} ạ.',
  },
  {
    intentId: 'tnds_xe_cu',
    category: 'san_pham',
    keywords: ['xe cũ', 'xe đã sử dụng', 'xe cũ có mua'],
    question: 'Xe cũ có mua được không?',
    description: 'Khách hỏi xe đã qua sử dụng có mua BH TNDS được không',
    replyText: 'Dạ xe đã sử dụng vẫn mua được bình thường {gender} ạ.',
  },
  {
    intentId: 'tnds_xe_moi',
    category: 'san_pham',
    keywords: ['xe mới', 'mới mua xe', 'xe mới có nên'],
    question: 'Có bảo hiểm cho xe mới không?',
    description: 'Khách hỏi xe mới có nên/có cần mua BH không',
    replyText: 'Dạ xe mới rất nên tham gia bảo hiểm để giảm rủi ro cho mình {gender} ạ.',
  },
  {
    intentId: 'tnds_xe_cong_ty',
    category: 'san_pham',
    keywords: ['xe công ty', 'xe doanh nghiệp', 'công ty mua'],
    question: 'Có mua cho xe công ty được không?',
    description: 'Khách hỏi xe công ty/doanh nghiệp có mua BH được không',
    replyText: 'Dạ xe cá nhân hay xe công ty đều tham gia bảo hiểm được hết {gender} ạ.',
  },
  {
    intentId: 'tnds_xe_it_di',
    category: 'san_pham',
    keywords: ['ít đi', 'ít sử dụng', 'để không', 'không đi nhiều'],
    question: 'Xe ít đi có cần mua không?',
    description: 'Khách hỏi xe ít sử dụng có cần mua BH không',
    replyText:
      'Dạ dù xe ít sử dụng nhưng rủi ro vẫn có thể xảy ra bất cứ lúc nào {gender} ạ. Với lại đây là bảo hiểm bắt buộc nên mình cần có để tránh bị phạt ạ.',
  },
  {
    intentId: 'tnds_nhieu_goi',
    category: 'san_pham',
    keywords: ['nhiều gói', 'mấy gói', 'chọn gói nào'],
    question: 'Có thể mua nhiều gói không?',
    description: 'Khách hỏi có nhiều gói BH để chọn không',
    replyText: 'Dạ {gender} có thể chọn gói phù hợp với nhu cầu của mình ạ. Em sẽ tư vấn gói phù hợp nhất cho {gender} ạ.',
  },
  {
    intentId: 'san_pham_bh_2_chieu',
    category: 'san_pham',
    keywords: ['2 chiều', 'hai chiều', 'thân vỏ', 'bảo hiểm vật chất'],
    question: 'Bên em có bán bảo hiểm 2 chiều không?',
    description: 'Khách hỏi có bán BH thân vỏ / BH 2 chiều không (khác BH TNDS 1 chiều)',
    replyText:
      'Dạ có ạ, bên em đang hỗ trợ các hãng uy tín và dịch vụ tốt như PVI Dầu Khí, Hàng Không VNI, Bảo Minh, Vietinbank VBI ạ. {gender} gửi cho em thông tin xe của mình rồi em check với các hãng sau đó báo phí cho {gender} nha.',
  },
  {
    intentId: 'san_pham_bh_than_vo_xe_cu',
    category: 'san_pham',
    keywords: ['thân vỏ xe cũ', 'xe trên 10 năm', 'xe cũ thân vỏ', 'xe lâu năm'],
    question: 'Bên em có bán bảo hiểm thân vỏ cho xe trên 10 năm không?',
    description: 'Khách hỏi riêng về BH thân vỏ cho xe cũ trên 10 năm (khác tnds_xe_cu là hỏi TNDS cho xe cũ chung)',
    replyText:
      'Dạ có ạ, bên em có hãng Bảo Minh và PVI Dầu Khí vẫn cấp hợp đồng cho những xe trên 10 năm {gender} ạ.',
  },

  // ═══════════════════════════════════
  // NHÓM QUYỀN LỢI
  // ═══════════════════════════════════
  {
    intentId: 'boi_thuong_tai_nan',
    category: 'quyen_loi',
    keywords: ['tai nạn', 'xảy ra tai nạn', 'đâm xe', 'va quệt'],
    question: 'Nếu xảy ra tai nạn thì sao?',
    description: 'Khách hỏi chung "tai nạn thì sao" — trả lời ngắn gọn hướng dẫn liên hệ. KHÁC quyen_loi_quy_trinh_tai_nan (hỏi chi tiết quy trình gọi ai, hotline 24/7)',
    replyText:
      'Dạ {gender} chỉ cần gọi hotline bảo hiểm hoặc liên hệ bên em để được hướng dẫn xử lý ạ. Bên em sẽ hỗ trợ {gender} trong suốt quá trình ạ.',
  },
  {
    intentId: 'quyen_loi_quy_trinh_tai_nan',
    category: 'quyen_loi',
    keywords: ['gọi cho ai', 'quy trình tai nạn', 'hotline', 'giám định viên', 'khi xảy ra sự cố gọi ai'],
    question: 'Khi xảy ra tai nạn thì gọi cho ai? Quy trình xử lý thế nào?',
    description: 'Khách hỏi CHI TIẾT quy trình khi tai nạn: gọi ai, hotline 24/7, giám định viên. KHÁC boi_thuong_tai_nan (chỉ hỏi chung "tai nạn thì sao")',
    replyText:
      'Dạ khi xảy ra sự cố thì {gender} gọi lên Hotline của hãng bảo hiểm, có in trên ấn chỉ giấy luôn ạ. Tổng đài viên sẽ hướng dẫn và cử giám định viên hỗ trợ cho mình ạ, tổng đài trực 24/7 luôn đó {gender}. Trường hợp đã gọi hãng mà chưa được xử lý thì {gender} liên hệ lại em, em sẽ hỗ trợ thêm để {gender} được xử lý sớm ạ.',
  },
  {
    intentId: 'boi_thuong_va_cham',
    category: 'quyen_loi',
    keywords: ['va chạm', 'đụng xe', 'xe bị va'],
    question: 'Nếu xe bị va chạm thì sao?',
    description: 'Khách hỏi xe bị va chạm nhẹ có được BH hỗ trợ không',
    replyText:
      'Dạ tùy theo gói bảo hiểm thì công ty bảo hiểm sẽ hỗ trợ chi phí sửa chữa theo hợp đồng {gender} ạ.',
  },
  {
    intentId: 'boi_thuong_hong_nang',
    category: 'quyen_loi',
    keywords: ['hỏng nặng', 'hư nặng', 'toàn bộ', 'mất hết'],
    question: 'Nếu xe bị hỏng nặng thì sao?',
    description: 'Khách hỏi xe hỏng nặng/tổn thất lớn thì bồi thường thế nào',
    replyText: 'Dạ bảo hiểm sẽ hỗ trợ theo mức bồi thường trong hợp đồng {gender} ạ.',
  },
  {
    intentId: 'boi_thuong_mat_cap',
    category: 'quyen_loi',
    keywords: ['mất cắp', 'trộm xe', 'mất xe'],
    question: 'Nếu xe bị mất cắp thì sao?',
    description: 'Khách hỏi xe bị mất cắp/trộm có được bồi thường không',
    replyText:
      'Dạ một số gói bảo hiểm vật chất xe có quyền lợi bồi thường khi mất cắp toàn bộ xe {gender} ạ. Em có thể tư vấn thêm cho {gender} ạ.',
  },
  {
    intentId: 'boi_thuong_thien_tai',
    category: 'quyen_loi',
    keywords: ['thiên tai', 'bão', 'lũ', 'ngập', 'lụt'],
    question: 'Bảo hiểm có bao gồm thiên tai không?',
    description: 'Khách hỏi BH có cover thiên tai (bão, lũ, ngập) không',
    replyText: 'Dạ một số gói có quyền lợi bồi thường thiên tai {gender} ạ. Em có thể kiểm tra gói phù hợp cho {gender} ạ.',
  },
  {
    intentId: 'boi_thuong_gioi_han',
    category: 'quyen_loi',
    keywords: ['giới hạn', 'mấy lần', 'số lần bồi thường'],
    question: 'Bảo hiểm có giới hạn số lần bồi thường không?',
    description: 'Khách hỏi giới hạn số lần bồi thường',
    replyText: 'Dạ tùy gói bảo hiểm sẽ có quy định cụ thể {gender} ạ. Em có thể kiểm tra chi tiết cho {gender} ạ.',
  },
  {
    intentId: 'boi_thuong_keo_xe',
    category: 'quyen_loi',
    keywords: ['kéo xe', 'cứu hộ', 'xe chết máy'],
    question: 'Có hỗ trợ kéo xe không?',
    description: 'Khách hỏi BH có hỗ trợ kéo xe/cứu hộ không',
    replyText: 'Dạ tùy gói bảo hiểm có thể hỗ trợ cứu hộ cho mình {gender} ạ.',
  },
  {
    intentId: 'boi_thuong_sua_xe',
    category: 'quyen_loi',
    keywords: ['sửa xe', 'chi phí sửa', 'hỗ trợ sửa'],
    question: 'Có hỗ trợ sửa xe không?',
    description: 'Khách hỏi BH có hỗ trợ chi phí sửa xe không',
    replyText: 'Dạ bảo hiểm có thể hỗ trợ chi phí sửa chữa theo điều khoản hợp đồng {gender} ạ.',
  },
  {
    intentId: 'quyen_loi_pham_vi_bhvc',
    category: 'quyen_loi',
    keywords: ['vật chất xe chi trả', 'trường hợp nào', 'bảo hiểm thân vỏ chi trả', 'quyền lợi thân vỏ'],
    question: 'Bảo hiểm vật chất xe chi trả cho những trường hợp nào?',
    description: 'Khách hỏi PHẠM VI chi trả cụ thể của BH vật chất/thân vỏ (tai nạn, thiên tai, mất cắp, cứu hộ...)',
    replyText:
      'Dạ bảo hiểm vật chất xe thường chi trả cho các trường hợp: xe gặp tai nạn đâm va lật đổ, hoả hoạn cháy nổ, thiên tai như mưa bão lũ lụt sét đánh, hư hỏng do vật thể bên ngoài tác động, và mất cắp mất cướp toàn bộ xe ạ. Ngoài ra còn hỗ trợ chi phí cứu hộ và đưa xe tới nơi sửa chữa gần nhất {gender} ạ.',
  },
  {
    intentId: 'quyen_loi_chua_nhan_bh',
    category: 'quyen_loi',
    keywords: ['chưa nhận', 'chưa có giấy', 'chưa nhận được bảo hiểm', 'tai nạn trước khi nhận'],
    question: 'Chưa nhận được bảo hiểm bản cứng nhưng bị tai nạn có được hưởng quyền lợi không?',
    description: 'Khách hỏi chưa nhận bản cứng BH mà xảy ra tai nạn thì có được hưởng quyền lợi không',
    replyText:
      'Dạ có ạ, {gender} sẽ được hưởng quyền lợi bình thường ạ. Bảo hiểm có hiệu lực ngay từ thời điểm ghi trên giấy chứng nhận, không cần chờ nhận bản cứng đâu {gender} ạ.',
  },

  // ═══════════════════════════════════
  // NHÓM THỦ TỤC
  // ═══════════════════════════════════
  {
    intentId: 'thu_tuc_boi_thuong',
    category: 'thu_tuc',
    keywords: ['thủ tục', 'bồi thường khó', 'làm hồ sơ'],
    question: 'Thủ tục bồi thường có khó không?',
    description: 'Khách hỏi thủ tục bồi thường có phức tạp không',
    replyText:
      'Dạ thủ tục khá đơn giản {gender} ạ, bên em sẽ hỗ trợ {gender} trong quá trình làm hồ sơ ạ.',
  },
  {
    intentId: 'thu_tuc_thoi_gian',
    category: 'thu_tuc',
    keywords: ['bao lâu bồi thường', 'nhận bồi thường', 'mấy ngày bồi thường'],
    question: 'Bao lâu nhận được bồi thường?',
    description: 'Khách hỏi thời gian nhận TIỀN BỒI THƯỜNG sau khi nộp hồ sơ (7-15 ngày). KHÁC thu_tuc_thoi_gian_nhan_ban_cung (hỏi thời gian nhận BẢN CỨNG BH)',
    replyText:
      'Dạ thông thường từ 7 đến 15 ngày sau khi hồ sơ đầy đủ theo quy định {gender} ạ.',
  },
  {
    intentId: 'thu_tuc_thoi_gian_nhan_ban_cung',
    category: 'thu_tuc',
    keywords: ['mấy ngày nhận', 'bao lâu nhận bảo hiểm', 'khi nào nhận được', 'giao bao lâu', 'nhận bản cứng'],
    question: 'Khi nào nhận được chứng nhận BH bản cứng?',
    description: 'Khách hỏi thời gian nhận BẢN CỨNG giấy chứng nhận BH TNDS (2-3 ngày). KHÁC thu_tuc_thoi_gian (hỏi thời gian nhận tiền bồi thường)',
    replyText:
      'Dạ khoảng 2 đến 3 ngày là mình nhận được bảo hiểm bản cứng ạ. Nội thành thì 1 ngày làm việc, khác tỉnh thành phố thì 2 đến 3 ngày làm việc {gender} ạ.',
  },
  {
    intentId: 'thu_tuc_thoi_gian_hop_dong_than_vo',
    category: 'thu_tuc',
    keywords: ['mấy ngày hợp đồng thân vỏ', 'bao lâu có hợp đồng', 'hợp đồng thân vỏ'],
    question: 'Tầm mấy ngày là có hợp đồng thân vỏ?',
    description: 'Khách hỏi thời gian có hợp đồng BH THÂN VỎ (tối đa 2 ngày). KHÁC thu_tuc_thoi_gian_nhan_ban_cung (hỏi bản cứng TNDS)',
    replyText:
      'Dạ tối đa 2 ngày là hãng sẽ cấp hợp đồng cho mình, nhưng thông thường trong ngày sẽ có liền luôn ạ. Em sẽ gửi {gender} bản scan để mình kiểm tra thông tin trước, sau đó bên em sẽ gửi hợp đồng thân vỏ về tận nhà cho mình luôn nha {gender}.',
  },
  {
    intentId: 'thu_tuc_giay_to',
    category: 'thu_tuc',
    keywords: ['giấy tờ', 'cần gì', 'cung cấp gì khi mua'],
    question: 'Có cần giấy tờ gì không?',
    description: 'Khách hỏi CHUNG cần giấy tờ gì để mua BH (đăng ký xe). KHÁC thu_tuc_cung_cap_thong_tin (hỏi cụ thể khi đã đồng ý mua cần gửi những gì)',
    replyText: 'Dạ {gender} chỉ cần cung cấp thông tin xe và đăng ký xe thôi ạ.',
  },
  {
    intentId: 'thu_tuc_cung_cap_thong_tin',
    category: 'thu_tuc',
    keywords: ['cung cấp thông tin gì', 'gửi gì cho em', 'cần gì để viết bảo hiểm', 'thông tin gì'],
    question: 'Anh cần cung cấp thông tin gì cho em để mua?',
    description: 'Khách ĐÃ ĐỒNG Ý mua và hỏi cụ thể cần gửi những gì (BH cũ/đăng ký xe, SĐT, tên, địa chỉ). KHÁC thu_tuc_giay_to (hỏi chung giấy tờ cần gì)',
    replyText:
      'Dạ {gender} gửi cho em bảo hiểm cũ hoặc đăng ký xe, số điện thoại, họ và tên người nhận, và địa chỉ nhận đơn hàng nữa ạ.',
  },
  {
    intentId: 'thu_tuc_ky_hop_dong',
    category: 'thu_tuc',
    keywords: ['ký hợp đồng', 'phải ký', 'hợp đồng'],
    question: 'Có cần ký hợp đồng không?',
    description: 'Khách hỏi có cần ký hợp đồng giấy phức tạp không — trả lời chỉ cần nhận giấy chứng nhận, không ký phức tạp',
    replyText: 'Dạ {gender} sẽ nhận giấy chứng nhận bảo hiểm khi tham gia ạ, không cần ký phức tạp gì đâu ạ.',
  },
  {
    intentId: 'thu_tuc_xem_hop_dong',
    category: 'thu_tuc',
    keywords: ['xem hợp đồng', 'xem trước', 'mẫu hợp đồng'],
    question: 'Tôi muốn xem hợp đồng trước.',
    description: 'Khách muốn xem mẫu hợp đồng trước khi quyết định',
    replyText: 'Dạ em có thể gửi mẫu hợp đồng để {gender} tham khảo trước qua Zalo ạ.',
  },
  {
    intentId: 'thu_tuc_mat_giay',
    category: 'thu_tuc',
    keywords: ['mất giấy', 'mất bảo hiểm', 'làm mất', 'mất chứng nhận'],
    question: 'Nếu mất giấy chứng nhận bảo hiểm thì làm sao?',
    description: 'Khách hỏi mất giấy chứng nhận BH thì xử lý thế nào',
    replyText:
      'Dạ {gender} có thể gọi lên số hotline của công ty bảo hiểm có in trên ấn chỉ giấy, hoặc liên hệ lại em để được hỗ trợ cấp lại ấn chỉ ạ.',
  },
  {
    intentId: 'thu_tuc_ban_xe',
    category: 'thu_tuc',
    keywords: ['bán xe', 'chuyển nhượng', 'sang tên'],
    question: 'Nếu bán xe thì bảo hiểm thế nào?',
    description: 'Khách hỏi bán xe/chuyển nhượng thì BH xử lý sao',
    replyText:
      'Dạ {gender} có thể điều chỉnh thông tin hợp đồng khi chuyển nhượng xe ạ.',
  },
  {
    intentId: 'thu_tuc_kiem_tra_xe',
    category: 'thu_tuc',
    keywords: ['kiểm tra xe', 'xem xe trước', 'kiểm định xe'],
    question: 'Có cần kiểm tra xe trước khi mua không?',
    description: 'Khách hỏi có cần kiểm tra xe trước khi mua BH',
    replyText:
      'Dạ tùy trường hợp có thể cần kiểm tra xe trước khi tham gia {gender} ạ. Em sẽ hướng dẫn cụ thể cho {gender} ạ.',
  },
  {
    intentId: 'thu_tuc_hoa_don_vat',
    category: 'thu_tuc',
    keywords: ['hóa đơn', 'VAT', 'xuất hóa đơn', 'hóa đơn đỏ'],
    question: 'Bên em có xuất hóa đơn VAT không?',
    description: 'Khách hỏi có xuất được hóa đơn VAT không',
    replyText:
      'Dạ có ạ, bên em có xuất hóa đơn VAT {gender} ạ. {gender} cho em thêm thông tin tên công ty, mã số thuế, và địa chỉ gmail, rồi công ty bảo hiểm sẽ gửi hóa đơn qua mail cho {gender} ạ.',
  },
  {
    intentId: 'thu_tuc_xe_vay_ngan_hang',
    category: 'thu_tuc',
    keywords: ['vay ngân hàng', 'trả góp', 'xe thế chấp', 'ngân hàng'],
    question: 'Xe đang vay qua ngân hàng có mua bên em được không?',
    description: 'Khách hỏi xe đang vay/thế chấp ngân hàng có mua BH bên ngoài được không',
    replyText:
      'Dạ được ạ. Nhưng {gender} hỏi lại chỗ ngân hàng xem có cho mua bảo hiểm ngoài hay không, và có yêu cầu chuyên thu không, hay chỉ cần điền thông tin ngân hàng thụ hưởng làm hợp đồng 3 bên là được {gender} ạ.',
  },
  {
    intentId: 'thu_tuc_tra_cuu_gcn',
    category: 'thu_tuc',
    keywords: ['tra cứu', 'kiểm tra bảo hiểm', 'check bảo hiểm', 'quét QR', 'xác thực'],
    question: 'Tra cứu giấy chứng nhận bảo hiểm như thế nào?',
    description: 'Khách hỏi cách tra cứu/xác thực giấy chứng nhận BH',
    replyText:
      'Dạ {gender} quét mã QR trên ấn chỉ bảo hiểm là check được thông tin của mình luôn ạ.',
  },
  {
    intentId: 'thu_tuc_cap_lui_ngay',
    category: 'thu_tuc',
    keywords: ['cấp lùi ngày', 'lùi ngày', 'ngày trước', 'cấp lùi'],
    question: 'Có cấp lùi ngày bảo hiểm được không?',
    description: 'Khách hỏi có được cấp lùi ngày hiệu lực BH không',
    replyText:
      'Dạ bộ tài chính quy định không được cấp lùi ngày với mọi trường hợp ạ {gender}.',
  },
  {
    intentId: 'thu_tuc_mua_truoc_het_han',
    category: 'thu_tuc',
    keywords: ['mua trước', 'còn hạn mua trước', 'gia hạn sớm', 'BH cũ còn hạn'],
    question: 'Bảo hiểm cũ còn hạn thì có mua trước được không?',
    description: 'Khách hỏi BH cũ chưa hết hạn có mua/gia hạn trước được không',
    replyText:
      'Dạ được {gender} ạ. Bên em sẽ viết nối tiếp với ngày hết hạn của bảo hiểm cũ của {gender} ạ.',
  },
  {
    intentId: 'thu_tuc_thanh_toan',
    category: 'thu_tuc',
    keywords: ['thanh toán sao', 'trả tiền sao', 'thanh toán thế nào', 'trả bằng gì'],
    question: 'Thanh toán như thế nào?',
    description: 'Khách hỏi CHUNG về cách thanh toán (nhận hàng mới trả). KHÁC flow BUC_5 (bước chốt đơn thực tế hỏi cod/online)',
    replyText:
      'Dạ {gender} nhận được đơn bảo hiểm, mình kiểm tra đúng thông tin thì mới thanh toán với shipper ạ. Mình không cần trả trước gì đâu {gender} ạ.',
  },

  // ═══════════════════════════════════
  // NHÓM DỊCH VỤ
  // ═══════════════════════════════════
  {
    intentId: 'dich_vu_tru_so',
    category: 'dich_vu',
    keywords: ['em ở đâu', 'tổng đài ở đâu', 'trụ sở', 'gọi từ đâu vậy'],
    question: 'Em ở đâu? Bên em gọi từ đâu vậy?',
    description: 'Khách hỏi VỊ TRÍ tổng đài/trụ sở ở đâu. KHÁC dich_vu_van_phong (hỏi có văn phòng/chi nhánh không)',
    replyText:
      'Dạ em gọi cho {gender} từ tổng đài bảo hiểm ô tô, trụ sở chính ở Đà Nẵng ạ.',
  },
  {
    intentId: 'dich_vu_giao_tan_noi',
    category: 'dich_vu',
    keywords: ['giao tận nơi', 'ship', 'giao hàng', 'nhận ở đâu'],
    question: 'Có giao bảo hiểm tận nơi không?',
    description: 'Khách hỏi có giao BH tận nhà/tận nơi không',
    replyText:
      'Dạ bên em hỗ trợ giao tận nơi hoặc gửi bản điện tử cho {gender} ạ.',
  },
  {
    intentId: 'dich_vu_mua_online',
    category: 'dich_vu',
    keywords: ['online', 'mua online', 'không cần đến', 'từ xa', 'có cần đến văn phòng'],
    question: 'Có mua online được không? Có cần đến văn phòng không?',
    description: 'Khách hỏi có mua online/từ xa được không, có cần đến VP không',
    replyText:
      'Dạ không cần đến văn phòng đâu {gender} ạ, bên em có thể hỗ trợ làm thủ tục online rất nhanh ạ.',
  },
  {
    intentId: 'dich_vu_van_phong',
    category: 'dich_vu',
    keywords: ['văn phòng', 'chi nhánh', 'địa chỉ công ty', 'có văn phòng không'],
    question: 'Bên em có văn phòng không?',
    description: 'Khách hỏi có văn phòng/chi nhánh không (xác nhận có/không). KHÁC dich_vu_tru_so (hỏi vị trí cụ thể ở đâu)',
    replyText:
      'Dạ công ty có văn phòng và chi nhánh {gender} ạ. Em có thể gửi địa chỉ để {gender} kiểm tra ạ.',
  },
  {
    intentId: 'dich_vu_bh_dien_tu',
    category: 'dich_vu',
    keywords: ['điện tử', 'bản điện tử', 'bảo hiểm điện tử', 'e-insurance'],
    question: 'Bên em có bảo hiểm điện tử không?',
    description: 'Khách hỏi có cấp BH điện tử không, BH điện tử có hiệu lực không',
    replyText:
      'Dạ có ạ, sau khi {gender} đồng ý gia hạn thì em sẽ lên đơn và gửi cho {gender} bản điện tử trước để kiểm tra thông tin và lưu lại sử dụng khi đi đường luôn ạ. Ấn chỉ điện tử có hiệu lực như ấn chỉ giấy luôn đó {gender} ạ.',
  },
  {
    intentId: 'dich_vu_ho_tro',
    category: 'dich_vu',
    keywords: ['hỗ trợ', 'khách hàng cũ', 'sau khi mua', 'hỗ trợ sự cố'],
    question: 'Có hỗ trợ sau khi mua không?',
    description: 'Khách hỏi có hỗ trợ khách hàng sau khi mua BH không',
    replyText:
      'Dạ bên em luôn hỗ trợ {gender} trong suốt thời gian bảo hiểm ạ. {gender} cứ yên tâm ạ.',
  },
  {
    intentId: 'dich_vu_nhac_gia_han',
    category: 'dich_vu',
    keywords: ['nhắc gia hạn', 'nhắc hết hạn', 'thông báo hạn'],
    question: 'Có nhắc gia hạn không?',
    description: 'Khách hỏi có dịch vụ nhắc trước khi BH hết hạn không',
    replyText:
      'Dạ bên em sẽ hỗ trợ nhắc {gender} trước khi bảo hiểm hết hạn ạ.',
  },
  {
    intentId: 'dich_vu_quyen_loi',
    category: 'dich_vu',
    keywords: ['quyền lợi', 'được gì', 'lợi ích'],
    question: 'Tôi chưa hiểu quyền lợi bảo hiểm.',
    description: 'Khách nói chưa hiểu quyền lợi BH, muốn được giải thích',
    replyText:
      'Dạ em sẽ giải thích chi tiết quyền lợi bảo hiểm cho {gender} ạ. {gender} cứ hỏi em bất cứ điều gì ạ.',
  },
  {
    intentId: 'dich_vu_tu_van_them',
    category: 'dich_vu',
    keywords: ['tư vấn thêm', 'hỏi thêm', 'giải đáp'],
    question: 'Tôi cần tư vấn thêm.',
    description: 'Khách muốn được tư vấn thêm nói chung',
    replyText: 'Dạ em sẵn sàng hỗ trợ giải đáp thêm cho {gender} ạ.',
  },
];
