# HANDOFF — Kurabe QAQC (2026-08-14, P69 password login)

## Trạng thái: main sạch, chưa push (chờ anh báo)

## Phiên này đã hoàn thành — Phase 69: Bật đăng nhập mật khẩu thật ✅
- **T01**: login/logout server action — bcrypt + rule NULL fallback; cookie `auth_session` httpOnly 7 ngày; login page bật password field. Fix bug logout (Sidebar cũ document.cookie bất lực với httpOnly).
- **T02**: migration REVOKE anon password_hash (GRANT 11 cột) + `USER_SELECT` thay mọi `select('*')` users + changePassword/resetPassword sang supabaseAdmin.
- **T03**: 3 case login PASS trên user test (NULL không pass / sai pass chặn / đúng pass vào / reset fallback) — test data đã dọn, nguyên trạng 22/3/22/1/8.
- **Dữ liệu**: reset hash 158 (sót từ P52) → NULL. Mọi account thật đều password_hash NULL = login mã NV như cũ; NV tự đặt pass sau (Cài đặt → Tài khoản).
- Commits: `19476cd` `1b805d0` `656f1c0` + docs. Chưa push.

## Việc còn mở (chờ anh quyết)
1. Thử lại 2 nút AI chưa verify ("Soạn thông báo", "Giải thích bằng AI")
2. Deploy production lên Vercel (⚠️ AI env chưa set: AI_API_KEY, AI_BASE_URL, AI_MODEL)
3. Cloudflare Tunnel: chờ anh trỏ nameserver `vorigin.vn` → Cloudflare
4. Khi muốn siết thật: rate-limit login + refactor client anon-write (C3)

## Lưu ý vận hành
- Server local port 3000 đang chạy (`npm run start`) — kill trước khi build (`ss -tlnp | grep 3000`).
- PAT Supabase cho kurabe: dùng PAT trong `~/.hermes/profiles/mika/config.yaml` (MCP), KHÔNG dùng `~/.supabase/access-token`.
