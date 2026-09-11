# 노래방 자막 생성기 (Karaoke Subtitle Generator)

mp3 음원과 가사 텍스트를 넣으면 **WhisperX**로 단어별 타이밍을 맞추고,
화면 중앙 하단에 글자별로 색이 채워지는 노래방 스타일 자막을
**투명 배경 MOV**(ProRes 4444 알파)와 **SRT**로 내보내는 윈도우용 GUI 프로그램입니다.

- 16:9(가로) / 9:16(세로) 선택, 9:16은 시작·끝 시간을 지정해 구간만 잘라냄
- 글자 단위로 매끄럽게 채워지는 하이라이트, 외곽선, 다음 줄 미리보기
- 정렬 결과(`*.timings.json`)를 저장해 두므로 색·폰트·구간만 바꿔 다시 렌더링할 때는 WhisperX를 건너뜀
- 인자 없이 실행하면 GUI, 인자를 주면 CLI

## 설치 (Windows)

1. [Python 3.10 ~ 3.12](https://www.python.org/downloads/windows/) 설치 (설치 시 **Add python.exe to PATH** 체크)
2. 이 폴더에서 명령 프롬프트를 열고:

```bat
python -m venv .venv
.venv\Scripts\activate

:: PyTorch — GPU(NVIDIA)가 있으면 https://pytorch.org/get-started/locally/ 의 CUDA 명령을,
:: 없으면 아래 CPU 버전을 설치
pip install torch torchaudio

pip install -r requirements.txt
```

ffmpeg는 `imageio-ffmpeg` 패키지에 포함된 바이너리를 자동으로 사용하므로 따로 설치하지 않아도 됩니다.
(PATH에 ffmpeg가 있으면 그것을 우선 사용)

첫 실행 때 Whisper 모델과 언어별 정렬 모델(wav2vec2)을 인터넷에서 내려받습니다(수백 MB ~ 수 GB).

## 실행

```bat
run_gui.bat
```
또는 `python main.py`

### GUI 사용 순서
1. **음원 파일** 선택 (mp3/wav/m4a …)
2. **가사 텍스트** 붙여넣기 또는 `.txt` 열기 — 한 줄이 자막 한 줄이 됩니다. 빈 줄과 `[Verse 1]`·`(Chorus)` 같은 표시 줄은 무시됩니다.
3. **화면 비율** 선택. 9:16을 고르면 **구간** 시작·끝을 `1:05.5` 또는 `65.5` 형식으로 입력(끝을 비우면 곡 끝까지)
4. 언어(자동 감지 가능)·Whisper 모델·장치 선택. CPU라면 `small`, GPU라면 `medium`/`large-v3` 권장
5. **폰트**는 시스템 폰트 폴더(`C:\Windows\Fonts`와 사용자 폰트)를 읽어 드롭다운으로 고릅니다. 한글 지원 폰트가 `[한글]` 표시와 함께 위쪽에 오고, 기본은 맑은 고딕 굵게입니다. 폴더 밖의 폰트는 **다른 파일…** 로 추가합니다.
6. **자막 색상**은 세 가지(부르기 전 글자 / 부른 글자, 즉 채워지는 색 / 외곽선)를 각각 색 이름 프리셋(노랑·빨강·파랑 …)에서 고르거나 색상표 버튼으로 직접 지정합니다. 폰트 아래 미리보기에 바로 반영됩니다.
7. 글자 크기(0=자동), 코덱, FPS 설정. **미리보기 mp4 생성**을 켜면 투명 MOV를 회색 배경 위에 합성한 1080p H.264 mp4(구간 오디오 포함)도 함께 만들어져 결과를 바로 재생해 볼 수 있습니다.
8. **자막 생성** → 완료 팝업이 뜨고, **완성본 재생**(기본 플레이어)·**폴더 열기** 버튼과 '출력 파일' 영역의 **열기** 버튼이 활성화됩니다. 출력 폴더에 아래 파일이 생깁니다.

| 파일 | 내용 |
|---|---|
| `<이름>_16x9.mov` / `<이름>_9x16.mov` | 투명 배경 자막 영상 (편집기에서 원본 영상 위에 얹기) |
| `<이름>_16x9.srt` / `<이름>_9x16.srt` | 줄 단위 SRT (9:16은 구간 시작이 0초) |
| `<이름>.timings.json` | 단어별 타이밍. 다시 렌더링할 때 **타이밍 재사용**에 지정 |
| `<이름>_16x9_preview.mp4` | (선택) 회색 배경 합성 미리보기 |

#### 이전 작업 기록과 설정 유지
- 생성이 끝난 작업은 **이전 작업** 드롭다운에 쌓이고, 프로그램을 껐다 켜도 남습니다. 항목을 고르면 출력 파일 영역에 그 작업의 MOV/SRT/timings.json/미리보기 경로가 표시되고, 파일이 실제로 있으면 [열기]·[완성본 재생]·[폴더 열기]가 활성화됩니다(지워진 파일은 "(파일 없음)" 표시).
- **타이밍 재사용에 넣기**를 누르면 그 작업의 timings.json과 음원이 입력칸에 채워져 색·폰트·구간만 바꿔 바로 다시 렌더링할 수 있습니다. **기록 지우기**는 목록만 지우며 파일은 삭제하지 않습니다.
- 마지막으로 사용한 설정(가사, 비율, 구간, 언어, 폰트, 색, 코덱, 출력 폴더 등)도 자동 저장되어 다음 실행 때 복원됩니다.
- 저장 위치: Windows `%APPDATA%\karaoke-subtitle\history.json`, `settings.json` (macOS `~/Library/Application Support/karaoke-subtitle`, Linux `~/.config/karaoke-subtitle`)

## CLI 예시

```bat
python main.py song.mp3 --lyrics lyrics.txt --aspect 16:9
python main.py song.mp3 --lyrics lyrics.txt --aspect 9:16 --start 1:05 --end 1:35 --audio-in-mov --preview-mp4
python main.py song.mp3 --timings song.timings.json --aspect 9:16 --start 0:40 --end 1:10 --highlight-color #FF4081
python main.py --help
```

## 정렬 방식

1. WhisperX로 음원을 인식하고 인식 단어의 시각을 얻습니다.
2. 인식 결과와 입력 가사를 **문자 단위**로 대조해 가사 줄마다 대략의 시간 창을 잡습니다(어절 분절이 달라도 견딤).
3. 각 줄의 실제 가사 텍스트를 그 창 안에서 WhisperX(wav2vec2) 강제 정렬해 단어 시각을 얻습니다.
4. 정렬되지 않은 단어(숫자·기호 등)는 이웃 단어에서 글자 수 비례로 보간합니다.

## 팁·문제 해결

- **속도**: ProRes 4444 인코딩이 가장 오래 걸립니다(4코어 CPU 기준 1080p 약 15~20 fps). 미리보기는 해상도 `720p`나 코덱 `qtrle`로 확인하고 최종본만 ProRes로 뽑으세요.
- **타이밍이 어긋남**: 모델을 `medium` 이상으로 올리거나 언어를 직접 지정하세요. 반주가 큰 곡은 보컬 분리 음원을 넣으면 정확도가 크게 올라갑니다. `timings.json`을 직접 고쳐서 다시 렌더링해도 됩니다.
- **`WhisperX를 불러올 수 없습니다`**: 가상환경이 활성화됐는지, `pip install whisperx`가 끝났는지 확인하세요.
- **한글이 네모로 나옴**: 폰트 드롭다운에서 `[한글]` 표시가 있는 폰트(맑은 고딕, 나눔고딕 등)를 고르세요.
- **윈도우 미디어 플레이어에서 MOV가 안 열림(0xC00D5212, ap4h)**: ProRes 4444는 편집기용 코덱이라 윈도우 기본 플레이어에는 디코더가 없습니다. 정상입니다. 결과 확인은 **미리보기 mp4**(기본 켜짐)로 하세요. [완성본 재생]과 MOV 줄의 [재생]은 미리보기 mp4가 있으면 그것을 열고, 없으면 만들어서 재생할지 묻습니다('아니요'면 MOV를 그대로 엽니다). MOV를 직접 재생하려면 VLC 플레이어를 설치하세요(투명 부분은 검게 보임).
- **DaVinci Resolve/Premiere/Final Cut**: MOV를 타임라인에 올리면 알파 채널이 자동 인식됩니다. 9:16 MOV는 구간 시작 시각에 맞춰 배치하세요(오디오 포함 옵션을 켜면 싱크 맞추기 쉬움).
