
import sqlite3
import json
from pathlib import Path

DB_PATH = Path(__file__).parent / "taskpilot.db"


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_db():
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

        # Add the status column to older databases if needed.
        columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(plans)"
            ).fetchall()
        }

        if "status" not in columns:
            connection.execute("""
                ALTER TABLE plans
                ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
            """)

        # Store reschedule proposals separately from active plans.
        connection.execute("""
            CREATE TABLE IF NOT EXISTS reschedule_proposals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id INTEGER NOT NULL,
                proposal_json TEXT NOT NULL,
                baseline_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (
                        status IN ('pending', 'accepted', 'rejected')
                    ),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (plan_id) REFERENCES plans(id)
            )
        """)


def save_plan(plan):
    # Ensure every task has an ID and a completion status.
    tasks = []

    for index, original_task in enumerate(plan["tasks"], start=1):
        task = dict(original_task)
        task.setdefault("task_id", index)
        task.setdefault("status", "pending")
        tasks.append(task)

    with get_connection() as connection:
        cursor = connection.execute("""
            INSERT INTO plans
                (goal, days_available, hours_per_day, tasks_json)
            VALUES (?, ?, ?, ?)
        """, (
            plan["goal"],
            plan["days_available"],
            plan["hours_per_day"],
            json.dumps(tasks)
        ))

        plan_id = cursor.lastrowid

    return plan_id


def get_plan(plan_id):
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM plans WHERE id = ?",
            (plan_id,)
        ).fetchone()

        if row is None:
            return None

        tasks = json.loads(row["tasks_json"])
        tasks_changed = False

        # Upgrade older saved tasks without losing their details.
        for index, task in enumerate(tasks, start=1):
            if "task_id" not in task:
                task["task_id"] = index
                tasks_changed = True

            if "status" not in task:
                task["status"] = "pending"
                tasks_changed = True

        if tasks_changed:
            connection.execute(
                "UPDATE plans SET tasks_json = ? WHERE id = ?",
                (json.dumps(tasks), plan_id)
            )

        return {
            "id": row["id"],
            "goal": row["goal"],
            "days_available": row["days_available"],
            "hours_per_day": row["hours_per_day"],
            "tasks": tasks,
            "status": row["status"],
            "created_at": row["created_at"]
        }


def update_plan_status(plan_id, new_status):
    with get_connection() as connection:
        cursor = connection.execute("""
            UPDATE plans
            SET status = ?
            WHERE id = ? AND status = 'pending'
        """, (new_status, plan_id))

        return cursor.rowcount


def update_task_status(plan_id, task_id, new_status):
    if new_status not in ("pending", "completed"):
        return "invalid_status"

    with get_connection() as connection:
        row = connection.execute(
            "SELECT status, tasks_json FROM plans WHERE id = ?",
            (plan_id,)
        ).fetchone()

        if row is None:
            return "plan_not_found"

        if row["status"] != "approved":
            return "plan_not_approved"

        tasks = json.loads(row["tasks_json"])

        # Add metadata to older saved tasks if necessary.
        for index, task in enumerate(tasks, start=1):
            task.setdefault("task_id", index)
            task.setdefault("status", "pending")

        matching_task = next(
            (
                task for task in tasks
                if task["task_id"] == task_id
            ),
            None
        )

        if matching_task is None:
            return "task_not_found"

        matching_task["status"] = new_status

        connection.execute(
            "UPDATE plans SET tasks_json = ? WHERE id = ?",
            (json.dumps(tasks), plan_id)
        )

    return "updated"


def get_all_plans():
    with get_connection() as connection:
        rows = connection.execute("""
            SELECT id
            FROM plans
            ORDER BY created_at DESC, id DESC
        """).fetchall()

    return [
        get_plan(row["id"])
        for row in rows
    ]


# ==========================================
# TASKPILOT: RESCHEDULE PROPOSAL MANAGEMENT
# ==========================================

def save_reschedule_proposal(plan_id, proposed_tasks, original_tasks):
    """Save a proposal without changing the active plan."""
    with get_connection() as connection:
        plan = connection.execute(
            "SELECT id, status FROM plans WHERE id = ?",
            (plan_id,)
        ).fetchone()

        if plan is None:
            return "plan_not_found"

        if plan["status"] != "approved":
            return "plan_not_approved"

        cursor = connection.execute("""
            INSERT INTO reschedule_proposals
                (plan_id, proposal_json, baseline_json, status)
            VALUES (?, ?, ?, 'pending')
        """, (
            plan_id,
            json.dumps(proposed_tasks),
            json.dumps(original_tasks)
        ))

        return cursor.lastrowid


def get_reschedule_proposal(plan_id, proposal_id):
    """Retrieve a proposal belonging to a specific plan."""
    with get_connection() as connection:
        row = connection.execute("""
            SELECT id, plan_id, proposal_json, status, created_at
            FROM reschedule_proposals
            WHERE id = ? AND plan_id = ?
        """, (proposal_id, plan_id)).fetchone()

        if row is None:
            return None

        return {
            "id": row["id"],
            "plan_id": row["plan_id"],
            "tasks": json.loads(row["proposal_json"]),
            "status": row["status"],
            "created_at": row["created_at"],
        }


def review_reschedule_proposal(plan_id, proposal_id, decision):
    """Accept or reject a proposal without losing task progress."""
    if decision not in ("accept", "reject"):
        return "invalid_decision"

    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")

        plan = connection.execute("""
            SELECT status, tasks_json
            FROM plans
            WHERE id = ?
        """, (plan_id,)).fetchone()

        if plan is None:
            return "plan_not_found"

        if plan["status"] != "approved":
            return "plan_not_approved"

        proposal = connection.execute("""
            SELECT proposal_json, baseline_json, status
            FROM reschedule_proposals
            WHERE id = ? AND plan_id = ?
        """, (proposal_id, plan_id)).fetchone()

        if proposal is None:
            return "proposal_not_found"

        if proposal["status"] != "pending":
            return "proposal_already_reviewed"

        current_tasks = json.loads(plan["tasks_json"])
        baseline_tasks = json.loads(proposal["baseline_json"])

        # Reject outdated proposals if the plan changed during review.
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

        # Only unfinished tasks may be rescheduled.
        pending_original = [
            task for task in current_tasks
            if task.get("status") != "completed"
        ]

        proposed_ids = [
            task.get("task_id") for task in proposed_tasks
        ]
        original_ids = [
            task.get("task_id") for task in pending_original
        ]

        if (
            None in proposed_ids
            or len(proposed_ids) != len(set(proposed_ids))
            or set(proposed_ids) != set(original_ids)
        ):
            return "invalid_proposal"

        proposed_by_id = {
            task["task_id"]: task
            for task in proposed_tasks
        }

        updated_tasks = []

        for task in current_tasks:
            if task.get("status") == "completed":
                # Keep completed tasks exactly as they are.
                updated_tasks.append(task)
                continue

            proposed = proposed_by_id[task["task_id"]]

            # The proposal may change scheduling, not task identity
            # or the amount of work originally estimated.
            if (
                proposed.get("title") != task.get("title")
                or proposed.get("duration_hours")
                != task.get("duration_hours")
                or type(proposed.get("day")) is not int
                or proposed["day"] < 1
                or proposed.get("priority")
                not in ("high", "medium", "low")
            ):
                return "invalid_proposal"

            updated_tasks.append({
                **task,
                "day": proposed["day"],
                "priority": proposed["priority"],
            })

        connection.execute("""
            UPDATE plans
            SET tasks_json = ?
            WHERE id = ?
        """, (json.dumps(updated_tasks), plan_id))

        connection.execute("""
            UPDATE reschedule_proposals
            SET status = 'accepted'
            WHERE id = ? AND status = 'pending'
        """, (proposal_id,))

        return "accepted"


initialize_db()
