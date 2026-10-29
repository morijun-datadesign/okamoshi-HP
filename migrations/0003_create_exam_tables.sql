-- ============================================================
-- 0003: 模試日程・会場・時間割・出題範囲マスターテーブル群
--   適用: npx wrangler d1 migrations apply okamoshi-master --remote
-- ============================================================

-- 1. 模試基本マスター
CREATE TABLE IF NOT EXISTS exam_schedules (
  id TEXT PRIMARY KEY,               -- 例: c3_10 (学年コード_月号数字)
  grade_code TEXT NOT NULL,          -- c3, c2, c1, p6
  grade_name TEXT NOT NULL,          -- 中3, 中2, 中1, 小6
  issue_name TEXT NOT NULL,          -- 10月号
  title TEXT NOT NULL,               -- 岡山県統一模擬試験
  catch_copy TEXT,                   -- 志望校決定の秋！...
  announcement TEXT,                 -- 緊急アナウンス（空欄時は通常文言を自動生成）
  fee INTEGER NOT NULL,              -- 5500
  fee_note TEXT,                     -- 会場・自宅共通
  subjects_note TEXT,                -- 各教科45分 / 5教科（500点満点）
  apply_deadline TEXT,               -- 2026-10-16 23:59
  ticket_shipping_date TEXT,         -- 2026-10-13 (YYYY-MM-DD)
  ticket_shipping_note TEXT,         -- ※試験3日前までに...
  home_return_deadline TEXT,         -- 2027-01-14 (自宅受験答案返送締切日)
  result_shipping_date TEXT,         -- 2026-11-12 (YYYY-MM-DD)
  result_shipping_note TEXT,         -- ※成績表・個人診断票...
  sort_order INTEGER DEFAULT 0
);

-- 2. 会場・個別日程マスター
CREATE TABLE IF NOT EXISTS exam_venues (
  id TEXT PRIMARY KEY,               -- 例: c3_10_okayama (GAS側で自動生成)
  schedule_id TEXT NOT NULL,         -- exam_schedules.id
  venue_type TEXT NOT NULL,          -- 岡山会場, 津山会場, 自宅受験
  venue_name TEXT,                   -- 山陽学園中学校・高等学校 等
  map_url TEXT,                      -- GoogleマップURL
  exam_date_start TEXT NOT NULL,     -- 2026-11-01 (YYYY-MM-DD)
  exam_date_end TEXT,                -- 2026-11-01 (自宅受験のみ設定、他はNULL)
  belongings TEXT,                   -- 持参物（改行テキスト）
  notice TEXT,                       -- 注意事項（改行テキスト）
  deadline_home TEXT,                -- 自宅受験用答案締切（YYYY-MM-DD HH:mm）
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (schedule_id) REFERENCES exam_schedules(id) ON DELETE CASCADE
);

-- 3. 時間割マスター
CREATE TABLE IF NOT EXISTS exam_timetables (
  id TEXT PRIMARY KEY,               -- 例: c3_10_okayama_1 (GAS側で自動連番生成)
  venue_id TEXT NOT NULL,            -- exam_venues.id
  item_name TEXT NOT NULL,           -- 受付, 社会, 数学...
  time_range TEXT NOT NULL,          -- 9:30〜9:50
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (venue_id) REFERENCES exam_venues(id) ON DELETE CASCADE
);

-- 4. 出題範囲マスター
CREATE TABLE IF NOT EXISTS exam_scopes (
  id TEXT PRIMARY KEY,               -- 例: c3_10_kokugo
  schedule_id TEXT NOT NULL,         -- exam_schedules.id
  subject TEXT NOT NULL,             -- 国語, 数学, 英語, 理科, 社会
  units TEXT NOT NULL,               -- 単元名（カンマ区切りテキスト）
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (schedule_id) REFERENCES exam_schedules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_venues_schedule ON exam_venues(schedule_id);
CREATE INDEX IF NOT EXISTS idx_timetables_venue ON exam_timetables(venue_id);
CREATE INDEX IF NOT EXISTS idx_scopes_schedule ON exam_scopes(schedule_id);
