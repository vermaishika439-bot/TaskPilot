
import json
import os
import re
from datetime import date
from typing import Literal

from dotenv import load_dotenv
from groq import Groq
from pydantic import BaseModel, Field, ValidationError


load_dotenv()

MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

ALLOWED_ACTIONS = {
    "create_plan",
    "reschedule_plan",
    "create_reminder",
    "update_reminder",
    "delete_reminder",
    "update_task_status",
    "review_plan",
}


# Fixed fields avoid unsupported arbitrary dictionary schemas in
# Gemini Developer API structured output.
class AvailabilityEntry(BaseModel):
    date: str = Field(min_length=10, max_length=10)
    hours: float = Field(ge=0, le=24)
    start_time: str | None = None
    end_time: str | None = None
    note: str | None = None


class ActionPayload(BaseModel):
    goal: str | None = None
    days_available: int | None = None
    hours_per_day: float | None = None
    start_date: str | None = None
    availability: list[AvailabilityEntry] | None = None

    plan_id: int | None = None
    remaining_days: int | None = None

    title: str | None = None
    reminder_type: Literal["birthday", "event", "deadline"] | None = None
    date: str | None = None
    time: str | None = None
    notes: str | None = None
    reminder_id: int | None = None

    task_id: int | None = None
    status: Literal[
        "pending", "completed", "approved", "rejected"
    ] | None = None


class ProposedAction(BaseModel):
    action_type: Literal[
        "create_plan",
        "reschedule_plan",
        "create_reminder",
        "update_reminder",
        "delete_reminder",
        "update_task_status",
        "review_plan",
    ]
    payload: ActionPayload
    explanation: str = Field(min_length=1, max_length=500)


class AssistantResponse(BaseModel):
    reply: str = Field(min_length=1, max_length=4000)
    action: ProposedAction | None = None


def _clean_model_response(response_text):
    """Return a usable assistant response without trusting model actions."""
    cleaned = response_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.rstrip().endswith("```"):
            cleaned = cleaned.rstrip()[:-3].rstrip()

    candidate = cleaned
    if not candidate.startswith("{"):
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start >= 0 and end > start:
            candidate = candidate[start:end + 1]

    try:
        parsed = json.loads(candidate)
    except (TypeError, ValueError, json.JSONDecodeError):
        # Some Groq responses are ordinary text despite response_format. Keep
        # the useful reply rather than turning a conversational answer into a
        # 502. No action can be executed from this fallback.
        if cleaned and not cleaned.startswith("{"):
            return {"reply": cleaned, "action": None}
        raise

    if not isinstance(parsed, dict):
        raise ValueError("Assistant response must be a JSON object")

    # Accept harmless naming variations occasionally returned by compatible
    # OpenAI/Groq models. Do not infer an action when the model omitted it.
    reply = parsed.get("reply")
    if reply is None:
        for key in ("response", "content", "message", "text"):
            if isinstance(parsed.get(key), str):
                reply = parsed[key]
                break
    if not isinstance(reply, str) or not reply.strip():
        raise ValueError("Assistant response has no reply text")

    action = parsed.get("action")
    if isinstance(action, dict):
        action = dict(action)
        if "action_type" not in action and isinstance(action.get("type"), str):
            action["action_type"] = action["type"]
        if "payload" not in action and isinstance(action.get("parameters"), dict):
            action["payload"] = action["parameters"]
        if isinstance(action.get("payload"), dict):
            payload = dict(action["payload"])
            aliases = {
                "reminder_date": "date",
                "reminder_time": "time",
                "type": "reminder_type",
                "reminder_title": "title",
            }
            for old_key, new_key in aliases.items():
                if new_key not in payload and old_key in payload:
                    payload[new_key] = payload[old_key]
            action["payload"] = payload
        parsed["action"] = action
    elif action is not None:
        parsed["action"] = None

    return {"reply": reply.strip(), "action": parsed.get("action")}


def _get_client():
    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is missing from the backend .env file."
        )

    return Groq(api_key=api_key)


def _validate_action(action):
    if action is None:
        return

    if action.action_type not in ALLOWED_ACTIONS:
        raise RuntimeError("AI proposed an unsupported action.")

    payload = action.payload.model_dump(exclude_none=True)

    required_fields = {
        "create_plan": {"goal"},
        "reschedule_plan": {
            "plan_id", "remaining_days",
        },
        "create_reminder": {
            "title", "reminder_type", "date",
        },
        "update_reminder": {
            "reminder_id", "status",
        },
        "delete_reminder": {
            "reminder_id",
        },
        "update_task_status": {
            "plan_id", "task_id", "status",
        },
        "review_plan": {
            "plan_id", "status",
        },
    }

    missing = required_fields[action.action_type] - set(payload)

    if missing:
        raise RuntimeError(
            "AI returned an incomplete action proposal."
        )

    if action.action_type == "create_plan":
        has_daily_defaults = "days_available" in payload and "hours_per_day" in payload
        if not has_daily_defaults and not payload.get("availability"):
            raise RuntimeError("AI returned a plan without dates or availability.")

    # Validate status values for the specific action.
    if action.action_type in {
        "update_reminder", "update_task_status"
    }:
        if payload["status"] not in {"pending", "completed"}:
            raise RuntimeError("AI returned an invalid status.")

    if action.action_type == "review_plan":
        if payload["status"] not in {"approved", "rejected"}:
            raise RuntimeError("AI returned an invalid review status.")

    # Prevent invalid numeric IDs, durations, and deadlines.
    for field in ("plan_id", "task_id", "reminder_id"):
        if field in payload:
            value = payload[field]
            if isinstance(value, bool) or not isinstance(value, int) or value < 1:
                raise RuntimeError("AI returned an invalid record ID.")

    for field in ("days_available", "remaining_days"):
        if field in payload:
            value = payload[field]
            if isinstance(value, bool) or not isinstance(value, int) or value < 1:
                raise RuntimeError("AI returned an invalid number of days.")

    if "hours_per_day" in payload:
        hours = payload["hours_per_day"]
        if isinstance(hours, bool) or not isinstance(hours, (int, float)):
            raise RuntimeError("AI returned invalid working hours.")
        if not 0 < hours <= 24:
            raise RuntimeError("AI returned invalid working hours.")

    if "goal" in payload and not payload["goal"].strip():
        raise RuntimeError("AI returned an empty plan goal.")

    if "title" in payload and not payload["title"].strip():
        raise RuntimeError("AI returned an empty reminder title.")


def _fallback_reminder_action(message, current_date):
    """Recover an omitted create-reminder action from an explicit user request."""
    lower = message.lower()
    if "reminder" not in lower or not re.search(r"\b(create|set|add|make)\b", lower):
        return None

    iso_match = re.search(r"\b(20\d{2})-(\d{1,2})-(\d{1,2})\b", message)
    date_match = re.search(
        r"\b(\d{1,2})(?:st|nd|rd|th)?\s+"
        r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
        r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|"
        r"nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b",
        lower,
    )

    if iso_match:
        reminder_date = f"{int(iso_match.group(1)):04d}-{int(iso_match.group(2)):02d}-{int(iso_match.group(3)):02d}"
    elif date_match:
        months = {
            "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
            "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
        }
        month = months[date_match.group(2)[:3]]
        year = int(date_match.group(3) or current_date[:4])
        reminder_date = f"{year:04d}-{month:02d}-{int(date_match.group(1)):02d}"
    else:
        return None

    time_match = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", lower)
    if time_match:
        hour = int(time_match.group(1)) % 12
        if time_match.group(3) == "pm":
            hour += 12
        reminder_time = f"{hour:02d}:{int(time_match.group(2) or 0):02d}"
    elif re.search(r"\b(midnight|12\s*am)\b", lower):
        reminder_time = "00:00"
    else:
        reminder_time = None

    title_match = re.search(
        r"\b(?:for|about|have)\s+(?:a\s+|an\s+|the\s+)?(.+?)"
        r"(?:\s+on\s+|\s+at\s+|\s+by\s+|$)",
        lower,
    )
    title = title_match.group(1).strip(" .") if title_match else "Task reminder"
    if not title or title in {"a reminder", "the reminder"}:
        title = "Task reminder"

    return {
        "action_type": "create_reminder",
        "payload": {
            "title": title[:200].capitalize(),
            "reminder_type": "deadline" if "deadline" in lower else "event",
            "date": reminder_date,
            "time": reminder_time,
        },
        "explanation": "Create this reminder?",
    }


def generate_assistant_response(
    message,
    history=None,
    plans=None,
    reminders=None,
    current_date=None,
    timezone_name="local",
):
    """
    Generate a conversational reply and an optional proposed action.
    This function never writes to the database or executes actions.
    """

    if not isinstance(message, str) or not message.strip():
        raise ValueError("Message cannot be empty.")

    if len(message) > 10000:
        raise ValueError("Message cannot exceed 10,000 characters.")

    history = history or []
    plans = plans or []
    reminders = reminders or []

    recent_history = [
        {
            "role": item["role"],
            "content": item["content"][:900],
        }
        for item in history[-10:]
        if (
            isinstance(item, dict)
            and item.get("role") in ("user", "assistant")
            and isinstance(item.get("content"), str)
        )
    ]

    compact_plans = []
    for plan in plans[:3]:
        compact_plans.append({
            "id": plan.get("id"),
            "goal": str(plan.get("goal", ""))[:100],
            "status": plan.get("status"),
            "days_available": plan.get("days_available"),
            "hours_per_day": plan.get("hours_per_day"),
            "tasks": [
                {
                    "task_id": task.get("task_id"),
                    "title": str(task.get("title", ""))[:80],
                    "day": task.get("day"),
                    "scheduled_date": task.get("scheduled_date"),
                    "status": task.get("status"),
                    "duration_hours": task.get("duration_hours"),
                }
                for task in (plan.get("tasks") or [])[:3]
            ],
        })

    compact_reminders = [
        {
            "id": reminder.get("id"),
            "title": str(reminder.get("title", ""))[:180],
            "date": reminder.get("reminder_date") or reminder.get("date"),
            "time": reminder.get("reminder_time") or reminder.get("time"),
            "status": reminder.get("status"),
        }
        for reminder in reminders[:5]
    ]

    context = {
        "current_date": current_date,
        "timezone": timezone_name,
        "plans": compact_plans,
        "reminders": compact_reminders,
        "recent_messages": recent_history,
    }

    prompt = f"""You are TaskPilot, a conversational study and task planner.
Return only valid JSON. Ordinary conversation: {{"reply":"short text","action":null}}. Proposed action: {{"reply":"short text","action":{{"action_type":"one supported type","payload":{{"required fields": "values"}},"explanation":"short confirmation explanation"}}}}.
Keep reply under 300 characters and explanation under 120 characters. Never claim an action is complete. Actions require confirmation. Use saved IDs only.
Actions: create_plan, reschedule_plan, create_reminder, update_reminder, delete_reminder, update_task_status, review_plan.
IMPORTANT: When the conversation contains a goal/topic, a deadline or test date, and availability slots, immediately propose create_plan. Do not ask the user to list tasks; create the study-task breakdown yourself.
For create_plan include goal, start_date when known, and exact availability entries with date, hours, start_time, and end_time. Never average different dates. A test date is a planning deadline, not automatically a reminder.
If the user corrects an earlier request, follow the latest intent.
Date: {current_date}. Saved context: {json.dumps(context, ensure_ascii=False, default=str)}
Conversation: {json.dumps(recent_history, ensure_ascii=False)}
Latest user message: {message.strip()}"""

    client = _get_client()

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=2048,
            response_format={"type": "json_object"},
        )
    except Exception as error:
        # Log the provider category and message locally, never the API key.
        print(
            f"GROQ CHAT ERROR [{type(error).__name__}]: {error}",
            flush=True,
        )
        raise RuntimeError(
            f"Groq request failed ({type(error).__name__}): {error}"
        ) from error

    response_text = response.choices[0].message.content if response.choices else None
    if not response_text:
        raise RuntimeError("The AI returned an empty response.")

    try:
        normalized = _clean_model_response(response_text)
        result = AssistantResponse.model_validate(normalized)
    except (ValidationError, TypeError, ValueError) as error:
        print(
            f"GROQ JSON VALIDATION ERROR [{type(error).__name__}]: {error}",
            flush=True,
        )
        print(f"GROQ RESPONSE PREVIEW: {response_text[:4000]}", flush=True)
        raise RuntimeError(
            "The AI returned an invalid assistant response."
        ) from error

    try:
        _validate_action(result.action)
    except RuntimeError as error:
        # Preserve the conversational answer, but never persist or execute an
        # incomplete/unsafe action proposal. The user can clarify naturally.
        print(f"GROQ ACTION VALIDATION WARNING: {error}", flush=True)
        result = AssistantResponse(reply=result.reply, action=None)

    if result.action is None:
        fallback = _fallback_reminder_action(message.strip(), current_date or date.today().isoformat())
        if fallback:
            result = AssistantResponse.model_validate({"reply": result.reply, "action": fallback})

    return {
        "reply": result.reply,
        "action": (
            {
                "action_type": result.action.action_type,
                "payload": result.action.payload.model_dump(
                    exclude_none=True
                ),
                "explanation": result.action.explanation,
            }
            if result.action is not None
            else None
        ),
    }
