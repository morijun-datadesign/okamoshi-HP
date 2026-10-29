#!/usr/bin/env python3
"""
本番用静的アセット最適化 & ビルドスクリプト (okamoshi)
- Tailwind CSS の Minify ビルド (css/style.min.css)
- 画像の最適化・WebP/AVIFリサイズ生成
"""
import os
import sys
import subprocess
import urllib.request
import platform
import shutil

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def ensure_tailwind_cli():
    bin_dir = os.path.join(BASE_DIR, "bin")
    cli_path = os.path.join(bin_dir, "tailwindcss")
    
    if os.path.exists(cli_path) and os.access(cli_path, os.X_OK):
        return cli_path

    os.makedirs(bin_dir, exist_ok=True)
    system = platform.system().lower()
    machine = platform.machine().lower()

    if system == "darwin":
        arch = "arm64" if "arm" in machine or "aarch64" in machine else "x64"
        filename = f"tailwindcss-macos-{arch}"
    elif system == "linux":
        arch = "arm64" if "arm" in machine or "aarch64" in machine else "x64"
        filename = f"tailwindcss-linux-{arch}"
    else:
        filename = "tailwindcss-windows-x64.exe"

    url = f"https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.17/{filename}"
    print(f"Downloading standalone Tailwind CLI from {url}...")
    try:
        urllib.request.urlretrieve(url, cli_path)
        os.chmod(cli_path, 0o755)
        print("Tailwind CLI downloaded successfully.")
        return cli_path
    except Exception as e:
        print(f"Failed to download Tailwind CLI: {e}")
        # fallback to tmp if exists
        tmp_cli = "/tmp/tailwindcss-v3"
        if os.path.exists(tmp_cli):
            return tmp_cli
        raise

def build_css():
    cli_path = ensure_tailwind_cli()
    config_path = os.path.join(BASE_DIR, "tailwind.config.js")
    input_path = os.path.join(BASE_DIR, "css", "input.css")
    output_path = os.path.join(BASE_DIR, "css", "style.min.css")

    print("Building minified Tailwind CSS...")
    res = subprocess.run([
        cli_path,
        "-c", config_path,
        "-i", input_path,
        "-o", output_path,
        "--minify"
    ], cwd=BASE_DIR, capture_output=True, text=True)
    if res.returncode != 0:
        print("CSS Build failed:", res.stderr)
        sys.exit(res.returncode)
    
    size_kb = os.path.getsize(output_path) / 1024
    print(f"CSS Build complete: {output_path} ({size_kb:.1f} KB)")

def optimize_images():
    if os.environ.get("CF_PAGES") or os.environ.get("CI"):
        print("Notice: Skipping image optimization in CI / Cloudflare Pages environment.")
        return
    if not shutil.which("sips"):
        print("Notice: 'sips' command not found (macOS only). Skipping image optimization.")
        return

    print("Optimizing images...")
    optimize_script = os.path.join(BASE_DIR, "scripts", "optimize_images.py")
    if os.path.exists(optimize_script):
        try:
            subprocess.run([sys.executable, optimize_script], cwd=BASE_DIR, check=True)
        except Exception as e:
            print(f"Warning: Image optimization failed ({e}). Continuing build...")

def build_ssg():
    print("Building microCMS static pages (SSG)...")
    ssg_script = os.path.join(BASE_DIR, "scripts", "build_ssg.py")
    if os.path.exists(ssg_script):
        subprocess.run([sys.executable, ssg_script], cwd=BASE_DIR, check=True)

def main():
    args = sys.argv[1:]
    if "--ssg-only" in args:
        print("=== okamoshi microCMS SSG Build Started ===")
        build_ssg()
        print("=== okamoshi microCMS SSG Build Finished Successfully ===")
        return

    print("=== okamoshi Production Build Started ===")
    build_css()
    if "--skip-images" not in args:
        optimize_images()
    build_ssg()
    print("=== okamoshi Production Build Finished Successfully ===")

if __name__ == "__main__":
    main()
