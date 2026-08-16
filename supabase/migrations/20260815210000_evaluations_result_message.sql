-- Phase 77 T2: evaluations thêm cột result_message (thông báo kết quả do Manager soạn AI → Employee xem)
alter table public.evaluations add column if not exists result_message text;
