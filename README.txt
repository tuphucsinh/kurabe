# 🚀 Antigravity V3 - Hướng Dẫn Vận Hành (Lean Discipline)
> **Triết lý**: Kỷ luật, Tinh gọn, Chống ảo giác (Anti-Hallucination), Tiết kiệm Token.

---

## 🏗 1. Kiến Trúc Lõi (State Machine)
Hệ thống hoạt động như một Cỗ máy Trạng thái dựa trên File System:
- **Bộ nhớ Dài hạn (`.ai/`)**: Chứa Kiến trúc (`ARCHITECT.md`), Data Schema (`SCHEMA.md`), Quyết định (`DECISIONS_LOG.md`) và Quy chuẩn dị biệt (`CONVENTIONS.md`).
- **Bộ nhớ Làm việc (`tasks.md`)**: Danh sách WBS (Work Breakdown Structure). AI chỉ làm việc trong Task được chỉ định.
- **Bộ nhớ Phiên (`HANDOFF.md`, `.tmp/`)**: Snapshot trạng thái khi đóng/mở phiên. `HANDOFF.md` là "lá thư" nối mạch giữa các lần chat.

---

## 🔄 2. Luồng Hoạt Động Tiêu Chuẩn
Mọi công việc đều phải đi qua 4 lệnh/giai đoạn nghiêm ngặt:

### 🟢 Giai đoạn 0: Start of Session (Mở máy)
AI tự động quét `HANDOFF.md`, `tasks.md`, `KNOWN_BUGS.md`. Định vị vị trí hiện tại và báo cáo mục tiêu.

### 🛠 Lệnh 1: `/plan [Feature]` (Thiết kế & Băm Task)
- AI không viết code.
- Phân rã Feature thành chuỗi Task nhỏ vào `tasks.md`.
- Cập nhật Kiến trúc/Schema (`.ai/`) nếu cần.
- **Quy tắc**: 1 khối logic = 1 task. Không nhồi nhét.

### ⚙️ Lệnh 2: `/do [Task_ID]` (Thi công 4-Cổng)
AI phải đi qua 4 Cổng thép (Gates) trước khi xong việc:
1.  **Gate 1 (TDD-First)**: Đọc môi trường thực tế (VD: `package.json`, `Makefile`). **[🚨]** Bắt buộc chạy Test để thấy màu **ĐỎ** (Fail) chứng minh lỗi/chưa có code, TRƯỚC KHI sang Gate 2. Áp dụng tư duy `@test-driven-development`.
2.  **Gate 2 (CODE)**: Viết code thực thi.
3.  **Gate 3 (Hardcode Audit)**: Kết hợp Tool Máy & Tư Duy. Chạy `npm run lint:audit` trước để bắt lỗi kĩ thuật, sau đó dùng Sequential Thinking truy quét 3 lỗi logic/bảo mật lõi.
4.  **Gate 4 (Test & Verification)**: 
    - Chạy Test. Nếu Pass -> Xác minh `@verification-before-completion` -> Tick `[x]`.
    - **Nếu Fail lần 1**: Dừng viết code. Dùng **Web Search** kiếm tài liệu và gọi skill `@systematic-debugging` điều tra log rồi mới sửa lần 2.
    - **Nếu Fail lần 2**: **2-Strike HALT**. AI khóa máy, báo cáo lỗi vào `.tmp/SYSTEM_ALERT.md`, chờ Anh chỉ thị.

### 🚑 Lệnh 3: `/fix [Bug]` (Cấp cứu)
Dùng cho lỗi nhỏ, typo, crash nhanh. Bypass 4-Gate nhưng phải dùng `@systematic-debugging` và ghi nhật ký vào `.tmp/diary.md`.

### ⛺ Lệnh 4: `/done` — Đóng Phiên
Áp dụng nguyên tắc `@verification-before-completion` rà soát tổng thể. Tổng kết tiến độ/blocker vào `HANDOFF.md`, xóa sạch rác ở `.tmp/`. Sẵn sàng cho phiên tiếp theo nhẹ nhàng.

---

## 🚨 Lưu Ý Quan Trọng
- **Cấm đoán mò**: Tuyệt đối không để AI retry code lần 2 mà không đọc log/research.
- **Dọn dẹp (Sweep)**: Khi Phase hoàn thành 100%, AI tự động nén summary vào `MASTER_PLAN.md` và dọn `tasks.md`.
- **Phân tách**: Nếu file trong `.ai/` > 800 dòng -> Bắt buộc phân mảnh.

## Stitch:
- Khởi tạo & Lấy Design: Anh đưa lệnh: /plan [Project_ID] - Build giao diện từ hệ thống Stitch. Chỉ cần vậy, Em sẽ chủ động dùng các tool như mcp_StitchMCP_get_project hoặc gọi skill @design-md để quét dự án Stitch của Anh trên server.
- Cấu trúc Design System (.ai/DESIGN.md): Thay vì phải code từ màn hình trắng, Em sẽ xuất toàn bộ Color Palette, Typography, và Layout rules từ hệ thống Stitch ra thành file .ai/DESIGN.md để đảm bảo code sinh ra khớp 100% bản mẫu.
- Chuyển hóa (Render into Code): Sau đó, Em sẽ dùng lệnh /do chạy tuần tự để lấy từng Screen (màn hình) trong cấu trúc Stitch, dịch nó thành CSS hoặc các Component Framework (React/Vue/Next.js... tuỳ Anh setup) rồi đưa hẳn vào ổ cứng của Anh. Đương nhiên với các tiêu chuẩn Code Sạch, Component hóa như luật thép của Antigravity quy định!