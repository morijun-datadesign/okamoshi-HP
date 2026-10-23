-- ============================================================
-- 0002: 実施塾・教室マスターデータ (cram_schools)
--   適用: npx wrangler d1 migrations apply okamoshi-master --remote
-- ============================================================

CREATE TABLE IF NOT EXISTS cram_schools (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  display_order INTEGER NOT NULL,                   -- 表示順
  area_id       TEXT NOT NULL,                      -- 学区ID (okayama-east, kurashiki 等)
  area_name     TEXT NOT NULL,                      -- 学区名 (岡山・東備学区 等)
  name          TEXT NOT NULL,                      -- 塾・教室名
  website_url   TEXT,                               -- 公式サイトURL (空文字またはNULL許容)
  phone_number  TEXT,                               -- 電話番号
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cram_schools_area_id ON cram_schools(area_id);
CREATE INDEX IF NOT EXISTS idx_cram_schools_display_order ON cram_schools(display_order);
