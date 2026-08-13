# E2E Live Test Recipe — Kurabe QAQC

Tạo nhóm/user test qua UI (mã `TST*`), chạy 3 vòng (SubLeader → Leader → Manager → Approved), verify dashboard/reports/scope, rồi **DỌN SẠCH**: `DELETE rounds → evaluations → audit_logs (actor LIKE '%Test%') → users (TST%) → teams (Test E2E)` + verify count=0 (xem skill `supabase-remote-ops` pitfalls).
