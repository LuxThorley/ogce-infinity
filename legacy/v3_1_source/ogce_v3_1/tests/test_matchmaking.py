from ogce_v31.matchmaking import Matchmaker

def test_matchmaker():
    mm = Matchmaker()
    mm.enqueue("a", 50, "militia", "eu-west")
    mm.enqueue("b", 52, "militia", "eu-west")
    mm.enqueue("c", 48, "militia", "eu-west")
    assert mm.form_match("militia", "eu-west", 3) is not None
