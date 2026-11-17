---
description: 쇼핑 쇼츠 한 편 만들기 (원본 영상 → 완성본 6종)
argument-hint: <편이름> [유튜브 링크]
---
`tools/shopping-shorts/`에서 쇼핑 쇼츠 한 편을 끝까지 만든다. 대상: $ARGUMENTS

1. `tools/shopping-shorts/CLAUDE.md`와 `RULES.md`를 읽는다.
2. `input/<편이름>/`에 원본 영상이 있는지 확인한다. 없으면 무엇을 넣어야 하는지 알려 주고 멈춘다.
   유튜브 링크를 받았으면 `python shorts.py new <편이름> --url <링크>`로 `info.json`에 적는다.
3. `.env`에 `ANTHROPIC_API_KEY`가 있으면 `python shorts.py auto <편이름>`으로 전체 자동 실행한다.
   없으면 CLAUDE.md의 "B. Claude Code가 판단 단계를 직접 맡기" 순서대로 한다.
4. 끝나면 `output/<편이름>/_검수_*.jpg`를 직접 보고, `<제품명>_보고.txt` 내용을 짧게 전한다:
   무엇을 만들었는지, 사람이 확인할 것, 차순위 제품 후보.
