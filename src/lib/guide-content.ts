export type GuideStep = {
  title: string;
  body: string;
  screenshotPath: string | null; // đường dẫn ảnh trong public, null = bước text-only (vd FAQ)
  annotate: { x: number; y: number; w: number; h: number; label: string }[] | null; // vùng khoanh trên ảnh; để null ban đầu
};

export type GuideRole = 'Manager' | 'Leader' | 'SubLeader' | 'Employee';

export type GuideSection = {
  role: GuideRole;
  intro: string; // 1-2 câu giới thiệu vai trò
  steps: GuideStep[]; // các bước theo đúng thứ tự dùng app
  faq: { question: string; answer: string }[];
};

export const guideContent: Record<GuideRole, GuideSection> = {
  Manager: {
    role: 'Manager',
    intro:
      'Bạn là Manager: lo dữ liệu nhân sự/nhóm, tiêu chuẩn, kỳ đánh giá, chốt kết quả vòng cuối và đóng kỳ. Làm theo đúng thứ tự các bước dưới đây.',
    steps: [
      {
        title: 'Đăng nhập vào hệ thống',
        body: 'Mở trình duyệt, vào địa chỉ app (ví dụ lykiv.vercel.app hoặc địa chỉ công ty cung cấp). Nhập mã nhân viên và mật khẩu, bấm Đăng nhập. Nếu chưa có mật khẩu, xem bước 2.',
        screenshotPath: '/screenshots/guide/manager-01-login.jpg',
        annotate: null,
      },
      {
        title: 'Đặt mật khẩu lần đầu (nếu chưa có)',
        body: 'Vào Cài đặt ở sidebar, tab Tài khoản. Nếu hiện nút Đặt mật khẩu thì bấm vào, nhập mật khẩu mới (tối thiểu 6 ký tự) và xác nhận. Nếu đã có mật khẩu, muốn đổi thì nhập mật khẩu cũ rồi bấm Đổi mật khẩu.',
        screenshotPath: '/screenshots/guide/manager-02-account.jpg',
        annotate: null,
      },
      {
        title: 'Tạo đủ nhóm và bổ nhiệm Leader',
        body: 'Vào Nhóm ở sidebar, bấm Thêm nhóm mới, đặt tên nhóm và chọn Leader cho nhóm, bấm lưu. Mỗi nhóm chỉ có đúng 1 Leader. Muốn đổi Leader sau này: vào Nhóm → Chỉnh sửa nhóm → chọn Leader mới → Cập nhật (hệ thống tự chuyển quyền).',
        screenshotPath: '/screenshots/guide/manager-03-teams.jpg',
        annotate: null,
      },
      {
        title: 'Thêm, sửa, xóa nhân viên',
        body: 'Vào Nhân viên ở sidebar, bấm Thêm nhân viên: nhập mã NV, họ tên, chọn nhóm và chức vụ (Nhân viên/SubLeader/Leader), bấm lưu. Cách nhanh hơn: vào Nhóm → mở nhóm cần thêm → bấm nút Thêm nhân viên ngay trên trang chi tiết nhóm — NHÓM TỰ CHỌN SẴN là nhóm đang mở (không cần chọn lại). Sửa: bấm bút chì ở cuối dòng. Xóa: bấm thùng rác và xác nhận (nhân viên bị xóa mềm, lịch sử đánh giá cũ vẫn giữ). Có thể import hàng loạt bằng nút Nhập từ Excel với file mẫu.',
        screenshotPath: '/screenshots/guide/manager-04-employees.jpg',
        annotate: null,
      },
      {
        title: 'Kiểm tra bộ tiêu chuẩn đánh giá có sẵn',
        body: 'Vào Tiêu chuẩn ở sidebar để xem các nhóm tiêu chí (A, B, C...) và các mức điểm của từng tiêu chí. Đây là bộ câu hỏi dùng để chấm điểm; hãy đọc qua để biết hệ thống đang đánh giá những gì.',
        screenshotPath: '/screenshots/guide/manager-05-criteria.jpg',
        annotate: null,
      },
      {
        title: 'Chỉnh sửa, bổ sung hoặc tạo thêm tiêu chuẩn và đặt giá trị mặc định',
        body: 'Trong trang Tiêu chuẩn: bấm Thêm tiêu chuẩn để tạo tiêu chí mới (điền tên, nhóm, mô tả, các mức điểm). Sửa: bấm bút chì. Xóa: bấm thùng rác. Với mỗi tiêu chí hãy chọn Mức mặc định — đây là mức điểm tự động áp dụng cho kỳ đánh giá mới nếu người chấm không chọn. Lưu ý: thay đổi tiêu chuẩn ảnh hưởng ngay đến kỳ hiện tại, nên rà soát kỹ trước khi lưu.',
        screenshotPath: '/screenshots/guide/manager-06-criteria-edit.jpg',
        annotate: null,
      },
      {
        title: 'Chỉnh thang điểm (xếp loại) trong Cài đặt',
        body: 'Vào Cài đặt → tab Thang điểm. Đây là quy định khoảng điểm ứng với xếp loại (ví dụ S, A, B, C...). Sửa các mức điểm tối thiểu/tối đa cho từng loại sao cho không chồng lấn, rồi bấm Lưu. Bảng này dùng để tính xếp loại cuối cùng của nhân viên.',
        screenshotPath: '/screenshots/guide/manager-07-grade-bands.jpg',
        annotate: null,
      },
      {
        title: 'Tạo kỳ đánh giá (nếu chưa có)',
        body: 'Vào Cài đặt → tab Kỳ đánh giá. Nếu chưa có kỳ nào cho năm hiện tại, bấm Tạo kỳ mới, đặt tên (ví dụ Đánh giá 2026), chọn năm và ngày bắt đầu/kết thúc, bấm lưu. Nhân viên chỉ được đánh giá trong một kỳ đang hoạt động.',
        screenshotPath: '/screenshots/guide/manager-08-period.jpg',
        annotate: null,
      },
      {
        title: 'Xem quy trình đánh giá (workflow)',
        body: 'Hệ thống đánh giá tuần tự theo vòng: Mỗi vai trò có số vòng riêng — Manager 1 vòng (tự đánh giá SELF là xong), Leader 2 vòng, SubLeader 3 vòng, Nhân viên 3 vòng. Vòng sau chỉ mở khi vòng trước đã nộp. Xem sơ đồ đầy đủ 4 vai trò ở trang Hướng dẫn, mục \'Quy trình 3 vòng đánh giá\'.',
        screenshotPath: null,
        annotate: null,
      },
      {
        title: 'Tự đánh giá bản thân',
        body: 'Bạn cũng là người được đánh giá. Vào Nhân viên, tìm tên bạn, bấm biểu tượng tài liệu ở cuối dòng để mở phiếu. Chấm từng tiêu chí theo các nhóm A, B, C..., bấm Lưu bản nháp thường xuyên, kiểm tra lại rồi bấm Gửi Đánh giá.',
        screenshotPath: '/screenshots/guide/manager-09-self-eval.jpg',
        annotate: null,
      },
      {
        title: 'Chờ Leader nộp đánh giá',
        body: 'Sau khi SubLeader nộp vòng 1, Leader đánh giá vòng 2. Bạn theo dõi tiến độ ở Dashboard (cột trạng thái từng nhóm) và Nhân viên (badge trạng thái từng người: Chưa bắt đầu / Đã nộp vòng X). Chỉ nhắc người đang giữ lượt nộp, hệ thống không tự mở sớm được. Mẹo đọc nhanh: ở trang Nhân viên và trang chi tiết nhóm, nhân viên nào đã có kết quả cuối thì ô xếp loại có viền xanh lá kèm dấu ✓; bấm vào TÊN nhân viên cũng mở được phiếu đánh giá (không cần bấm icon tài liệu).',
        screenshotPath: '/screenshots/guide/manager-10-dashboard.jpg',
        annotate: null,
      },
      {
        title: 'Đánh giá vòng cuối (vòng 3) cho từng nhân viên',
        body: 'Khi Leader đã nộp vòng 2, phiếu của nhân viên mở cho bạn chấm vòng 3. Mở phiếu, xem điểm và nhận xét các vòng trước, chấm điểm theo tiêu chuẩn, ghi nhận xét (có thể dùng Gợi ý nhận xét AI), kiểm tra rồi bấm Gửi Đánh giá. Đây là kết quả chốt của nhân viên. Trong phiếu đánh giá: nhóm tiêu chuẩn đầu tiên đã được highlight sẵn; đánh xong nhóm nào, dùng dãy nhóm tiêu chuẩn ở CUỐI trang để chuyển sang nhóm kế tiếp — hệ thống tự cuộn lên đầu, không cần cuộn tay.',
        screenshotPath: '/screenshots/guide/manager-11-round3.jpg',
        annotate: null,
      },
      {
        title: 'Trả đánh giá lại cho Leader khi cần chỉnh',
        body: 'Nếu thấy vòng 2 của Leader chưa hợp lý (thiếu ghi chú, điểm lệch...), mở phiếu nhân viên và bấm Trả lại đánh giá, nhập lý do bắt buộc rồi xác nhận. Leader sẽ thấy banner vàng ghi lý do, sửa lại và nộp lại. Sau đó bạn chấm vòng 3 bình thường.',
        screenshotPath: '/screenshots/guide/manager-12-return.jpg',
        annotate: null,
      },
      {
        title: 'Dùng các tính năng AI',
        body: 'Hệ thống có AI hỗ trợ rộng khắp: (1) Gợi ý nhận xét AI khi chấm điểm; (2) Giải thích bằng AI khi Dashboard cảnh báo điểm chênh lệch; (3) Trợ lý chat (góc phải dưới) — hỏi hướng dẫn, tình hình, số liệu bằng tiếng Việt tự nhiên ("Ai giảm điểm nhiều nhất?", "Tóm tắt báo cáo") — AI trả lời số liệu thật theo trang; (4) Soạn thông báo kết quả AI (trên phiếu chốt và Soạn thông báo hàng loạt ở trang Báo cáo — tự viết thông báo riêng cho từng nhân viên); (5) Biên bản kết thúc kỳ ở trang Báo cáo; (6) Tạo tóm tắt AI ở trang Báo cáo. AI chạy 10–60 giây, kết quả chỉ là gợi ý — hãy rà soát và chỉnh sửa trước khi dùng.',
        screenshotPath: '/screenshots/guide/manager-13-ai.jpg',
        annotate: null,
      },
      {
        title: 'Xem báo cáo và bảng điều khiển',
        body: 'Dashboard (trang chủ) cho thấy KPI, tiến độ từng nhóm, phân bổ xếp loại, cảnh báo bất thường và hoạt động gần đây. Trang Báo cáo cho biểu đồ radar năng lực, khoảng cách so với mục tiêu, biến động điểm qua các vòng, Top Performers và tóm tắt AI. Dùng các màn này để theo dõi và đánh giá cả kỳ.',
        screenshotPath: '/screenshots/guide/manager-14-reports.jpg',
        annotate: null,
      },
      {
        title: 'Đóng kỳ đánh giá khi hoàn tất',
        body: 'Khi mọi nhân viên đã có kết quả vòng cuối, vào Cài đặt → tab Kỳ đánh giá, chọn kỳ hiện tại và bấm Đóng kỳ (hoặc kết thúc kỳ). Kỳ đã đóng sẽ khóa mọi thao tác đánh giá; dữ liệu vẫn xem được ở các màn báo cáo. Chỉ đóng khi chắc chắn mọi kết quả đã đúng.',
        screenshotPath: '/screenshots/guide/manager-15-close-period.jpg',
        annotate: null,
      },
      {
        title: 'Soạn biên bản kết thúc kỳ và thông báo kết quả cho nhân viên',
        body: 'Sau khi đóng kỳ, vào trang Báo cáo: (1) bấm Soạn thông báo kết quả (AI) để AI tự viết thông báo riêng cho từng nhân viên (giải thích xếp loại, điểm mạnh, điều cần cải thiện, động viên — có gọi đúng tên nhân viên), rà soát rồi bấm Gửi tất cả; (2) bấm Soạn biên bản kết thúc kỳ để AI tổng hợp cả kỳ thành biên bản chính thức (kết quả, xếp loại, vấn đề, khuyến nghị) — rà soát, sửa rồi Sao chép/In. Khi đã gửi thông báo, nhân viên đăng nhập sẽ thấy card kết quả của mình ngay trên phiếu.',
        screenshotPath: null,
        annotate: null,
      },
    ],
    faq: [
      {
        question: 'Vì sao tôi không mở được đánh giá của nhân viên dù là Manager?',
        answer:
          'Quy trình tuần tự: vòng 1 (SubLeader) chưa nộp thì vòng 2, vòng 3 chưa mở — kể cả Manager cũng không mở sớm được. Hãy nhắc người đang giữ lượt nộp trước.',
      },
      {
        question: 'Mỗi nhóm có mấy Leader?',
        answer:
          'Đúng 1 Leader duy nhất. Muốn đổi Leader: vào Nhóm → Chỉnh sửa nhóm → chọn Leader mới → Cập nhật, hệ thống tự chuyển quyền.',
      },
      {
        question: 'Tôi có thể xóa nhân viên đã có lịch sử đánh giá không?',
        answer:
          'Được. Xóa là xóa mềm: nhân viên không còn xuất hiện trong kỳ mới nhưng lịch sử đánh giá cũ vẫn được giữ để đối chiếu.',
      },
      {
        question: 'Thay đổi tiêu chuẩn giữa kỳ có ảnh hưởng gì?',
        answer:
          'Tiêu chuẩn đổi sẽ áp dụng ngay cho cách chấm điểm của kỳ hiện tại. Nên rà soát kỹ trước khi lưu, tránh đổi giữa chừng khi nhiều người đã chấm.',
      },
      {
        question: 'Khi nào thì đóng kỳ?',
        answer:
          'Khi mọi nhân viên đã có kết quả vòng cuối (Manager chốt) và bạn đã rà soát báo cáo. Đóng kỳ sẽ khóa đánh giá; dữ liệu vẫn xem được ở báo cáo.',
      },
      {
        question: 'AI viết nhận xét có dùng được ngay không?',
        answer: 'Nội dung AI chỉ là gợi ý. Luôn rà soát, sửa cho khớp thực tế rồi mới lưu/gửi.',
      },
    ],
  },
  Leader: {
    role: 'Leader',
    intro:
      'Bạn là Leader quản lý một nhóm: theo dõi tiến độ đánh giá của nhóm, tự đánh giá bản thân, đánh giá vòng 2 cho nhân viên và hỗ trợ dữ liệu nhóm. Làm theo thứ tự các bước dưới đây.',
    steps: [
      {
        title: 'Đăng nhập vào hệ thống',
        body: 'Mở trình duyệt, vào địa chỉ app (ví dụ lykiv.vercel.app hoặc địa chỉ công ty cung cấp). Nhập mã nhân viên và mật khẩu, bấm Đăng nhập. Nếu chưa có mật khẩu, xem bước 2.',
        screenshotPath: '/screenshots/guide/leader-01-login.jpg',
        annotate: null,
      },
      {
        title: 'Đặt mật khẩu lần đầu (nếu chưa có)',
        body: 'Vào Cài đặt ở sidebar, tab Tài khoản. Nếu hiện nút Đặt mật khẩu thì bấm vào, nhập mật khẩu mới (tối thiểu 6 ký tự) và xác nhận. Đã có mật khẩu thì nhập mật khẩu cũ rồi bấm Đổi mật khẩu.',
        screenshotPath: '/screenshots/guide/leader-02-account.jpg',
        annotate: null,
      },
      {
        title: 'Xem dashboard và tiến độ của nhóm',
        body: 'Trang chủ Dashboard cho thấy KPI, tiến độ từng nhóm và trạng thái đánh giá. Vào Nhân viên để xem từng người trong nhóm của bạn: badge Chưa bắt đầu / Đã nộp vòng X cho biết ai còn giữ lượt, ai đã nộp xong.',
        screenshotPath: '/screenshots/guide/leader-03-dashboard.jpg',
        annotate: null,
      },
      {
        title: 'Quản lý nhân viên trong nhóm (theo quyền)',
        body: 'Bạn được thêm và sửa Nhân viên hoặc SubLeader TRONG nhóm của mình: vào Nhân viên bấm Thêm nhân viên, HOẶC vào Nhóm → mở nhóm của bạn → bấm nút Thêm nhân viên ngay trên trang chi tiết nhóm (nhóm tự chọn sẵn là nhóm của bạn). Bạn KHÔNG được xóa nhân viên và không được đổi Leader (việc đó chỉ Manager làm).',
        screenshotPath: '/screenshots/guide/leader-04-team-members.jpg',
        annotate: null,
      },
      {
        title: 'Tự đánh giá bản thân (vòng riêng của Leader)',
        body: 'Bạn cũng là người được đánh giá. Vào Nhân viên, tìm tên bạn, bấm biểu tượng tài liệu ở cuối dòng. Chấm từng tiêu chí, bấm Lưu bản nháp thường xuyên, kiểm tra lại rồi bấm Gửi Đánh giá. Sau đó Manager sẽ chấm vòng cuối cho bạn.',
        screenshotPath: '/screenshots/guide/leader-05-self-eval.jpg',
        annotate: null,
      },
      {
        title: 'Đánh giá nhân viên vòng 2 (khi SubLeader đã nộp vòng 1)',
        body: 'Chờ SubLeader nộp vòng 1 xong, phiếu nhân viên mới mở cho bạn chấm vòng 2. Mở phiếu từ danh sách Nhân viên, xem điểm vòng 1, chấm điểm theo tiêu chuẩn, ghi nhận xét (có thể dùng Gợi ý nhận xét AI), kiểm tra rồi bấm Gửi Đánh giá. Trong phiếu: nhóm đầu đã highlight sẵn; dùng dãy nhóm ở cuối trang để chuyển nhóm nhanh (tự cuộn lên đầu).',
        screenshotPath: '/screenshots/guide/leader-06-round2.jpg',
        annotate: null,
      },
      {
        title: 'Trả lại vòng 1 cho SubLeader khi cần chỉnh',
        body: 'Nếu thấy vòng 1 của SubLeader chưa hợp lý, mở phiếu nhân viên và bấm Trả lại đánh giá, nhập lý do bắt buộc rồi xác nhận. SubLeader sẽ thấy banner vàng ghi lý do, sửa lại và nộp lại. Sau đó bạn chấm vòng 2 bình thường.',
        screenshotPath: '/screenshots/guide/leader-07-return.jpg',
        annotate: null,
      },
      {
        title: 'Xem báo cáo phạm vi nhóm',
        body: 'Trang Báo cáo cho thấy phân bổ xếp loại, biểu đồ năng lực và so sánh giữa các nhóm. Bạn chỉ xem được dữ liệu trong phạm vi quyền của mình; nếu cần dữ liệu toàn hệ thống hãy liên hệ Manager.',
        screenshotPath: '/screenshots/guide/leader-09-reports.jpg',
        annotate: null,
      },
    ],
    faq: [
      {
        question: 'Vì sao tôi không mở được đánh giá của nhân viên?',
        answer: 'Vòng 1 (SubLeader) chưa nộp thì vòng 2 chưa mở. Hãy nhắc SubLeader nộp vòng 1 trước.',
      },
      {
        question: 'Tôi có thể xóa nhân viên trong nhóm không?',
        answer: 'Không. Leader chỉ được thêm/sửa Nhân viên hoặc SubLeader trong nhóm mình; xóa và đổi Leader chỉ Manager làm được.',
      },
      {
        question: 'Nhân viên bị trả lại đánh giá thì sao?',
        answer: 'Họ thấy banner vàng ghi lý do, sửa lại và nộp lại. Sau khi nộp lại, bạn tiếp tục chấm vòng 2.',
      },
      {
        question: 'Điểm vòng 1 để làm gì?',
        answer: 'Là điểm SubLeader chấm. Bạn nên tham khảo khi chấm vòng 2 để đối chiếu, tránh chênh lệch quá lớn không có giải thích.',
      },
    ],
  },
  SubLeader: {
    role: 'SubLeader',
    intro:
      'Bạn là SubLeader phụ trách một nhóm nhỏ: tự đánh giá bản thân và đánh giá vòng 1 cho nhân viên thuộc nhóm phụ trách. Làm theo thứ tự các bước dưới đây.',
    steps: [
      {
        title: 'Đăng nhập vào hệ thống',
        body: 'Mở trình duyệt, vào địa chỉ app (ví dụ lykiv.vercel.app hoặc địa chỉ công ty cung cấp). Nhập mã nhân viên và mật khẩu, bấm Đăng nhập. Nếu chưa có mật khẩu, xem bước 2.',
        screenshotPath: '/screenshots/guide/subleader-01-login.jpg',
        annotate: null,
      },
      {
        title: 'Đặt mật khẩu lần đầu (nếu chưa có)',
        body: 'Vào Cài đặt ở sidebar, tab Tài khoản. Nếu hiện nút Đặt mật khẩu thì bấm vào, nhập mật khẩu mới (tối thiểu 6 ký tự) và xác nhận. Đã có mật khẩu thì nhập mật khẩu cũ rồi bấm Đổi mật khẩu.',
        screenshotPath: '/screenshots/guide/subleader-02-account.jpg',
        annotate: null,
      },
      {
        title: 'Xem dashboard và danh sách nhân viên phụ trách',
        body: 'Trang chủ Dashboard cho thấy tiến độ chung. Vào Nhân viên để xem những người thuộc nhóm bạn phụ trách; badge trạng thái cho biết ai chưa được đánh giá vòng 1.',
        screenshotPath: '/screenshots/guide/subleader-03-dashboard.jpg',
        annotate: null,
      },
      {
        title: 'Đánh giá vòng 1 cho nhân viên trong nhóm phụ trách',
        body: 'Mở phiếu từng nhân viên (biểu tượng tài liệu ở cuối dòng), chấm từng tiêu chí theo các nhóm A, B, C..., bấm Lưu bản nháp thường xuyên, kiểm tra lại rồi bấm Gửi Đánh giá. Sau khi nộp, Leader mới mở được vòng 2. Có thể bấm vào TÊN nhân viên để mở phiếu (không cần icon tài liệu). Trong phiếu, dùng dãy nhóm tiêu chuẩn ở cuối trang để chuyển nhóm nhanh.',
        screenshotPath: '/screenshots/guide/subleader-04-round1.jpg',
        annotate: null,
      },
      {
        title: 'Tự đánh giá bản thân',
        body: 'Bạn cũng là người được đánh giá: vào Nhân viên, tìm tên bạn, mở phiếu và tự chấm vòng 1 của mình, rồi bấm Gửi Đánh giá. Leader sẽ chấm vòng 2 và Manager chấm vòng 3 cho bạn.',
        screenshotPath: '/screenshots/guide/subleader-05-self-eval.jpg',
        annotate: null,
      },
      {
        title: 'Sửa lại đánh giá khi bị trả về',
        body: 'Nếu Leader/Manager trả lại đánh giá, bạn sẽ thấy banner vàng ghi rõ lý do. Mở phiếu, xem lý do, chỉnh sửa điểm/ghi chú rồi bấm Gửi Đánh giá lần nữa để gửi lại.',
        screenshotPath: '/screenshots/guide/subleader-06-return.jpg',
        annotate: null,
      },
    ],
    faq: [
      {
        question: 'Tôi đánh giá những ai?',
        answer: 'Nhân viên thuộc nhóm bạn phụ trách và tự đánh giá bản thân. Không đánh giá cấp trên hoặc người ngoài nhóm — hệ thống sẽ chặn.',
      },
      {
        question: 'Vì sao tôi không sửa được đánh giá đã gửi?',
        answer: 'Vòng đã nộp bị khóa. Nếu cần sửa, phải được Leader/Manager trả lại (họ nhập lý do), sau đó bạn sửa và nộp lại.',
      },
      {
        question: 'Tôi có thêm/sửa nhân viên được không?',
        answer: 'Không. SubLeader chỉ đánh giá; thêm/sửa/xóa nhân viên do Leader hoặc Manager làm.',
      },
      {
        question: 'Nộp vòng 1 rồi thì sao?',
        answer: 'Leader sẽ thấy và chấm vòng 2. Bạn theo dõi badge trạng thái trên danh sách nhân viên.',
      },
    ],
  },
  Employee: {
    role: 'Employee',
    intro:
      'Bạn là nhân viên: tự theo dõi quá trình đánh giá của mình và xem kết quả cuối kỳ. Làm theo thứ tự các bước dưới đây.',
    steps: [
      {
        title: 'Đăng nhập vào hệ thống',
        body: 'Mở trình duyệt, vào địa chỉ app (ví dụ lykiv.vercel.app hoặc địa chỉ công ty cung cấp). Nhập mã nhân viên và mật khẩu, bấm Đăng nhập. Nếu chưa có mật khẩu, xem bước 2.',
        screenshotPath: '/screenshots/guide/employee-01-login.jpg',
        annotate: null,
      },
      {
        title: 'Đặt mật khẩu lần đầu (nếu chưa có)',
        body: 'Vào Cài đặt ở sidebar, tab Tài khoản. Nếu hiện nút Đặt mật khẩu thì bấm vào, nhập mật khẩu mới (tối thiểu 6 ký tự) và xác nhận. Đã có mật khẩu thì nhập mật khẩu cũ rồi bấm Đổi mật khẩu.',
        screenshotPath: '/screenshots/guide/employee-02-account.jpg',
        annotate: null,
      },
      {
        title: 'Xem kết quả đánh giá của mình',
        body: 'Sau khi đăng nhập, hệ thống đưa bạn thẳng đến phiếu đánh giá của mình. Khi Manager đã chốt và gửi thông báo, phiếu hiện card kết quả nổi bật: xếp loại, thông điệp từ Ban Quản lý (giải thích điểm mạnh, điều cần cải thiện, động viên) và ý nghĩa từng xếp loại. Dưới phiếu có mục "Kết quả các kỳ trước" để xem lại lịch sử đánh giá của bạn. Bạn chỉ có 3 trang: Phiếu đánh giá, Cài đặt (đổi mật khẩu) và Hướng dẫn.',
        screenshotPath: '/screenshots/guide/employee-03-result.jpg',
        annotate: null,
      },
      {
        title: 'Hiểu quy trình 3 vòng đánh giá',
        body: 'Bạn được đánh giá qua 3 vòng tuần tự: Vòng 1 SubLeader chấm, Vòng 2 Leader chấm, Vòng 3 Manager chốt. Vòng sau chỉ mở khi vòng trước đã nộp. Bạn không tự chấm điểm cho mình (trừ khi bạn là SubLeader/Leader/Manager).',
        screenshotPath: null,
        annotate: null,
      },
    ],
    faq: [
      {
        question: 'Khi nào tôi xem được kết quả?',
        answer: 'Sau khi Manager chốt vòng cuối, bạn vào phiếu của mình để xem xếp loại và tổng điểm.',
      },
      {
        question: 'Tôi có thể sửa đánh giá của mình không?',
        answer: 'Bạn không tự chấm; đánh giá do SubLeader/Leader/Manager thực hiện. Bạn chỉ xem kết quả.',
      },
      {
        question: 'Vì sao tôi không mở được hồ sơ của người khác?',
        answer: 'Mỗi người chỉ xem được dữ liệu trong phạm vi của mình. Mở hồ sơ cấp trên hoặc người ngoài phạm vi sẽ bị chặn.',
      },
    ],
  },
};
