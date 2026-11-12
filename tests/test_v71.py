
from ogce4.v70.auth import AuthStore
from ogce4.v70.runtime import GameRuntime

def test_account_registration_and_session_validation(tmp_path):
    db=tmp_path/"accounts.sqlite3"
    auth=AuthStore(db)
    created=auth.register("explorer_01","correct horse battery 2026!")
    assert created["username"]=="explorer_01"
    assert auth.validate(created["token"])=="explorer_01"
    assert auth.validate("not-a-session") is None

def test_duplicate_and_weak_accounts_rejected(tmp_path):
    auth=AuthStore(tmp_path/"accounts.sqlite3")
    auth.register("builder_01","this is a sufficiently long password")
    try: auth.register("builder_01","this is a sufficiently long password")
    except ValueError as e: assert "exists" in str(e)
    else: assert False
    try: auth.register("short","123")
    except ValueError: pass
    else: assert False

def test_authenticated_identity_can_drive_persistent_world(tmp_path):
    db=tmp_path/"game.sqlite3"; auth=AuthStore(db); runtime=GameRuntime(db)
    user=auth.register("worldmaker","password that is long enough")
    assert auth.validate(user["token"])=="worldmaker"
    out=runtime.act("Aurelia","worldmaker",{"type":"move","dx":0,"dy":1})
    assert out["state"]["players"]["worldmaker"]["y"]==3
