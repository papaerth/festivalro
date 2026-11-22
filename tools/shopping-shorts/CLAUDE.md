# 쇼핑 쇼츠 자동 제작 — 작업 지침서

연예인 추천템 유튜브 쇼핑 쇼츠(타겟 20~40대 여성)를 원본 영상 하나(또는 같은 제품의 영상 둘)로부터 끝까지 만든다.
제작 규칙은 `RULES.md`에 있다(자동 실행도 같은 파일을 읽는다). 사용자와의 대화는 한국어로 한다.

@RULES.md

## 입력과 출력

`input/<편이름>/`에 사용자가 넣는 것
- 원본 영상 파일 (필수). 같은 제품을 다룬 영상 둘을 섞으려면 둘을 넣는다(아래 "두 영상 섞기")
- `info.json` — `{"url": 유튜브 링크, "inpock": 인포크 번호, "product": 제품명, "channel": 채널명}` (모두 선택. `python shorts.py new <편> --url …` 로 만든다).
  두 영상이면 `"url2"`(둘째 링크)와 `"videos": [첫 영상 파일, 둘째 영상 파일]`
- `img1.jpg`, `img2.jpg` — TTS 구간에 쓸 이미지 (선택. 없으면 원본 영상의 정지 화면)
- `tts1.mp3`, `tts2.mp3` — 일레븐랩스 키가 없을 때 직접 넣는 TTS 음성 (선택)
- `comments.json` — 댓글을 직접 줄 때 (선택. 형식은 아래)
- `vidiq.txt` — vidIQ 분석 결과를 붙여 넣은 글 (선택. 자동 실행의 제품 선정·컷 설계가 함께 읽는다)
- `feedback.txt` — 완성본을 본 사용자의 수정 요청 (선택. `--redo design` 때 이전 설계 `work/<편>/plan.prev.json`과 함께 반영한다)

`output/<편이름>/`(자동 실행 `auto`는 그 아래 버전 폴더 `01_처음`, `02_수정` … 현재 버전은 `work/<편>/version.json`)에 만들어지는 것 — 이 여섯 가지가 한 편의 완성본이다
1. `<제품명>_배경음O.mp4` 2. `<제품명>_배경음X.mp4` 3. `<제품명>_썸네일.jpg`
4~6. `<제품명>_업로드문구.txt` (제목 1순위 + 대안 2개, 설명, 핀 댓글)

그리고 `<제품명>_보고.txt`와 `_보고.json`(사람이 확인할 것, 수정 요청 반영, 차순위 후보. 창이 읽는다), `_plan_resolved.json`, `_검수.json`, `_검수_*.jpg`.

## 사람이 해야 하는 일 (자동화하지 않는다)
- 유튜브 업로드 화면에서 제품 태그 검색이 되는지 확인
- 인포크 번호 만들기, 유튜브 업로드
- 배경음X 버전에서 목소리가 뭉개지지 않았는지 듣기

## 만드는 두 가지 방법

### A. 전체 자동 (API 키가 있을 때)
```
python shorts.py auto <편>        # 또는 --all
```
`.env`에 `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`가 있어야 한다. 단계마다 `work/<편>/`에 파일을 남기고,
파일이 있으면 그 단계를 건너뛴다. 다시 하려면 `--redo analyze|design|tts|render`.

### B. Claude Code가 판단 단계를 직접 맡기 (API 키 없이)
판단 결과를 같은 파일로 써 넣으면 나머지는 똑같이 돈다.

1. `python shorts.py prep <편>` — 전체 대사(`work/<편>/transcript.txt`), 개요 프레임 시트(`overview_*.jpg`), 댓글
2. 분석. vidIQ MCP를 쓸 수 있으면 함께 쓴다.
   - `vidiq_video_transcript` (language ko), `vidiq_video_comments` (maxResult 100, relevance)
   - `vidiq_video_watch` 프롬프트:
     > 한국어로 답하세요. (1) 영상에 등장하는 모든 제품을 표로: 브랜드·정확한 제품명, 소개 시작~끝(mm:ss), 제품 클로즈업 시각, 바르거나 시연하는 시각, 화자의 가장 강한 한마디. (2) 20~40대 여성이 쇼츠 첫 3초에 멈출 후킹 순간 TOP 10을 시각·이유와 함께. 표정·리액션·반전 발언·비포애프터·제형 클로즈업 우선. (3) 제품별 시각적으로 강한 컷 시각 목록. (4) 쇼핑 쇼츠 소재로 시청지속시간이 가장 높을 제품 3개와 근거.
   - 결과를 `work/<편>/analysis.json`에 쓴다. 최소한 `pick`(brand, name, start, end, reason), `alternates` 2개,
     `channel`, `paid_ad`, `paid_ad_note`.
   - vidIQ로 받은 댓글은 `work/<편>/comments.json`에 `{"comments": [{"text": 원문, "likes": 수, "likes_label": "1.2천"}]}` 로 쓴다.
3. `python shorts.py zoom <편>` — 제품 구간의 0.5초 간격 프레임 시트(`zoom_*.jpg`, x좌표 눈금과 크롭 경계 표시)와
   어절별 시작 시각(`words_zoom.txt`). 시트를 직접 보고 컷 경계와 x0를 정한다.
4. `work/<편>/plan.json`(형식: `plans/example_plan.json`)과 `work/<편>/copy.json`을 쓴다.
   copy.json: `{"combos": [{"top": [윗줄, 아랫줄], "title": 업로드 제목} ×3], "description": {"hook_line", "body_lines": [], "closing_line", "hashtags": []}, "pin_question", "notes"}`
5. `python shorts.py check <편> --fix` — 규칙 검사. 오류가 없어질 때까지 plan을 고친다. `--fix`는 컷 안의 쉼을 잘라 컷을 나눈다.
6. `python shorts.py tts <편>` → `render <편>` → `qa <편>`
7. `output/<편>/_검수_*.jpg`를 직접 본다: 내장 자막·광고 문구가 들어왔는지, 자막·댓글 카드가 얼굴을 가리는지.
   문제가 있으면 plan의 x0나 카드 `pos`를 고쳐 다시 렌더링한다.
8. `python shorts.py copy <편>` — 업로드 문구와 보고 파일. 보고 내용을 사용자에게 짧게 전한다.

## 두 영상 섞기
`input/<편>/`에 영상이 둘이고 `info.json`에 `videos`(파일 이름 둘) 또는 `url2`가 있으면 두 영상을 섞는 편이다(`Episode.sources`). 첫 영상이 A, 둘째가 B.
- 둘째 영상의 작업 파일은 이름 뒤에 `_2`: `meta_2.json`, `words_2.json`, `transcript_2.txt`, `comments_2.json`, `words_zoom_2.txt`.
  프레임 시트는 `overviewB_*.jpg`, `zoomB_<n>_*.jpg`. 댓글을 직접 줄 때는 `input/<편>/comments_2.json`.
- `analysis.json`: 제품·후킹·`pick`·`pick.ranges` 항목마다 `"src": "A"|"B"`, 그리고 `channel_b`, `burned_in_b`.
- `plan.json`: 둘째 영상의 장면(컷·정지 화면)과 `thumbnail`, 그 영상의 댓글 카드에 `"src": 1`. 둘째 영상의 크롭은 `crop_b`,
  영상 내내 지울 글씨는 `erase_b`.
  출처 문구는 `source_text`(A)와 `source_text_b`(B)이고, 렌더링이 그 장면의 영상 것만 띄운다(`build.source_text_at`). `ranges`는 `[[시작, 끝, 영상 번호(0|1)], …]`. 시각·x0는 모두 그 영상 기준이다.
- 규칙 검사는 영상별로 본다(구간 겹침, 자막 시각, 제품 구간). 제품 구간이 있는 영상을 하나도 안 쓰면 오류다.

## plan.json 요점
- `timeline`: 재생 순서. 컷은 `{"type":"cut","a","b","x0","subs":[{"t","text","em","sfx"}],"sfx"}`,
  TTS는 `{"type":"tts","text","audio":"tts1.mp3","image" 또는 "still_t"+"x0","sfx"}`.
- `crop`: `size`(1:1 한 변, 1080p 기본 840), `y0`(기본 0), `x_min`/`x_max`(크롭이 들어가도 되는 원본 x 범위).
- 원본 글씨: plan 맨 위 `erase`(영상 내내 같은 자리의 글씨)와 구간의 `erase`는 원본 좌표 사각형 `[[x,y,w,h], …]`을 주변 화소로 메운다.
  구간에 `"mirror": false`를 주면 그 구간만 거울반전을 하지 않는다. 우선순위는 RULES.md(피하기 → 지우기 → 반전 풀기).
- `cards`: `seg`(뜨기 시작하는 timeline 순번), `offset`, `dur`, `text`(원문 그대로), `likes`, `heart`.
  카드는 영상 바로 아래 띠(`layout.card_gap`, 그린 상자 높이 `card_h`)에 화면 폭으로 붙고 그 아래에 출처 문구가 온다. 긴 댓글은 글씨를 줄여 맞춘다.
  표시 시간은 `build.card_seconds`가 글자 수로 정한다(읽기에 살짝 모자라게. 비율은 `card_read`). plan의 `dur`는 `"dur_fixed": true`일 때만 쓴다.
  영상 위에 올리려면 `"on_video": true`와 `pos`(top/mid/bottom) 또는 `pos`에 y 숫자.
  실제 캡처 이미지를 쓰려면 `image`(파일명)와 `mosaic`([[x,y,w,h], …] 가릴 영역)를 준다.
- `ranges`: 고른 제품이 나오는 원본 구간 `[[시작, 끝], …]`(analysis의 `pick.ranges`에서 옴). 있으면 규칙 검사가
  모든 컷·정지 화면·썸네일이 이 안에 있는지 본다. 제품과 무관한 장면은 넣지 않는다.
- `title`: 화면 상단 두 줄(= 썸네일 문구). `thumbnail`: `{"t","x0"}`. 구간의 `note`는 그 장면에 무엇이 보이는지(보고의 장면 구성에 나온다).
- `sfx_files`: `{"ding": "파일.wav", …}` 로 실제 효과음 파일을 쓸 수 있다(없으면 합성음). 컷 전환 소리(`whoosh`)는 렌더링에서 뺀다(`sfx_off`).
- 화면 배치·속도 등 고정값은 `pipeline/build.py`의 `DEFAULTS`. plan의 `layout`으로 편마다 덮어쓸 수 있다.

## 스크립트
- `gui.py` 바탕화면 아이콘으로 여는 창(영상·링크·vidIQ 분석을 받아 `shorts.py auto` 실행, 업데이트, 아이콘 만들기).
  표준 라이브러리만 쓴다(numpy 등을 읽지 않는다). `쇼츠만들기.bat`이 명령창 없이 연다.
- `preview_gui.py` 미리보기 창(글자체·크기 고르기, 앱별 화면 요소 덧그리기). 고른 값은 `settings.json`(깃 제외)에 저장되고
  `build.apply_defaults`가 읽는다(`font_title`, `font_sub`, `title_size`, `sub_size`, `title_bold`, `sub_bold`,
  `music_file`, `music_volume`. plan에 직접 적은 값이 우선). `music_file`이 있으면 `<제품명>_음악.mp4`도 만든다.
  `pipeline/fonts.py` 한글 글자체 목록 · `pipeline/platforms.py` 쇼츠·틱톡·릴스 화면 요소
- `pipeline/asr_words.py` 음성 인식(어절별 시각) · `pipeline/sheets.py` 프레임 시트 · `pipeline/build.py` 렌더링
- `pipeline/checks.py` 규칙 검사·쉼 제거 · `pipeline/qa.py` 완성본 검수
- `pipeline/tts.py` 일레븐랩스 · `pipeline/comments.py` 댓글 · `pipeline/brain.py` Claude API 판단 단계
- `pipeline/center.py` 인물 가운데 맞춤(얼굴 찾기, onnxruntime + UltraFace 모델 1MB). sherpa-onnx와 한 프로세스에서 함께 불러오면
  충돌할 수 있어 `shorts.py`는 따로 실행한다. `shorts.py center <편>` 또는 `auto`가 TTS 전에 부른다. 컷에 `"center": false`면 건너뛴다
- `pipeline/capture.py` 실제 유튜브 댓글 캡처(playwright로 PC의 Edge·Chrome 사용). `shorts.py capture <편>` 또는 `auto`가 렌더 전에 부른다.
  카드에 `image`(`input/<편>/card_*.png`)와 `mosaic`을 붙인다. 유튜브 화면 구조가 바뀌면 이 파일의 선택자(`THREAD`, `READ_JS`, 가릴 곳)를 고친다
- 검증: 테스트 도구는 없다. 고친 뒤에는 실제로 한 편을 `render` → `qa` 해 보고 프레임 시트를 본다.

## 원격(웹) 세션에서
- 원본 영상은 저장소에 없다(`input/`은 깃 제외). 사용자가 파일을 올려 줘야 한다.
- 기본 네트워크에서는 `api.elevenlabs.io`, 유튜브가 막혀 있을 수 있다. TTS 파일을 받거나 환경 설정에서 허용한다.
- 모델 파일(약 400MB)은 처음 실행할 때 GitHub 릴리스에서 `models/`로 내려받는다.
