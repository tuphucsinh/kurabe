-- KURABE QAQC — Merge Worker criteria into shared criteria
-- Source: TCDGCN.xlsx (Công nhân)
-- Applies QL + NV + CN to high-confidence existing matches.
-- Adds only unmatched Worker-specific criteria as CN-only.
-- Idempotent; no existing criterion is deleted.

BEGIN;

-- High-confidence matches from TCDGCN.xlsx -> existing criteria IDs.
-- A1-A9, B1-B3, C2-C4, D1/D3, E1/E5, F2-F5.
WITH matched(id) AS (
  VALUES
    ('e1e77b6c-d88b-49f4-b2c7-f57d27277328'::uuid),
    ('342d2dcb-689d-48a2-bff4-f8c2ee7ce8bd'::uuid),
    ('2c91b92e-faca-4b4e-ad1f-e5bedd0a7045'::uuid),
    ('899a94f6-0805-491b-a41e-86e11116bce5'::uuid),
    ('2e900ad7-cc30-4dc4-bc0b-1289ca20c6e1'::uuid),
    ('f487589a-0d7b-4714-9be4-b65f7c26199c'::uuid),
    ('72cb2abf-d34f-43b7-9b01-ab2b721fff66'::uuid),
    ('afe617df-03dc-4aaa-ae14-f6b30d7d6424'::uuid),
    ('1c3c8f5f-e9e1-421c-8223-0523f83ad3b7'::uuid),
    ('eb00bcb2-27e8-4910-87c1-65d16314575c'::uuid),
    ('a836ae13-647c-4483-8460-16f5d20430b1'::uuid),
    ('4b479dd9-f3a3-4035-bb00-3656516fe2a3'::uuid),
    ('dbdce64f-b3f0-4191-9f4f-d855beccc3ca'::uuid),
    ('673a2c3c-365d-4eab-87f7-8d6270016c48'::uuid),
    ('da2fb789-0629-4cc8-9318-11b7082c8c66'::uuid),
    ('3c477f83-90db-467c-89f9-586475126d3a'::uuid),
    ('8ca60df3-0c94-4e9f-b026-7c3408feb7d9'::uuid),
    ('b0455e9a-953e-4d42-bf9a-c2c02166e15b'::uuid),
    ('66261f86-67eb-41ac-a700-a038c4a59b52'::uuid),
    ('b15ff127-b9d9-4773-b47a-575c19f705b7'::uuid),
    ('342a048a-6577-4129-95db-3099cf310fff'::uuid),
    ('9420b22f-eba9-447d-8a09-a084f93b147f'::uuid),
    ('b734ccdc-0782-4386-b890-11581e478581'::uuid)
)
UPDATE public.criteria c
SET applies_to = 'both'
WHERE c.id IN (SELECT id FROM matched);

WITH matched(id) AS (
  VALUES
    ('e1e77b6c-d88b-49f4-b2c7-f57d27277328'::uuid),('342d2dcb-689d-48a2-bff4-f8c2ee7ce8bd'::uuid),('2c91b92e-faca-4b4e-ad1f-e5bedd0a7045'::uuid),('899a94f6-0805-491b-a41e-86e11116bce5'::uuid),('2e900ad7-cc30-4dc4-bc0b-1289ca20c6e1'::uuid),('f487589a-0d7b-4714-9be4-b65f7c26199c'::uuid),('72cb2abf-d34f-43b7-9b01-ab2b721fff66'::uuid),('afe617df-03dc-4aaa-ae14-f6b30d7d6424'::uuid),('1c3c8f5f-e9e1-421c-8223-0523f83ad3b7'::uuid),('eb00bcb2-27e8-4910-87c1-65d16314575c'::uuid),('a836ae13-647c-4483-8460-16f5d20430b1'::uuid),('4b479dd9-f3a3-4035-bb00-3656516fe2a3'::uuid),('dbdce64f-b3f0-4191-9f4f-d855beccc3ca'::uuid),('673a2c3c-365d-4eab-87f7-8d6270016c48'::uuid),('da2fb789-0629-4cc8-9318-11b7082c8c66'::uuid),('3c477f83-90db-467c-89f9-586475126d3a'::uuid),('8ca60df3-0c94-4e9f-b026-7c3408feb7d9'::uuid),('b0455e9a-953e-4d42-bf9a-c2c02166e15b'::uuid),('66261f86-67eb-41ac-a700-a038c4a59b52'::uuid),('b15ff127-b9d9-4773-b47a-575c19f705b7'::uuid),('342a048a-6577-4129-95db-3099cf310fff'::uuid),('9420b22f-eba9-447d-8a09-a084f93b147f'::uuid),('b734ccdc-0782-4386-b890-11581e478581'::uuid)
), audiences(audience) AS (
  VALUES ('management'), ('employee'), ('worker')
)
INSERT INTO public.criterion_audiences (criterion_id, audience)
SELECT m.id, a.audience FROM matched m CROSS JOIN audiences a
ON CONFLICT (criterion_id, audience) DO NOTHING;

-- Unmatched Worker-only criteria from the workbook.
WITH new_criteria(group_code, code, name) AS (
  VALUES
    ('D', 'D5', 'Cố gắng hoàn thành công việc được giao'),
    ('E', 'E8', 'Thực hiện đúng quy định Công ty'),
    ('E', 'E9', 'Thực hiện theo phương châm Công ty và bộ phận'),
    ('E', 'E10', 'Ý thức tiết kiệm'),
    ('F', 'F10', 'Phát sinh sản phẩm hư (NG)')
)
INSERT INTO public.criteria (group_id, code, name, description, applies_to, weight, is_active)
SELECT g.id, n.code, n.name, 'Nguồn: TCDGCN.xlsx — tiêu chuẩn Công nhân.', 'staff', 0, true
FROM new_criteria n
JOIN public.criteria_groups g ON g.code = n.group_code AND g.is_active = true
WHERE NOT EXISTS (
  SELECT 1 FROM public.criteria c
  WHERE c.group_id = g.id AND c.code = n.code
);

WITH new_criteria(group_code, code) AS (
  VALUES ('D', 'D5'), ('E', 'E8'), ('E', 'E9'), ('E', 'E10'), ('F', 'F10')
)
INSERT INTO public.criterion_audiences (criterion_id, audience)
SELECT c.id, 'worker'
FROM public.criteria c
JOIN public.criteria_groups g ON g.id = c.group_id
JOIN new_criteria n ON n.group_code = g.code AND n.code = c.code
ON CONFLICT (criterion_id, audience) DO NOTHING;

WITH levels(group_code, code, sort_order, points, label) AS (
  VALUES
    ('D','D5',0,5,'Nỗ lực đến cùng'),('D','D5',1,4,'Có cố gắng'),('D','D5',2,3,'Bình thường'),('D','D5',3,2,'Thiếu nỗ lực'),('D','D5',4,1,'Rất hay bỏ cuộc'),
    ('E','E8',0,5,'Rất tốt'),('E','E8',1,4,'Khá tốt'),('E','E8',2,3,'Bình thường'),('E','E8',3,2,'Vi phạm 1 lần'),('E','E8',4,1,'Nhiều lần vi phạm'),
    ('E','E9',0,5,'Hiểu rõ, làm đúng và có thể hướng dẫn lại'),('E','E9',1,4,'Hiểu rõ và thực hiện theo đúng'),('E','E9',2,3,'Biết và làm được theo hướng dẫn'),('E','E9',3,2,'Chưa hiểu rõ và thực hiện đôi lúc còn sai'),('E','E9',4,1,'Không thực hiện được dù đã được chỉ dẫn'),
    ('E','E10',0,5,'Rất cao'),('E','E10',1,4,'Cao'),('E','E10',2,3,'Bình thường'),('E','E10',3,2,'Kém'),('E','E10',4,1,'Rất kém'),
    ('F','F10',0,15,'0 lần'),('F','F10',1,12,'1 lần'),('F','F10',2,9,'2 lần'),('F','F10',3,6,'3 lần'),('F','F10',4,3,'4 lần trở lên')
)
INSERT INTO public.criterion_levels (criterion_id, points, label, sort_order)
SELECT c.id, l.points, l.label, l.sort_order
FROM levels l
JOIN public.criteria_groups g ON g.code = l.group_code AND g.is_active = true
JOIN public.criteria c ON c.group_id = g.id AND c.code = l.code
WHERE NOT EXISTS (
  SELECT 1 FROM public.criterion_levels old WHERE old.criterion_id = c.id
);

COMMIT;
