"""Persistent password, session and one-time WebSocket ticket store."""
import hashlib, hmac, secrets, sqlite3, time, re

class AuthStore:
    def __init__(self,database):
        self.database=str(database)
        with sqlite3.connect(self.database) as db:
            db.execute("CREATE TABLE IF NOT EXISTS accounts(username TEXT PRIMARY KEY,salt BLOB NOT NULL,password_hash BLOB NOT NULL,created REAL NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,username TEXT NOT NULL,expires REAL NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS ws_tickets(ticket_hash TEXT PRIMARY KEY,username TEXT NOT NULL,expires REAL NOT NULL)")
    def _db(self):
        db=sqlite3.connect(self.database,timeout=30)
        db.execute("PRAGMA busy_timeout=30000")
        return db
    @staticmethod
    def _hash(password,salt): return hashlib.pbkdf2_hmac("sha256",password.encode(),salt,310000)
    def register(self,username,password):
        username=str(username).strip().lower()
        if not re.fullmatch(r"[a-z0-9_]{3,24}",username): raise ValueError("username_must_be_3_to_24_letters_numbers_or_underscore")
        if not isinstance(password,str) or len(password)<12 or len(password)>256: raise ValueError("password_must_be_12_to_256_characters")
        salt=secrets.token_bytes(16); digest=self._hash(password,salt)
        try:
            with self._db() as db: db.execute("INSERT INTO accounts VALUES(?,?,?,?)",(username,salt,digest,time.time()))
        except sqlite3.IntegrityError: raise ValueError("account_already_exists")
        return self.login(username,password)
    def login(self,username,password):
        username=str(username).strip().lower()
        with self._db() as db: row=db.execute("SELECT salt,password_hash FROM accounts WHERE username=?",(username,)).fetchone()
        if not row or not hmac.compare_digest(self._hash(str(password),row[0]),row[1]): raise ValueError("invalid_credentials")
        token=secrets.token_urlsafe(32); digest=hashlib.sha256(token.encode()).hexdigest()
        with self._db() as db: db.execute("INSERT INTO sessions VALUES(?,?,?)",(digest,username,time.time()+43200))
        return {"token":token,"username":username,"expires_in":43200}
    def validate(self,token):
        if not token:return None
        digest=hashlib.sha256(token.encode()).hexdigest()
        with self._db() as db:
            row=db.execute("SELECT username,expires FROM sessions WHERE token_hash=?",(digest,)).fetchone()
            if not row:return None
            if row[1]<time.time():
                db.execute("DELETE FROM sessions WHERE token_hash=?",(digest,));return None
            return row[0]
    def issue_ws_ticket(self,token):
        username=self.validate(token)
        if not username: raise ValueError("invalid_session")
        ticket=secrets.token_urlsafe(32); digest=hashlib.sha256(ticket.encode()).hexdigest()
        with self._db() as db:
            db.execute("DELETE FROM ws_tickets WHERE expires<?",(time.time(),))
            db.execute("INSERT INTO ws_tickets VALUES(?,?,?)",(digest,username,time.time()+60))
        return {"ticket":ticket,"expires_in":60}
    def consume_ws_ticket(self,ticket):
        if not ticket:return None
        digest=hashlib.sha256(ticket.encode()).hexdigest()
        with self._db() as db:
            row=db.execute("SELECT username,expires FROM ws_tickets WHERE ticket_hash=?",(digest,)).fetchone()
            if not row:return None
            db.execute("DELETE FROM ws_tickets WHERE ticket_hash=?",(digest,))
            return row[0] if row[1]>=time.time() else None
