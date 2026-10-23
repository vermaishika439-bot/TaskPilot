
import os
import math
import re
from datetime import date, datetime, timedelta
from typing import Literal

from dotenv import load_dotenv
from groq import Groq
from pydantic import (
    BaseModel,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)

load_dotenv()

MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
MAX_GOAL_LENGTH = 500


class Task(BaseModel):
    title: str = Field(min_length=3, max_length=150)
    description: str = Field(default="", max_length=1000)
    day: int = Field(ge=1, le=365)
    scheduled_date: str | None = None
    scheduled_time: str | None = None
    scheduled_end_time: str | None = None
    duration_hours: float = Field(ge=0.25, le=24)
    priority: Literal["high", "medium", "low"]
    prerequisite_task_ids: list[int] = Field(default_factory=list)

    @field_validator("prerequisite_task_ids", mode="before")
    @classmethod
    def normalize_prerequisite_task_ids(cls, value):
        """Accept integer IDs and AI labels such as T2 or '2'."""
        if value is None:
            return []

        if not isinstance(value, list):
            raise ValueError("prerequisite_task_ids must be a list")

        normalized = []

        for item in value:
            if isinstance(item, bool):
                raise ValueError("Prerequisite task IDs must be integers")

            if isinstance(item, str):
                item = item.strip()

                # Convert labels like T2 and t10 to integer IDs.
                match = re.fullmatch(r"T?(\d+)", item, flags=re.IGNORECASE)
                if not match:
                    raise ValueError(
                        "Prerequisite IDs must be integers or labels "
                        "such as T2"
                    )

                item = int(match.group(1))

            if not isinstance(item, int):
                raise ValueError("Prerequisite task IDs must be integers")

            normalized.append(item)

        # Remove duplicate dependencies while preserving their order.
        return list(dict.fromkeys(normalized))


class Plan(BaseModel):
    tasks: list[Task] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def validate_prerequisites(self):
        """Ensure dependencies refer to valid tasks and contain no cycles."""
        task_ids = set(range(1, len(self.tasks) + 1))

        for index, task in enumerate(self.tasks, start=1):
            for prerequisite_id in task.prerequisite_task_ids:
                if prerequisite_id not in task_ids:
                    raise ValueError(
                        f"Task {index} references nonexistent prerequisite "
                        f"task ID {prerequisite_id}"
                    )

                if prerequisite_id == index:
                    raise ValueError(
                        f"Task {index} cannot depend on itself"
                    )

        # Detect dependency cycles.
        dependencies = {
            index: task.prerequisite_task_ids
            for index, task in enumerate(self.tasks, start=1)
        }
        visited = set()
        visiting = set()

        def visit(task_id):
            if task_id in visiting:
                raise ValueError("Task prerequisites contain a dependency cycle")

            if task_id in visited:
                return

            visiting.add(task_id)

            for prerequisite_id in dependencies[task_id]:
                visit(prerequisite_id)

            visiting.remove(task_id)
            visited.add(task_id)

        for task_id in dependencies:
            visit(task_id)

        return self


def create_plan(goal, days, hours_per_day, availability=None, start_date=None):
    # Validate the goal.
    if not isinstance(goal, str) or not goal.strip():
        raise ValueError("Goal cannot be empty")

    goal = goal.strip()

    if len(goal) > MAX_GOAL_LENGTH:
        raise ValueError(
            f"Goal must be {MAX_GOAL_LENGTH} characters or fewer"
        )

    # Validate the deadline.
    if type(days) is not int or not 1 <= days <= 365:
        raise ValueError("Days must be an integer between 1 and 365")

    # Validate available daily time.
    if (
        isinstance(hours_per_day, bool)
        or not isinstance(hours_per_day, (int, float))
        or not math.isfinite(hours_per_day)
        or not 0 < hours_per_day <= 24
    ):
        raise ValueError(
            "Hours per day must be a number greater than 0 and at most 24"
        )

    # Check API configuration.
    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        raise RuntimeError("GROQ_API_KEY is missing from .env")

    client = Groq(api_key=api_key)

    prompt = f"""
You are TaskPilot's planning partner. Create a realistic,
learning-aware schedule for this goal, not an evenly divided checklist:

{goal}

Planning window: {days} days starting
{start_date or date.today().isoformat()}.

Default maximum working time: {hours_per_day} hours per day.

Date-specific availability and constraints (preserve these exact dates
and hours; do not average them):
{availability or "No date-specific availability was provided."}

Requirements:
- Estimate workload from complexity, prerequisites, practice and revision.
- Create clear, actionable tasks with useful descriptions.
- Do not schedule unavailable dates when constraints are supplied.
- Every task must have a day, title, description, duration_hours, priority,
  and prerequisite_task_ids.
- Priorities must be high, medium, or low.
- Each task must take between 0.25 and 24 hours.
- Total task duration on any day must not exceed
  {hours_per_day} hours.
- Use day numbers from 1 to {days}.
- When date-specific availability is supplied, set scheduled_date to one of
  those exact dates and keep each date within its supplied hours.
- Do not include tasks outside the deadline.
- prerequisite_task_ids must contain integer task IDs starting at 1,
  corresponding to the tasks' positions in the returned tasks array.
- You may use labels such as T1 or T2 in your reasoning, but the final
  prerequisite_task_ids values must be integers.
- A task must not depend on itself, a nonexistent task, or a dependency cycle.
- Return only data matching the requested JSON schema.
"""

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Return only valid JSON matching the requested plan "
                        "schema. Do not use Markdown fences."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=4096,
            response_format={"type": "json_object"},
        )

        response_text = (
            response.choices[0].message.content
            if response.choices
            else None
        )

        if not response_text:
            raise RuntimeError("AI returned an empty response")

        generated = Plan.model_validate_json(response_text)

    except (ValidationError, TypeError, ValueError) as error:
        raise RuntimeError(
            "AI returned an invalid task plan"
        ) from error

    except RuntimeError:
        raise

    except Exception as error:
        raise RuntimeError(
            "AI service is temporarily unavailable. Please try again."
        ) from error

    tasks = [
        {
            "task_id": index,
            **task.model_dump(),
            "status": "pending",
        }
        for index, task in enumerate(generated.tasks, start=1)
    ]

    # Validate the generated schedule.
    daily_totals = {}

    date_limits = {
        str(entry.get("date")): float(entry.get("hours", 0))
        for entry in (availability or [])
        if isinstance(entry, dict) and entry.get("date")
    }

    availability_dates = list(date_limits)

    availability_windows = {
        str(entry.get("date")): entry
        for entry in (availability or [])
        if isinstance(entry, dict) and entry.get("date")
    }

    window_cursors = {}

    for task in tasks:
        if task["day"] > days:
            raise RuntimeError("AI returned a task outside the deadline")

        if (
            not math.isfinite(task["duration_hours"])
            or not 0.25 <= task["duration_hours"] <= 24
        ):
            raise RuntimeError("AI returned an invalid task duration")

        day = task["day"]

        if availability_dates:
            if task.get("scheduled_date") not in date_limits:
                if 1 <= day <= len(availability_dates):
                    task["scheduled_date"] = availability_dates[day - 1]
                else:
                    raise RuntimeError(
                        "AI scheduled a task outside the supplied "
                        "availability dates"
                    )

            bucket = task["scheduled_date"]
            window = availability_windows.get(bucket, {})

            if window.get("start_time") and not task.get("scheduled_time"):
                try:
                    cursor = (
                        window_cursors.get(bucket)
                        or datetime.strptime(
                            window["start_time"], "%H:%M"
                        )
                    )

                    task["scheduled_time"] = cursor.strftime("%H:%M")

                    end = cursor + timedelta(
                        hours=task["duration_hours"]
                    )

                    task["scheduled_end_time"] = end.strftime("%H:%M")
                    window_cursors[bucket] = end

                except (TypeError, ValueError):
                    raise RuntimeError(
                        "AI returned an invalid availability time window"
                    )

            daily_totals[bucket] = (
                daily_totals.get(bucket, 0)
                + task["duration_hours"]
            )

        else:
            daily_totals[day] = (
                daily_totals.get(day, 0)
                + task["duration_hours"]
            )

    if any(
        total
        > (
            date_limits.get(bucket, hours_per_day)
            if date_limits
            else hours_per_day
        ) + 1e-9
        for bucket, total in daily_totals.items()
    ):
        raise RuntimeError("AI generated an overloaded daily schedule")

    effective_start_date = (
        start_date
        or (
            availability[0].get("date")
            if availability and isinstance(availability[0], dict)
            else None
        )
        or date.today().isoformat()
    )

    return {
        "goal": goal,
        "days_available": days,
        "hours_per_day": hours_per_day,
        "start_date": effective_start_date,
        "availability": availability or {},
        "tasks": tasks,
    }
