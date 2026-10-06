# 사용법:  make analyze EP=episodes/021_윤은혜_온슬로패치
#          make build   EP=episodes/021_윤은혜_온슬로패치
#          make sample           (합성 샘플 편 생성: episodes/샘플)
EP ?= episodes/샘플
PY ?= python3

.PHONY: analyze build sample install

install:
	$(PY) -m pip install -r requirements.txt

analyze:
	$(PY) -m shorts.cli analyze "$(EP)"

build:
	$(PY) -m shorts.cli build "$(EP)"

sample:
	$(PY) scripts/make_sample_episode.py
