#!/usr/bin/env sh
set -eu
python -m pip install -e ".[server,test]"
pytest -q
ogce80 serve --host 127.0.0.1 --port 8787
