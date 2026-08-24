# Chính Sách và Ranh Giới Quản Trị AI (AI Governance Boundary) — KURABE QAQC

Tài liệu quy định ranh giới bảo mật, kiểm soát dữ liệu, giới hạn tài nguyên và nguyên tắc vận hành khi tích hợp AI/LLM trong hệ thống đánh giá QAQC KURABE.

---

## 1. Mục Đích và Nguyên Tắc Cốt Lõi

- **Bảo toàn tính năng trợ lý và nghiệp vụ**: AI trợ lý (Chat Assistant) và AI tóm tắt (Period Summary) được kích hoạt phục vụ người dùng theo đúng phân quyền. Dữ liệu đánh giá QAQC (tiến độ, phân bổ xếp loại, điểm số, mã nhân viên, ghi chú đánh giá) được gửi tới LLM khi cần thiết để trả lời câu hỏi của người dùng có thẩm quyền.
- **Không vô hiệu hóa hay xóa nhầm dữ liệu nghiệp vụ hợp lệ**: Ranh giới quản trị (AI Governance Boundary) bảo vệ hệ thống bằng cách kiểm soát chặt chẽ biên giới đầu vào/đầu ra, lọc các mẫu thông tin chứng thực (credentials) và giới hạn độ dài payload, mà không làm sai lệch hay mất ngữ cảnh nghiệp vụ.
- **An toàn và độc lập**: Module quản trị được thiết kế dạng pure function, server-safe, không phụ thuộc vào framework, database hay network tại thời điểm nạp module.

---

## 2. Các Giới Hạn và Cơ Chế Làm Sạch Dữ Liệu (Bounds & Redaction)

### 2.1. Hạn mức ký tự (Input Bounds)
Hệ thống áp dụng các ngưỡng trần ký tự định lượng (`src/lib/ai-governance.ts`):
- `MAX_AI_PROMPT_CHARS = 12000`: Độ dài tối đa cho toàn bộ nội dung prompt gửi tới LLM.
- `MAX_AI_SYSTEM_CHARS = 8000`: Độ dài tối đa cho system prompt và tài liệu tri thức nghiệp vụ.
- `MAX_AI_HISTORY_ITEMS = 12`: Số lượng lượt hội thoại gần nhất được giữ lại trong ngữ cảnh.
- `MAX_AI_HISTORY_ITEM_CHARS = 800`: Độ dài tối đa cho mỗi tin nhắn trong lịch sử hội thoại.
- `MAX_AI_IMAGE_BASE64_CHARS = 921600`: Ngưỡng trần chuỗi base64 cho ảnh chụp màn hình gửi Vision (~900KB).
- `MAX_AI_REPORT_HISTORY_CHARS = 8000`: Độ dài tối đa cho lịch sử hội thoại khi người dùng báo lỗi kỹ thuật.

### 2.2. Che giấu thông tin chứng thực (Secret Redaction)
Hàm `redactAISecrets` tự động nhận diện và thay thế bằng nhãn `[REDACTED]`:
- Token ủy quyền: `Bearer <token>`, `Basic <token>`.
- Gán giá trị bí mật: `api_key`, `password`, `secret`, `cookie`, `access_token`, `refresh_token`, `auth_token`, `session_token`, `client_secret`.
- Các định dạng khóa nhận diện phổ biến: `sk-*`, `sbp_*`, `ghp_*`, chuỗi JWT (`eyJ*`).
- **Bảo toàn ngữ cảnh**: Toàn bộ tiếng Việt tự nhiên, tên người dùng, mã nhân viên (như `NV001`, `EMP-042`), điểm đánh giá và xếp loại không bị ảnh hưởng.

### 2.3. Lọc ký tự điều khiển & Chuẩn hóa đầu vào
- Loại bỏ các ký tự ASCII control không in được (`\x00-\x08`, `\x0B`, `\x0C`, `\x0E-\x1F`, `\x7F`), bảo toàn các ký tự ngắt dòng (`\n`, `\r`) và tab (`\t`).
- Lọc danh sách lịch sử hội thoại chỉ chấp nhận hai vai trò hợp lệ: `user` và `assistant`.
- Chuẩn hóa tên hành động (`normalizeAIAction`) về tập ký tự an toàn `[a-zA-Z0-9_-]` tối đa 64 ký tự; mọi chuỗi sai định dạng hoặc cố tình chèn ký tự lạ đều rơi về `'unknown'`.

---

## 3. Phân Quyền và Hạn Mức Tần Suất (Role Auth & Rate Limits)

### 3.1. Phân quyền theo vai trò (Role Scopes)
- **Manager**: Có quyền truy vấn dữ liệu toàn diện (tiến độ tổng thể, phân bổ xếp loại, top tăng/giảm, bất thường đánh giá) và thực hiện tạo tóm tắt kỳ qua AI (`ai_summaries`).
- **Leader / SubLeader**: Chỉ được hỗ trợ tra cứu quy trình, hướng dẫn thao tác trong phạm vi nhóm quản lý; hệ thống từ chối các yêu cầu phân tích sâu ngoài thẩm quyền.
- **Worker / Employee**: Chỉ được giải đáp quy trình đánh giá cơ bản và kết quả của bản thân; không được tiếp cận dữ liệu người khác.

### 3.2. Quản lý hạn mức tần suất (Rate Limiting — Fail-Closed)
- **Chat Trợ lý**: Giới hạn **15 lượt hỏi / 2 giờ** cho mỗi người dùng (`chat_usage`). Slot được đặt chỗ (reserve) trước khi gửi yêu cầu tới LLM nhằm chống gian lận và tránh vượt ngân sách.
- **Tác vụ Quản trị AI**: Giới hạn **30 lượt / giờ** (`ai_usage`) cho các hành động quản trị như tóm tắt kỳ.
- **Báo lỗi hệ thống**: Giới hạn **1 lượt báo lỗi / ngày** cho mỗi người dùng (`chat_reports`).

---

## 4. Kiểm Soát Nhà Cung Cấp LLM (`AI_ALLOWED_HOSTS`)

Biến môi trường máy chủ `AI_ALLOWED_HOSTS` cung cấp cơ chế kiểm soát danh sách domain được phép kết nối:
- **Khi để trống**: Cho phép kết nối tới endpoint hợp lệ được chỉ định trong `AI_BASE_URL` (hỗ trợ cả HTTPS và HTTP nội bộ mạng LAN).
- **Khi cấu hình danh sách domain** (phân tách bằng dấu phẩy, ví dụ: `api.openai.com, opencode.ai, 192.168.1.50`): Bắt buộc hostname mục tiêu phải khớp chính xác (không phân biệt chữ hoa/chữ thường).
- **Chính sách từ chối**:
  - Từ chối URL sai cú pháp.
  - Từ chối URL chứa thông tin đăng nhập (`http://user:pass@host`).
  - Từ chối URL chứa query parameter (`?key=...`) hoặc hash fragment (`#...`).
  - Từ chối các giao thức ngoài HTTP/HTTPS (ví dụ `ftp:`, `file:`).

---

## 5. Cơ Chế Dự Phòng Sự Cố (Fail-Soft) và Ghi Log An Toàn

- **Fail-Soft**: Nếu thiếu API key, nhà cung cấp bị chặn, timeout hoặc phát sinh lỗi mạng, các hàm gọi AI trả về `null` và hiển thị thông báo nhẹ nhàng đến người dùng. Tuyệt đối không làm văng exception hay gây crash giao diện ứng dụng.
- **Safe Operational Logging**:
  - Ghi nhận tối thiểu thông tin kỹ thuật: HTTP status code, hostname nhà cung cấp, tên model AI.
  - **Cấm ghi log**: Không bao giờ in ra console/log nội dung prompt, kết quả phản hồi từ AI, chuỗi ảnh base64, API key, token bí mật hay toàn bộ exception object thô.

---

## 6. Trạng Thái Lưu Trữ Dữ Liệu (Data Retention Status)

- **Lưu ý quan trọng**: File migration SQL về chính sách lưu trữ (data retention) ở Phase 3 hiện chỉ ở dạng **đề xuất kỹ thuật (candidate)** và **CHƯA ĐƯỢC ÁP DỤNG TRỰC TIẾP** vào cơ sở dữ liệu Supabase đang vận hành.
- **Không tự động dọn dẹp**: Hiện tại hệ thống chưa thực hiện auto-purge dữ liệu trong các bảng `ai_usage`, `chat_usage`, `chat_reports`.
- Mọi dữ liệu lưu trữ lịch sử được bảo lưu phục vụ quản trị và điều tra sự cố cho đến khi có quyết định kích hoạt chính thức từ Manager.

---

## 7. Danh Mục Kiểm Tra Vận Hành Trước Go-Live (Operational Checklist)

Trước khi kích hoạt trên môi trường Production, Quản trị viên cần kiểm tra các mục sau:
1. [ ] **Cấu hình Provider**: Kiểm tra `AI_BASE_URL` và thiết lập danh sách `AI_ALLOWED_HOSTS` chính xác theo hạ tầng được phê duyệt.
2. [ ] **Bảo mật Khóa**: Đảm bảo `AI_API_KEY`, `KURABE_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN` chỉ nằm trong môi trường máy chủ an toàn, không commit vào git và không xuất hiện ở client.
3. [ ] **Phê duyệt Migration Retention**: Rà soát và áp dụng migration dọn dẹp dữ liệu bảng ghi nhận AI theo định kỳ nếu có yêu cầu tuân thủ dữ liệu.
4. [ ] **Giám sát Log**: Kiểm tra log vận hành của server đảm bảo tuân thủ nguyên tắc không lộ thông tin nhạy cảm.
