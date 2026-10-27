import re
import csv
import os

def export_cram_schools():
    html_path = "schools.html"
    output_path = "cram_schools.csv"

    if not os.path.exists(html_path):
        raise FileNotFoundError(f"{html_path} not found")

    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()

    district_map = [
        ("tableOkayama", "okayama-east", "岡山・東備学区"),
        ("tableKurashiki", "kurashiki", "倉敷学区"),
        ("tableMimasaka", "mimasaka", "美作学区"),
        ("tableSeibi", "seibi", "西備学区"),
    ]

    records = []
    global_order = 0

    for tbody_id, d_id, d_name in district_map:
        m = re.search(r'id="' + tbody_id + r'"[^>]*>(.*?)</tbody>', content, re.DOTALL)
        if not m:
            print(f"Warning: tbody #{tbody_id} not found")
            continue

        tbody_html = m.group(1)
        # tr を抽出
        tr_matches = re.finditer(
            r'<tr[^>]*data-name="([^"]*)"[^>]*data-tel="([^"]*)"[^>]*>(.*?)</tr>',
            tbody_html,
            re.DOTALL,
        )

        district_count = 0
        for tm in tr_matches:
            global_order += 1
            district_count += 1
            name = tm.group(1).strip()
            tel = tm.group(2).strip()
            tr_inner = tm.group(3)

            # 1番目の td から公式サイトURLを抽出
            tds = re.findall(r"<td[^>]*>(.*?)</td>", tr_inner, re.DOTALL)
            url = ""
            if tds:
                td1 = tds[0]
                url_match = re.search(r'<a[^>]*href="([^"]*)"', td1)
                if url_match:
                    found_url = url_match.group(1).strip()
                    if not found_url.startswith("tel:") and not found_url.startswith("javascript:"):
                        url = found_url

            records.append({
                "district_id": d_id,
                "district_name": d_name,
                "name": name,
                "url": url,
                "tel": tel,
                "order": global_order,
            })
        print(f"Parsed {d_name} ({d_id}): {district_count} schools")

    # CSV 出力 (UTF-8 with BOM: encoding='utf-8-sig')
    with open(output_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        # ヘッダー行: 学区ID,学区名,塾・教室名,公式サイトURL,電話番号,表示順
        writer.writerow(["学区ID", "学区名", "塾・教室名", "公式サイトURL", "電話番号", "表示順"])
        for r in records:
            writer.writerow([
                r["district_id"],
                r["district_name"],
                r["name"],
                r["url"],
                r["tel"],
                r["order"],
            ])

    print(f"Successfully generated {output_path} with {len(records)} records (UTF-8 with BOM).")

if __name__ == "__main__":
    export_cram_schools()
