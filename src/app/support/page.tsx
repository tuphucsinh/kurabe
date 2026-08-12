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
      'Vào mục "Nhân viên" để xem toàn bộ danh sách trong phạm vi quyền của bạn. Ở cột "Xếp loại gần nhất", vòng hiện tại luôn được hiển thị đậm hơn, các vòng trước mờ hơn. Hãy dùng cột này để xác định nhanh một người đang ở vòng nào, điểm hiện tại là bao nhiêu, và có lịch sử thay đổi gì từ các vòng trước.',
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
    title: '9. Cách đọc lỗi và xử lý đúng',
    content:
      'Nếu gặp lỗi quyền truy cập, không thử gửi lại nhiều lần; hãy kiểm tra đúng vai trò và đúng kỳ trước. Nếu gặp lỗi vì chưa có dữ liệu evaluation, cần kiểm tra xem nhân viên đó đã được khởi tạo trong kỳ hiện tại chưa. Nếu thấy vòng mới không mở đúng như mong đợi, hãy đối chiếu lại phần workflow theo vai trò bên dưới để xác định đang chờ ai đánh giá tiếp theo.',
  },
];

const roleGuides = [
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
      'Manager là vai trò duy nhất có quyền khởi tạo kỳ mới, đóng kỳ, rà soát tất cả nhân sự và cập nhật cấu hình tiêu chuẩn đánh giá.',
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
      'Để import hàng loạt, bấm nút "Import Excel", tải file mẫu về, điền dữ liệu theo đúng định dạng và tải file lên. Hệ thống sẽ tự động rà soát lỗi và xác nhận trước khi lưu.',
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
      'Quy tắc bắt buộc: MỖI NHÓM CHỈ CÓ ĐÚNG 1 LEADER VÀ 1 SUBLEADER. Để thay đổi Leader/SubLeader, phải làm đúng 2 bước: (1) HẠ người đang giữ chức xuống "Nhân viên" trước, (2) rồi THĂNG người khác lên. Hệ thống sẽ từ chối nếu cố thăng người mới khi nhóm đã có người giữ chức (hiện thông báo yêu cầu hạ người cũ trước). Khi thay đổi chức vụ, hệ thống tự đồng bộ leader hiển thị ở trang Nhóm, danh sách nhân viên và các vòng đánh giá tương ứng.',
  },
];

const permissionMatrix = [
  {
    role: 'Manager',
    rights:
      'Xem toàn bộ dữ liệu; thêm, sửa, xóa nhân viên; thêm, sửa, xóa nhóm; tạo, đóng, xóa kỳ; sửa tiêu chuẩn; chấm vòng cuối theo workflow.',
  },
  {
    role: 'Leader',
    rights:
      'Xem dữ liệu trong phạm vi nhóm và các evaluation liên quan tới mình; thêm/sửa Employee hoặc SubLeader trong nhóm mình quản lý; chấm các vòng được giao; không có quyền xóa nhân viên hoặc quản lý nhóm/kỳ.',
  },
  {
    role: 'SubLeader',
    rights:
      'Xem dữ liệu trong phạm vi nhóm phụ trách; tự đánh giá vòng 1 và đánh giá nhân viên vòng 1; không có quyền thêm, sửa, xóa nhân viên hoặc nhóm.',
  },
  {
    role: 'Nhân viên',
    rights:
      'Chỉ xem dữ liệu thuộc phạm vi của mình và tham gia các vòng đánh giá nếu workflow cho phép; không có quyền quản lý nhân viên, nhóm, kỳ hay tiêu chuẩn.',
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
      'Mỗi nhóm chỉ có đúng 1 Leader và 1 SubLeader. Muốn đổi người giữ chức, hãy làm 2 bước theo đúng thứ tự: (1) vào "Nhân viên", hạ người đang giữ chức xuống "Nhân viên" trước; (2) sau đó thăng người mới lên Leader/SubLeader. Hệ thống sẽ chặn nếu bạn thăng người mới khi nhóm vẫn còn người giữ chức cũ — đây là quy tắc bắt buộc để mỗi nhóm luôn chỉ có 1 Leader + 1 SubLeader.',
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
];

const quickLinks = [
  { href: '#huong-dan', label: 'Cách thao tác' },
  { href: '#vai-tro', label: 'Theo vai trò' },
  { href: '#workflow', label: 'Workflow các vòng' },
  { href: '#bao-cao', label: 'Đọc báo cáo & Phân tích' },
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
          </div>

          <div id="quan-ly-du-lieu" className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <UsersRound size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">Hướng dẫn thêm, sửa, xóa nhân viên và nhóm</h2>
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
