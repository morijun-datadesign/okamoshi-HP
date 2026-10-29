-- ============================================================
-- 0004: exam_schedules テーブルに自宅受験答案返送締切日カラムを追加
--   適用: npx wrangler d1 migrations apply okamoshi-master --remote
-- ============================================================

ALTER TABLE exam_schedules ADD COLUMN home_return_deadline TEXT;
