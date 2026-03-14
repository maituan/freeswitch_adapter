export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string;
};

export const tndsFaqItems: FaqItem[] = [
  {
    id: 'faq-discount',
    category: 'discount',
    question: 'Ben em chiet khau duoc bao nhieu?',
    answer:
      'Dạ vâng, a/c hỏi vậy chắc đã tham khảo nhiều bên rồi đúng không a/c. Nếu chưa thì năm ngoái mình mua BH với mức phí bao nhiêu đấy ạ? Em sẽ báo giá chiết khấu phù hợp, nhớ báo giá niêm yết trước rồi mới báo giá ưu đãi ạ.',
    keywords: ['chiet khau', 'giam gia', 'uu dai', 'khuyen mai'],
  },
  {
    id: 'faq-where',
    category: 'about',
    question: 'Em dang o dau?',
    answer:
      'Dạ em gọi cho Anh chị từ tổng đài bảo hiểm ô tô, trụ sở chính ở Đà Nẵng, hỗ trợ gia hạn online trên toàn quốc ạ.',
    keywords: [
      'o dau',
      'em ben nao',
      'ben nao',
      'em o ben nao',
      'em la ai',
      'bao hiem gi',
      'chi nhanh',
      'van phong',
      'tong dai',
    ],
  },
  {
    id: 'faq-company-name',
    category: 'about',
    question: 'Em o ben bao hiem nao?',
    answer: 'Dạ em bên bảo hiểm VietinBank anh ạ.',
    keywords: [
      'bao hiem nao',
      'em o ben bao hiem nao',
      'em ben bao hiem nao',
      'ben bao hiem nao',
      'thuoc bao hiem nao',
      'ten cong ty bao hiem',
      'vietinbank',
    ],
  },
  {
    id: 'faq-cheaper',
    category: 'price-compare',
    question: 'Sao ben khac re hon?',
    answer:
      'Dạ/ vâng a/c cho em hỏi xíu là chỗ mình mua đó là mua người quen hay chỗ mình mua xe ạ? Bên em sẽ gửi giá ưu đãi qua Zalo để a/c so sánh, nếu bên em tốt hơn thì a/c báo em hỗ trợ nhé.',
    keywords: ['re hon', 'gia thap', 'so sanh', 'ben khac'],
  },
  {
    id: 'faq-already-renewed',
    category: 'already-renewed',
    question: 'A/c gia han roi',
    answer:
      'À dạ vâng, tiếc quá Anh/chị ạ. Chương trình gia hạn online tại tổng đài bên em đang giảm đến 40-50% đó ạ. Anh/chị cho em hỏi mình mới gia hạn lâu chưa và mức phí mình mua bao nhiêu để em tham khảo, em đối chiếu xem bên em còn tối ưu hơn được không ạ? Nếu tiện, em xin phép kết bạn Zalo gửi ưu đãi để Anh/chị tham khảo thêm; nếu phù hợp em hỗ trợ luôn cho mình và cả người thân/bạn bè. Dạ với lại Anh/chị có cần em báo thêm gói thân vỏ để mình tham khảo luôn không ạ?',
    keywords: ['gia han roi', 'da mua', 'da gia han', 'moi mua roi', 'vua mua xong', 'co roi', 'than vo'],
  },
  {
    id: 'faq-source',
    category: 'source',
    question: 'Sao em co thong tin cua a/c',
    answer:
      'Dạ, em bên tổng đài đại lý bảo hiểm, được cung cấp danh sách KH sắp đến hạn BH để gọi nhắc gia hạn online cho mình khỏi quên. Gia hạn tháng này còn được giảm giá 20-30%, giao ấn chỉ tận nơi và chỉ thanh toán sau khi kiểm tra hợp lệ ạ.',
    keywords: ['sao biet', 'thong tin', 'nguon thong tin', 'crm'],
  },
  {
    id: 'faq-online-trust',
    category: 'online',
    question: 'Khach so mua online',
    answer:
      'Dạ a/c yên tâm, hình thức gia hạn online đã được khuyến khích theo quy định pháp luật. Ấn chỉ gửi về có QR kiểm tra hợp lệ, a/c chỉ thanh toán sau khi kiểm tra đúng thông tin ạ.',
    keywords: ['mua online', 'so lua', 'khong an toan', 'uy tin', 'qr'],
  },
  {
    id: 'faq-register',
    category: 'register',
    question: 'Doi den dang kiem mua',
    answer:
      'Dạ vâng, đăng kiểm bán theo giá niêm yết, còn bên em hỗ trợ giảm 20-30% trên giá gốc và giao ấn chỉ tận nơi. A/c gia hạn sớm sẽ tiết kiệm hơn ạ.',
    keywords: ['dang kiem', 'mua gan nha', 'quen', 'gia niem yet'],
  },
  {
    id: 'faq-purpose',
    category: 'benefit',
    question: 'Bao hiem nay co tac dung gi the em?',
    answer:
      'Dạ bảo hiểm TNDS bắt buộc là để bảo vệ bên thứ 3 khi có thiệt hại về sức khỏe, tính mạng hoặc tài sản do xe cơ giới gây ra ạ.',
    keywords: ['tac dung', 'de lam gi', 'quyen loi', 'bao ve ben thu 3', 'tnds la gi'],
  },
  {
    id: 'faq-csgt-check',
    category: 'benefit',
    question: 'Di duong CSGT chang may hoi thi sao?',
    answer:
      'Dạ Anh/chị cứ yên tâm, đây là giấy tờ bắt buộc khi CSGT kiểm tra. Mình có va quệt hoặc sự cố với xe khác thì bên bảo hiểm sẽ thẩm định và bồi thường bên thứ 3 theo quyền lợi hợp đồng ạ.',
    keywords: ['csgt', 'canh sat giao thong', 'kiem tra giay to', 'di duong bi hoi'],
  },
  {
    id: 'faq-vat-invoice',
    category: 'invoice',
    question: 'Ben em co xuat hoa don VAT khong?',
    answer:
      'Dạ bên em có xuất hóa đơn VAT ạ. Anh/chị cho em thêm thông tin tên công ty, mã số thuế, địa chỉ email để bên em gửi hóa đơn qua mail cho mình ạ.',
    keywords: ['hoa don', 'vat', 'xuat hoa don', 'ma so thue', 'email cong ty'],
  },
  {
    id: 'faq-bank-collateral',
    category: 'bank',
    question: 'Xe dang vay ngan hang thi co mua duoc ben em khong?',
    answer:
      'Dạ được ạ. Anh/chị cho em biết ngân hàng đang vay có yêu cầu chuyển thụ hưởng hay không, nếu cần thì chỉ cần điền thông tin ngân hàng thụ hưởng để làm hợp đồng 3 bên ạ.',
    keywords: ['vay ngan hang', 'the chap', 'thu huong', 'hop dong 3 ben'],
  },
  {
    id: 'faq-policy-lookup',
    category: 'lookup',
    question: 'Tra cuu GCN bao hiem nhu the nao em?',
    answer:
      'Dạ Anh/chị quét QR trên ấn chỉ bảo hiểm sẽ tra cứu được thông tin hợp lệ ngay. Anh/chị cũng có thể liên hệ số tổng đài in trên ấn chỉ ạ.',
    keywords: ['tra cuu', 'gcn', 'giay chung nhan', 'quet qr', 'kiem tra hop le'],
  },
  {
    id: 'faq-backdate',
    category: 'policy',
    question: 'Muon cap lui ngay bao hiem duoc khong?',
    answer:
      'Dạ theo tài chính quy định không được cấp lùi ngày với mọi trường hợp ạ.',
    keywords: ['cap lui ngay', 'lui ngay', 'backdate', 'ghi lui ngay'],
  },
  {
    id: 'faq-buy-before-expire',
    category: 'policy',
    question: 'Bao hiem cu con han thi co mua truoc duoc khong?',
    answer:
      'Dạ được Anh/chị ạ, bên em sẽ viết nối tiếp với ngày hết hạn của bảo hiểm cũ để không bị đứt quãng quyền lợi ạ.',
    keywords: ['con han', 'mua truoc', 'viet noi tiep', 'noi han'],
  },
  {
    id: 'faq-paper-delivery-time',
    category: 'delivery',
    question: 'Khi nao nhan duoc chung nhan bao hiem ban cung?',
    answer:
      'Dạ khoảng 2-3 ngày là mình nhận được bản cứng ạ (nội thành nhanh hơn, tỉnh khác thường 2-3 ngày làm việc).',
    keywords: ['ban cung', 'bao gio nhan giay', 'thoi gian giao', '2 3 ngay'],
  },
  {
    id: 'faq-right-without-paper',
    category: 'delivery',
    question: 'Chua nhan ban cung ma tai nan thi co duoc huong quyen loi khong?',
    answer:
      'Dạ có ạ, Anh/chị vẫn được hưởng quyền lợi bồi thường theo hợp đồng hợp lệ ạ.',
    keywords: ['chua nhan giay', 'chua co ban cung', 'tai nan', 'boi thuong'],
  },
  {
    id: 'faq-lost-certificate',
    category: 'delivery',
    question: 'Bi mat giay chung nhan thi lam nhu the nao?',
    answer:
      'Dạ Anh/chị có thể gọi hotline in trên ấn chỉ hoặc liên hệ lại em để hỗ trợ cấp lại khi đủ điều kiện ạ.',
    keywords: ['mat giay', 'mat gcn', 'cap lai', 'hotline'],
  },
  {
    id: 'faq-required-info',
    category: 'process',
    question: 'Can cung cap thong tin gi de viet bao hiem?',
    answer:
      'Dạ Anh/chị gửi giúp em giấy tờ xe hoặc đăng ký xe, số điện thoại, họ tên người nhận và địa chỉ nhận đơn hàng ạ.',
    keywords: ['can thong tin gi', 'ho so', 'giay to xe', 'dang ky xe', 'dia chi nhan'],
  },
  {
    id: 'faq-payment',
    category: 'payment',
    question: 'Thanh toan nhu the nao?',
    answer:
      'Dạ Anh/chị nhận đơn rồi kiểm tra đúng thông tin thì mới thanh toán cho shipper hoặc theo hướng dẫn thanh toán em gửi ạ.',
    keywords: ['thanh toan', 'cod', 'shipper', 'chuyen khoan', 'tra tien'],
  },
  {
    id: 'faq-electronic-validity',
    category: 'online',
    question: 'Ban dien tu co hieu luc khong?',
    answer:
      'Dạ sau khi Anh/chị đồng ý gia hạn, bên em gửi bản điện tử trước để mình kiểm tra. Bản điện tử có giá trị trong thời gian chờ bản giấy, khi CSGT kiểm tra mình có thể xuất trình mã QR để tra cứu ạ.',
    keywords: ['ban dien tu', 'hieu luc', 'qr', 'cho ban giay', 'xuat trinh'],
  },
  {
    id: 'faq-branch-support',
    category: 'about',
    question: 'Ngoai Bac mua ben em duoc khong?',
    answer:
      'Dạ Anh/chị ở miền Nam hay ngoài Bắc đều mua và được hỗ trợ bình thường ạ. Khi cần hỗ trợ bồi thường, chỉ cần gọi hotline tổng đài là có nhân viên hướng dẫn gần nhất.',
    keywords: ['mien bac', 'mien nam', 'ngoai bac', 'chi nhanh', 'ho tro toan quoc'],
  },
  {
    id: 'faq-change-phone-or-lost-e-cert',
    category: 'online',
    question: 'Doi dien thoai hoac mat tin nhan ban dien tu thi sao?',
    answer:
      'Dạ Anh/chị yên tâm, thông tin hợp đồng được lưu trên hệ thống. Chỉ cần đọc biển số xe hoặc thông tin định danh là bên em có thể hỗ trợ gửi lại bản điện tử ạ.',
    keywords: ['doi so', 'doi dien thoai', 'mat tin nhan', 'gui lai file', 'cap lai ban dien tu'],
  },
  {
    id: 'faq-payment-method-detail',
    category: 'payment',
    question: 'The thanh toan kieu gi em? Chuyen khoan a?',
    answer:
      'Dạ mình có thể thanh toán linh hoạt ạ: nhận ấn chỉ kiểm tra đúng thông tin rồi thanh toán COD cho shipper, hoặc chuyển khoản theo thông tin bên em gửi. Anh/chị chỉ thanh toán sau khi kiểm tra hợp lệ ạ.',
    keywords: ['the thanh toan', 'kieu gi', 'chuyen khoan a', 'cod', 'thanh toan kieu nao'],
  },
  {
    id: 'faq-paper-home-delivery',
    category: 'delivery',
    question: 'Bao gio co giay va co gui ve nha khong?',
    answer:
      'Dạ bên em gửi giấy về tận nhà cho Anh/chị ạ. Thường nội thành nhận nhanh, còn tỉnh khác khoảng 2-3 ngày làm việc.',
    keywords: ['gui ve nha', 'gui tan nha', 'bao gio co giay', 'nhan giay tai nha'],
  },
  {
    id: 'faq-claim-reduction',
    category: 'benefit',
    question: 'Tai sao boi thuong bi cat giam?',
    answer:
      'Dạ mức bồi thường phụ thuộc điều khoản và phạm vi bảo hiểm trên hợp đồng. Bên em luôn tư vấn đúng quyền lợi theo mức phí và hướng dẫn hồ sơ để Anh/chị nhận quyền lợi đầy đủ nhất ạ.',
    keywords: ['boi thuong cat giam', 'vi sao cat giam', 'quyen loi boi thuong', 'pham vi bao hiem'],
  },
  {
    id: 'faq-no-zalo-alternative',
    category: 'process',
    question: 'Anh khong dung Zalo thi gui thong tin bang cach nao?',
    answer:
      'Dạ nếu Anh/chị không dùng Zalo, em có thể gửi báo giá và thông tin qua SMS hoặc gọi xác nhận trực tiếp. Anh/chị chọn kênh thuận tiện nhất để em hỗ trợ ngay ạ.',
    keywords: ['khong dung zalo', 'gui tin nhan thuong', 'sms', 'kenh thay the', 'khong co zalo'],
  },
  {
    id: 'faq-price-300k-compare',
    category: 'price-compare',
    question: 'Van de bao hiem ban 300k thi sao?',
    answer:
      'Dạ mức giá có thể khác nhau theo loại xe, mục đích sử dụng, điều khoản và chất lượng hỗ trợ khi có sự cố. Bên em báo đúng quy định, có ấn chỉ hợp lệ và hỗ trợ xử lý nhanh khi cần ạ.',
    keywords: ['300k', 'ben kia bao 300', 'sao gia cao', 'gia re hon', 'so sanh muc gia'],
  },
];
