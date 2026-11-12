"""WebSocket transport adapter contract with safe, testable message framing."""
import json
MAX_MESSAGE_BYTES=65536
class MessageProtocolError(ValueError): pass
def encode_message(message):
    if not isinstance(message,dict): raise MessageProtocolError("message must be an object")
    data=json.dumps(message,separators=(",",":"),allow_nan=False).encode()
    if len(data)>MAX_MESSAGE_BYTES: raise MessageProtocolError("message exceeds size limit")
    return data
def decode_message(data):
    if not isinstance(data,(bytes,str)): raise MessageProtocolError("unsupported message type")
    raw=data.encode() if isinstance(data,str) else data
    if len(raw)>MAX_MESSAGE_BYTES: raise MessageProtocolError("message exceeds size limit")
    try: value=json.loads(raw.decode("utf-8"))
    except Exception as e: raise MessageProtocolError("invalid JSON message") from e
    if not isinstance(value,dict) or "type" not in value: raise MessageProtocolError("message requires type field")
    return value
class TransportAdapter:
    """Interface for plugging in a real WebSocket server/client."""
    def __init__(self,handler): self.handler=handler
    def receive(self,raw):
        msg=decode_message(raw)
        result=self.handler(msg)
        return encode_message({"type":"ack","result":result})
