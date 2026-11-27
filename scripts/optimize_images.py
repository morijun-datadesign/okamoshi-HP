import os
import random
import shutil
import subprocess
import tempfile
from PIL import Image, ImageChops, ImageFilter


def build_deterministic_dither_pair(size, sigma=0.95, seed=20260919):
    """
    NumPy 不要・決定論的（毎回同一出力）の極微小ガウシアンディザリング (+noise / -noise) 画像を生成する。
    8bit量子化および非可逆YUV変換による青空グラデーションのカラーバンディング（波模様）を分散消去するため、
    値域は [-3, +3] にクランプし、自然なグラデーション階調を保つ。
    """
    tile_w, tile_h = 256, 256
    rng = random.Random(seed)
    pos_buf = bytearray(tile_w * tile_h * 3)
    neg_buf = bytearray(tile_w * tile_h * 3)

    idx = 0
    for _ in range(tile_w * tile_h):
        # 輝度相関のある極微小ディザ＋色チャンネル間の微差で色帯を消す
        base_n = rng.gauss(0.0, sigma * 0.85)
        for _c in range(3):
            val = int(round(max(-3.0, min(3.0, base_n + rng.gauss(0.0, sigma * 0.45)))))
            if val >= 0:
                pos_buf[idx] = val
                neg_buf[idx] = 0
            else:
                pos_buf[idx] = 0
                neg_buf[idx] = -val
            idx += 1

    pos_tile = Image.frombytes("RGB", (tile_w, tile_h), bytes(pos_buf))
    neg_tile = Image.frombytes("RGB", (tile_w, tile_h), bytes(neg_buf))

    w, h = size
    pos_full = Image.new("RGB", (w, h))
    neg_full = Image.new("RGB", (w, h))
    for y in range(0, h, tile_h):
        for x in range(0, w, tile_w):
            pos_full.paste(pos_tile, (x, y))
            neg_full.paste(neg_tile, (x, y))
    return pos_full, neg_full


def deband_sky_gradient(im, sigma=0.95):
    """
    空・霞など平坦グラデーション領域のみを局所エッジ保護付きで広域デバンディング＋ディザリングする。
    人物の輪郭・髪・顔・制服など高周波エッジ領域はマスクで完全保護する。
    """
    rgb = im.convert("RGB")
    # 1. エッジ保護マスク（人物や髪の微細エッジ周辺は広く保護、完全平坦部のみ 255）
    edges = (
        rgb.convert("L")
        .filter(ImageFilter.FIND_EDGES)
        .filter(ImageFilter.MaxFilter(7))
        .filter(ImageFilter.GaussianBlur(5))
    )
    flat_mask = edges.point(lambda e: 255 if e <= 4 else (0 if e >= 18 else int((18 - e) * 255 / 14)))

    # 2. 青空・下部白フェード領域マスク（Bチャンネル >= 150 の領域を滑らかに抽出）
    _, _, b_chan = rgb.split()
    sky_mask = b_chan.point(lambda b: 255 if b >= 165 else (0 if b <= 135 else int((b - 135) * 255 / 30)))
    sky_mask = sky_mask.filter(ImageFilter.GaussianBlur(8))

    apply_mask = ImageChops.multiply(flat_mask, sky_mask)

    # 3. 広域の色帯ムラを消す平滑化（radius=14）＋ 固定シード極微小ノイズディザリング
    smoothed = rgb.filter(ImageFilter.GaussianBlur(radius=14.0))
    pos_noise, neg_noise = build_deterministic_dither_pair(rgb.size, sigma=sigma)
    dithered = ImageChops.subtract(ImageChops.add(smoothed, pos_noise), neg_noise)

    return Image.composite(dithered, rgb, apply_mask)


def encode_avif_via_png(im, avif_path, quality, tmp_dir, tag):
    """
    WebP など非可逆形式を経由した二重劣化を防ぐため、
    メモリ上の画像を一時ロスレス PNG へ書き出してから sips で直接 AVIF エンコードする。
    """
    png_path = os.path.join(tmp_dir, f"{tag}.png")
    im.save(png_path, "PNG")
    res = subprocess.run(
        [
            "sips",
            "-s",
            "format",
            "avif",
            "-s",
            "formatOptions",
            str(quality),
            png_path,
            "--out",
            avif_path,
        ],
        capture_output=True,
        text=True,
    )
    if res.returncode != 0:
        raise RuntimeError(f"sips AVIF conversion failed for {avif_path}: {res.stderr}")


def save_webp_and_avif(im, base_path_no_ext, webp_quality, avif_quality, has_sips, tmp_dir, tag):
    rgb = im.convert("RGB") if im.mode not in ("RGB", "RGBA") else im
    webp_path = f"{base_path_no_ext}.webp"
    rgb.save(webp_path, "WEBP", quality=webp_quality, method=6)
    if has_sips:
        avif_path = f"{base_path_no_ext}.avif"
        encode_avif_via_png(rgb, avif_path, avif_quality, tmp_dir, tag)


def optimize():
    if os.environ.get("CF_PAGES") or os.environ.get("CI"):
        print("Notice: Skipping image optimization in CI / Cloudflare Pages environment.")
        return

    has_sips = shutil.which("sips") is not None
    if not has_sips:
        print("Notice: 'sips' command not found. Skipping AVIF generation.")

    img_dir = "images"

    with tempfile.TemporaryDirectory(prefix="okamoshi_img_") as tmp_dir:
        # 1. PC・SP ヒーロー画像（読み取り専用マスターから生成し、マスター自体は絶対上書きしない）
        hero_master = os.path.join(img_dir, "hero-main-master.webp")
        if not os.path.exists(hero_master):
            hero_master = os.path.join(img_dir, "Web-1366---1-scaled.webp")
        if not os.path.exists(hero_master):
            hero_master = os.path.join(img_dir, "hero-main.webp")

        if os.path.exists(hero_master):
            with Image.open(hero_master) as im:
                master_rgb = im.convert("RGB")
                w, h = master_rgb.size

                # 1a. PC用ヒーロー画像 (1920px幅)
                pc_w = 1920
                pc_h = int(h * (pc_w / w))
                resized_pc = master_rgb.resize((pc_w, pc_h), Image.Resampling.LANCZOS)
                debanded_pc = deband_sky_gradient(resized_pc, sigma=0.95)

                save_webp_and_avif(
                    debanded_pc,
                    os.path.join(img_dir, "hero-main-pc"),
                    webp_quality=94,
                    avif_quality=94,
                    has_sips=has_sips,
                    tmp_dir=tmp_dir,
                    tag="hero_pc",
                )
                # 既存の <img src="/images/hero-main.webp"> 等フォールバック用（マスターとは別ファイル）
                debanded_pc.save(os.path.join(img_dir, "hero-main.webp"), "WEBP", quality=94, method=6)

                # 1b. スマホ用ヒーロー画像 (マスターから直接 800px幅へ縮小＋デバンディング)
                sp_w = 800
                sp_h = int(h * (sp_w / w))
                resized_sp = master_rgb.resize((sp_w, sp_h), Image.Resampling.LANCZOS)
                debanded_sp = deband_sky_gradient(resized_sp, sigma=0.95)

                save_webp_and_avif(
                    debanded_sp,
                    os.path.join(img_dir, "hero-main-sp"),
                    webp_quality=94,
                    avif_quality=94,
                    has_sips=has_sips,
                    tmp_dir=tmp_dir,
                    tag="hero_sp",
                )

        # 2. サムネイル画像 (中3: 3_top/3-mondai/3-kaisetu, 中1・中2: 2-top/2-mondai/2-kaisetu, 小6: 6-top/6-mondai/6-kaisetu)
        # 文字や細い罫線の滲み・ジャギーを防ぐため、元画像からロスレスPNG経由で WebP q=90 / AVIF opt=90 で出力
        report_top_items = [
            ("3_top", ["3_top.jpg", "3_top.jpeg", "3_top.png", "おかもしサイト用_おかもし成績表_中3_top.001.jpeg", "おかもしサイト用_おかもし成績表_中3_top.001.jpg"], ["3_top", "preview-c3-report", "preview-card-report"]),
            ("3-mondai", ["3-mondai.jpeg", "3-mondai.jpg", "3-mondai.png"], ["3-mondai"]),
            ("3-kaisetu", ["3-kaisetu.jpeg", "3-kaisetu.jpg", "3-kaisetu.png"], ["3-kaisetu"]),
            ("2-top", ["2-top.jpeg", "2-top.jpg", "2-top.png"], ["2-top"]),
            ("2-mondai", ["2-mondai.jpeg", "2-mondai.jpg", "2-mondai.png"], ["2-mondai"]),
            ("2-kaisetu", ["2-kaisetu.jpeg", "2-kaisetu.jpg", "2-kaisetu.png"], ["2-kaisetu"]),
            ("6-top", ["6-top.jpeg", "6-top.jpg", "6-top.png"], ["6-top"]),
            ("6-mondai", ["6-mondai.jpeg", "6-mondai.jpg", "6-mondai.png"], ["6-mondai"]),
            ("6-kaisetu", ["6-kaisetu.jpeg", "6-kaisetu.jpg", "6-kaisetu.png"], ["6-kaisetu"]),
        ]
        for key, candidates, targets in report_top_items:
            src = None
            for cand in candidates:
                cand_path = os.path.join(img_dir, cand)
                if os.path.exists(cand_path):
                    src = cand_path
                    break
            if src:
                with Image.open(src) as im:
                    rgb = im.convert("RGB")
                    for idx, base in enumerate(targets):
                        save_webp_and_avif(
                            rgb,
                            os.path.join(img_dir, base),
                            webp_quality=90,
                            avif_quality=90,
                            has_sips=has_sips,
                            tmp_dir=tmp_dir,
                            tag=f"report_{key}_{idx}",
                        )
                    # スマホ表示向けの軽量版 (幅640px) も文字劣化を防ぐため q=90 / opt=90 で生成
                    if key in ("3_top", "2-top", "6-top"):
                        w, h = rgb.size
                        sp_w = 640
                        sp_h = int(h * (sp_w / w))
                        resized_sp = rgb.resize((sp_w, sp_h), Image.Resampling.LANCZOS)
                        save_webp_and_avif(
                            resized_sp,
                            os.path.join(img_dir, f"{key}-sp"),
                            webp_quality=90,
                            avif_quality=90,
                            has_sips=has_sips,
                            tmp_dir=tmp_dir,
                            tag=f"report_{key}_sp",
                        )

        # 3. 中3成績表拡大モーダル（カルーセル 3枚）画像 — 元JPGから直接ロスレスPNG経由でエンコード
        for base in ("3-carousel-1", "3-carousel-2", "3-carousel-3"):
            src_path = None
            for ext in (".jpg", ".jpeg", ".png"):
                c_path = os.path.join(img_dir, f"{base}{ext}")
                if os.path.exists(c_path):
                    src_path = c_path
                    break
            if src_path:
                with Image.open(src_path) as im:
                    save_webp_and_avif(
                        im.convert("RGB"),
                        os.path.join(img_dir, base),
                        webp_quality=95,
                        avif_quality=95,
                        has_sips=has_sips,
                        tmp_dir=tmp_dir,
                        tag=f"carousel_{base}",
                    )

        # 4. プレビューカード画像（*-master.webp がある場合はマスターから生成し、自己上書きしない）
        cards = [
            ("preview-card-exam", 480),
            ("preview-card-answer", 360),
            ("article-classroom", 512),
        ]
        for base, max_w in cards:
            master_path = os.path.join(img_dir, f"{base}-master.webp")
            src_path = master_path if os.path.exists(master_path) else os.path.join(img_dir, f"{base}.webp")
            if os.path.exists(src_path):
                with Image.open(src_path) as im:
                    rgb = im.convert("RGB")
                    w, h = rgb.size
                    if w > max_w:
                        new_h = int(h * (max_w / w))
                        resized = rgb.resize((max_w, new_h), Image.Resampling.LANCZOS)
                    else:
                        resized = rgb
                    save_webp_and_avif(
                        resized,
                        os.path.join(img_dir, base),
                        webp_quality=90,
                        avif_quality=90,
                        has_sips=has_sips,
                        tmp_dir=tmp_dir,
                        tag=f"card_{base}",
                    )

    print("Image optimization finished.")


if __name__ == "__main__":
    optimize()
