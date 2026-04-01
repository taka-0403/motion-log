import hashlib
import json
import os
import sqlite3
from datetime import datetime
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


HOST = "127.0.0.1"
PORT = 8000
ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "motion_log.db"


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                weekly_goal_minutes INTEGER NOT NULL DEFAULT 150,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workouts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                date TEXT NOT NULL,
                activity TEXT NOT NULL,
                duration INTEGER NOT NULL,
                intensity TEXT NOT NULL,
                calories INTEGER NOT NULL,
                notes TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS friend_requests (
                requester_id TEXT NOT NULL,
                target_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (requester_id, target_id),
                FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS friendships (
                user_id TEXT NOT NULL,
                friend_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (user_id, friend_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(users)").fetchall()
        }
        if "weekly_goal_minutes" not in columns:
            connection.execute(
                "ALTER TABLE users ADD COLUMN weekly_goal_minutes INTEGER NOT NULL DEFAULT 150"
            )


def generate_id() -> str:
    return hashlib.sha256(os.urandom(32)).hexdigest()[:24]


def hash_password(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120000).hex()


def verify_password(password: str, salt_hex: str, password_hash: str) -> bool:
    salt = bytes.fromhex(salt_hex)
    return hash_password(password, salt) == password_hash


def now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def normalize_username(value: str) -> str:
    return value.strip().lower()


def fetch_user(connection: sqlite3.Connection, user_id: str):
    return connection.execute(
        "SELECT id, username, weekly_goal_minutes, created_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()


def serialize_user(user_row: sqlite3.Row) -> dict:
    return {
        "id": user_row["id"],
        "username": user_row["username"],
        "weeklyGoalMinutes": user_row["weekly_goal_minutes"],
        "createdAt": user_row["created_at"],
    }


def fetch_state(connection: sqlite3.Connection, user_id: str) -> dict:
    user = fetch_user(connection, user_id)
    if not user:
      return {}

    workouts = connection.execute(
        """
        SELECT id, user_id, date, activity, duration, intensity, calories, notes, created_at
        FROM workouts
        WHERE user_id = ?
        ORDER BY date DESC, created_at DESC
        """,
        (user_id,),
    ).fetchall()

    incoming_rows = connection.execute(
        """
        SELECT u.id, u.username, u.weekly_goal_minutes, u.created_at
        FROM friend_requests fr
        JOIN users u ON u.id = fr.requester_id
        WHERE fr.target_id = ?
        ORDER BY fr.created_at DESC
        """,
        (user_id,),
    ).fetchall()

    outgoing_rows = connection.execute(
        """
        SELECT u.id, u.username, u.weekly_goal_minutes, u.created_at
        FROM friend_requests fr
        JOIN users u ON u.id = fr.target_id
        WHERE fr.requester_id = ?
        ORDER BY fr.created_at DESC
        """,
        (user_id,),
    ).fetchall()

    friend_rows = connection.execute(
        """
        SELECT u.id, u.username, u.weekly_goal_minutes, u.created_at
        FROM friendships f
        JOIN users u ON u.id = f.friend_id
        WHERE f.user_id = ?
        ORDER BY u.username
        """,
        (user_id,),
    ).fetchall()

    friend_workouts = {}
    for friend in friend_rows:
        rows = connection.execute(
            """
            SELECT id, user_id, date, activity, duration, intensity, calories, notes, created_at
            FROM workouts
            WHERE user_id = ?
            ORDER BY date DESC, created_at DESC
            LIMIT 20
            """,
            (friend["id"],),
        ).fetchall()
        friend_workouts[friend["id"]] = [
            {
                "id": row["id"],
                "userId": row["user_id"],
                "date": row["date"],
                "activity": row["activity"],
                "duration": row["duration"],
                "intensity": row["intensity"],
                "calories": row["calories"],
                "notes": row["notes"],
                "createdAt": row["created_at"],
            }
            for row in rows
        ]

    return {
        "currentUser": serialize_user(user),
        "workouts": [
            {
                "id": row["id"],
                "userId": row["user_id"],
                "date": row["date"],
                "activity": row["activity"],
                "duration": row["duration"],
                "intensity": row["intensity"],
                "calories": row["calories"],
                "notes": row["notes"],
                "createdAt": row["created_at"],
            }
            for row in workouts
        ],
        "friends": {
            "incoming": [serialize_user(row) for row in incoming_rows],
            "outgoing": [serialize_user(row) for row in outgoing_rows],
            "accepted": [serialize_user(row) for row in friend_rows],
        },
        "friendWorkouts": friend_workouts,
    }


class MotionLogHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            self.handle_get_state(parsed)
            return

        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        routes = {
            "/api/register": self.handle_register,
            "/api/login": self.handle_login,
            "/api/workouts": self.handle_create_workout,
            "/api/goal": self.handle_update_goal,
            "/api/friends/request": self.handle_friend_request,
            "/api/friends/accept": self.handle_friend_accept,
            "/api/friends/decline": self.handle_friend_decline,
            "/api/friends/cancel": self.handle_friend_cancel,
            "/api/friends/remove": self.handle_friend_remove,
        }

        handler = routes.get(parsed.path)
        if handler:
            handler()
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/workouts/"):
            self.handle_delete_workout(parsed)
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def handle_register(self):
        payload = self.read_json()
        username = normalize_username(payload.get("username", ""))
        password = payload.get("password", "")

        if not username or not password:
            self.send_json({"error": "ユーザー名とパスワードを入力してください。"}, HTTPStatus.BAD_REQUEST)
            return

        salt = os.urandom(16)
        user_id = generate_id()

        try:
            with get_connection() as connection:
                connection.execute(
                    """
                    INSERT INTO users (id, username, password_hash, salt, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (user_id, username, hash_password(password, salt), salt.hex(), now_iso()),
                )
                state = fetch_state(connection, user_id)
        except sqlite3.IntegrityError:
            self.send_json({"error": "そのユーザー名はすでに使われています。"}, HTTPStatus.CONFLICT)
            return

        self.send_json(state, HTTPStatus.CREATED)

    def handle_login(self):
        payload = self.read_json()
        username = normalize_username(payload.get("username", ""))
        password = payload.get("password", "")

        with get_connection() as connection:
            user = connection.execute(
                "SELECT * FROM users WHERE username = ?",
                (username,),
            ).fetchone()
            if not user or not verify_password(password, user["salt"], user["password_hash"]):
                self.send_json({"error": "ユーザー名またはパスワードが違います。"}, HTTPStatus.UNAUTHORIZED)
                return

            state = fetch_state(connection, user["id"])

        self.send_json(state)

    def handle_get_state(self, parsed):
        params = parse_qs(parsed.query)
        user_id = params.get("userId", [""])[0]

        if not user_id:
            self.send_json({"error": "userId が必要です。"}, HTTPStatus.BAD_REQUEST)
            return

        with get_connection() as connection:
            state = fetch_state(connection, user_id)
            if not state:
                self.send_json({"error": "ユーザーが見つかりません。"}, HTTPStatus.NOT_FOUND)
                return

        self.send_json(state)

    def handle_create_workout(self):
        payload = self.read_json()
        user_id = payload.get("userId", "")

        with get_connection() as connection:
            if not fetch_user(connection, user_id):
                self.send_json({"error": "ユーザーが見つかりません。"}, HTTPStatus.NOT_FOUND)
                return

            connection.execute(
                """
                INSERT INTO workouts (id, user_id, date, activity, duration, intensity, calories, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    generate_id(),
                    user_id,
                    payload.get("date", ""),
                    payload.get("activity", ""),
                    int(payload.get("duration", 0)),
                    payload.get("intensity", ""),
                    int(payload.get("calories", 0)),
                    payload.get("notes", ""),
                    now_iso(),
                ),
            )
            state = fetch_state(connection, user_id)

        self.send_json(state, HTTPStatus.CREATED)

    def handle_update_goal(self):
        payload = self.read_json()
        user_id = payload.get("userId", "")
        weekly_goal_minutes = max(1, int(payload.get("weeklyGoalMinutes", 150)))

        with get_connection() as connection:
            connection.execute(
                "UPDATE users SET weekly_goal_minutes = ? WHERE id = ?",
                (weekly_goal_minutes, user_id),
            )
            state = fetch_state(connection, user_id)

        self.send_json(state)

    def handle_delete_workout(self, parsed):
        workout_id = parsed.path.split("/")[-1]
        params = parse_qs(parsed.query)
        user_id = params.get("userId", [""])[0]

        with get_connection() as connection:
            connection.execute(
                "DELETE FROM workouts WHERE id = ? AND user_id = ?",
                (workout_id, user_id),
            )
            state = fetch_state(connection, user_id)

        self.send_json(state)

    def handle_friend_request(self):
        payload = self.read_json()
        requester_id = payload.get("userId", "")
        target_username = normalize_username(payload.get("friendUsername", ""))

        with get_connection() as connection:
            requester = fetch_user(connection, requester_id)
            target = connection.execute(
                "SELECT id, username, created_at FROM users WHERE username = ?",
                (target_username,),
            ).fetchone()

            if not requester or not target:
                self.send_json({"error": "ユーザーが見つかりません。"}, HTTPStatus.NOT_FOUND)
                return

            if requester["id"] == target["id"]:
                self.send_json({"error": "自分自身は追加できません。"}, HTTPStatus.BAD_REQUEST)
                return

            existing_friend = connection.execute(
                "SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?",
                (requester["id"], target["id"]),
            ).fetchone()
            if existing_friend:
                self.send_json({"error": "すでにフレンドです。"}, HTTPStatus.CONFLICT)
                return

            try:
                connection.execute(
                    "INSERT INTO friend_requests (requester_id, target_id, created_at) VALUES (?, ?, ?)",
                    (requester["id"], target["id"], now_iso()),
                )
            except sqlite3.IntegrityError:
                self.send_json({"error": "すでに申請済みです。"}, HTTPStatus.CONFLICT)
                return

            state = fetch_state(connection, requester["id"])

        self.send_json(state)

    def handle_friend_accept(self):
        self.update_friendship("accept")

    def handle_friend_decline(self):
        self.update_friendship("decline")

    def handle_friend_cancel(self):
        self.update_friendship("cancel")

    def handle_friend_remove(self):
        payload = self.read_json()
        user_id = payload.get("userId", "")
        friend_id = payload.get("friendId", "")

        with get_connection() as connection:
            connection.execute(
                "DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
                (user_id, friend_id, friend_id, user_id),
            )
            state = fetch_state(connection, user_id)

        self.send_json(state)

    def update_friendship(self, action: str):
        payload = self.read_json()
        user_id = payload.get("userId", "")
        other_id = payload.get("otherUserId", "")

        with get_connection() as connection:
            if action == "accept":
                connection.execute(
                    "DELETE FROM friend_requests WHERE requester_id = ? AND target_id = ?",
                    (other_id, user_id),
                )
                timestamp = now_iso()
                connection.execute(
                    "INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)",
                    (user_id, other_id, timestamp),
                )
                connection.execute(
                    "INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)",
                    (other_id, user_id, timestamp),
                )
            elif action == "decline":
                connection.execute(
                    "DELETE FROM friend_requests WHERE requester_id = ? AND target_id = ?",
                    (other_id, user_id),
                )
            elif action == "cancel":
                connection.execute(
                    "DELETE FROM friend_requests WHERE requester_id = ? AND target_id = ?",
                    (user_id, other_id),
                )

            state = fetch_state(connection, user_id)

        self.send_json(state)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


def main() -> None:
    init_db()
    handler = partial(MotionLogHandler, directory=str(ROOT))
    server = ThreadingHTTPServer((HOST, PORT), handler)
    print(f"Serving Motion Log at http://localhost:{PORT}")
    print(f"SQLite DB: {DB_PATH}")
    print("Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
