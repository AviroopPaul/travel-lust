import sqlite3
import json
from datetime import datetime
from typing import List, Optional, Dict, Any
from contextlib import contextmanager
import os

DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'travel_agent.db')


@contextmanager
def get_db():
    """Context manager for database connections"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def init_db():
    """Initialize database tables"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Chat sessions table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                destination TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Chat messages table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                trip_plan TEXT,
                user_query TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            )
        ''')

        # Add user_query column if it doesn't exist (for existing databases)
        try:
            cursor.execute(
                'ALTER TABLE chat_messages ADD COLUMN user_query TEXT')
        except sqlite3.OperationalError:
            # Column already exists, ignore
            pass

        # User memories table (for personalization)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                memory_type TEXT NOT NULL,
                content TEXT NOT NULL,
                confidence REAL DEFAULT 1.0,
                source_session_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (source_session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL
            )
        ''')

        # Create indexes for better performance
        cursor.execute(
            'CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id)')
        cursor.execute(
            'CREATE INDEX IF NOT EXISTS idx_memories_type ON user_memories(memory_type)')

        print("[Database] Initialized successfully")

# Chat Session Functions


def create_session(session_id: str, title: str, destination: str = None) -> Dict[str, Any]:
    """Create a new chat session"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO chat_sessions (id, title, destination) VALUES (?, ?, ?)',
            (session_id, title, destination)
        )
        return get_session(session_id)


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Get a chat session by ID"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT * FROM chat_sessions WHERE id = ?', (session_id,))
        row = cursor.fetchone()
        if row:
            return dict(row)
        return None


def get_all_sessions() -> List[Dict[str, Any]]:
    """Get all chat sessions, ordered by most recent"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM chat_sessions ORDER BY updated_at DESC')
        return [dict(row) for row in cursor.fetchall()]


def update_session(session_id: str, title: str = None, destination: str = None):
    """Update a chat session"""
    with get_db() as conn:
        cursor = conn.cursor()
        updates = []
        params = []

        if title:
            updates.append('title = ?')
            params.append(title)
        if destination:
            updates.append('destination = ?')
            params.append(destination)

        updates.append('updated_at = CURRENT_TIMESTAMP')
        params.append(session_id)

        cursor.execute(
            f'UPDATE chat_sessions SET {", ".join(updates)} WHERE id = ?',
            params
        )


def delete_session(session_id: str) -> bool:
    """Delete a chat session and its messages"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            'DELETE FROM chat_messages WHERE session_id = ?', (session_id,))
        cursor.execute('DELETE FROM chat_sessions WHERE id = ?', (session_id,))
        return cursor.rowcount > 0

# Chat Message Functions


def add_message(session_id: str, role: str, content: str, trip_plan: Dict = None, user_query: Dict = None) -> Dict[str, Any]:
    """Add a message to a session"""
    with get_db() as conn:
        cursor = conn.cursor()
        trip_plan_json = json.dumps(trip_plan) if trip_plan else None
        user_query_json = json.dumps(user_query) if user_query else None
        cursor.execute(
            'INSERT INTO chat_messages (session_id, role, content, trip_plan, user_query) VALUES (?, ?, ?, ?, ?)',
            (session_id, role, content, trip_plan_json, user_query_json)
        )
        # Update session timestamp
        cursor.execute(
            'UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            (session_id,)
        )
        return {
            'id': cursor.lastrowid,
            'session_id': session_id,
            'role': role,
            'content': content,
            'trip_plan': trip_plan,
            'user_query': user_query
        }


def get_session_messages(session_id: str) -> List[Dict[str, Any]]:
    """Get all messages for a session"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
            (session_id,)
        )
        messages = []
        for row in cursor.fetchall():
            msg = dict(row)
            if msg['trip_plan']:
                msg['trip_plan'] = json.loads(msg['trip_plan'])
            if msg['user_query']:
                msg['user_query'] = json.loads(msg['user_query'])
            messages.append(msg)
        return messages

# Memory Functions


def add_memory(memory_type: str, content: str, source_session_id: str = None, confidence: float = 1.0) -> Dict[str, Any]:
    """Add a new memory"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO user_memories (memory_type, content, source_session_id, confidence) VALUES (?, ?, ?, ?)',
            (memory_type, content, source_session_id, confidence)
        )
        return {
            'id': cursor.lastrowid,
            'memory_type': memory_type,
            'content': content,
            'confidence': confidence
        }


def get_memories(memory_type: str = None, limit: int = 20) -> List[Dict[str, Any]]:
    """Get user memories, optionally filtered by type"""
    with get_db() as conn:
        cursor = conn.cursor()
        if memory_type:
            cursor.execute(
                'SELECT * FROM user_memories WHERE memory_type = ? ORDER BY confidence DESC, updated_at DESC LIMIT ?',
                (memory_type, limit)
            )
        else:
            cursor.execute(
                'SELECT * FROM user_memories ORDER BY confidence DESC, updated_at DESC LIMIT ?',
                (limit,)
            )
        return [dict(row) for row in cursor.fetchall()]


def get_all_memories_for_context() -> str:
    """Get all memories formatted for LLM context"""
    memories = get_memories(limit=50)
    if not memories:
        return ""

    memory_text = "User preferences and past information:\n"
    for mem in memories:
        memory_text += f"- [{mem['memory_type']}]: {mem['content']}\n"
    return memory_text


def delete_memory(memory_id: int) -> bool:
    """Delete a specific memory"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM user_memories WHERE id = ?', (memory_id,))
        return cursor.rowcount > 0


def clear_all_memories() -> int:
    """Clear all memories"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM user_memories')
        return cursor.rowcount


# Initialize database on import
init_db()
