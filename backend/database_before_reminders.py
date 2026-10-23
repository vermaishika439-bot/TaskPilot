

import sqlite3
import json
import math
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

        # Migrate older plans tables safely.
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

        # Store proposals separately from the active schedule.
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

        # Migrate existing proposals without deleting their history.
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


def save_plan(plan):
    """Save a plan and ensure every task has an ID and status."""
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
    """Retrieve a plan and migrate missing task metadata in memory."""
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM plans WHERE id = ?",
            (plan_id,)
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
    """Update a plan that is still awaiting its initial decision."""
    with get_connection() as connection:
        cursor = connection.execute("""
            UPDATE plans
            SET status = ?
            WHERE id = ? AND status = 'pending'
        """, (new_status, plan_id))

        return cursor.rowcount


def update_task_status(plan_id, task_id, new_status):
    """Update task progress without allowing unapproved plan changes."""
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
    """Return all saved plans, newest first."""
    with get_connection() as connection:
        rows = connection.execute("""
            SELECT id
            FROM plans
            ORDER BY created_at DESC, id DESC
        """).fetchall()

    return [get_plan(row["id"]) for row in rows]


# ==========================================
# TASKPILOT: RESCHEDULE PROPOSAL MANAGEMENT
# ==========================================

def save_reschedule_proposal(
    plan_id,
    proposed_tasks,
    original_tasks,
    remaining_days=None
):
    """Save a proposal without modifying the active plan."""
    with get_connection() as connection:
        plan = connection.execute("""
            SELECT id, status, days_available
            FROM plans
            WHERE id = ?
        """, (plan_id,)).fetchone()

        if plan is None:
            return "plan_not_found"

        if plan["status"] != "approved":
            return "plan_not_approved"

        # Keep older callers compatible. New callers should provide
        # the actual remaining_days from the reschedule request.
        if remaining_days is None:
            remaining_days = plan["days_available"]

        if (
            type(remaining_days) is not int
            or remaining_days < 1
        ):
            return "invalid_remaining_days"

        cursor = connection.execute("""
            INSERT INTO reschedule_proposals
                (
                    plan_id,
                    proposal_json,
                    baseline_json,
                    remaining_days,
                    status
                )
            VALUES (?, ?, ?, ?, 'pending')
        """, (
            plan_id,
            json.dumps(proposed_tasks),
            json.dumps(original_tasks),
            remaining_days
        ))

        return cursor.lastrowid


def get_reschedule_proposal(plan_id, proposal_id):
    """Retrieve a proposal belonging to a specific plan."""
    with get_connection() as connection:
        row = connection.execute("""
            SELECT
                id,
                plan_id,
                proposal_json,
                remaining_days,
                status,
                created_at
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
            "status": row["status"],
            "created_at": row["created_at"]
        }


def review_reschedule_proposal(plan_id, proposal_id, decision):
    """Accept or reject a proposal while preserving task progress."""
    if decision not in ("accept", "reject"):
        return "invalid_decision"

    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")

        plan = connection.execute("""
            SELECT status, tasks_json, days_available, hours_per_day
            FROM plans
            WHERE id = ?
        """, (plan_id,)).fetchone()

        if plan is None:
            return "plan_not_found"

        if plan["status"] != "approved":
            return "plan_not_approved"

        proposal = connection.execute("""
            SELECT
                proposal_json,
                baseline_json,
                remaining_days,
                status
            FROM reschedule_proposals
            WHERE id = ? AND plan_id = ?
        """, (proposal_id, plan_id)).fetchone()

        if proposal is None:
            return "proposal_not_found"

        if proposal["status"] != "pending":
            return "proposal_already_reviewed"

        current_tasks = json.loads(plan["tasks_json"])
        baseline_tasks = json.loads(proposal["baseline_json"])

        # Do not apply proposals based on an older version of the plan.
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
            task.get("task_id") for task in proposed_tasks
            if isinstance(task, dict)
        ]

        original_ids = [
            task.get("task_id") for task in pending_original
        ]

        # Every unfinished task must appear exactly once.
        if (
            len(proposed_ids) != len(proposed_tasks)
            or any(type(task_id) is not int for task_id in proposed_ids)
            or len(proposed_ids) != len(set(proposed_ids))
            or set(proposed_ids) != set(original_ids)
        ):
            return "invalid_proposal"

        proposed_by_id = {
            task["task_id"]: task
            for task in proposed_tasks
        }

        # Old proposals created before the migration use the original
        # plan deadline. New proposals store their requested deadline.
        remaining_days = (
            proposal["remaining_days"]
            if proposal["remaining_days"] is not None
            else plan["days_available"]
        )

        daily_limit = plan["hours_per_day"]

        if (
            type(remaining_days) is not int
            or remaining_days < 1
            or not isinstance(daily_limit, (int, float))
            or not math.isfinite(daily_limit)
            or daily_limit <= 0
        ):
            return "invalid_proposal"

        daily_totals = {}
        updated_tasks = []

        for task in current_tasks:
            # Completed tasks are preserved exactly as stored.
            if task.get("status") == "completed":
                updated_tasks.append(task)
                continue

            proposed = proposed_by_id[task["task_id"]]

            day = proposed.get("day")
            duration = proposed.get("duration_hours")
            priority = proposed.get("priority")

            # Task identity and estimated effort cannot be changed.
            if (
                proposed.get("title") != task.get("title")
                or duration != task.get("duration_hours")
                or type(day) is not int
                or day < 1
                or day > remaining_days
                or priority not in ("high", "medium", "low")
                or isinstance(duration, bool)
                or not isinstance(duration, (int, float))
                or not math.isfinite(duration)
                or duration <= 0
            ):
                return "invalid_proposal"

            daily_totals[day] = (
                daily_totals.get(day, 0) + duration
            )

            updated_tasks.append({
                **task,
                "day": day,
                "priority": priority
            })

        # Enforce the daily workload limit independently of the AI.
        if any(
            total > daily_limit + 1e-9
            for total in daily_totals.values()
        ):
            return "invalid_proposal"

        # Apply the schedule and mark the proposal accepted together.
        connection.execute("""
            UPDATE plans
            SET tasks_json = ?
            WHERE id = ?
        """, (json.dumps(updated_tasks), plan_id))

        cursor = connection.execute("""
            UPDATE reschedule_proposals
            SET status = 'accepted'
            WHERE id = ? AND status = 'pending'
        """, (proposal_id,))

        if cursor.rowcount != 1:
            raise RuntimeError("Proposal status changed unexpectedly")

        return "accepted"


initialize_db()
