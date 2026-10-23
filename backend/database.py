
import json
import math
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "taskpilot.db"


def get_connection():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_db():
    """Create new tables and safely migrate older databases."""
    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                goal TEXT NOT NULL,
                days_available INTEGER NOT NULL,
                hours_per_day REAL NOT NULL,
                tasks_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        plan_columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(plans)"
            ).fetchall()
        }

        if "status" not in plan_columns:
            connection.execute("""
                ALTER TABLE plans
                ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
            """)

        if "availability_json" not in plan_columns:
            connection.execute("""
                ALTER TABLE plans ADD COLUMN availability_json TEXT
            """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS reschedule_proposals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id INTEGER NOT NULL,
                proposal_json TEXT NOT NULL,
                baseline_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'rejected')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (plan_id) REFERENCES plans(id)
            )
        """)

        proposal_columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(reschedule_proposals)"
            ).fetchall()
        }

        if "remaining_days" not in proposal_columns:
            connection.execute("""
                ALTER TABLE reschedule_proposals
                ADD COLUMN remaining_days INTEGER
            """)

        if "availability_json" not in proposal_columns:
            connection.execute("""
                ALTER TABLE reschedule_proposals
                ADD COLUMN availability_json TEXT NOT NULL DEFAULT '[]'
            """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                reminder_type TEXT NOT NULL
                    CHECK (
                        reminder_type IN ('birthday', 'event', 'deadline')
                    ),
                reminder_date TEXT NOT NULL,
                reminder_time TEXT,
                notes TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'completed')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Persistent assistant conversations.
        connection.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT 'New conversation',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Conversation messages and optional structured metadata.
        connection.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                role TEXT NOT NULL
                    CHECK (role IN ('user', 'assistant', 'system')),
                content TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id)
                    REFERENCES conversations(id) ON DELETE CASCADE
            )
        """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
            ON chat_messages(conversation_id, id)
        """)

        # AI-proposed actions remain pending until explicitly confirmed.
        connection.execute("""
            CREATE TABLE IF NOT EXISTS chat_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                message_id INTEGER,
                action_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (
                        status IN (
                            'pending', 'confirmed', 'rejected', 'failed'
                        )
                    ),
                result_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id)
                    REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (message_id)
                    REFERENCES chat_messages(id) ON DELETE SET NULL
            )
        """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_chat_actions_conversation
            ON chat_actions(conversation_id, id)
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS activity_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                entity_type TEXT,
                entity_id TEXT,
                description TEXT NOT NULL,
                details_json TEXT NOT NULL DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_activity_events_created
            ON activity_events(created_at DESC, id DESC)
        """)


# --------------------------------------------------
# Plans
# --------------------------------------------------

def save_plan(plan):
    """Save a plan and ensure every task has an ID and status."""
    try:
        start_date = date.fromisoformat(plan.get("start_date") or date.today().isoformat())
    except (TypeError, ValueError):
        start_date = date.today()
    tasks = []

    for index, original_task in enumerate(plan["tasks"], start=1):
        task = dict(original_task)
        task.setdefault("task_id", index)
        task.setdefault("status", "pending")
        task.setdefault("scheduled_date", (start_date + timedelta(days=max(0, int(task.get("day", 1)) - 1))).isoformat())
        task.setdefault("scheduled_time", None)
        task.setdefault("scheduled_end_time", None)
        task.setdefault("completed_at", None)
        tasks.append(task)

    with get_connection() as connection:
        cursor = connection.execute("""
            INSERT INTO plans
                (goal, days_available, hours_per_day, tasks_json, availability_json)
            VALUES (?, ?, ?, ?, ?)
        """, (
            plan["goal"],
            plan["days_available"],
            plan["hours_per_day"],
            json.dumps(tasks),
            json.dumps(plan.get("availability") or {}),
        ))

        return cursor.lastrowid


def get_plan(plan_id):
    """Retrieve a plan and migrate missing task metadata."""
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM plans WHERE id = ?",
            (plan_id,),
        ).fetchone()

        if row is None:
            return None

        tasks = json.loads(row["tasks_json"])
        tasks_changed = False

        for index, task in enumerate(tasks, start=1):
            if "task_id" not in task:
                task["task_id"] = index
                tasks_changed = True

            if "status" not in task:
                task["status"] = "pending"
                tasks_changed = True

            if "scheduled_date" not in task:
                try:
                    base = date.fromisoformat(str(row["created_at"])[:10])
                except (TypeError, ValueError):
                    base = date.today()
                task["scheduled_date"] = (base + timedelta(days=max(0, int(task.get("day", 1)) - 1))).isoformat()
                tasks_changed = True
            task.setdefault("scheduled_time", None)
            task.setdefault("scheduled_end_time", None)
            task.setdefault("completed_at", None)

        if tasks_changed:
            connection.execute(
                "UPDATE plans SET tasks_json = ? WHERE id = ?",
                (json.dumps(tasks), plan_id),
            )

        return {
            "id": row["id"],
            "goal": row["goal"],
            "days_available": row["days_available"],
            "hours_per_day": row["hours_per_day"],
            "tasks": tasks,
            "status": row["status"],
            "created_at": row["created_at"],
            "availability": json.loads(row["availability_json"] or "{}") if "availability_json" in row.keys() else {},
        }


def update_plan_status(plan_id, new_status):
    """Review a plan only while it is still pending."""
    if new_status not in ("approved", "rejected"):
        return 0

    with get_connection() as connection:
        cursor = connection.execute("""
            UPDATE plans
            SET status = ?
            WHERE id = ? AND status = 'pending'
        """, (new_status, plan_id))

        return cursor.rowcount


def delete_plan(plan_id):
    """Delete a plan and any stored reschedule proposals for it."""
    with get_connection() as connection:
        connection.execute(
            "DELETE FROM reschedule_proposals WHERE plan_id = ?",
            (plan_id,),
        )
        cursor = connection.execute(
            "DELETE FROM plans WHERE id = ?",
            (plan_id,),
        )
        return cursor.rowcount


def update_task_status(plan_id, task_id, new_status):
    """Update task progress only on an approved plan."""
    if new_status not in ("pending", "completed"):
        return "invalid_status"

    with get_connection() as connection:
        row = connection.execute(
            "SELECT status, tasks_json FROM plans WHERE id = ?",
            (plan_id,),
        ).fetchone()

        if row is None:
            return "plan_not_found"

        if row["status"] != "approved":
            return "plan_not_approved"

        tasks = json.loads(row["tasks_json"])

        for index, task in enumerate(tasks, start=1):
            task.setdefault("task_id", index)
            task.setdefault("status", "pending")

        matching_task = next(
            (
                task for task in tasks
                if task["task_id"] == task_id
            ),
            None,
        )

        if matching_task is None:
            return "task_not_found"

        matching_task["status"] = new_status
        matching_task["completed_at"] = datetime.now(timezone.utc).isoformat() if new_status == "completed" else None

        connection.execute(
            "UPDATE plans SET tasks_json = ? WHERE id = ?",
            (json.dumps(tasks), plan_id),
        )

    return "updated"


def update_task_schedule(plan_id, task_id, scheduled_date, scheduled_time=None, scheduled_end_time=None):
    """Move or retime an approved task without changing its completion state."""
    try:
        date.fromisoformat(scheduled_date)
    except (TypeError, ValueError):
        return "invalid_date"
    for value in (scheduled_time, scheduled_end_time):
        if value is not None:
            try:
                datetime.strptime(value, "%H:%M")
            except (TypeError, ValueError):
                return "invalid_time"
    if scheduled_time and scheduled_end_time and scheduled_end_time <= scheduled_time:
        return "invalid_time_range"

    with get_connection() as connection:
        row = connection.execute("SELECT status, tasks_json FROM plans WHERE id = ?", (plan_id,)).fetchone()
        if row is None:
            return "plan_not_found"
        if row["status"] != "approved":
            return "plan_not_approved"
        tasks = json.loads(row["tasks_json"])
        matching_task = next((task for task in tasks if task.get("task_id") == task_id), None)
        if matching_task is None:
            return "task_not_found"
        matching_task["scheduled_date"] = scheduled_date
        matching_task["scheduled_time"] = scheduled_time
        matching_task["scheduled_end_time"] = scheduled_end_time
        connection.execute("UPDATE plans SET tasks_json = ? WHERE id = ?", (json.dumps(tasks), plan_id))
    return "updated"


def get_all_plans():
    """Return saved plans, newest first."""
    with get_connection() as connection:
        rows = connection.execute("""
            SELECT id FROM plans
            ORDER BY created_at DESC, id DESC
        """).fetchall()

    return [get_plan(row["id"]) for row in rows]


def get_calendar_tasks(start_date=None, end_date=None):
    """Return real scheduled tasks, including overdue unfinished tasks."""
    start_date = start_date or date.today().isoformat()
    end_date = end_date or start_date
    items = []
    for plan in get_all_plans():
        if plan["status"] != "approved":
            continue
        for task in plan["tasks"]:
            scheduled = task.get("scheduled_date")
            if not scheduled or not start_date <= scheduled <= end_date:
                continue
            items.append({
                "id": f"task-{plan['id']}-{task['task_id']}",
                "plan_id": plan["id"],
                "task_id": task["task_id"],
                "title": task.get("title", "Untitled task"),
                "scheduled_date": scheduled,
                "scheduled_time": task.get("scheduled_time"),
                "scheduled_end_time": task.get("scheduled_end_time"),
                "duration_hours": task.get("duration_hours"),
                "priority": task.get("priority", "medium"),
                "status": task.get("status", "pending"),
                "completed_at": task.get("completed_at"),
                "plan_goal": plan["goal"],
            })
    return sorted(items, key=lambda item: (item["scheduled_date"], item.get("scheduled_time") or "23:59", item["id"]))


def create_activity(event_type, description, entity_type=None, entity_id=None, details=None):
    with get_connection() as connection:
        cursor = connection.execute("""
            INSERT INTO activity_events
                (event_type, entity_type, entity_id, description, details_json)
            VALUES (?, ?, ?, ?, ?)
        """, (event_type, entity_type, str(entity_id) if entity_id is not None else None, description, json.dumps(details or {})))
        return cursor.lastrowid


def get_activity(limit=100):
    with get_connection() as connection:
        rows = connection.execute("""
            SELECT id, event_type, entity_type, entity_id, description, details_json, created_at
            FROM activity_events ORDER BY created_at DESC, id DESC LIMIT ?
        """, (limit,)).fetchall()
    return [{**dict(row), "details": json.loads(row["details_json"] or "{}")} for row in rows]


# --------------------------------------------------
# Reschedule proposals
# --------------------------------------------------

def save_reschedule_proposal(
    plan_id,
    proposed_tasks,
    original_tasks,
    remaining_days=None,
    availability=None,
):
    """Save a proposal without changing the active schedule."""
    with get_connection() as connection:
        plan = connection.execute("""
            SELECT id, status, days_available
            FROM plans WHERE id = ?
        """, (plan_id,)).fetchone()

        if plan is None:
            return "plan_not_found"

        if plan["status"] != "approved":
            return "plan_not_approved"

        if remaining_days is None:
            remaining_days = plan["days_available"]

        if type(remaining_days) is not int or remaining_days < 1:
            return "invalid_remaining_days"

        cursor = connection.execute("""
            INSERT INTO reschedule_proposals
                (
                    plan_id, proposal_json, baseline_json,
                    remaining_days, availability_json, status
                )
            VALUES (?, ?, ?, ?, ?, 'pending')
        """, (
            plan_id,
            json.dumps(proposed_tasks),
            json.dumps(original_tasks),
            remaining_days,
            json.dumps(availability or []),
        ))

        return cursor.lastrowid


def get_reschedule_proposal(plan_id, proposal_id):
    """Retrieve a proposal belonging to the requested plan."""
    with get_connection() as connection:
        row = connection.execute("""
            SELECT id, plan_id, proposal_json, remaining_days,
                   availability_json, status, created_at
            FROM reschedule_proposals
            WHERE id = ? AND plan_id = ?
        """, (proposal_id, plan_id)).fetchone()

        if row is None:
            return None

        return {
            "id": row["id"],
            "plan_id": row["plan_id"],
            "tasks": json.loads(row["proposal_json"]),
            "remaining_days": row["remaining_days"],
            "availability": json.loads(row["availability_json"] or "[]"),
            "status": row["status"],
            "created_at": row["created_at"],
        }


def review_reschedule_proposal(plan_id, proposal_id, decision):
    """Accept or reject a proposal while preserving task progress."""
    if decision not in ("accept", "reject"):
        return "invalid_decision"

    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")

        plan = connection.execute("""
            SELECT status, tasks_json, days_available, hours_per_day
            FROM plans WHERE id = ?
        """, (plan_id,)).fetchone()

        if plan is None:
            return "plan_not_found"

        if plan["status"] != "approved":
            return "plan_not_approved"

        proposal = connection.execute("""
            SELECT proposal_json, baseline_json, remaining_days,
                   availability_json, status
            FROM reschedule_proposals
            WHERE id = ? AND plan_id = ?
        """, (proposal_id, plan_id)).fetchone()

        if proposal is None:
            return "proposal_not_found"

        if proposal["status"] != "pending":
            return "proposal_already_reviewed"

        current_tasks = json.loads(plan["tasks_json"])
        baseline_tasks = json.loads(proposal["baseline_json"])

        if current_tasks != baseline_tasks:
            return "proposal_stale"

        if decision == "reject":
            connection.execute("""
                UPDATE reschedule_proposals
                SET status = 'rejected'
                WHERE id = ? AND status = 'pending'
            """, (proposal_id,))
            return "rejected"

        proposed_tasks = json.loads(proposal["proposal_json"])

        if not isinstance(proposed_tasks, list):
            return "invalid_proposal"

        pending_original = [
            task for task in current_tasks
            if task.get("status") != "completed"
        ]

        proposed_ids = [
            task.get("task_id")
            for task in proposed_tasks
            if isinstance(task, dict)
        ]
        original_ids = [
            task.get("task_id") for task in pending_original
        ]

        if (
            len(proposed_ids) != len(proposed_tasks)
            or any(type(task_id) is not int for task_id in proposed_ids)
            or len(proposed_ids) != len(set(proposed_ids))
            or not set(proposed_ids).issubset(set(original_ids))
        ):
            return "invalid_proposal"

        proposed_by_id = {
            task["task_id"]: task for task in proposed_tasks
        }

        remaining_days = (
            proposal["remaining_days"]
            if proposal["remaining_days"] is not None
            else plan["days_available"]
        )
        daily_limit = plan["hours_per_day"]
        availability = json.loads(proposal["availability_json"] or "[]")
        availability_by_date = {
            str(entry.get("date")): entry
            for entry in availability
            if isinstance(entry, dict) and entry.get("date")
        }

        if (
            type(remaining_days) is not int
            or remaining_days < 1
            or isinstance(daily_limit, bool)
            or not isinstance(daily_limit, (int, float))
            or not math.isfinite(daily_limit)
            or daily_limit <= 0
        ):
            return "invalid_proposal"

        daily_totals = {}
        updated_tasks = []

        for task in current_tasks:
            if task.get("status") == "completed":
                updated_tasks.append(task)
                continue

            proposed = proposed_by_id.get(task["task_id"])
            if proposed is None:
                # The AI intentionally deferred this task because it did not
                # fit the new availability. Keep it pending but remove its
                # stale old date/time so the old and new schedules never mix.
                updated_tasks.append({
                    **task,
                    "scheduled_date": None,
                    "scheduled_time": None,
                    "scheduled_end_time": None,
                })
                continue
            day = proposed.get("day")
            duration = proposed.get("duration_hours")
            priority = proposed.get("priority")

            if (
                proposed.get("title") != task.get("title")
                or duration != task.get("duration_hours")
                or type(day) is not int
                or not 1 <= day <= remaining_days
                or priority not in ("high", "medium", "low")
                or isinstance(duration, bool)
                or not isinstance(duration, (int, float))
                or not math.isfinite(duration)
                or duration <= 0
            ):
                return "invalid_proposal"

            scheduled_date = proposed.get("scheduled_date")
            bucket = scheduled_date if availability_by_date else day
            daily_totals[bucket] = daily_totals.get(bucket, 0) + duration

            updated_tasks.append({
                **task,
                "day": day,
                "priority": priority,
                "scheduled_date": proposed.get("scheduled_date", task.get("scheduled_date")),
                "scheduled_time": proposed.get("scheduled_time", task.get("scheduled_time")),
                "scheduled_end_time": proposed.get("scheduled_end_time", task.get("scheduled_end_time")),
            })

        if any(
            total > (
                float(availability_by_date.get(bucket, {}).get("hours", daily_limit))
                if availability_by_date else daily_limit
            ) + 1e-9
            for bucket, total in daily_totals.items()
        ):
            return "invalid_proposal"

        connection.execute("""
            UPDATE plans
            SET tasks_json = ?,
                days_available = ?,
                hours_per_day = ?,
                availability_json = ?
            WHERE id = ?
        """, (
            json.dumps(updated_tasks),
            len(availability),
            max(
                (
                    float(entry.get("hours"))
                    for entry in availability
                    if isinstance(entry, dict)
                    and isinstance(entry.get("hours"), (int, float))
                    and not isinstance(entry.get("hours"), bool)
                ),
                default=float(daily_limit),
            ),
            json.dumps(availability),
            plan_id,
        ))

        cursor = connection.execute("""
            UPDATE reschedule_proposals
            SET status = 'accepted'
            WHERE id = ? AND status = 'pending'
        """, (proposal_id,))

        if cursor.rowcount != 1:
            raise RuntimeError("Proposal status changed unexpectedly")

        return "accepted"


# --------------------------------------------------
# Smart reminders
# --------------------------------------------------

def create_reminder(
    title,
    reminder_type,
    reminder_date,
    reminder_time=None,
    notes="",
):
    """Create a reminder and return its ID."""
    with get_connection() as connection:
        cursor = connection.execute("""
            INSERT INTO reminders
                (title, reminder_type, reminder_date, reminder_time, notes)
            VALUES (?, ?, ?, ?, ?)
        """, (
            title,
            reminder_type,
            reminder_date,
            reminder_time,
            notes,
        ))

        return cursor.lastrowid


def get_reminder(reminder_id):
    """Retrieve one reminder."""
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM reminders WHERE id = ?",
            (reminder_id,),
        ).fetchone()

        return dict(row) if row else None


def get_all_reminders():
    """List reminders in date order."""
    with get_connection() as connection:
        rows = connection.execute("""
            SELECT * FROM reminders
            ORDER BY reminder_date ASC, reminder_time ASC, id DESC
        """).fetchall()

        return [dict(row) for row in rows]


def get_upcoming_reminders():
    """Return pending reminders scheduled for today or later."""
    from datetime import date

    today = date.today().isoformat()

    with get_connection() as connection:
        rows = connection.execute("""
            SELECT * FROM reminders
            WHERE status = 'pending' AND reminder_date >= ?
            ORDER BY reminder_date ASC, reminder_time ASC
        """, (today,)).fetchall()

        return [dict(row) for row in rows]


def update_reminder_status(reminder_id, status):
    """Mark an existing reminder pending or completed."""
    if status not in ("pending", "completed"):
        raise ValueError("Status must be 'pending' or 'completed'")

    with get_connection() as connection:
        cursor = connection.execute("""
            UPDATE reminders SET status = ? WHERE id = ?
        """, (status, reminder_id))

        if cursor.rowcount == 0:
            return None

        row = connection.execute("""
            SELECT * FROM reminders WHERE id = ?
        """, (reminder_id,)).fetchone()

        return dict(row) if row else None


def delete_reminder(reminder_id):
    """Delete a reminder and report whether it existed."""
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM reminders WHERE id = ?",
            (reminder_id,),
        )
        return cursor.rowcount > 0


# --------------------------------------------------
# Persistent AI conversations
# --------------------------------------------------

def create_conversation(title="New conversation"):
    """Create a conversation and return its ID."""
    if not isinstance(title, str) or not title.strip():
        title = "New conversation"

    with get_connection() as connection:
        cursor = connection.execute("""
            INSERT INTO conversations (title)
            VALUES (?)
        """, (title.strip()[:120],))

        return cursor.lastrowid


def get_conversation(conversation_id):
    """Retrieve conversation metadata, or None if missing."""
    with get_connection() as connection:
        row = connection.execute("""
            SELECT id, title, created_at, updated_at
            FROM conversations WHERE id = ?
        """, (conversation_id,)).fetchone()

        return dict(row) if row else None


def get_all_conversations():
    """List conversations, most recently updated first."""
    with get_connection() as connection:
        rows = connection.execute("""
            SELECT
                c.id,
                c.title,
                c.created_at,
                c.updated_at,
                (
                    SELECT content
                    FROM chat_messages m
                    WHERE m.conversation_id = c.id
                      AND m.role IN ('user', 'assistant')
                    ORDER BY m.id DESC
                    LIMIT 1
                ) AS last_message
            FROM conversations c
            ORDER BY c.updated_at DESC, c.id DESC
        """).fetchall()

        return [dict(row) for row in rows]


def update_conversation_title(conversation_id, title):
    """Update a conversation title."""
    if not isinstance(title, str) or not title.strip():
        raise ValueError("Conversation title cannot be empty")

    with get_connection() as connection:
        cursor = connection.execute("""
            UPDATE conversations
            SET title = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (title.strip()[:120], conversation_id))

        return cursor.rowcount > 0


def save_chat_message(
    conversation_id,
    role,
    content,
    metadata=None,
):
    """Save a chat message and return its ID."""
    if role not in ("user", "assistant", "system"):
        raise ValueError("Invalid chat message role")

    if not isinstance(content, str) or not content.strip():
        raise ValueError("Chat message content cannot be empty")

    metadata_json = json.dumps(metadata or {})

    with get_connection() as connection:
        exists = connection.execute("""
            SELECT id FROM conversations WHERE id = ?
        """, (conversation_id,)).fetchone()

        if exists is None:
            return None

        cursor = connection.execute("""
            INSERT INTO chat_messages
                (conversation_id, role, content, metadata_json)
            VALUES (?, ?, ?, ?)
        """, (
            conversation_id,
            role,
            content.strip(),
            metadata_json,
        ))

        connection.execute("""
            UPDATE conversations
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (conversation_id,))

        return cursor.lastrowid


def get_chat_messages(conversation_id, limit=100):
    """Retrieve recent messages in chronological order."""
    if type(limit) is not int or not 1 <= limit <= 500:
        raise ValueError("Message limit must be between 1 and 500")

    with get_connection() as connection:
        rows = connection.execute("""
            SELECT id, conversation_id, role, content,
                   metadata_json, created_at
            FROM (
                SELECT *
                FROM chat_messages
                WHERE conversation_id = ?
                ORDER BY id DESC
                LIMIT ?
            )
            ORDER BY id ASC
        """, (conversation_id, limit)).fetchall()

        messages = []

        for row in rows:
            message = dict(row)
            message["metadata"] = json.loads(
                message.pop("metadata_json") or "{}"
            )
            messages.append(message)

        return messages


# --------------------------------------------------
# Confirmable AI actions
# --------------------------------------------------

def create_chat_action(
    conversation_id,
    action_type,
    payload,
    message_id=None,
):
    """Save a proposed action without executing it."""
    if not isinstance(action_type, str) or not action_type.strip():
        raise ValueError("Action type is required")

    with get_connection() as connection:
        conversation = connection.execute("""
            SELECT id FROM conversations WHERE id = ?
        """, (conversation_id,)).fetchone()

        if conversation is None:
            return None

        if message_id is not None:
            message = connection.execute("""
                SELECT id FROM chat_messages
                WHERE id = ? AND conversation_id = ?
            """, (message_id, conversation_id)).fetchone()

            if message is None:
                raise ValueError(
                    "Message does not belong to this conversation"
                )

        cursor = connection.execute("""
            INSERT INTO chat_actions
                (conversation_id, message_id, action_type, payload_json)
            VALUES (?, ?, ?, ?)
        """, (
            conversation_id,
            message_id,
            action_type.strip(),
            json.dumps(payload),
        ))

        return cursor.lastrowid


def get_chat_action(conversation_id, action_id):
    """Retrieve an action belonging to a conversation."""
    with get_connection() as connection:
        row = connection.execute("""
            SELECT * FROM chat_actions
            WHERE id = ? AND conversation_id = ?
        """, (action_id, conversation_id)).fetchone()

        if row is None:
            return None

        action = dict(row)
        action["payload"] = json.loads(action.pop("payload_json"))
        result_json = action.pop("result_json")
        action["result"] = (
            json.loads(result_json) if result_json else None
        )

        return action


def get_chat_actions(conversation_id, status=None):
    """List proposed actions, optionally filtered by status."""
    with get_connection() as connection:
        if status is None:
            rows = connection.execute("""
                SELECT id FROM chat_actions
                WHERE conversation_id = ?
                ORDER BY id DESC
            """, (conversation_id,)).fetchall()
        else:
            rows = connection.execute("""
                SELECT id FROM chat_actions
                WHERE conversation_id = ? AND status = ?
                ORDER BY id DESC
            """, (conversation_id, status)).fetchall()

    return [
        get_chat_action(conversation_id, row["id"])
        for row in rows
    ]


def update_chat_action(
    conversation_id,
    action_id,
    status,
    result=None,
):
    """Transition a pending action to its final state."""
    if status not in ("confirmed", "rejected", "failed"):
        raise ValueError("Invalid chat action status")

    with get_connection() as connection:
        cursor = connection.execute("""
            UPDATE chat_actions
            SET status = ?,
                result_json = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND conversation_id = ?
              AND status = 'pending'
        """, (
            status,
            json.dumps(result) if result is not None else None,
            action_id,
            conversation_id,
        ))

        return cursor.rowcount == 1


# Create any missing tables when this module is imported.
initialize_db()
