# HANDOFF — Kurabe QAQC (2026-08-14, chốt phiên tối)

## Trạng thái: main khớp origin ✓ (mọi commit đã push)

## Phiên này đã hoàn thành
- **P65** Live test toàn diện (6 tasks) — org test TST, cleanup xong, DB nguyên trạng 22/3/22/1/8/0
- **P66** Fix 2 bugs: sync team change vào evaluation (team_id + R2/R3 evaluator) + audit CREATE/UPDATE user&team (logAuditAction)
- **P67** Trang Hỗ trợ + In Hướng Dẫn: thêm Trả lại đánh giá, AI hỗ trợ, đổi Leader 2 cách, FAQ mới + 5 ảnh minh họa (public/screenshots/)
- **P68** Form Thêm NV default team = "Chọn nhóm..." + validation + dọn dead code upsertUserAction

## Việc còn mở (chờ anh quyết)
1. Thử lại 2 nút AI chưa verify ("Soạn thông báo", "Giải thích bằng AI") — AI suggestion đã hoạt động
2. Bật đăng nhập bằng mật khẩu thật (hiện mock — code sẵn sàng)
3. Deploy production lên Vercel
4. Import Excel — anh đã chốt bỏ qua

## Lưu ý vận hành
- Form thêm NV giờ bắt buộc chọn team (Manager) — đã fix default nhóm đầu
- Reports cache 300s (số liệu trễ tối đa 5 phút — design)
- AI chờ 10–60s; fail-soft (không crash)
- Supabase keepalive cron vẫn chạy (T7 21:00, CN 08:00 → Discord #report)
- Server local đã tắt cuối phiên — start lại bằng `npm run start` khi cần
