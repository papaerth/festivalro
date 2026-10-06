# 폰트

규격표(SPEC.md 5장)의 폰트 파일을 이 폴더에 넣는다. `config.yaml`의 `fonts.files`에 적힌 파일명과 맞춘다.

| 용도 | 폰트 | 기본 파일명 |
|---|---|---|
| 썸네일 윗줄·아랫줄 | 카페24 단정해 | `Cafe24Danjunghae.ttf` |
| 출처 | 그림 | `Geurim.ttf` |
| 자막 | 행복 | `Haengbok.ttf` |

파일이 없으면 경고를 띄우고 `NanumGothic-Bold.ttf`(나눔고딕, OFL 라이선스 — `NanumGothic-OFL.txt`)로 대신 렌더링한다.
좌표·크기 확인은 대체 폰트로도 할 수 있지만, 최종 확인은 실제 폰트를 넣고 한다.
