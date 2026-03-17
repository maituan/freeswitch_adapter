export type BidvKBScenario = 'SMARTBANKING_LOGIN' | 'CARD_GNND';

export type BidvKBStepKind = 'ASK' | 'DO' | 'CHECK' | 'NOTE';

export type BidvKBStep = {
  kind: BidvKBStepKind;
  text: string; // Voice-friendly
};

export type BidvKBItem = {
  id: string;
  scenario: BidvKBScenario;
  cause: string;
  keywords: string[];
  guidance: string; // Voice-friendly text
  steps?: BidvKBStep[]; // Optional: more deterministic step-by-step flow
};

export const bidvKbItems: BidvKBItem[] = [
  // =============================
  // SMARTBANKING LOGIN
  // =============================
  {
    id: 'SB-01-FIRST_LOGIN',
    scenario: 'SMARTBANKING_LOGIN',
    cause: 'Sử dụng lần đầu, chưa biết cách đăng nhập',
    keywords: ['lần đầu', 'mới dùng', 'đăng nhập lần đầu', 'chưa biết đăng nhập', 'đăng ký lần đầu'],
    guidance:
      'Thực hiện lần lượt: Bước một, tải ứng dụng “BIDV SmartBanking” trên App Store hoặc Google Play. Bước hai, nhập tên đăng nhập và mật khẩu do ngân hàng cung cấp. Bước ba, làm theo hướng dẫn để đổi mật khẩu và xác thực khuôn mặt. Bước bốn, thiết lập mã PIN Smart OTP.',
    steps: [
      { kind: 'ASK', text: '{{Customer}} đang cần hướng dẫn đăng nhập lần đầu {{app}}, đúng không ạ?' },
      { kind: 'ASK', text: '{{Customer}} đang dùng iPhone hay điện thoại Android ạ?' },
      {
        kind: 'DO',
        text: '{{Customer}} vào App Store hoặc Google Play, tìm “{{app}}” rồi tải hoặc cập nhật lên phiên bản mới nhất giúp em.',
      },
      {
        kind: 'DO',
        text: '{{Customer}} mở ứng dụng, đăng nhập bằng số điện thoại đã đăng ký dịch vụ và mật khẩu do ngân hàng cung cấp.',
      },
      {
        kind: 'DO',
        text: 'Sau khi đăng nhập, {{customer}} làm theo hướng dẫn trên màn hình để đổi mật khẩu và thực hiện xác thực khuôn mặt hoặc thu thập sinh trắc học.',
      },
      { kind: 'DO', text: 'Cuối cùng, {{customer}} thiết lập mã pin Smart OTP gồm 6 chữ số để hoàn tất.' },
      { kind: 'CHECK', text: '{{Customer}} thao tác như vậy thì đã đăng nhập và dùng được ứng dụng chưa ạ?' },
    ],
  },
  {
    id: 'SB-02-CHANGE_DEVICE_FORGOT',
    scenario: 'SMARTBANKING_LOGIN',
    cause: 'Đổi thiết bị đăng nhập / sử dụng tính năng quên mật khẩu',
    keywords: [
      'đổi điện thoại',
      'đổi thiết bị',
      'thiết bị mới',
      'thiết bị khác',
      'quên mật khẩu trên máy khác',
      'đăng nhập thiết bị khác',
      'đăng nhập trên máy mới',
    ],
    guidance:
      'Trường hợp đổi thiết bị, làm theo hướng dẫn sau. Bước một, trên điện thoại cũ đã từng đăng nhập, mở BIDV SmartBanking và vào phần cài đặt. Bước hai, vào cài đặt sinh trắc học và bật tính năng “Đăng nhập hoặc Quên mật khẩu trên thiết bị khác”. Bước ba, trên điện thoại mới, cài BIDV SmartBanking và chọn “Đăng nhập hoặc Quên mật khẩu trên thiết bị khác”, rồi làm theo hướng dẫn trên màn hình.',
    steps: [
      { kind: 'ASK', text: '{{Customer}} đang muốn đăng nhập {{app}} trên điện thoại mới, đúng không ạ?' },
      { kind: 'ASK', text: '{{Customer}} còn giữ điện thoại cũ là máy gần nhất đăng nhập {{app}} thành công không ạ?' },
      {
        kind: 'DO',
        text: 'Nếu còn giữ điện thoại cũ: {{customer}} mở {{app}} trên máy cũ, vào cài đặt rồi chọn cài đặt sinh trắc học.',
      },
      {
        kind: 'DO',
        text: '{{Customer}} bật tính năng “Đăng nhập hoặc Quên mật khẩu trên thiết bị khác”, xác nhận điều khoản và nhập mã pin Smart OTP để hoàn tất.',
      },
      {
        kind: 'DO',
        text: 'Sau đó {{customer}} quay lại điện thoại mới, cài {{app}} và chọn “Đăng nhập hoặc Quên mật khẩu trên thiết bị khác”, rồi làm theo hướng dẫn trên màn hình.',
      },
      {
        kind: 'NOTE',
        text: 'Nếu {{customer}} không còn giữ điện thoại cũ hoặc không bật được tính năng trên máy cũ, bên em cần tư vấn viên hỗ trợ tiếp.',
      },
      { kind: 'CHECK', text: '{{Customer}} thử lại thì đã đăng nhập được trên thiết bị mới chưa ạ?' },
    ],
  },
  {
    id: 'SB-03-CONNECTION_ERROR',
    scenario: 'SMARTBANKING_LOGIN',
    cause: 'Đăng nhập nhưng hiển thị thông báo lỗi kết nối',
    keywords: ['lỗi kết nối', 'không kết nối', 'mạng', 'network', 'connection'],
    guidance:
      'Khởi động lại điện thoại và kiểm tra lại kết nối mạng (Wi‑Fi/4G/5G), sau đó mở lại BIDV SmartBanking và thử đăng nhập lại.',
    steps: [
      { kind: 'ASK', text: '{{Customer}} đang gặp lỗi kết nối khi đăng nhập ứng dụng, đúng không ạ?' },
      {
        kind: 'DO',
        text: '{{Customer}} giúp em khởi động lại điện thoại, kiểm tra lại Wi‑Fi hoặc 4G/5G rồi mở {{app}} và thử đăng nhập lại giúp em.',
      },
      { kind: 'CHECK', text: '{{Customer}} thử xong thì còn báo lỗi kết nối không ạ?' },
      {
        kind: 'DO',
        text: 'Nếu vẫn lỗi: {{customer}} vào cài đặt của điện thoại, tìm ứng dụng {{app}} và bật cho phép ứng dụng sử dụng dữ liệu di động, rồi thử đăng nhập lại bằng 4G/5G.',
      },
      { kind: 'CHECK', text: '{{Customer}} thử lại giúp em, đã đăng nhập được chưa ạ?' },
      {
        kind: 'DO',
        text: 'Nếu vẫn lỗi: {{customer}} vào cài đặt chung, chọn ngày và giờ, bật chế độ tự động. Nếu đang bật sẵn thì tắt đi rồi bật lại, sau đó thử đăng nhập lại.',
      },
      { kind: 'CHECK', text: '{{Customer}} thử lại thì còn báo lỗi kết nối không ạ?' },
      { kind: 'ASK', text: '{{Customer}} đang dùng iPhone hay điện thoại Android ạ?' },
      {
        kind: 'DO',
        text: 'Nếu iPhone: {{customer}} vào cài đặt, chọn cài đặt chung, vào quản lý vpn và thiết bị, xóa cấu hình vpn nếu có. Nếu có mục dns thì tắt các cấu hình đang bật, rồi thử đăng nhập lại.',
      },
      {
        kind: 'DO',
        text: 'Nếu Android: {{customer}} vào cài đặt, chọn kết nối, vào cài đặt kết nối khác, vào vpn và xóa cấu hình vpn nếu có. Vào dns riêng tư và tắt các mục đang bật, rồi thử đăng nhập lại.',
      },
      { kind: 'CHECK', text: '{{Customer}} thử lại thì đã đăng nhập được chưa ạ?' },
    ],
  },
  {
    id: 'SB-04-OUTDATED_APP',
    scenario: 'SMARTBANKING_LOGIN',
    cause: 'Chưa cập nhật phiên bản ứng dụng mới nhất',
    keywords: ['phiên bản', 'cập nhật', 'update', 'lỗi do phiên bản'],
    guidance:
      'Vào App Store hoặc Google Play để cập nhật BIDV SmartBanking lên phiên bản mới nhất, sau đó thử lại.',
    steps: [
      { kind: 'ASK', text: '{{Customer}} đang bị yêu cầu cập nhật ứng dụng {{app}} trước khi đăng nhập, đúng không ạ?' },
      { kind: 'ASK', text: '{{Customer}} đang dùng iPhone hay điện thoại Android ạ?' },
      {
        kind: 'DO',
        text: '{{Customer}} vào App Store hoặc Google Play, tìm “{{app}}” rồi bấm “Cập nhật” để lên phiên bản mới nhất.',
      },
      { kind: 'DO', text: 'Cập nhật xong {{customer}} mở lại ứng dụng và thử đăng nhập giúp em.' },
      { kind: 'CHECK', text: '{{Customer}} thử lại thì đã vào được ứng dụng chưa ạ?' },
    ],
  },
  {
    id: 'SB-05-INVALID_CREDENTIALS',
    scenario: 'SMARTBANKING_LOGIN',
    cause: 'Thông tin đăng nhập không hợp lệ',
    keywords: ['sai mật khẩu', 'sai tên đăng nhập', 'không hợp lệ', 'invalid', 'user sai'],
    guidance:
      'Kiểm tra lại tên đăng nhập và mật khẩu (lưu ý chữ hoa/chữ thường nếu có), rồi thử đăng nhập lại.',
    steps: [
      { kind: 'ASK', text: '{{Customer}} đang gặp thông báo “thông tin đăng nhập không hợp lệ” khi đăng nhập {{app}}, đúng không ạ?' },
      {
        kind: 'DO',
        text: '{{Customer}} kiểm tra lại tên đăng nhập là số điện thoại đã đăng ký dịch vụ với BIDV, lưu ý không có khoảng trắng thừa khi nhập.',
      },
      {
        kind: 'DO',
        text: '{{Customer}} dùng biểu tượng hình con mắt ở ô mật khẩu để hiển thị và soát lại mật khẩu vừa nhập giúp em.',
      },
      {
        kind: 'NOTE',
        text: '{{Customer}} lưu ý nếu nhập sai mật khẩu quá 5 lần liên tiếp, dịch vụ có thể tạm khóa để bảo vệ tài khoản.',
      },
      { kind: 'CHECK', text: '{{Customer}} thử lại thì đã đăng nhập được chưa ạ?' },
    ],
  },
  {
    id: 'SB-06-SERVICE_LOCKED',
    scenario: 'SMARTBANKING_LOGIN',
    cause: 'Dịch vụ đang không ở trạng thái hoạt động (bị khóa)',
    keywords: ['bị khóa', 'khóa dịch vụ', 'không hoạt động', 'disabled', 'tạm khóa'],
    guidance:
      'Trường hợp dịch vụ có thể đang bị khóa hoặc không ở trạng thái hoạt động, cần liên hệ hotline BIDV để được tư vấn và hỗ trợ kịp thời.',
  },
  {
    id: 'SB-07-FORGOT_PASSWORD',
    scenario: 'SMARTBANKING_LOGIN',
    cause: 'Quên mật khẩu đăng nhập',
    keywords: ['quên mật khẩu', 'lấy lại mật khẩu', 'cấp lại mật khẩu', 'reset password'],
    guidance:
      'Thực hiện cấp lại mật khẩu ngay trên ứng dụng SmartBanking, hoặc tới quầy giao dịch BIDV để được hỗ trợ.',
  },
  {
    id: 'SB-08-ANDROID_INSTALL',
    scenario: 'SMARTBANKING_LOGIN',
    cause: 'Không cài đặt/ cập nhật được ứng dụng trên Android',
    keywords: ['android', 'không cài được', 'không cập nhật được', 'lỗi cài đặt', 'xóa cache'],
    guidance:
      'Với Android, thử xóa cache của ứng dụng, sau đó gỡ và tải lại BIDV SmartBanking từ Google Play.',
  },
  {
    id: 'SB-09-LOGIN_OK_BUT_ERROR',
    scenario: 'SMARTBANKING_LOGIN',
    cause: 'Đăng nhập đúng user/mật khẩu nhưng hệ thống báo lỗi',
    keywords: ['đúng mật khẩu', 'đúng user', 'báo lỗi', 'lỗi hệ thống', 'đăng nhập đúng vẫn lỗi', 'đồng bộ thời gian'],
    guidance:
      'Kiểm tra và đồng bộ lại thời gian trên thiết bị (đặt tự động theo mạng), sau đó thử đăng nhập lại.',
  },

  // =============================
  // CARD GHI NỢ NỘI ĐỊA (GNNĐ)
  // =============================
  {
    id: 'CARD-01-ATM_NO_CASH',
    scenario: 'CARD_GNND',
    cause: 'Thẻ không rút được tiền tại ATM',
    keywords: ['không rút được', 'rút tiền', 'atm', 'không giao dịch được'],
    guidance:
      'Kiểm tra và kích hoạt thẻ trên ứng dụng BIDV SmartBanking, sau đó thử rút tiền lại tại máy ATM.',
    steps: [
      { kind: 'ASK', text: '{{Customer}} đang gặp tình huống không rút được tiền tại máy ATM, đúng không ạ?' },
      { kind: 'DO', text: '{{Customer}} kiểm tra trạng thái thẻ và kích hoạt thẻ trên ứng dụng {{app}} giúp em.' },
      { kind: 'DO', text: 'Sau đó {{customer}} thử rút tiền lại tại máy ATM.' },
      { kind: 'CHECK', text: '{{Customer}} thử lại thì giao dịch đã thực hiện được chưa ạ?' },
    ],
  },
  {
    id: 'CARD-02-MAGSTRIPE_FAIL',
    scenario: 'CARD_GNND',
    cause: 'Thẻ từ không thực hiện được giao dịch rút tiền nữa',
    keywords: ['thẻ từ', 'không rút được nữa', 'không giao dịch được', 'đổi thẻ chip', 'chuyển đổi thẻ chip'],
    guidance:
      'Trường hợp thẻ từ không giao dịch rút tiền được nữa, thực hiện chuyển đổi sang thẻ chip trên ứng dụng BIDV SmartBanking.',
  },
  {
    id: 'CARD-03-FORGOT_CASH_ATM',
    scenario: 'CARD_GNND',
    cause: 'Rút tiền nhưng quên không nhận tiền tại ATM',
    keywords: ['quên nhận tiền', 'không nhận tiền', 'atm nuốt tiền', 'nuốt tiền'],
    guidance:
      'Chờ và nhận hóa đơn hoặc thông báo tại máy ATM về việc máy đã nuốt tiền.',
  },
  {
    id: 'CARD-04-ATM_HANG',
    scenario: 'CARD_GNND',
    cause: 'Đang rút tiền nhưng ATM bị treo',
    keywords: ['atm treo', 'bị treo', 'đơ', 'kẹt giao dịch', 'đang rút'],
    guidance:
      'Chờ khoảng 15 đến 20 phút hoặc hơn, sau đó kiểm tra lại trạng thái giao dịch.',
  },
  {
    id: 'CARD-05-FORGOT_PIN',
    scenario: 'CARD_GNND',
    cause: 'Quên mã PIN thẻ',
    keywords: ['quên pin', 'mã pin', 'đổi pin', 'cấp lại pin'],
    guidance:
      'Cấp lại mã PIN thẻ qua BIDV SmartBanking, hoặc liên hệ quầy giao dịch/hotline để được hỗ trợ.',
    steps: [
      { kind: 'ASK', text: '{{Customer}} đang cần cấp lại mã pin thẻ, đúng không ạ?' },
      { kind: 'DO', text: '{{Customer}} có thể thực hiện cấp lại mã pin thẻ trên ứng dụng {{app}}.' },
      {
        kind: 'NOTE',
        text: 'Nếu {{customer}} không thực hiện được trên ứng dụng, bên em sẽ tạo ticket để tư vấn viên liên hệ hỗ trợ tiếp.',
      },
      { kind: 'CHECK', text: '{{Customer}} đang thao tác được trên ứng dụng không ạ?' },
    ],
  },
];
