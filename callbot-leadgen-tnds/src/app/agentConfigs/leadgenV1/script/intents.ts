export const leadgenV1Script = {
  opening:
    'Dạ em chào {gender} {name}, em là {agent_name} gọi từ TỔNG ĐẠI LÝ BẢO HIỂM Ô TÔ ạ. Em thấy xe biển số {BKS} sắp hết hạn bảo hiểm, em xin phép hỗ trợ gia hạn cho mình ạ.',
  identity:
    'Dạ {gender} đang nghe máy đúng không ạ, em là {agent_name} gọi từ TỔNG ĐẠI LÝ BẢO HIỂM Ô TÔ ạ. Bên em được cung cấp danh sách khách hàng sắp đến hạn BH để hỗ trợ gia hạn cho mình ạ.',
  noHear1:
    'Em check thấy xe biển số {BKS} của {gender} sắp hết hạn rồi này. Em viết nối hạn luôn cho {gender} nha.',
  noHear2:
    'Dạ em là {agent_name} từ bên bảo hiểm xe ô tô. Em gọi để giúp {gender} gia hạn bảo hiểm. Xe {gender} là biển số {BKS}, sắp hết hạn rồi ạ.',
  noisyClose: 'Dạ hiện tại tín hiệu không tốt, em xin phép gọi lại sau ạ. Em chào {gender} ạ.',
  silence1: 'Em check thấy xe biển số {BKS} của {gender} sắp hết hạn rồi. {gender} có nghe được em không ạ?',
  silence2: 'Em gọi từ bên bảo hiểm xe ô tô. {gender} vẫn nghe được em không ạ?',
  askOtherCar:
    'Dạ, vậy hiện tại {gender} đang đi xe nào ạ? Bên em muốn gửi chương trình chiết khấu tới xe {gender} đang đi ạ.',
  notUsingCar:
    'À mình bán xe rồi ạ. Vậy anh không dùng chiếc nào nữa hả anh? Dạ vâng, cảm ơn anh đã thông báo. Em sẽ cập nhật lại hệ thống nhé.',
  alreadyRenewed:
    'Dạ vâng. Vậy tiếc quá ạ, vì chương trình gia hạn online tại tổng đài giảm giá đến 30% luôn đấy ạ. Em xin phép kết bạn Zalo để gửi ưu đãi cho lần sau nhé.',
  stillValid:
    'À vẫn còn hạn đúng không ạ. Nhưng mà tháng tới là sắp hết hạn rồi đấy anh. Anh cứ gọi lại em khi sắp hết hạn để em hỗ trợ gia hạn nhé.',
  companyCar:
    'Dạ, vậy {gender} cho em xin SĐT của kế toán hay bạn nào phụ trách mua BH của công ty được không ạ?',
  boughtElsewhere:
    'À là anh nhờ để kiểm định mua mất ạ, mua rồi. Dạ vâng, cảm ơn anh. Nếu lần tới cần gia hạn bảo hiểm thì anh nhớ gọi em nhé.',
  askFamily:
    'Dạ, {gender} đồng ý kết bạn Zalo với em nhé, em gửi mình thông tin qua Zalo mình tham khảo, nếu được thì báo em nhé.',
  busyClose: 'Dạ vâng, vậy em xin phép gọi lại vào lúc khác phù hợp hơn ạ. Em chào {gender} ạ.',
  callbackAsk:
    'À vâng, anh đang bận lắm à. Dạ vâng em hiểu ạ. Vậy em gọi lại cho anh lúc nào thuận tiện nhất ạ?',
  callbackConfirm: 'Dạ vâng, để em xin phép gọi lại cho {gender} sau nhé. Mấy hôm nữa em gọi lại cho {gender} nhé.',
  wrongNumber: 'Dạ em xin lỗi vì đã làm phiền {gender}. Chúc {gender} một ngày tốt lành ạ.',
  relativeClose: 'À thế ạ, vậy em xin phép gọi lại vào lúc khác phù hợp hơn. Em chào ạ.',
  refusal1:
    'Dạ em hiểu, nhưng em chỉ gọi để hỗ trợ {gender} gia hạn bảo hiểm với giá ưu đãi thôi ạ. Bên em đang có chương trình giảm giá tới 30% cho khách hàng gia hạn trong tháng này. Không biết {gender} có quan tâm không ạ?',
  refusal2:
    'Dạ vâng, em hiểu {gender} rồi. Nhưng nếu {gender} muốn gia hạn lại, em luôn sẵn sàng hỗ trợ. Bên em còn tặng quà kèm theo nữa ạ. Cho em xin số Zalo để em gửi thông tin ưu đãi qua cho {gender} tham khảo nhé?',
  refusal3: 'Dạ vâng, em tôn trọng quyết định của {gender}. Chúc {gender} một ngày tốt lành ạ.',
  confirmVehicle:
    'Dạ vâng. Vậy xe {gender} là {num_seats} chỗ, mục đích sử dụng là {purpose} đúng không ạ?',
  askBusiness: 'Dạ vâng, xe {num_seats} chỗ. Vậy xe {gender} có kinh doanh hay không ạ?',
  askExpiry: 'Dạ vâng, {purpose}. Vậy bảo hiểm của {gender} hết hạn vào ngày nào ạ?',
  readyQuote: 'Dạ vâng, {expiry_date}. Vậy em báo giá cho {gender} nhé.',
  expiryUnknown:
    'Vâng {gender} ơi, em không có thời gian cụ thể xe nhà mình gần hết hạn bảo hiểm khi nào. Nhưng xe của mình có trong danh sách xe sắp hết hạn, em hỗ trợ gia hạn cho mình nhé.',
  scamFaq:
    'Dạ {gender} yên tâm. Bên em gửi ấn chỉ về tận nhà, mình kiểm tra đầy đủ thông tin, quét mã QR hợp lệ rồi mới thanh toán ạ. Bên em không thu trước bất kỳ chi phí gì đâu ạ.',
  inspectionFaq:
    'Dạ vâng, ở đăng kiểm thường là giá niêm yết ạ. Bên em đang hỗ trợ mức ưu đãi tốt hơn để mình tiết kiệm chi phí ạ.',
  multiYearFaq:
    'Dạ, nếu {gender} gia hạn từ 2 năm trở lên thì em tính theo từng năm, không có chiết khấu bổ sung ạ. Nhưng vẫn tặng thẻ phạt nguội miễn phí 1 năm. {gender} có muốn em báo phương án 2 năm không ạ?',
  quote:
    'Dạ vâng. Xe {num_seats} chỗ {purpose}, giá niêm yết là {list_price} đồng/năm. Hôm nay bên em có ưu đãi, {gender} chỉ cần {discount_price} đồng/năm, tiết kiệm {savings} đồng ạ. Ngoài ra {gender} còn được tặng {gifts} ạ.',
  promo:
    'Dạ vâng, bên em đang có chương trình ưu đãi như sau: giảm {discount_percent}% so với giá niêm yết, tặng {gifts}, giao tận nhà (COD) hoặc online, không phải thanh toán trước ạ.',
  priceAccepted:
    'Dạ vâng, cảm ơn {gender}. Vậy em lên hồ sơ cho {gender} ngay nhé. Em sẽ gửi bản điện tử qua Zalo để {gender} kiểm tra, sau đó gửi bản giấy tận nhà ạ.',
  priceCompare:
    'Dạ em hiểu, {gender} có tham khảo bên khác rồi ạ. Bên em đang có ưu đãi rất tốt, nếu mình muốn em có thể báo thêm phương án gia hạn dài hạn để mình tiện so sánh ạ.',
  priceRefusal:
    'Dạ em hiểu. Nhưng nếu không gia hạn bảo hiểm, khi bị kiểm tra có thể bị phạt 400.000-600.000 đồng ạ. Giá ưu đãi hiện tại vẫn tiết kiệm hơn nhiều ạ. {gender} cân nhắc giúp em nhé?',
  zaloCaptured:
    'Dạ vâng, cảm ơn {gender}. Em vừa gửi lời mời kết bạn Zalo rồi ạ. {gender} vui lòng chấp nhận giúp em, em sẽ gửi bản điện tử và thông tin ưu đãi qua Zalo ạ.',
  noZalo:
    'Dạ vâng, vậy {gender} cho em xin email hoặc số điện thoại để em gửi bản điện tử cho {gender} nhé.',
  confirmAddress:
    'Dạ vâng, em gửi bản giấy bảo hiểm và quà tặng về địa chỉ {address} cho {gender} nhé. Thường mất 2-3 ngày để giao đến ạ.',
  onlinePayment:
    'Dạ vâng, {gender} có thể chuyển khoản trực tiếp vào tài khoản công ty em ạ. Em sẽ gửi bản điện tử để {gender} kiểm tra trước, sau đó chuyển khoản là cấp đơn hợp lệ ngay ạ.',
} as const;

export function fillTemplate(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}
