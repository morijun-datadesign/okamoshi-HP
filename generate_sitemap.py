import os
import datetime

BASE_URL = "https://okamoshi.pages.dev"
today = datetime.date.today().isoformat()

pages = [
    {"loc": f"{BASE_URL}/", "priority": "1.0", "changefreq": "weekly"},
    {"loc": f"{BASE_URL}/index.html", "priority": "1.0", "changefreq": "weekly"},
    {"loc": f"{BASE_URL}/apply.html", "priority": "0.9", "changefreq": "monthly"},
    {"loc": f"{BASE_URL}/schools.html", "priority": "0.8", "changefreq": "monthly"},
    {"loc": f"{BASE_URL}/blog.html", "priority": "0.8", "changefreq": "daily"},
    {"loc": f"{BASE_URL}/blog-detail.html", "priority": "0.7", "changefreq": "monthly"},
    {"loc": f"{BASE_URL}/privacy.html", "priority": "0.3", "changefreq": "yearly"},
    {"loc": f"{BASE_URL}/tokushoho.html", "priority": "0.3", "changefreq": "yearly"},
]

xml_items = []
for p in pages:
    xml_items.append(f"""  <url>
    <loc>{p['loc']}</loc>
    <lastmod>{today}</lastmod>
    <changefreq>{p['changefreq']}</changefreq>
    <priority>{p['priority']}</priority>
  </url>""")

sitemap_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{chr(10).join(xml_items)}
</urlset>"""

with open("sitemap.xml", "w", encoding="utf-8") as f:
    f.write(sitemap_xml)

print("sitemap.xml generated with", len(pages), "URLs.")
