import pytest
from ogce4.v62.agent_society import create_agent,society_turn,social_influence
from ogce4.v62.dialogue import dialogue_response
from ogce4.v62.transport import encode_message,decode_message,TransportAdapter,MessageProtocolError
from ogce4.v62.room import WorldRoom,RoomError
from ogce4.v62.vector_memory import LocalSemanticIndex

def test_society_turn_is_deterministic_and_bounded():
    agents=[create_agent("a","Mira",goals=[{"name":"explore","priority":.9,"urgency":.8}])]
    a,events=society_turn(agents); b,_=society_turn(agents)
    assert a==b and events[0]["action"]=="explore" and agents[0]["turns"]==0

def test_society_agent_limit():
    with pytest.raises(ValueError): society_turn([{}]*3,max_agents=2)

def test_social_influence_bounded():
    a=create_agent("a","A")
    for _ in range(100): a=social_influence(a,"b",1)
    assert 0<a["relationships"]["b"]<=1

def test_dialogue_relationship_tone():
    npc={"name":"Mira"}; player={"display_name":"Alex"}
    assert dialogue_response(npc,player,"greeting",.8)["tone"]=="warm"
    assert dialogue_response(npc,player,"greeting",-.8)["tone"]=="guarded"

def test_transport_roundtrip():
    msg={"type":"move","position":[1,2,3]}
    assert decode_message(encode_message(msg))==msg

def test_transport_rejects_invalid_and_oversize():
    with pytest.raises(MessageProtocolError): decode_message("[]")
    with pytest.raises(MessageProtocolError): decode_message(b"x"*70000)

def test_transport_adapter_uses_handler():
    adapter=TransportAdapter(lambda m:{"accepted":m["type"]=="ping"})
    assert decode_message(adapter.receive('{"type":"ping"}'))["result"]["accepted"]

def test_room_membership_sequence_and_event():
    room=WorldRoom("aurelia",max_players=2)
    room.join("p1"); room.join("p2")
    seq=room.publish("p1","chat_message",{"text":"hello"})
    assert seq==3 and len(room.events_since(0))==3

def test_room_authorization_and_capacity():
    room=WorldRoom("a",max_players=1); room.join("p1")
    with pytest.raises(RoomError): room.join("p2")
    with pytest.raises(PermissionError): room.publish("p2","chat_message",{})

def test_room_event_allowlist():
    room=WorldRoom("a"); room.join("p")
    with pytest.raises(PermissionError): room.publish("p","admin_override",{})

def test_local_semantic_search():
    idx=LocalSemanticIndex()
    idx.add("forest","Ancient forest beside northern river")
    idx.add("desert","Desert kingdom trades salt")
    assert idx.search("ancient northern forest")[0]["id"]=="forest"
