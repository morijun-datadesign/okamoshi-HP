-- ============================================================
-- 0001: 申込フォーム用マスターデータ（郵便番号・学校）
--   適用: npx wrangler d1 migrations apply okamoshi-master --remote
-- ============================================================

-- ------------------------------------------------------------
-- 郵便番号マスター（日本郵便 utf_ken_all.csv 由来）
--   ※ 1つの郵便番号に複数町域が紐づくケースがあるため zip_code は PK にせず、
--     明示インデックスで等価検索を O(log n) に保つ。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zip_codes (
  zip_code   TEXT NOT NULL,   -- 7桁ハイフンなし（例: 7000822）
  prefecture TEXT NOT NULL,   -- 都道府県（例: 岡山県）
  city       TEXT NOT NULL,   -- 市区町村（例: 岡山市北区）
  town       TEXT NOT NULL DEFAULT ''  -- 町域（例: 表町）
);

CREATE INDEX IF NOT EXISTS idx_zip_code ON zip_codes(zip_code);

-- ------------------------------------------------------------
-- 学校マスター（文部科学省 学校コード一覧 由来）
--   school_type: 小学校 / 中学校 / 義務教育学校 / 中等教育学校
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schools (
  school_code TEXT PRIMARY KEY,  -- 文科省学校コード（13桁）
  school_name TEXT NOT NULL,
  school_type TEXT NOT NULL,
  prefecture  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_school_name ON schools(school_name);
-- 学年（小6/中学生）での絞り込み + 岡山県優先ソート用
CREATE INDEX IF NOT EXISTS idx_school_type_pref ON schools(school_type, prefecture);
