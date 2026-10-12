import os
from PIL import Image
import subprocess

def optimize():
    img_dir = "images"
    
    # 1. PC用ヒーロー画像
    # 元: images/hero-main.webp (2560x1296)
    hero_pc_src = os.path.join(img_dir, "hero-main.webp")
    if os.path.exists(hero_pc_src):
        with Image.open(hero_pc_src) as im:
            # 1920px幅にリサイズ (Retina 2x of 960-1280px)
            w, h = im.size
            new_w = 1920
            new_h = int(h * (new_w / w))
            resized = im.resize((new_w, new_h), Image.Resampling.LANCZOS)
            
            # WebP保存 (高圧縮 quality=80)
            webp_path = os.path.join(img_dir, "hero-main-pc.webp")
            resized.save(webp_path, "WEBP", quality=80, method=6)
            
            # フォールバック用に hero-main.webp も最適化版で更新（元の2560pxから1920pxへ）
            resized.save(hero_pc_src, "WEBP", quality=80, method=6)
            
            # AVIF保存 (sips使用)
            avif_path = os.path.join(img_dir, "hero-main-pc.avif")
            subprocess.run(["sips", "-s", "format", "avif", webp_path, "--out", avif_path], capture_output=True)

    # 2. スマホ用ヒーロー画像
    # 元: images/hero-main.webp からスマホ向けにリサイズ (800x405 または 800x540)
    if os.path.exists(hero_pc_src):
        with Image.open(hero_pc_src) as im:
            # スマホ表示は横幅最大430px、高さ270px〜300px (比率約 16:10 〜 16:9)
            # 800x480 で十分なRetina解像度
            w, h = im.size
            target_w = 800
            target_h = int(h * (target_w / w))
            resized_sp = im.resize((target_w, target_h), Image.Resampling.LANCZOS)
            
            sp_webp_path = os.path.join(img_dir, "hero-main-sp.webp")
            resized_sp.save(sp_webp_path, "WEBP", quality=80, method=6)
            
            sp_avif_path = os.path.join(img_dir, "hero-main-sp.avif")
            subprocess.run(["sips", "-s", "format", "avif", sp_webp_path, "--out", sp_avif_path], capture_output=True)

    # 3. プレビューカード画像
    cards = [
        ("preview-card-exam.webp", 480),
        ("preview-card-report.webp", 512),
        ("preview-card-answer.webp", 360),
        ("article-classroom.webp", 512),
    ]
    for filename, max_w in cards:
        path = os.path.join(img_dir, filename)
        if os.path.exists(path):
            with Image.open(path) as im:
                w, h = im.size
                if w > max_w:
                    new_h = int(h * (max_w / w))
                    resized = im.resize((max_w, new_h), Image.Resampling.LANCZOS)
                else:
                    resized = im
                resized.save(path, "WEBP", quality=82, method=6)
                
                # AVIFも作成
                base, _ = os.path.splitext(filename)
                avif_path = os.path.join(img_dir, f"{base}.avif")
                subprocess.run(["sips", "-s", "format", "avif", path, "--out", avif_path], capture_output=True)

    print("Image optimization finished.")

if __name__ == "__main__":
    optimize()
