"""합성 샘플 편 생성: episodes/샘플/input 에 영상 2개·이미지 2개를 만든다 (실제 영상이 없을 때 파이프라인 확인용).

  python scripts/make_sample_episode.py            # episodes/샘플
  python scripts/make_sample_episode.py 다른폴더   # 다른 편 폴더

video1: 1920x1080 16:9, 30초, 시각 표시, 440Hz 비프
video2: 1280x720  16:9, 25초, 시각 표시, 330Hz 비프
화면에 시각과 'VIDEO1' 글자를 찍어 두어 컷 위치·미러링·크롭이 맞는지 눈으로 확인할 수 있다.
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def ffmpeg(*args):
    exe = shutil.which("ffmpeg")
    if not exe:
        sys.exit("[오류] ffmpeg를 찾을 수 없습니다. 설치 후 PATH에 추가하세요.")
    cmd = [exe, "-hide_banner", "-nostdin", "-y", "-loglevel", "error", *map(str, args)]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        sys.exit("[오류] 샘플 생성 실패:\n" + r.stderr.decode("utf-8", "replace")[-800:])


def make_video(out, label, w, h, seconds, freq, src):
    text = f"{label}  %{{pts\\:hms}}"
    vf = (f"drawtext=text='{text}':fontcolor=white:fontsize={h // 12}:box=1:boxcolor=black@0.6:"
          f"x=(w-text_w)/2:y=(h-text_h)/2,"
          f"drawtext=text='L':fontcolor=yellow:fontsize={h // 8}:x=40:y=40,"
          f"drawtext=text='R':fontcolor=yellow:fontsize={h // 8}:x=w-text_w-40:y=40")
    ffmpeg("-f", "lavfi", "-i", f"{src}=size={w}x{h}:rate=30",
           "-f", "lavfi", "-i", f"sine=frequency={freq}:beep_factor=4:sample_rate=48000",
           "-t", seconds, "-vf", vf,
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "128k", "-shortest", out)


def make_image(out, color, label):
    ffmpeg("-f", "lavfi", "-i", f"color=c={color}:size=1080x1920",
           "-vf", f"drawtext=text='{label}':fontcolor=white:fontsize=120:x=(w-text_w)/2:y=(h-text_h)/2",
           "-frames:v", "1", "-update", "1", out)


def main():
    ep = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "episodes" / "샘플"
    inp = ep / "input"
    inp.mkdir(parents=True, exist_ok=True)
    make_video(inp / "video1.mp4", "VIDEO1", 1920, 1080, 30, 440, "testsrc2")
    make_video(inp / "video2.mp4", "VIDEO2", 1280, 720, 25, 330, "testsrc")
    make_image(inp / "image1.png", "0x3A5F8A", "IMAGE 1")
    make_image(inp / "image2.png", "0x8A3A5F", "IMAGE 2")
    if not (inp / "brief.txt").exists():
        (inp / "brief.txt").write_text(
            "제품명: 온슬로 패치\n연예인: 윤은혜\n출처: 승아로운\n"
            "핵심: 마스크 안이 가려워서 사봤는데 안은 겔, 겉은 뽀송해서 마스크가 안 젖음\n검색어: 21\n",
            encoding="utf-8")
    print(f"샘플 편 생성 완료: {inp}")


if __name__ == "__main__":
    main()
