
import math

import json
import os
from datetime import datetime, timedelta

from dotenv import load_dotenv
from groq import Groq
from pydantic import BaseModel, Field, ValidationError


VALID_PRIORITIES = {"high", "medium", "low"}


def validate_reschedule(
    original_tasks,
    proposed_tasks,
    remaining_days,
    hours_per_day,
    availability=None,
):
    """Validate a proposed schedule without modifying the original tasks."""

    if type(remaining_days) is not int or remaining_days < 1:
        raise ValueError("Remaining days must be a positive integer")

    if (
        isinstance(hours_per_day, bool)
        or not isinstance(hours_per_day, (int, float))
        or not math.isfinite(hours_per_day)
        or not 0 < hours_per_day <= 24
    ):
        raise ValueError("Invalid daily time limit")

    if not isinstance(original_tasks, list):
        raise ValueError("Original tasks must be a list")

    if not isinstance(proposed_tasks, list):
        raise ValueError("Proposed tasks must be a list")

    # Completed tasks are preserved exactly as they are.
    completed_tasks = [
        dict(task)
        for task in original_tasks
        if task.get("status") == "completed"
    ]

    pending_tasks = [
        task
        for task in original_tasks
        if task.get("status") != "completed"
    ]

    # A proposal may contain a prioritized subset of unfinished tasks. Tasks
    # omitted by the AI remain pending and are not compressed into impossible
    # time windows.
    original_ids = [task.get("task_id") for task in pending_tasks]
    proposed_ids = [task.get("task_id") for task in proposed_tasks]

    if None in original_ids or None in proposed_ids:
        raise ValueError("Every task must have a task_id")

    if len(set(original_ids)) != len(original_ids):
        raise ValueError("Original task IDs must be unique")

    if len(set(proposed_ids)) != len(proposed_ids):
        raise ValueError("Proposed task IDs must be unique")

    if not set(proposed_ids).issubset(set(original_ids)):
        raise ValueError(
            "Proposal contains a task that is not unfinished"
        )

    original_by_id = {
        task["task_id"]: task
        for task in pending_tasks
    }

    availability = availability or []
    availability_by_date = {
        str(entry.get("date")): entry
        for entry in availability
        if isinstance(entry, dict) and entry.get("date")
    }
    if availability and not availability_by_date:
        raise ValueError("At least one valid availability date is required")

    daily_totals = {}
    validated_pending = []
    window_cursors = {}

    for proposed in proposed_tasks:
        task_id = proposed["task_id"]
        original = original_by_id[task_id]

        day = proposed.get("day")
        duration = proposed.get("duration_hours")
        priority = proposed.get("priority")

        if type(day) is not int or not 1 <= day <= remaining_days:
            raise ValueError(
                f"Task {task_id} is outside the remaining deadline"
            )

        if (
            isinstance(duration, bool)
            or not isinstance(duration, (int, float))
            or not math.isfinite(duration)
            or not 0.25 <= duration <= 24
        ):
            raise ValueError(
                f"Task {task_id} has an invalid duration"
            )

        if priority not in VALID_PRIORITIES:
            raise ValueError(
                f"Task {task_id} has an invalid priority"
            )

        # Rescheduling may move a task or change its priority,
        # but it must not silently rewrite the task itself.
        if proposed.get("title") != original.get("title"):
            raise ValueError(
                f"Task {task_id} title cannot be changed"
            )

        if not math.isclose(
            duration,
            original.get("duration_hours", -1),
            rel_tol=0,
            abs_tol=1e-9,
        ):
            raise ValueError(
                f"Task {task_id} duration cannot be changed"
            )

        if availability_by_date:
            scheduled_date = proposed.get("scheduled_date")
            if scheduled_date not in availability_by_date:
                if 1 <= day <= len(availability):
                    scheduled_date = str(availability[day - 1]["date"])
                else:
                    raise ValueError(f"Task {task_id} has no valid available date")
            proposed["scheduled_date"] = scheduled_date
            window = availability_by_date[scheduled_date]
            if window.get("start_time"):
                try:
                    cursor = window_cursors.get(scheduled_date) or datetime.strptime(window["start_time"], "%H:%M")
                    end = cursor + timedelta(hours=duration)
                    if not proposed.get("scheduled_time"):
                        proposed["scheduled_time"] = cursor.strftime("%H:%M")
                    if not proposed.get("scheduled_end_time"):
                        proposed["scheduled_end_time"] = end.strftime("%H:%M")
                    window_cursors[scheduled_date] = end
                except (TypeError, ValueError):
                    raise ValueError(f"Invalid time window for {scheduled_date}")
            daily_totals[scheduled_date] = daily_totals.get(scheduled_date, 0) + duration
        else:
            daily_totals[day] = daily_totals.get(day, 0) + duration

        validated_pending.append({
            **original,
            "day": day,
            "priority": priority,
            **({key: proposed.get(key) for key in ("scheduled_date", "scheduled_time", "scheduled_end_time") if proposed.get(key)} if availability_by_date else {}),
        })

    if not proposed_tasks:
        raise ValueError("The revised window cannot fit every unfinished task")

    if any(
        total > (
            float(availability_by_date.get(bucket, {}).get("hours", hours_per_day))
            if availability_by_date else hours_per_day
        ) + 1e-9
        for bucket, total in daily_totals.items()
    ):
        raise ValueError(
            "Proposed schedule exceeds the daily time limit"
        )

    # Return a new list; never mutate the stored original tasks.
    return completed_tasks + validated_pending


load_dotenv()

RESCHEDULE_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")


class ProposedTask(BaseModel):
    task_id: int = Field(ge=1)
    title: str = Field(min_length=3, max_length=150)
    day: int = Field(ge=1, le=365)
    duration_hours: float = Field(ge=0.25, le=24)
    priority: str
    scheduled_date: str | None = None
    scheduled_time: str | None = None
    scheduled_end_time: str | None = None


class ReschedulePlan(BaseModel):
    tasks: list[ProposedTask] = Field(min_length=1, max_length=30)


def generate_reschedule(
    goal,
    original_tasks,
    remaining_days,
    hours_per_day,
    availability=None,
    allow_fallback=True,
):
    """Generate and validate a proposed schedule without saving it."""

    if not isinstance(goal, str) or not goal.strip():
        raise ValueError("Goal cannot be empty")

    if type(remaining_days) is not int or not 1 <= remaining_days <= 365:
        raise ValueError("Remaining days must be between 1 and 365")

    if not isinstance(original_tasks, list):
        raise ValueError("Original tasks must be a list")

    completed_tasks = [
        task for task in original_tasks
        if task.get("status") == "completed"
    ]

    pending_tasks = [
        task for task in original_tasks
        if task.get("status") != "completed"
    ]

    if not pending_tasks:
        raise ValueError("There are no unfinished tasks to reschedule")

    if len(pending_tasks) > 30:
        raise ValueError("Too many unfinished tasks to reschedule")

    # Optional emergency mode; normal rescheduling remains AI-driven.
    # Enable TASKPILOT_DETERMINISTIC_RESCHEDULE=true only for an explicit fallback.
    if availability and (
        os.getenv("TASKPILOT_DETERMINISTIC_RESCHEDULE", "false").lower() == "true"
        or not allow_fallback
    ):
        if not isinstance(availability, list) or not availability:
            raise ValueError("At least one new availability window is required")
        proposed_tasks = []
        for index, task in enumerate(pending_tasks):
            placed = False
            for slot_index, slot in enumerate(availability):
                try:
                    start = datetime.strptime(slot["start_time"], "%H:%M")
                    end_limit = datetime.strptime(slot["end_time"], "%H:%M")
                    cursor = slot.setdefault("_cursor", start.strftime("%H:%M"))
                    cursor_dt = datetime.strptime(cursor, "%H:%M")
                    task_end = cursor_dt + timedelta(hours=float(task["duration_hours"]))
                except (KeyError, TypeError, ValueError):
                    raise ValueError("Each availability entry needs a valid date, start_time, and end_time")
                if task_end <= end_limit:
                    proposed_tasks.append({
                        "task_id": task["task_id"],
                        "title": task["title"],
                        "day": slot_index + 1,
                        "duration_hours": task["duration_hours"],
                        "priority": task.get("priority", "medium"),
                        "scheduled_date": slot["date"],
                        "scheduled_time": cursor_dt.strftime("%H:%M"),
                        "scheduled_end_time": task_end.strftime("%H:%M"),
                    })
                    slot["_cursor"] = task_end.strftime("%H:%M")
                    placed = True
                    break
            if not placed:
                # Leave this lower-priority/longer task pending for a later
                # window rather than compressing it into an impossible slot.
                continue

        if not proposed_tasks:
            raise ValueError(
                "The new availability cannot fit every unfinished task; no complete task fits. Add more time."
            )

        validated_tasks = validate_reschedule(
            original_tasks=original_tasks,
            proposed_tasks=proposed_tasks,
            remaining_days=len(availability),
            hours_per_day=hours_per_day,
            availability=availability,
        )
        return {
            "goal": goal.strip(),
            "remaining_days": len(availability),
            "hours_per_day": hours_per_day,
            "tasks": validated_tasks,
        }

    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        raise RuntimeError("GROQ_API_KEY is missing from .env")

    client = Groq(api_key=api_key)

    if availability:
        remaining_days = len(availability)

    task_context = [
        {
            "task_id": task["task_id"],
            "title": task["title"],
            "duration_hours": task["duration_hours"],
            "priority": task["priority"],
        }
        for task in pending_tasks
    ]

    prompt = f"""
You are the scheduling engine for TaskPilot. Return only one valid JSON object with this exact top-level shape: {{"tasks":[...]}}. Do not use Markdown.

User goal: {goal}

Create a proposed recovery schedule for the unfinished tasks below.

Remaining days: {remaining_days}
Maximum available hours per day: {hours_per_day}
New exact availability windows: {json.dumps(availability or [], ensure_ascii=False)}

Unfinished tasks:
{json.dumps(task_context)}

Rules:
- Include each task only when its full duration realistically fits. You may omit lower-priority tasks; omitted tasks remain pending for a later window.
- Preserve every task_id and title exactly.
- Preserve each task's duration_hours exactly.
- You may change the day and priority.
- Use day numbers from 1 to {remaining_days}.
- When availability is supplied, assign every task to one of those exact dates and keep total duration within that date's hours.
- Preserve scheduled_date, scheduled_time, and scheduled_end_time in the JSON when possible.
- Use only high, medium, or low priorities.
- Total scheduled hours on any date must not exceed that date's supplied hours.
- Prioritize high-importance work while keeping the workload realistic.
- Do not invent, delete, rename, or split tasks.
- Return only data matching the requested JSON schema.
"""

    try:
        response = client.chat.completions.create(
            model=RESCHEDULE_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "Return only valid JSON matching the requested reschedule schema. Do not use Markdown fences.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=4096,
            response_format={"type": "json_object"},
        )

        response_text = response.choices[0].message.content if response.choices else None
        if not response_text:
            raise RuntimeError("AI returned an empty reschedule proposal")

        cleaned_response = response_text.strip()
        if cleaned_response.startswith("```"):
            cleaned_response = cleaned_response.split("\n", 1)[-1]
            if cleaned_response.rstrip().endswith("```"):
                cleaned_response = cleaned_response.rstrip()[:-3].rstrip()
        generated = ReschedulePlan.model_validate_json(cleaned_response)

    except (ValidationError, TypeError, ValueError) as error:
        print(
            f"GROQ RESCHEDULE JSON ERROR [{type(error).__name__}]: {error}",
            flush=True,
        )
        if 'response_text' in locals():
            print(f"GROQ RESCHEDULE RESPONSE PREVIEW: {response_text[:4000]}", flush=True)
        if availability and allow_fallback:
            return generate_reschedule(
                goal, original_tasks, remaining_days, hours_per_day,
                availability=availability, allow_fallback=False,
            )
        raise RuntimeError("AI returned an invalid reschedule proposal") from error

    except RuntimeError:
        raise

    except Exception as error:
        print(
            f"GROQ RESCHEDULE ERROR [{type(error).__name__}]: {error}",
            flush=True,
        )
        if availability and allow_fallback:
            return generate_reschedule(
                goal, original_tasks, remaining_days, hours_per_day,
                availability=availability, allow_fallback=False,
            )
        raise RuntimeError(
            f"AI rescheduling failed ({type(error).__name__}): {error}"
        ) from error

    proposed_tasks = [
        task.model_dump()
        for task in generated.tasks
    ]

    # Enforce the rules in Python; never trust the AI output alone.
    validated_tasks = validate_reschedule(
        original_tasks=original_tasks,
        proposed_tasks=proposed_tasks,
        remaining_days=remaining_days,
        hours_per_day=hours_per_day,
        availability=availability,
    )

    return {
        "goal": goal.strip(),
        "remaining_days": remaining_days,
        "hours_per_day": hours_per_day,
        "tasks": validated_tasks,
    }

import pytest
import rescheduler


def test_missing_api_key_is_handled(monkeypatch):
    """Missing Groq key should produce a controlled error."""
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    with pytest.raises(
        RuntimeError,
        match="GROQ_API_KEY is missing",
    ):
        rescheduler.generate_reschedule(
            goal="Prepare for Python exam",
            original_tasks=[
                {
                    "task_id": 1,
                    "title": "Revise loops",
                    "duration_hours": 1.0,
                    "priority": "high",
                    "day": 1,
                    "status": "pending",
                }
            ],
            remaining_days=3,
            hours_per_day=2,
        )


def test_gemini_api_failure_is_handled(monkeypatch):
    """An API exception should become a controlled RuntimeError."""

    monkeypatch.setenv("GROQ_API_KEY", "test-key")

    class FakeClient:
        def __init__(self, *args, **kwargs):
            raise ConnectionError("Simulated network failure")

    monkeypatch.setattr(rescheduler, "Groq", FakeClient)

    with pytest.raises(
        RuntimeError,
        match="AI rescheduling is temporarily unavailable",
    ):
        rescheduler.generate_reschedule(
            goal="Prepare for Python exam",
            original_tasks=[
                {
                    "task_id": 1,
                    "title": "Revise loops",
                    "duration_hours": 1.0,
                    "priority": "high",
                    "day": 1,
                    "status": "pending",
                }
            ],
            remaining_days=3,
            hours_per_day=2,
        )


def test_empty_ai_response_is_handled(monkeypatch):
    """An empty response should not create a schedule."""

    monkeypatch.setenv("GROQ_API_KEY", "test-key")

    class FakeCompletions:
        def create(self, **kwargs):
            message = type("Message", (), {"content": ""})()
            choice = type("Choice", (), {"message": message})()
            return type("FakeResponse", (), {"choices": [choice]})()

    class FakeClient:
        def __init__(self, **kwargs):
            self.chat = type("Chat", (), {"completions": FakeCompletions()})()

    monkeypatch.setattr(rescheduler, "Groq", FakeClient)

    with pytest.raises(
        RuntimeError,
        match="AI returned an empty reschedule proposal",
    ):
        rescheduler.generate_reschedule(
            goal="Prepare for Python exam",
            original_tasks=[
                {
                    "task_id": 1,
                    "title": "Revise loops",
                    "duration_hours": 1.0,
                    "priority": "high",
                    "day": 1,
                    "status": "pending",
                }
            ],
            remaining_days=3,
            hours_per_day=2,
        )
