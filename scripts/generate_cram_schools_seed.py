import csv

def generate_seed_sql():
    input_csv = "cram_schools.csv"
    output_sql = "db/seed/cram_schools.sql"

    with open(input_csv, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    lines = [
        "-- ============================================================",
        "-- 実施塾マスターデータ初期投入シード (cram_schools: 119件)",
        "--   実行: npx wrangler d1 execute okamoshi-master --remote --file=db/seed/cram_schools.sql",
        "-- ============================================================",
        "DELETE FROM cram_schools;",
        "INSERT INTO cram_schools (display_order, area_id, area_name, name, website_url, phone_number) VALUES",
    ]

    val_lines = []
    for r in rows:
        order = int(r["表示順"])
        area_id = r["学区ID"].replace("'", "''")
        area_name = r["学区名"].replace("'", "''")
        name = r["塾・教室名"].replace("'", "''")
        url = r["公式サイトURL"].strip().replace("'", "''")
        url_val = f"'{url}'" if url else "NULL"
        tel = r["電話番号"].replace("'", "''").strip()
        tel_val = f"'{tel}'" if tel else "NULL"

        val_lines.append(f"({order}, '{area_id}', '{area_name}', '{name}', {url_val}, {tel_val})")

    lines.append(",\n".join(val_lines) + ";")

    with open(output_sql, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"Successfully generated {output_sql} with {len(rows)} records.")

if __name__ == "__main__":
    generate_seed_sql()
