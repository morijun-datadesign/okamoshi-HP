import os
import random
import shutil
import subprocess
import tempfile
from PIL import Image, ImageChops, ImageDraw, ImageMath


def build_float_dither_maps(size, sigma=0.75, seed=20260919):
    """
    NumPy 不要・決定論的（毎回同一出力）の極微小ガウシアンディザリングマップを
    RGB 各チャンネルの L 画像（128 + v * 40 スケール、値域 [-2.5, +2.5]）として生成する。
    バイラテラル平滑化後の float 累積値へ直接加算して1回だけ 8bit 量子化することで、
    量子化誤差・色帯（バンディング）を再発させずに滑らかな青空階調を保つ。
    """
    tile_w, tile_h = 256, 256
    rng = random.Random(seed)
    bufs = [bytearray(tile_w * tile_h), bytearray(tile_w * tile_h), bytearray(tile_w * tile_h)]

    for idx in range(tile_w * tile_h):
        # 輝度相関のある極微小ディザ＋色チャンネル間の微差で色帯を分散消去
        base_n = rng.gauss(0.0, sigma * 0.80)
        for c in range(3):
            val = max(-2.5, min(2.5, base_n + rng.gauss(0.0, sigma * 0.45)))
            bufs[c][idx] = max(0, min(255, int(round(128.0 + val * 40.0))))

    w, h = size
    outs = []
    for c in range(3):
        tile = Image.frombytes("L", (tile_w, tile_h), bytes(bufs[c]))
        full = Image.new("L", (w, h))
        for y in range(0, h, tile_h):
            for x in range(0, w, tile_w):
                full.paste(tile, (x, y))
        outs.append(full)
    return outs


def deband_sky_gradient(im, radii=(3, 7, 13), color_thresh=6, sigma=0.75, seed=20260919):
    """
    空間膨張型のエッジ保護マスクおよび広域ガウシアンブラー（ハロー／二重輪郭の原因）を廃止し、
    「色差ゲート付きバイラテラル平均（RGB各チャンネル差 <= color_thresh の近傍のみ平均化）」＋
    「ピクセル単位の空・白フェード判定」＋「float累積後の一括マイクロディザ量子化」を行う。
    人物の髪・顔・制服と空の境界では色差が大きいため1pxも混ざらず、輪郭外側のハローを完全ゼロ化する。
    """
    rgb = im.convert("RGB")
    w, h = rgb.size
    r0, g0, b0 = rgb.split()

    acc_r = ImageMath.unsafe_eval("float(a) * 2.0", a=r0)
    acc_g = ImageMath.unsafe_eval("float(a) * 2.0", a=g0)
    acc_b = ImageMath.unsafe_eval("float(a) * 2.0", a=b0)
    acc_w = ImageMath.unsafe_eval("float(a) * 0.0 + 2.0", a=r0)

    offsets = []
    for rad in radii:
        offsets.extend([
            (rad, 0), (-rad, 0), (0, rad), (0, -rad),
            (rad, rad), (-rad, -rad), (rad, -rad), (-rad, rad),
        ])

    for dx, dy in offsets:
        shifted = ImageChops.offset(rgb, dx, dy)
        diff = ImageChops.difference(rgb, shifted)
        dr, dg, db = diff.split()
        mr = dr.point(lambda v: 255 if v <= color_thresh else 0)
        mg = dg.point(lambda v: 255 if v <= color_thresh else 0)
        mb = db.point(lambda v: 255 if v <= color_thresh else 0)
        gate = ImageChops.darker(ImageChops.darker(mr, mg), mb)

        # ImageChops.offset の端ラップアラウンド領域を重み 0 にマスクアウト
        draw = ImageDraw.Draw(gate)
        if dx > 0:
            draw.rectangle([0, 0, dx - 1, h - 1], fill=0)
        elif dx < 0:
            draw.rectangle([w + dx, 0, w - 1, h - 1], fill=0)
        if dy > 0:
            draw.rectangle([0, 0, w - 1, dy - 1], fill=0)
        elif dy < 0:
            draw.rectangle([0, h + dy, w - 1, h - 1], fill=0)

        sr, sg, sb = shifted.split()
        wf = ImageMath.unsafe_eval("float(m) / 255.0", m=gate)
        acc_r = ImageMath.unsafe_eval("a + float(s) * w", a=acc_r, s=sr, w=wf)
        acc_g = ImageMath.unsafe_eval("a + float(s) * w", a=acc_g, s=sg, w=wf)
        acc_b = ImageMath.unsafe_eval("a + float(s) * w", a=acc_b, s=sb, w=wf)
        acc_w = ImageMath.unsafe_eval("a + w", a=acc_w, w=wf)

    nr, ng, nb = build_float_dither_maps((w, h), sigma=sigma, seed=seed)
    expr = "convert(min(max(a / w + (float(n) - 128.0) / 40.0 + 0.5, 0.0), 255.0), 'L')"
    out_r = ImageMath.unsafe_eval(expr, a=acc_r, w=acc_w, n=nr)
    out_g = ImageMath.unsafe_eval(expr, a=acc_g, w=acc_w, n=ng)
    out_b = ImageMath.unsafe_eval(expr, a=acc_b, w=acc_w, n=nb)
    debanded = Image.merge("RGB", (out_r, out_g, out_b))

    # 空間ブラーを一切使わないピクセル単位の空・下部白フェード判定（1pxキワまで均一）
    b_ge_155 = b0.point(lambda v: 255 if v >= 155 else 0)
    b_minus_r_ge_15 = ImageChops.subtract(b0, r0).point(lambda v: 255 if v >= 15 else 0)
    white_fade = ImageChops.darker(
        r0.point(lambda v: 255 if v >= 210 else 0),
        g0.point(lambda v: 255 if v >= 215 else 0),
    )
    is_sky_mask = ImageChops.darker(b_ge_155, ImageChops.lighter(b_minus_r_ge_15, white_fade))

    return Image.composite(debanded, rgb, is_sky_mask)


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
                debanded_pc = deband_sky_gradient(resized_pc, sigma=0.75)

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
                debanded_sp = deband_sky_gradient(resized_sp, sigma=0.75)

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
