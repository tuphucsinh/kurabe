'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  FilePenLine,
  HelpCircle,
  Lock,
  Printer,
  ShieldCheck,
  Settings2,
  Sparkles,
  UsersRound,
  LineChart,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const usageGuide = [
  {
    title: '1. Kiểm tra đúng kỳ trước khi thao tác',
    content:
      'Nhìn xuống cuối sidebar để xác nhận bộ chọn kỳ đang đứng ở đúng năm cần làm việc. Đây là bước đầu tiên bắt buộc vì toàn bộ danh sách nhân viên, lịch sử đánh giá, báo cáo và màn hình chi tiết đều phụ thuộc vào kỳ đang chọn. Nếu chọn nhầm kỳ, bạn có thể tưởng rằng thiếu dữ liệu hoặc đánh giá sai người trong khi thực tế chỉ là đang xem nhầm năm.',
  },
  {
    title: '2. Mở danh sách nhân viên và đọc trạng thái đúng cách',
    content:
      'Vào mục "Nhân viên" để xem toàn bộ danh sách trong phạm vi quyền của bạn. Ở cột "Xếp loại gần nhất", vòng hiện tại luôn được hiển thị đậm hơn, các vòng trước mờ hơn. Hãy dùng cột này để xác định nhanh một người đang ở vòng nào, điểm hiện tại là bao nhiêu, và có lịch sử thay đổi gì từ các vòng trước. Trên màn hình chi tiết nhóm, mỗi người có badge trạng thái rõ ràng: "Chưa bắt đầu" (chưa ai nộp vòng hiện tại), "Đã nộp vòng X" (vòng X vừa được nộp hoặc đã xem xét) hoặc "Đã có KẾT QUẢ đánh giá" (đã được duyệt hoàn tất).',
  },
  {
    title: '3. Mở đúng hồ sơ cần đánh giá hoặc cần xem',
    content:
      'Nhấn biểu tượng tài liệu ở cuối dòng nhân viên để vào chi tiết đánh giá. Nếu hệ thống hiện "Bạn không thể xem đánh giá của cấp trên", nghĩa là bạn đang cố mở đánh giá của người giữ chức vụ cao hơn bạn. Nếu hiện "Chưa có dữ liệu đánh giá", nghĩa là kỳ hiện tại chưa có evaluation tương ứng cho nhân viên đó và cần kiểm tra lại kỳ hoặc dữ liệu khởi tạo. Nếu hiện "Tên nhân viên (chức vụ) chưa có đánh giá — hiện đang ở vòng X/Y", nghĩa là vòng hiện tại chưa ai khởi tạo bản nháp cho nhân viên đó.',
  },
  {
    title: '4. Hiểu rõ màn hình chi tiết trước khi chấm điểm',
    content:
      'Phía trên cùng của màn hình chi tiết sẽ cho biết bạn đang ở vòng nào, đang ở chế độ sửa hay chỉ xem, và đánh giá đó đã nộp hay chưa. Khối tóm tắt bên phải hiển thị điểm, xếp loại và số tiêu chí đã chấm của vòng hiện tại; các vòng trước được liệt kê bên dưới để bạn so sánh. Nếu bạn nhìn thấy trạng thái "Chỉ xem" hoặc "Đã nộp", nghĩa là vòng đó đã bị khóa và bạn không thể sửa trực tiếp nữa.',
  },
  {
    title: '5. Chấm từng tiêu chí theo nhóm một cách chính xác',
    content:
      'Các tiêu chí được chia theo nhóm A, B, C... Hãy bấm từng tab nhóm để chấm hết trong một nhóm rồi mới chuyển sang nhóm khác. Mỗi tiêu chí chỉ chọn một mức điểm. Nếu một tiêu chí có nhiều lựa chọn cùng số điểm, hệ thống vẫn ghi nhớ đúng thẻ mà bạn vừa bấm gần nhất. Khi cần giải thích, bấm "Ghi chú" ngay trong tiêu chí đó để nhập nội dung cụ thể thay vì để lại nhận xét chung quá ngắn.',
  },
  {
    title: '6. Lưu nháp trong lúc làm để tránh mất dữ liệu',
    content:
      'Trong quá trình chấm, nên bấm "Lưu bản nháp" thường xuyên, đặc biệt sau khi hoàn thành một nhóm tiêu chí lớn hoặc sau khi nhập nhiều ghi chú. Hệ thống sẽ hiện thông báo xác nhận ở đầu trang và tự ẩn sau vài giây. Lưu nháp không khóa vòng hiện tại, nên bạn vẫn có thể quay lại tiếp tục chỉnh sửa nếu chưa gửi.',
  },
  {
    title: '7. Kiểm tra lại trước khi gửi',
    content:
      'Trước khi bấm "Gửi Đánh giá", hãy rà soát ba điểm: tổng số tiêu chí đã chấm đã đủ chưa, xếp loại/tổng điểm có đúng kỳ vọng không, và ghi chú quan trọng đã nhập đầy đủ chưa. Nếu đang đánh giá nhiều vòng, cũng nên nhìn nhanh lịch sử các vòng trước để tránh chấm lệch quá mạnh mà không có giải thích.',
  },
  {
    title: '8. Gửi đánh giá và hiểu điều gì xảy ra sau đó',
    content:
      'Khi bấm "Gửi Đánh giá", hệ thống sẽ khóa vòng hiện tại ngay sau khi gửi thành công. Bạn sẽ không còn sửa lại vòng đó qua giao diện. Nếu workflow còn bước tiếp theo, hệ thống tự mở vòng kế tiếp cho người có trách nhiệm tiếp theo. Sau đó trang sẽ quay về danh sách nhân viên và dữ liệu trên danh sách sẽ được cập nhật ngay mà không cần tự bấm reload.',
  },
  {
    title: '9. Khi đánh giá bị trả lại (Return) — phải sửa và nộp lại',
    content:
      'Người đánh giá vòng sau (Leader/Manager) có thể bấm "Trả lại đánh giá" khi thấy cần bổ sung hoặc chỉnh sửa. Khi đó: (1) phiếu của bạn được mở lại (trạng thái về bản nháp), (2) trên màn hình hiện banner màu vàng ghi rõ lý do trả lại, (3) bạn bấm vào phiếu, xem lý do, chỉnh sửa điểm/ghi chú rồi bấm "Gửi Đánh giá" lần nữa. Lý do trả lại là BẮT BUỘC phải nhập khi người đánh giá trả lại. Sau khi bạn nộp lại, lý do trả lại sẽ được xóa và vòng đánh giá tiếp tục như bình thường.',
  },
  {
    title: '10. Cách đọc lỗi và xử lý đúng',
    content:
      'Nếu gặp lỗi quyền truy cập, không thử gửi lại nhiều lần; hãy kiểm tra đúng vai trò và đúng kỳ trước. Nếu gặp lỗi vì chưa có dữ liệu evaluation, cần kiểm tra xem nhân viên đó đã được khởi tạo trong kỳ hiện tại chưa. Nếu thấy vòng mới không mở đúng như mong đợi, hãy đối chiếu lại phần workflow theo vai trò bên dưới để xác định đang chờ ai đánh giá tiếp theo.',
  },
];

const roleGuides = [
  {
    role: 'Nhân viên',
    icon: UsersRound,
    summary:
      'Được đánh giá qua 3 vòng: SubLeader → Leader → Manager; chỉ xem kết quả trong phạm vi của mình.',
    details:
      'Nhân viên không tự khởi tạo phiếu đánh giá; phiếu do người đánh giá theo workflow tạo và chấm. Nếu mở phiếu của cấp trên hoặc người ngoài nhóm, hệ thống sẽ chặn truy cập.',
  },
  {
    role: 'SubLeader',
    icon: UsersRound,
    summary:
      'Tự đánh giá bản thân ở vòng 1, đồng thời đánh giá nhân viên trong nhóm ở vòng 1.',
    details:
      'SubLeader được chấm chính mình và nhân viên thuộc phạm vi nhóm phụ trách tại vòng 1. Nếu mở người không thuộc quyền hoặc mở cấp trên, hệ thống sẽ chặn truy cập.',
  },
  {
    role: 'Leader',
    icon: FilePenLine,
    summary:
      'Đánh giá vòng của chính mình, đánh giá nhân sự nhóm ở vòng tiếp theo và so sánh biến động giữa các vòng.',
    details:
      'Leader có thể xem draft vòng trước để chuẩn bị đánh giá, nhưng chỉ sửa được khi workflow đã mở đúng lượt.',
  },
  {
    role: 'Manager',
    icon: ClipboardCheck,
    summary:
      'Quản lý kỳ đánh giá, xem toàn bộ dữ liệu, chấm vòng cuối và điều chỉnh trực tiếp bộ tiêu chuẩn khi cần.',
    details:
      'Manager là vai trò duy nhất có quyền quản lý kỳ đánh giá (tạo/đóng/xóa), rà soát tất cả nhân sự, cập nhật tiêu chuẩn, thang điểm, mục tiêu kỳ và xem nhật ký hoạt động — tập trung trong trang Cài đặt (6 tab: Tài khoản, Kỳ đánh giá, Thang điểm, Nhóm & Quyền, Nhật ký, Mục tiêu).',
  },
];

const roleWorkflows = [
  {
    role: 'Nhân viên',
    steps: [
      { round: 'Vòng 1', evaluator: 'SubLeader đánh giá' },
      { round: 'Vòng 2', evaluator: 'Leader đánh giá' },
      { round: 'Vòng 3', evaluator: 'Manager đánh giá' },
    ],
  },
  {
    role: 'SubLeader',
    steps: [
      { round: 'Vòng 1', evaluator: 'Tự đánh giá (SELF)' },
      { round: 'Vòng 2', evaluator: 'Leader đánh giá' },
      { round: 'Vòng 3', evaluator: 'Manager đánh giá' },
    ],
  },
  {
    role: 'Leader',
    steps: [
      { round: 'Vòng 1', evaluator: 'Tự đánh giá (SELF)' },
      { round: 'Vòng 2', evaluator: 'Manager đánh giá' },
    ],
  },
  {
    role: 'Manager',
    steps: [
      { round: 'Vòng 1', evaluator: 'Tự đánh giá (SELF)' },
      { round: 'Kết thúc', evaluator: 'Hoàn tất sau vòng 1' },
    ],
  },
];

const managementGuide = [
  {
    title: 'Quản lý nhân viên',
    steps: [
      'Vào mục "Nhân viên" từ sidebar để xem danh sách hiện có.',
      'Để thêm mới, dùng nút "Thêm nhân viên mới" ở góc trên bên phải.',
      'Để import hàng loạt, bấm nút "Nhập từ Excel", tải file mẫu về, điền dữ liệu theo đúng định dạng và tải file lên. Hệ thống sẽ tự động rà soát lỗi và xác nhận trước khi lưu.',
      'Để sửa thông tin, bấm biểu tượng bút chì ở cuối dòng nhân viên.',
      'Để xóa, bấm biểu tượng thùng rác và xác nhận lại trước khi xóa.',
    ],
    note:
      'Manager có thể thêm/sửa/xóa toàn bộ nhân viên. Leader chỉ được thêm/sửa Employee hoặc SubLeader trong chính nhóm mình quản lý và không có quyền xóa nhân viên.',
  },
  {
    title: 'Quản lý nhóm',
    steps: [
      'Vào mục "Nhóm" từ sidebar để xem các nhóm đang tồn tại.',
      'Dùng nút "Thêm nhóm mới" để tạo nhóm.',
      'Dùng biểu tượng bút chì trên thẻ nhóm để sửa tên nhóm hoặc leader của nhóm.',
      'Dùng biểu tượng thùng rác trên thẻ nhóm để xóa nhóm khi không còn sử dụng.',
    ],
    note:
      'Quy tắc: MỖI NHÓM CHỈ CÓ ĐÚNG 1 LEADER; SubLeader không giới hạn số lượng. Có 2 cách đổi Leader: (1) NHANH: vào Nhóm → "Chỉnh sửa nhóm" → chọn Leader mới trong danh sách → Cập nhật (hệ thống tự chuyển quyền). (2) QUA NHÂN VIÊN: hạ người đang giữ chức xuống "Nhân viên" trước, rồi thăng người khác lên Leader — hệ thống sẽ từ chối nếu cố thăng người mới khi nhóm đã có Leader. Khi thay đổi chức vụ, nhóm hoặc SubLeader, hệ thống TỰ ĐỘNG đồng bộ: leader hiển thị ở trang Nhóm, danh sách nhân viên, team trên phiếu đánh giá và gán lại người đánh giá cho các vòng CHƯA nộp (vòng đã nộp giữ nguyên).',
  },
  {
    title: 'Quản lý tiêu chuẩn đánh giá',
    steps: [
      'Vào mục "Tiêu chuẩn" từ sidebar để xem danh sách các nhóm tiêu chí (A, B, C...) và thang điểm.',
      'Để thêm tiêu chí mới, bấm nút "Thêm tiêu chuẩn", điền tên, nhóm, mô tả và các mức điểm.',
      'Để sửa, bấm biểu tượng bút chì trên tiêu chí/nhóm cần sửa.',
      'Để xóa, bấm biểu tượng thùng rác và xác nhận lại trước khi xóa.',
    ],
    note:
      'Chỉ Manager (Ngô Thảo Ly / tài khoản có vai trò Manager) mới được thêm, sửa, xóa tiêu chuẩn và nhóm tiêu chuẩn. Leader, SubLeader và Nhân viên chỉ được xem bảng tiêu chuẩn, không có nút thao tác. Thay đổi tiêu chuẩn sẽ ảnh hưởng ngay đến cách chấm điểm của kỳ hiện tại nên cần rà soát kỹ trước khi lưu.',
  },
  {
    title: 'Cập nhật tài khoản & mật khẩu (mọi vai trò)',
    steps: [
      'Vào mục "Cài đặt" từ sidebar — mọi vai trò đều vào được, nhưng chỉ thấy tab "Tài khoản" của mình (Manager thấy thêm các tab quản trị).',
      'Tab Tài khoản hiển thị thông tin cá nhân (mã nhân viên, họ tên, chức vụ, nhóm).',
      'Chưa có mật khẩu → bấm "Đặt mật khẩu" (tối thiểu 6 ký tự). Đã có mật khẩu → nhập mật khẩu cũ rồi "Đổi mật khẩu".',
    ],
    note:
      'Hiện tại đăng nhập vẫn dùng mã nhân viên; mật khẩu được lưu sẵn sàng cho đợt bật đăng nhập bằng mật khẩu sắp tới. Manager có thể đặt lại mật khẩu của nhân viên (đưa về trống) từ nút "Đặt lại mật khẩu" trong trang Nhân viên — khi đó nhân viên vào Cài đặt đặt mật khẩu mới.',
  },
];

const permissionMatrix = [
  {
    role: 'Manager',
    rights:
      'Xem toàn bộ dữ liệu; thêm, sửa, xóa nhân viên (kèm đặt lại mật khẩu); thêm, sửa, xóa nhóm; tạo, đóng, xóa kỳ; sửa tiêu chuẩn, thang điểm, mục tiêu kỳ; xem nhật ký hoạt động; chấm vòng cuối theo workflow.',
  },
  {
    role: 'Leader',
    rights:
      'Xem dữ liệu trong phạm vi nhóm và các evaluation liên quan tới mình; thêm/sửa Employee hoặc SubLeader trong nhóm mình quản lý; chấm các vòng được giao; không có quyền xóa nhân viên hoặc quản lý nhóm/kỳ.',
  },
  {
    role: 'SubLeader',
    rights:
      'Xem dữ liệu trong phạm vi nhóm phụ trách; tự đánh giá vòng 1 và đánh giá nhân viên vòng 1; không có quyền thêm, sửa, xóa nhân viên hoặc nhóm; có thể cập nhật thông tin cá nhân và đặt/đổi mật khẩu trong Cài đặt → Tài khoản.',
  },
  {
    role: 'Nhân viên',
    rights:
      'Chỉ xem dữ liệu thuộc phạm vi của mình và tham gia các vòng đánh giá nếu workflow cho phép; không có quyền quản lý nhân viên, nhóm, kỳ hay tiêu chuẩn; có thể cập nhật thông tin cá nhân và đặt/đổi mật khẩu trong Cài đặt → Tài khoản.',
  },
];

const aiGuide = [
  {
    title: 'Gợi ý nhận xét (AI)',
    content:
      'Khi chấm điểm, bấm "Gợi ý nhận xét (AI)" để hệ thống tự viết nhận xét tổng quát dựa trên điểm và ghi chú của bạn (điền vào ô Ghi chú chung). AI chạy 10–60 giây — chờ thông báo hoàn tất, KHÔNG bấm lại nhiều lần. Bạn nên chỉnh sửa lại cho khớp thực tế trước khi gửi.',
  },
  {
    title: 'Soạn thông báo kết quả (AI)',
    content:
      'Manager có thể bấm "Soạn thông báo kết quả (AI)" trên màn hình chi tiết đánh giá để tạo nháp thông báo kết quả cho nhân viên — rà soát và chỉnh sửa trước khi sử dụng.',
  },
  {
    title: 'Giải thích cảnh báo bất thường (AI)',
    content:
      'Khi điểm giữa 2 vòng liên tiếp chênh lệch từ 20 điểm trở lên, Dashboard hiện cảnh báo (≥20: chú ý, ≥30: nghiêm trọng). Bấm "Giải thích bằng AI" để có phân tích nguyên nhân khả dĩ — dùng làm căn cứ trao đổi, không phải kết luận cuối cùng.',
  },
  {
    title: 'Tóm tắt kỳ bằng AI (Báo cáo)',
    content:
      'Trên trang Báo cáo, bấm "Tạo tóm tắt" để AI tổng hợp toàn bộ kỳ: phân bổ xếp loại, điểm nổi bật, xu hướng nhận xét và gợi ý hành động. Bản tóm tắt lưu theo kỳ, tạo lại khi cần cập nhật số liệu mới.',
  },
];

const faqItems = [
  {
    question: 'Vì sao tôi chỉ xem được mà không sửa được?',
    answer:
      'Bạn đang ở ngoài lượt đánh giá của mình, hoặc vòng đó đã được nộp. Hệ thống khóa chỉnh sửa để giữ đúng quy trình nhiều vòng.',
  },
  {
    question: 'Vì sao mở vào chỉ thấy thông báo "Bạn không thể xem đánh giá của cấp trên"?',
    answer:
      'Thông báo này xuất hiện khi người dùng cấp thấp hơn cố mở đánh giá của người giữ chức vụ cao hơn (ví dụ SubLeader mở đánh giá của Leader, hoặc Nhân viên mở đánh giá của SubLeader/Leader). Mỗi vai trò chỉ được xem đánh giá trong phạm vi công việc của mình.',
  },
  {
    question: 'Tôi muốn thay đổi Leader hoặc SubLeader của nhóm thì làm thế nào?',
    answer:
      'Quy tắc này chỉ áp dụng cho Leader: mỗi nhóm chỉ có đúng 1 Leader. Muốn đổi Leader, hãy làm 2 bước theo đúng thứ tự: (1) vào "Nhân viên", hạ người đang giữ chức xuống "Nhân viên" trước; (2) sau đó thăng người mới lên Leader. Hệ thống sẽ chặn nếu bạn thăng người mới khi nhóm vẫn còn Leader cũ. Với SubLeader thì không giới hạn: thăng thêm hoặc hạ bớt bất cứ lúc nào, hệ thống tự cập nhật vòng đánh giá tương ứng.',
  },
  {
    question: 'Vì sao có nhân viên chưa có dữ liệu evaluation?',
    answer:
      'Kỳ đang chọn có thể chưa được khởi tạo cho nhân viên đó, hoặc bạn đang đứng ở một kỳ cũ/chưa có dữ liệu. Hãy kiểm tra lại bộ chọn kỳ trước.',
  },
  {
    question: 'Điểm các vòng trước dùng để làm gì?',
    answer:
      'Điểm cũ giúp đối chiếu mức thay đổi qua từng lượt đánh giá. Tại danh sách nhân viên và màn hình chi tiết, vòng hiện tại luôn nổi bật hơn để tránh đọc nhầm.',
  },
  {
    question: 'Hệ thống thông báo và cảnh báo hoạt động như thế nào?',
    answer:
      'Hệ thống sử dụng các thông báo nổi (Toast) ở góc màn hình để báo trạng thái thành công/lỗi nhằm không làm gián đoạn công việc. Với các thao tác rủi ro cao (Xóa, Gửi đánh giá), hệ thống sẽ hiển thị hộp thoại xác nhận (Confirm Dialog) rõ ràng để tránh bấm nhầm.',
  },
  {
    question: 'Tôi có thể dùng hệ thống trên điện thoại không?',
    answer:
      'Có. Giao diện đã được tối ưu hoàn toàn cho thiết bị di động. Bạn có thể mở menu bên (Sidebar) thông qua nút menu ở góc màn hình, đồng thời các biểu đồ, bảng biểu và thao tác chấm điểm đều thân thiện với thao tác chạm/vuốt.',
  },
  {
    question: 'Tôi bị trả lại đánh giá thì phải làm gì?',
    answer:
      'Đánh giá của bạn được mở lại để sửa. Nhìn banner màu vàng ở đầu màn hình để đọc lý do trả lại, chỉnh sửa điểm/ghi chú theo yêu cầu rồi bấm "Gửi Đánh giá" lần nữa. Nếu không thấy nút sửa, kiểm tra lại bạn có đang đứng đúng lượt đánh giá của mình không.',
  },
  {
    question: 'Cảnh báo "đánh giá bất thường" trên Dashboard là gì?',
    answer:
      'Hệ thống tự so sánh điểm giữa 2 vòng liên tiếp: chênh từ 20 điểm trở lên là bất thường (≥30 nghiêm trọng) và hiện cảnh báo trên Dashboard để người quản lý rà soát. Bấm "Giải thích bằng AI" để có phân tích hỗ trợ; sau khi kiểm tra, người đánh giá có thể điều chỉnh điểm ở vòng chưa nộp.',
  },
];

const quickLinks = [
  { href: '#huong-dan', label: 'Cách thao tác' },
  { href: '#vai-tro', label: 'Theo vai trò' },
  { href: '#workflow', label: 'Workflow các vòng' },
  { href: '#bao-cao', label: 'Đọc báo cáo & Phân tích' },
  { href: '#ai-ho-tro', label: 'AI hỗ trợ đánh giá' },
  { href: '#quan-ly-du-lieu', label: 'Quản lý dữ liệu nền' },
  { href: '#faq', label: 'Câu hỏi thường gặp' },
];

const reportingGuide = [
  {
    title: 'Biểu đồ Radar (Hồ sơ năng lực)',
    content: 'Biểu đồ Radar hiển thị sức mạnh tương đối của nhân viên trên các nhóm tiêu chí (A, B, C...). Một hình đa giác đều và rộng thể hiện năng lực toàn diện. Nếu biểu đồ bị "móp" ở một góc, đó là dấu hiệu của nhóm kỹ năng cần cải thiện.',
  },
  {
    title: 'Phân tích khoảng cách (Skill Gap Analysis)',
    content: 'Skill Gap là sự chênh lệch giữa Điểm mục tiêu (Target) và Điểm thực tế (Actual). Nếu điểm thực tế thấp hơn mục tiêu, hệ thống sẽ đánh dấu vùng thiếu hụt. Đây là căn cứ quan trọng nhất để lập kế hoạch đào tạo hoặc luân chuyển nhân sự.',
  },
  {
    title: 'Biến động điểm qua các vòng',
    content: 'Hệ thống cho phép so sánh điểm giữa vòng Tự đánh giá, Leader đánh giá và Manager chốt. Khoảng cách lớn giữa các vòng thường cho thấy sự chưa thống nhất về kỳ vọng công việc giữa nhân viên và quản lý.',
  },
  {
    title: 'Xếp loại và Tổng điểm',
    content: 'Tổng điểm là giá trị định lượng cuối cùng, nhưng Xếp loại (S, A, B, C...) mới là giá trị dùng để xét thưởng hoặc thăng tiến. Xếp loại được tính dựa trên dải điểm cấu hình sẵn trong tiêu chuẩn của từng kỳ.',
  },
];

export default function SupportPage() {
  const { isManager } = useAuth();

  const handlePrintGuide = () => {
    window.open('/print-guide.html?autoPrint=true', '_blank');
  };

  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto print:p-0 print:space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 md:p-6 shadow-sm lg:col-span-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 print:border-none print:shadow-none print:p-0">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Trang hỗ trợ</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950 md:text-4xl">
              Hướng dẫn sử dụng và quyền thao tác trong hệ thống đánh giá
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600 md:text-base">
              Trang này gom toàn bộ hướng dẫn quan trọng theo đúng luồng sử dụng thực tế: chọn kỳ,
              mở hồ sơ, chấm điểm, lưu nháp, gửi đánh giá, đọc workflow nhiều vòng và hiểu rõ ai
              được phép làm gì.
            </p>
          </div>
          <button
            onClick={handlePrintGuide}
            className="flex items-center gap-2 rounded-2xl bg-[#07384d] px-5 py-3 text-sm font-black text-white transition-colors hover:bg-[#052b3b] shadow-sm whitespace-nowrap print:hidden active:scale-95 cursor-pointer"
          >
            <Printer size={18} />
            In Hướng Dẫn (A4)
          </button>
        </div>

        <div className="rounded-[24px] border border-cyan-100 bg-cyan-50/70 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-cyan-800 shadow-sm">
              <BookOpen size={20} />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">Đọc theo thứ tự này</p>
              <p className="text-xs leading-5 text-slate-500">Giúp người mới không bị lạc luồng.</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {quickLinks.map((item, index) => (
              <a
                key={item.href}
                href={item.href}
                className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-cyan-200 hover:text-cyan-900"
              >
                <span>
                  {index + 1}. {item.label}
                </span>
                <ArrowRight size={16} className="text-slate-400" />
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-6">
          <div id="huong-dan" className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-800">
                <BookOpen size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">Hướng dẫn sử dụng chi tiết</h2>
                <p className="text-sm text-slate-500">
                  Đọc theo đúng thứ tự bên dưới để đi từ chuẩn bị dữ liệu tới khi gửi xong một bản
                  đánh giá mà không bỏ sót bước.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {usageGuide.map((item, index) => (
                <div
                  key={item.title}
                  className="grid gap-4 rounded-[20px] border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[56px_minmax(0,1fr)] md:items-start"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-lg font-black text-cyan-800 shadow-sm">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 md:text-base">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.content}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <figure className="rounded-[20px] border border-slate-200 bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/screenshots/03-evaluation-detail.jpg"
                  alt="Màn chi tiết đánh giá"
                  className="w-full rounded-xl border border-slate-100"
                />
                <figcaption className="mt-2 px-1 text-xs leading-5 text-slate-500">
                  Màn chi tiết đánh giá: chấm theo nhóm tiêu chí (A–F), so sánh điểm các vòng, ghi chú chung.
                </figcaption>
              </figure>
            </div>
          </div>

          <div id="vai-tro" className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                <UsersRound size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">Hướng dẫn theo vai trò</h2>
                <p className="text-sm text-slate-500">Mỗi vai trò nhìn thấy và thao tác khác nhau theo quy trình nhiều vòng.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {roleGuides.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.role} className="rounded-[20px] border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                        <Icon size={18} />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900">{item.role}</h3>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                          Vai trò thao tác
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm font-semibold leading-6 text-slate-800">{item.summary}</p>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.details}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div id="workflow" className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
                <ClipboardCheck size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">Workflow các vòng theo vai trò</h2>
                <p className="text-sm text-slate-500">Mô tả cụ thể luồng đánh giá đúng theo cấu hình hệ thống hiện tại.</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {roleWorkflows.map((workflow) => (
                <div key={workflow.role} className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-4">
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">
                    {workflow.role}
                  </h3>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {workflow.steps.map((step, index) => (
                      <div key={`${workflow.role}-${step.round}-${index}`} className="flex items-center gap-2">
                        <div className="min-w-[138px] rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{step.round}</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-slate-800">{step.evaluator}</p>
                        </div>
                        {index < workflow.steps.length - 1 && (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200/70 text-slate-500">
                            <ArrowRight size={14} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div id="bao-cao" className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <LineChart size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">Hướng dẫn đọc báo cáo & Phân tích</h2>
                <p className="text-sm text-slate-500">Cách diễn giải các biểu đồ và chỉ số năng lực trong hệ thống.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {reportingGuide.map((item) => (
                <div key={item.title} className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-4">
                  <h3 className="text-sm font-black text-slate-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{item.content}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <figure className="rounded-[20px] border border-slate-200 bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/screenshots/05-reports.jpg"
                  alt="Trang Báo cáo"
                  className="w-full rounded-xl border border-slate-100"
                />
                <figcaption className="mt-2 px-1 text-xs leading-5 text-slate-500">
                  Trang Báo cáo: KPI, phân bổ xếp loại, so sánh nhóm, Top Performers, Tóm tắt bằng AI.
                </figcaption>
              </figure>
              <figure className="rounded-[20px] border border-slate-200 bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/screenshots/01-dashboard.jpg"
                  alt="Dashboard tổng quan"
                  className="w-full rounded-xl border border-slate-100"
                />
                <figcaption className="mt-2 px-1 text-xs leading-5 text-slate-500">
                  Dashboard tổng quan: KPI, trạng thái theo nhóm, phân bổ, tồn đọng, hoạt động gần đây.
                </figcaption>
              </figure>
            </div>
          </div>

          <div id="ai-ho-tro" className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-fuchsia-50 text-fuchsia-700">
                <Sparkles size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">AI hỗ trợ đánh giá</h2>
                <p className="text-sm text-slate-500">Các nút AI giúp tiết kiệm thời gian; nội dung AI sinh ra chỉ là gợi ý, bạn có thể chỉnh sửa trước khi lưu/gửi.</p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {aiGuide.map((item) => (
                <div key={item.title} className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-4">
                  <h3 className="text-sm font-black text-slate-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{item.content}</p>
                </div>
              ))}
            </div>
          </div>

          <div id="quan-ly-du-lieu" className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <UsersRound size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">Hướng dẫn thêm, sửa, xóa nhân viên, nhóm và tiêu chuẩn</h2>
                <p className="text-sm text-slate-500">Phần này dành cho thao tác quản trị dữ liệu nền trước và trong kỳ đánh giá.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {managementGuide.map((item) => (
                <div key={item.title} className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
                  <h3 className="text-sm font-black text-slate-900">{item.title}</h3>
                  <div className="mt-3 space-y-3">
                    {item.steps.map((step, index) => (
                      <div key={step} className="flex gap-3">
                        <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-emerald-700 shadow-sm">
                          {index + 1}
                        </div>
                        <p className="text-sm leading-7 text-slate-600">{step}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm font-medium leading-7 text-slate-800">{item.note}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Quyền hạn</h3>
                  <p className="text-xs leading-5 text-slate-500">
                    Dùng bảng này để xác định nhanh vai trò nào được làm gì trong hệ thống.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {permissionMatrix.map((item) => (
                  <div key={item.role} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-sm font-black text-slate-900">{item.role}</p>
                    <p className="mt-1 text-sm leading-7 text-slate-600">{item.rights}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <figure className="rounded-[20px] border border-slate-200 bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/screenshots/02-employees.jpg"
                  alt="Danh sách nhân viên"
                  className="w-full rounded-xl border border-slate-100"
                />
                <figcaption className="mt-2 px-1 text-xs leading-5 text-slate-500">
                  Danh sách nhân viên: badge xếp loại gần nhất theo vòng, nút thao tác cuối dòng.
                </figcaption>
              </figure>
              <figure className="rounded-[20px] border border-slate-200 bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/screenshots/04-settings-log.jpg"
                  alt="Cài đặt → Nhật ký hoạt động"
                  className="w-full rounded-xl border border-slate-100"
                />
                <figcaption className="mt-2 px-1 text-xs leading-5 text-slate-500">
                  Cài đặt → Nhật ký hoạt động: mọi thao tác quan trọng được ghi lại (ai, làm gì, khi nào).
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <div id="faq" className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
                <HelpCircle size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">Câu hỏi thường gặp</h2>
                <p className="text-sm text-slate-500">Những tình huống dễ gây nhầm trong lúc sử dụng.</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {faqItems.map((item) => (
                <div key={item.question} className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
                  <h3 className="text-sm font-black text-slate-900">{item.question}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-[#07384d] p-6 text-white shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white">
                <Lock size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black">Nguyên tắc quyền truy cập</h2>
                <p className="text-sm text-white/70">Đọc phần này để hiểu vì sao hệ thống cho sửa hoặc chỉ cho xem.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-7 text-white/80">
              <p>Cấp dưới không được mở đánh giá của cấp trên. Khi vượt quyền, màn hình sẽ chặn ngay bằng thông báo không có quyền truy cập.</p>
              <p>Mỗi vòng chỉ mở chỉnh sửa cho đúng người và đúng thời điểm. Sau khi gửi, vòng đó bị khóa và hệ thống chuyển sang vòng tiếp theo nếu workflow còn bước tiếp.</p>
              <p>Manager có phạm vi kiểm soát rộng nhất, nhưng vẫn bị khóa chỉnh sửa ở các vòng đã nộp để đảm bảo lịch sử đánh giá không bị ghi đè ngoài quy trình.</p>
            </div>

            {isManager ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-sm font-bold text-white">Manager có thể điều chỉnh cấu hình ngay trong hệ thống.</p>
                <p className="mt-2 text-sm leading-7 text-white/75">
                  Dùng nút bên dưới để vào màn hình tiêu chuẩn, sửa nhóm tiêu chí, mức điểm và mức mặc định áp dụng cho kỳ đánh giá mới.
                </p>
                <Link
                  href="/criteria"
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#07384d] transition-colors hover:bg-slate-100"
                >
                  <Settings2 size={18} />
                  Sửa trực tiếp
                </Link>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-sm font-bold text-white">Bạn đang ở chế độ xem hướng dẫn.</p>
                <p className="mt-2 text-sm leading-7 text-white/75">
                  Nếu cần thay đổi tiêu chuẩn, nhóm hoặc workflow, hãy liên hệ Manager vì chỉ Manager mới có nút sửa trực tiếp trong khu vực hỗ trợ này.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
