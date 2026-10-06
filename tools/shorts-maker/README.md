# 연템저장소 쇼츠 제작기 (shorts-maker)

원본 영상 2개, TTS용 이미지 2개, 제품명을 넣으면 연예인 추천템 쇼츠(9:16, 20초 내외) 한 편과 업로드용 텍스트 묶음을 만드는 로컬 프로그램. 전체 명세는 [SPEC.md](SPEC.md).

**현재 상태: 8장 1단계 완료** — 손으로 적은 `candidates.md`를 읽어 컷·이어붙이기·9:16·1.1배속·미러링·확대 크롭·색감을 적용하고, 썸네일 문구·출처·자막 샘플을 규격표 좌표에 얹은 `final.mp4`를 만든다. 받아쓰기(2단계)·음성 정리(4단계)·문구 생성(5단계)·TTS(6단계)·효과음(7단계)은 아직 자리만 있다.

## 설치

```bash
# ffmpeg, ffprobe 가 PATH 에 있어야 한다
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # API 키는 2·5·6단계부터 필요
```

폰트: `assets/fonts/`에 카페24 단정해·행복·그림 파일을 넣는다 (파일명은 `config.yaml`의 `fonts.files`). 없으면 나눔고딕으로 대신 그리고 경고한다. [assets/fonts/README.md](assets/fonts/README.md) 참고.

## 사용

```bash
make sample                      # 합성 샘플 편 생성 (episodes/샘플/input 에 영상·이미지)
make build EP=episodes/샘플      # = python -m shorts.cli build episodes/샘플
make analyze EP=...              # 2단계에서 구현
```

편 폴더 구조(`episodes/편번호_연예인_제품/`):

```
input/video1.mp4, video2.mp4, image1.png, image2.png, brief.txt
candidates.md      # analyze가 생성(2단계) / 지금은 직접 적는다
output/            # build 결과
```

`brief.txt`는 SPEC.md 2장 형식. 1단계에서는 썸네일 문구 확인용으로 `썸네일 윗줄:` `썸네일 아랫줄:` 줄을 더 적을 수 있다(없으면 샘플 문구).

`candidates.md`:

```
- [x] 1 | video1 | 00:12.4 - 00:16.8 | (대사)
- [ ] 2 | video2 | 00:03.0 - 00:07.5 | (대사)
```

체크된 것만 쓰고 앞 숫자가 순서(1이 맨 앞 후킹). 두 영상 구간이 하나씩은 있어야 한다.

## 출력 (output/)

| 파일 | 내용 |
|---|---|
| `final.mp4` | 1080×1920, H.264, 30fps, AAC 192k |
| `check.png` | 1초 지점 프레임 + 썸네일·출처·자막 — **좌표 확인용** |
| `thumbnail.png` | 첫 프레임 + 썸네일 문구·출처 |
| `subtitles.ass` | 자막·출처·썸네일 ASS (캡컷 수정 참고) |
| `edit.json` | 사용 구간, 배속, 크롭, 환산값 등 편집 기록 |

`--keep-clips`를 주면 구간별 중간 클립(`output/clips/`)과 `concat.mp4`를 남긴다.

## 캡컷 좌표 맞추기

`config.yaml`의 `capcut` 항목이 환산식이다.

```
픽셀 x = 540  + 캡컷x × position_scale + offset_x
픽셀 y = 960  − 캡컷y × position_scale + offset_y     (캡컷은 위가 +)
글자 px = 캡컷 크기 × font_scale,  줄간격 px = 캡컷 줄간격 × line_spacing_scale
```

build가 환산 결과를 표로 출력한다. `check.png`를 기존 영상 한 편과 나란히 놓고 `position_scale`·`font_scale`·`offset_*`을 고친 뒤 다시 build 하면 된다. 규격표의 좌표·크기 자체(`texts` 항목)는 캡컷 값 그대로 둔다.

## 구조

```
shorts/cli.py          analyze / build
shorts/candidates.py   candidates.md 읽기/쓰기
shorts/edit.py         컷·9:16·배속·미러링·크롭·색감·이어붙이기
shorts/overlay.py      캡컷 좌표 환산, ASS 생성
shorts/render.py       최종 렌더, 확인용 프레임
shorts/episode.py      편 폴더·brief.txt
shorts/transcribe.py, audio.py, copy.py, tts.py   2단계 이후
prompts/hook.md, copy.md   클로드 프롬프트 (2·5단계)
scripts/make_sample_episode.py   합성 샘플 편
```

ffmpeg는 `ffmpeg-python` 대신 subprocess로 직접 호출한다(필터 문자열을 그대로 제어하고 오류를 한글로 바꾸기 위해).
