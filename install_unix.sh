#!/usr/bin/env sh
set -eu
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e ".[server,test]"
echo "OGCE v7.4 installed. Run: ogce74 serve"
