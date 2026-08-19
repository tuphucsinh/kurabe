# Secrets Location — Kurabe QAQC

> ⚠️ Anh (Mika) làm việc với **NHIỀU account Supabase** → mỗi project PHẢI dùng ĐÚNG key,
> không lấy nhầm token account/project khác. File này chỉ note **nơi lưu**, không chứa giá trị secret.

## Key quản trị Supabase (MCP / chạy SQL tự do)

- **Project ref**: `cliiqqthppxuzirabzla`
- **Nơi lưu**: `~/.hermes/profiles/mika/config.yaml` → mục `supabase` MCP server
  (biến `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`)
- **Loại**: Supabase **personal/management access token** (`sbp_…`) — **account-level**, quyền quản trị
  mọi project của account → KHÔNG đặt trong project folder, chỉ dùng cho MCP/ops.
- Cách dùng để query SQL (VD dung lượng DB):
  `curl -X POST https://api.supabase.com/v1/projects/{ref}/database/query -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -d '{"query":"..."}'`

## App keys (dùng trong code/runtime)

- File: `.env.local` (git-ignored, KHÔNG commit)
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client)
  - `SUPABASE_SERVICE_ROLE_KEY` (server, admin)
  - AI chat: `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` (`https://opencode.ai/zen/go/v1`)
  - `KURABE_WEBHOOK_URL` / `KURABE_WEBHOOK_SECRET`, Telegram

## ⚠️ KHÔNG nhầm với token account khác

- `~/.supabase/access-token` (prefix `sbp_6f2a…`) → account KHÁC
- `~/.supabase/access-token-affvn` (prefix `sbp_9c6d…`) → **affvn** (project `rglnmxhjpvgnllpsdbuk`)
- Chỉ token trong `mika/config.yaml` mới đúng cho Kurabe.
