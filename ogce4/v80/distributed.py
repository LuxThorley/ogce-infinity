"""Optional Redis pub/sub fan-out for horizontally scaled room workers.

The authoritative world mutation still belongs to the game service/database.
This adapter only broadcasts already-committed events; it does not claim to
provide distributed consensus or transactional exactly-once delivery.
"""
import json
class RedisRoomBus:
    def __init__(self, url: str, channel_prefix: str = "ogce:v80:room:"):
        try:
            import redis
        except ImportError as exc:
            raise RuntimeError("Install optional dependency: pip install 'redis>=5,<7'") from exc
        self.client = redis.Redis.from_url(url, decode_responses=True)
        self.prefix = channel_prefix
    def publish(self, world_id: str, event: dict) -> int:
        return int(self.client.publish(self.prefix + world_id, json.dumps(event,separators=(",",":"))))
    def subscribe(self, world_id: str):
        pubsub=self.client.pubsub()
        pubsub.subscribe(self.prefix+world_id)
        return pubsub
