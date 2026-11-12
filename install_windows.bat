@echo off
py -3.10 -m venv .venv
call .venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -e ".[server,test]"
echo OGCE v7.4 installed. Run: ogce74 serve
