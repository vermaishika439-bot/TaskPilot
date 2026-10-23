
import math
import os
from datetime import date, datetime

from flask import Flask, request
from flask_cors import CORS

from planner import create_plan
from rescheduler import generate_reschedule
from chat_service import generate_assistant_response

from database import (
    save_plan,
    get_plan,
    get_all_plans,
    update_plan_status,
    delete_plan,
    update_task_status,
    update_task_schedule,
    save_reschedule_proposal,
    get_reschedule_proposal,
    review_reschedule_proposal,
    create_reminder,
    get_reminder,
    get_all_reminders,
    get_upcoming_reminders,
    update_reminder_status,
    delete_reminder,
    create_conversation,
    get_conversation,
    get_all_conversations,
    update_conversation_title,
    save_chat_message,
    get_chat_messages,
    create_chat_action,
    get_chat_action,
    get_chat_actions,
    update_chat_action,
    get_calendar_tasks,
    create_activity,
    get_activity,
)


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173",
    ).split(",")
    if origin.strip()
]

CORS(app, origins=allowed_origins)


# --------------------------------------------------
# Shared helpers
# --------------------------------------------------

def calculate_progress(tasks):
    total_tasks = len(tasks)
    completed_tasks = sum(
        1 for task in tasks
        if task.get("status") == "completed"
    )

    percentage = (
        round((completed_tasks / total_tasks) * 100, 2)
        if total_tasks > 0
        else 0
    )

    return {
        "completed_tasks": completed_tasks,
        "total_tasks": total_tasks,
        "percentage": percentage,
    }


def is_positive_int(value):
    return type(value) is int and value > 0


def is_valid_hours(value):
    return (
        not isinstance(value, bool)
        and isinstance(value, (int, float))
        and math.isfinite(value)
        and 0 < value <= 24
    )


def valid_iso_date(value):
    if not isinstance(value, str):
        return False

    try:
        return datetime.strptime(
            value, "%Y-%m-%d"
        ).date().isoformat() == value
    except ValueError:
        return False


def valid_iso_time(value):
    if not isinstance(value, str):
        return False

    try:
        return datetime.strptime(
            value, "%H:%M"
        ).strftime("%H:%M") == value
    except ValueError:
        return False


def get_json_object():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def get_action_context():
    """Supply the assistant with actual saved plans and reminders."""
    plans = get_all_plans()
    reminders = get_all_reminders()

    plan_context = []

    for plan in plans:
        plan_context.append({
            "id": plan["id"],
            "goal": plan["goal"],
            "days_available": plan["days_available"],
            "hours_per_day": plan["hours_per_day"],
            "status": plan["status"],
            "tasks": plan["tasks"],
            "availability": plan.get("availability", {}),
            "progress": calculate_progress(plan["tasks"]),
        })

    return plan_context, reminders


def conversation_or_404(conversation_id):
    conversation = get_conversation(conversation_id)

    if conversation is None:
        return None, (
            {"error": "Conversation not found"},
            404,
        )

    return conversation, None


# --------------------------------------------------
# Health
# --------------------------------------------------

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "message": "TaskPilot API is running",
    }, 200


# --------------------------------------------------
# Plans
# --------------------------------------------------

@app.post("/api/plans")
def create_new_plan():
    data = get_json_object()

    if data is None:
        return {
            "error": "Request body must be a valid JSON object"
        }, 400

    goal = data.get("goal")
    days_available = data.get(
        "days_available",
        data.get("days"),
    )
    hours_per_day = data.get("hours_per_day")

    if not isinstance(goal, str) or not goal.strip():
        return {"error": "A goal is required"}, 400

    if (
        isinstance(days_available, bool)
        or not isinstance(days_available, int)
    ):
        return {
            "error": "days_available must be an integer"
        }, 400

    if (
        isinstance(hours_per_day, bool)
        or not isinstance(hours_per_day, (int, float))
    ):
        return {
            "error": "hours_per_day must be a number"
        }, 400

    try:
        planner_options = {}
        if data.get("availability") is not None:
            planner_options["availability"] = data.get("availability")
        if data.get("start_date"):
            planner_options["start_date"] = data.get("start_date")
        plan = create_plan(
            goal=goal.strip(), days=days_available,
            hours_per_day=hours_per_day, **planner_options,
        )

        plan_id = save_plan(plan)
        saved_plan = get_plan(plan_id)
        create_activity("plan_created", f'Created plan “{saved_plan.get("goal", goal.strip())}”.', "plan", plan_id)

        return {
            "message": "Plan created successfully",
            "plan": saved_plan,
            "id": plan_id,
            "status": saved_plan.get("status", "pending"),
        }, 201

    except ValueError as error:
        return {"error": str(error)}, 400

    except RuntimeError:
        app.logger.exception("Plan generation failed")
        return {
            "error": "Unable to generate the plan. Please try again."
        }, 502

    except Exception:
        app.logger.exception("Failed to create plan")
        return {
            "error": "Unable to create plan. Please try again."
        }, 500


@app.get("/api/plans")
def list_plans():
    plans = get_all_plans()
    plan_summaries = []

    for plan in plans:
        plan_summaries.append({
            "id": plan["id"],
            "goal": plan["goal"],
            "days_available": plan["days_available"],
            "hours_per_day": plan["hours_per_day"],
            "status": plan["status"],
            "created_at": plan["created_at"],
            "progress": calculate_progress(plan["tasks"]),
        })

    return {
        "total_plans": len(plan_summaries),
        "plans": plan_summaries,
    }, 200


@app.get("/api/plans/<int:plan_id>")
def retrieve_plan(plan_id):
    plan = get_plan(plan_id)

    if plan is None:
        return {"error": "Plan not found"}, 404

    return {"plan": plan}, 200


@app.delete("/api/plans/<int:plan_id>")
def remove_plan(plan_id):
    if delete_plan(plan_id) != 1:
        return {"error": "Plan not found"}, 404
    return {"message": "Plan deleted", "plan_id": plan_id}, 200


@app.patch("/api/plans/<int:plan_id>/status")
def change_plan_status(plan_id):
    data = get_json_object()

    if data is None:
        return {
            "error": "Request body must be a valid JSON object"
        }, 400

    new_status = data.get("status")

    if new_status not in ("approved", "rejected"):
        return {
            "error": "Status must be 'approved' or 'rejected'"
        }, 400

    plan = get_plan(plan_id)

    if plan is None:
        return {"error": "Plan not found"}, 404

    updated_rows = update_plan_status(plan_id, new_status)

    if updated_rows == 0:
        return {
            "error": "This plan has already been reviewed",
            "current_status": plan["status"],
        }, 409

    create_activity("plan_reviewed", f"Plan {new_status}.", "plan", plan_id, {"status": new_status})

    return {
        "plan_id": plan_id,
        "status": new_status,
    }, 200


@app.patch("/api/plans/<int:plan_id>/tasks/<int:task_id>")
def change_task_status(plan_id, task_id):
    data = get_json_object()

    if data is None:
        return {
            "error": "Request body must be a valid JSON object"
        }, 400

    new_status = data.get("status")

    if new_status not in ("pending", "completed"):
        return {
            "error": "Task status must be 'pending' or 'completed'"
        }, 400

    result = update_task_status(
        plan_id,
        task_id,
        new_status,
    )

    if result == "plan_not_found":
        return {"error": "Plan not found"}, 404

    if result == "plan_not_approved":
        return {
            "error": "Approve the plan before updating tasks"
        }, 409

    if result == "task_not_found":
        return {"error": "Task not found"}, 404

    if result == "invalid_status":
        return {"error": "Invalid task status"}, 400

    if result != "updated":
        app.logger.error(
            "Unexpected task update result: %s", result
        )
        return {"error": "Unable to update task"}, 500

    plan = get_plan(plan_id)
    task = next((item for item in plan["tasks"] if item.get("task_id") == task_id), None)
    create_activity("task_status_changed", f'Task “{task.get("title", task_id) if task else task_id}” marked {new_status}.', "task", f"{plan_id}:{task_id}", {"status": new_status, "plan_id": plan_id})

    return {
        "plan_id": plan_id,
        "task_id": task_id,
        "status": new_status,
        "progress": calculate_progress(plan["tasks"]),
    }, 200


@app.get("/api/plans/<int:plan_id>/progress")
def get_plan_progress(plan_id):
    plan = get_plan(plan_id)

    if plan is None:
        return {"error": "Plan not found"}, 404

    return {
        "plan_id": plan_id,
        "goal": plan["goal"],
        "status": plan["status"],
        "progress": calculate_progress(plan["tasks"]),
    }, 200


# --------------------------------------------------
# Manual task schedule editing
# --------------------------------------------------

@app.patch("/api/plans/<int:plan_id>/tasks/<int:task_id>/schedule")
def change_task_schedule(plan_id, task_id):
    data = get_json_object()
    if data is None or not valid_iso_date(data.get("scheduled_date")):
        return {"error": "scheduled_date must be a valid YYYY-MM-DD date"}, 400
    result = update_task_schedule(
        plan_id, task_id, data["scheduled_date"],
        data.get("scheduled_time"), data.get("scheduled_end_time"),
    )
    errors = {
        "plan_not_found": ({"error": "Plan not found"}, 404),
        "plan_not_approved": ({"error": "Approve the plan before editing its schedule"}, 409),
        "task_not_found": ({"error": "Task not found"}, 404),
        "invalid_time": ({"error": "Times must use HH:MM format"}, 400),
        "invalid_time_range": ({"error": "End time must be after start time"}, 400),
    }
    if result in errors:
        return errors[result]
    if result != "updated":
        return {"error": "Unable to update task schedule"}, 500
    create_activity("task_schedule_changed", f"Task {task_id} schedule changed.", "task", f"{plan_id}:{task_id}", {"scheduled_date": data["scheduled_date"], "scheduled_time": data.get("scheduled_time"), "scheduled_end_time": data.get("scheduled_end_time")})
    return {"plan_id": plan_id, "task_id": task_id, "scheduled_date": data["scheduled_date"], "scheduled_time": data.get("scheduled_time"), "scheduled_end_time": data.get("scheduled_end_time")}, 200


# --------------------------------------------------
# Rescheduling
# --------------------------------------------------

@app.post("/api/plans/<int:plan_id>/reschedule")
def create_reschedule(plan_id):
    data = get_json_object()

    if data is None:
        return {
            "error": "Request body must be a valid JSON object"
        }, 400

    remaining_days = data.get("remaining_days")
    availability = data.get("availability")

    if not isinstance(availability, list) or not availability:
        return {
            "error": "Provide at least one new availability window with date, hours, start_time, and end_time"
        }, 400

    if (
        type(remaining_days) is not int
        or not 1 <= remaining_days <= 365
    ):
        return {
            "error": "remaining_days must be an integer from 1 to 365"
        }, 400

    plan = get_plan(plan_id)

    if plan is None:
        return {"error": "Plan not found"}, 404

    if plan["status"] != "approved":
        return {
            "error": "Only approved plans can be rescheduled"
        }, 409

    try:
        generated = generate_reschedule(
            goal=plan["goal"], original_tasks=plan["tasks"],
            remaining_days=len(availability), hours_per_day=plan["hours_per_day"],
            availability=availability,
        )
        proposal_tasks = [task for task in generated["tasks"] if task.get("status") != "completed"]

        proposal_id = save_reschedule_proposal(
            plan_id=plan_id,
            proposed_tasks=proposal_tasks,
            original_tasks=plan["tasks"],
            remaining_days=len(availability),
            availability=availability,
        )

        if isinstance(proposal_id, str):
            if proposal_id == "plan_not_found":
                return {"error": "Plan not found"}, 404

            if proposal_id == "plan_not_approved":
                return {
                    "error": "Only approved plans can be rescheduled"
                }, 409

            return {
                "error": "Unable to save the reschedule proposal"
            }, 500

        proposal = get_reschedule_proposal(
            plan_id,
            proposal_id,
        )

        return {
            "message": "Reschedule proposal created",
            "proposal": proposal,
        }, 201

    except ValueError as error:
        return {"error": str(error)}, 400

    except RuntimeError as error:
        app.logger.exception("Reschedule generation failed")
        return {
            "error": f"Unable to generate a reschedule proposal: {error}"
        }, 502

    except Exception:
        app.logger.exception("Failed to create reschedule proposal")
        return {
            "error": "Unable to create reschedule proposal"
        }, 500


@app.get("/api/plans/<int:plan_id>/reschedule/<int:proposal_id>")
def retrieve_reschedule(plan_id, proposal_id):
    proposal = get_reschedule_proposal(
        plan_id,
        proposal_id,
    )

    if proposal is None:
        return {"error": "Reschedule proposal not found"}, 404

    return {"proposal": proposal}, 200


@app.post(
    "/api/plans/<int:plan_id>/reschedule/<int:proposal_id>/review"
)
def review_reschedule(plan_id, proposal_id):
    data = get_json_object()

    if data is None:
        return {
            "error": "Request body must be a valid JSON object"
        }, 400

    decision = data.get("decision")

    if decision not in ("accept", "reject"):
        return {
            "error": "Decision must be 'accept' or 'reject'"
        }, 400

    result = review_reschedule_proposal(
        plan_id=plan_id,
        proposal_id=proposal_id,
        decision=decision,
    )

    errors = {
        "plan_not_found": ({"error": "Plan not found"}, 404),
        "plan_not_approved": (
            {"error": "Plan must be approved"}, 409
        ),
        "proposal_not_found": (
            {"error": "Reschedule proposal not found"}, 404
        ),
        "proposal_already_reviewed": (
            {"error": "Proposal has already been reviewed"}, 409
        ),
        "proposal_stale": (
            {
                "error": (
                    "The plan changed after this proposal was created. "
                    "Generate a new proposal."
                )
            },
            409,
        ),
        "invalid_proposal": (
            {"error": "The proposal failed validation"}, 422
        ),
        "invalid_decision": (
            {"error": "Invalid decision"}, 400
        ),
    }

    if result in errors:
        body, status_code = errors[result]
        return body, status_code

    if result in ("accepted", "rejected"):
        create_activity("schedule_revision_reviewed", f"Schedule revision {result} for plan {plan_id}.", "proposal", proposal_id, {"decision": result, "plan_id": plan_id})

    if result not in ("accepted", "rejected"):
        app.logger.error(
            "Unexpected proposal review result: %s", result
        )
        return {
            "error": "Unable to review the proposal"
        }, 500

    return {
        "message": f"Proposal {result}",
        "plan_id": plan_id,
        "proposal_id": proposal_id,
        "status": result,
    }, 200


# --------------------------------------------------
# Internal calendar and persistent activity
# --------------------------------------------------
@app.get("/api/calendar")
def calendar_tasks():
    start = request.args.get("start_date", date.today().isoformat())
    end = request.args.get("end_date", start)
    if not valid_iso_date(start) or not valid_iso_date(end) or start > end:
        return {"error": "start_date and end_date must be valid YYYY-MM-DD dates"}, 400
    return {"start_date": start, "end_date": end, "tasks": get_calendar_tasks(start, end)}, 200

@app.get("/api/activity")
def activity_history():
    return {"events": get_activity()}, 200

# --------------------------------------------------
# Reminders
# --------------------------------------------------

@app.post("/api/reminders")
def add_reminder():
    data = get_json_object()

    if data is None:
        return {
            "error": "Request body must be a valid JSON object"
        }, 400

    title = data.get("title")
    reminder_type = data.get("reminder_type")
    reminder_date = data.get("date", data.get("reminder_date"))
    reminder_time = data.get("time", data.get("reminder_time"))
    notes = data.get("notes", "")

    if not isinstance(title, str) or not title.strip():
        return {"error": "A reminder title is required"}, 400

    if len(title.strip()) > 200:
        return {
            "error": "Reminder title cannot exceed 200 characters"
        }, 400

    if reminder_type not in ("birthday", "event", "deadline"):
        return {
            "error": (
                "reminder_type must be birthday, event, or deadline"
            )
        }, 400

    if not valid_iso_date(reminder_date):
        return {
            "error": "date must use YYYY-MM-DD format"
        }, 400

    if reminder_time is not None and not valid_iso_time(
        reminder_time
    ):
        return {
            "error": "time must use HH:MM format"
        }, 400

    if not isinstance(notes, str) or len(notes) > 2000:
        return {
            "error": "notes must be text of at most 2000 characters"
        }, 400

    try:
        reminder_id = create_reminder(
            title=title.strip(),
            reminder_type=reminder_type,
            reminder_date=reminder_date,
            reminder_time=reminder_time,
            notes=notes,
        )

        return {
            "message": "Reminder created successfully",
            "reminder": get_reminder(reminder_id),
        }, 201

    except Exception:
        app.logger.exception("Failed to create reminder")
        return {"error": "Unable to create reminder"}, 500


@app.get("/api/reminders")
def list_reminders():
    reminders = get_all_reminders()

    return {
        "total_reminders": len(reminders),
        "reminders": reminders,
    }, 200


@app.get("/api/reminders/upcoming")
def list_upcoming_reminders():
    reminders = get_upcoming_reminders()

    return {
        "total_reminders": len(reminders),
        "reminders": reminders,
    }, 200


@app.patch("/api/reminders/<int:reminder_id>")
def change_reminder_status(reminder_id):
    data = get_json_object()

    if data is None:
        return {
            "error": "Request body must be a valid JSON object"
        }, 400

    status = data.get("status")

    if status not in ("pending", "completed"):
        return {
            "error": "Status must be 'pending' or 'completed'"
        }, 400

    reminder = update_reminder_status(reminder_id, status)

    if reminder is None:
        return {"error": "Reminder not found"}, 404

    return {
        "message": "Reminder updated successfully",
        "reminder": reminder,
    }, 200


@app.delete("/api/reminders/<int:reminder_id>")
def remove_reminder(reminder_id):
    if not delete_reminder(reminder_id):
        return {"error": "Reminder not found"}, 404

    return {
        "message": "Reminder deleted successfully",
        "reminder_id": reminder_id,
    }, 200


# --------------------------------------------------
# AI conversation management
# --------------------------------------------------

@app.post("/api/conversations")
def new_conversation():
    data = get_json_object()

    if data is None:
        data = {}

    title = data.get("title", "New conversation")

    if not isinstance(title, str):
        return {"error": "title must be text"}, 400

    if len(title.strip()) > 120:
        return {
            "error": "Conversation title cannot exceed 120 characters"
        }, 400

    conversation_id = create_conversation(title)

    return {
        "message": "Conversation created",
        "conversation": get_conversation(conversation_id),
    }, 201


@app.get("/api/conversations")
def list_conversations():
    conversations = get_all_conversations()

    return {
        "total_conversations": len(conversations),
        "conversations": conversations,
    }, 200


@app.get("/api/conversations/<int:conversation_id>")
def retrieve_conversation(conversation_id):
    conversation, error = conversation_or_404(conversation_id)

    if error:
        return error

    messages = get_chat_messages(
        conversation_id,
        limit=500,
    )
    actions = get_chat_actions(conversation_id)

    return {
        "conversation": conversation,
        "messages": messages,
        "actions": actions,
    }, 200


@app.post("/api/conversations/<int:conversation_id>/messages")
def send_chat_message(conversation_id):
    conversation, error = conversation_or_404(conversation_id)

    if error:
        return error

    data = get_json_object()

    if data is None:
        return {
            "error": "Request body must be a valid JSON object"
        }, 400

    message = data.get("message")

    if not isinstance(message, str) or not message.strip():
        return {"error": "A message is required"}, 400

    if len(message) > 10000:
        return {
            "error": "Message cannot exceed 10,000 characters"
        }, 400

    previous_messages = get_chat_messages(
        conversation_id,
        limit=100,
    )

    # Save the user's message before calling the AI.
    user_message_id = save_chat_message(
        conversation_id=conversation_id,
        role="user",
        content=message.strip(),
    )

    if user_message_id is None:
        return {"error": "Conversation not found"}, 404

    try:
        # Set a useful title from the first user message.
        if conversation["title"] == "New conversation":
            title = " ".join(message.strip().split())[:60]
            update_conversation_title(conversation_id, title)

        plans, reminders = get_action_context()

        response = generate_assistant_response(
            message=message.strip(),
            history=previous_messages,
            plans=plans,
            reminders=reminders,
            current_date=date.today().isoformat(),
            timezone_name=os.getenv("TASKPILOT_TIMEZONE", "local"),
        )

        action = response.get("action")
        action_summary = None

        if action:
            # Save the assistant message first so the action can reference it.
            assistant_message_id = save_chat_message(
                conversation_id=conversation_id,
                role="assistant",
                content=response["reply"],
                metadata={
                    "has_action": True,
                    "action_type": action["action_type"],
                },
            )

            action_id = create_chat_action(
                conversation_id=conversation_id,
                action_type=action["action_type"],
                payload=action["payload"],
                message_id=assistant_message_id,
            )

            if action_id is None:
                return {
                    "error": "Unable to save the proposed action"
                }, 500

            action_summary = {
                "id": action_id,
                "action_type": action["action_type"],
                "payload": action["payload"],
                "explanation": action["explanation"],
                "status": "pending",
            }

        else:
            assistant_message_id = save_chat_message(
                conversation_id=conversation_id,
                role="assistant",
                content=response["reply"],
                metadata={"has_action": False},
            )

        return {
            "message": "Reply generated successfully",
            "conversation_id": conversation_id,
            "user_message_id": user_message_id,
            "assistant_message": {
                "id": assistant_message_id,
                "role": "assistant",
                "content": response["reply"],
            },
            "action": action_summary,
        }, 200

    except ValueError as error:
        return {"error": str(error)}, 400

    except RuntimeError as error:
        app.logger.exception("AI assistant request failed")
        error_text = str(error).lower()
        if "groq_api_key" in error_text or "api key" in error_text or "authenticationerror" in error_text or "401" in error_text:
            public_error = "The AI service key is missing or invalid. Check GROQ_API_KEY in backend/.env and restart the backend."
        elif "429" in error_text or "rate limit" in error_text or "quota" in error_text or "resource_exhausted" in error_text:
            public_error = "Groq rate limit or quota reached. Wait and try again, or check your Groq console limits."
        elif "404" in error_text or "model" in error_text and ("not found" in error_text or "decommission" in error_text):
            public_error = "The configured Groq model is unavailable. Set GROQ_MODEL to a model enabled for your account and restart the backend."
        elif "json" in error_text or "validation" in error_text or "invalid assistant response" in error_text:
            public_error = "Groq responded, but the response was not valid TaskPilot JSON. Check the backend terminal for details."
        else:
            public_error = "Groq could not process this request. Check the backend terminal for the line beginning GROQ CHAT ERROR."
        return {
            "error": public_error,
            "code": "AI_REQUEST_FAILED",
        }, 502

    except Exception:
        app.logger.exception("Failed to process chat message")
        return {
            "error": (
                "Unable to process the message. "
                "Your message was saved; please try again."
            )
        }, 500


# --------------------------------------------------
# Confirm or reject AI-proposed actions
# --------------------------------------------------

def execute_chat_action(action_type, payload):
    """
    Execute only explicitly supported actions.
    Every payload is checked on the server before use.
    """

    if not isinstance(payload, dict):
        return {"error": "Invalid action payload"}, 400

    # Create a new plan.
    if action_type == "create_plan":
        goal = payload.get("goal")
        days = payload.get("days_available")
        hours = payload.get("hours_per_day")
        availability = payload.get("availability") or []

        if availability:
            availability = [entry for entry in availability if isinstance(entry, dict)]
            dated_hours = [float(entry.get("hours", 0)) for entry in availability]
            if not availability or any(hours < 0 or hours > 24 for hours in dated_hours) or not any(dated_hours):
                return {"error": "Availability must contain at least one date with available time"}, 400
            days = len(availability)
            # This is only a schema fallback. The planner receives the full
            # date-by-date values and must not use this maximum as an average.
            hours = max(dated_hours)

        if not isinstance(goal, str) or not goal.strip():
            return {"error": "A valid goal is required"}, 400

        if type(days) is not int or not 1 <= days <= 365:
            return {"error": "days_available must be 1–365"}, 400

        if not is_valid_hours(hours):
            return {
                "error": "hours_per_day must be greater than 0 and at most 24"
            }, 400

        plan = create_plan(
            goal=goal.strip(),
            days=days,
            hours_per_day=hours,
            availability=availability,
            start_date=payload.get("start_date"),
        )

        plan_id = save_plan(plan)

        return {
            "message": "Plan created successfully",
            "plan": get_plan(plan_id),
        }, 201

    # Generate a rescheduling proposal without applying it.
    if action_type == "reschedule_plan":
        plan_id = payload.get("plan_id")
        remaining_days = payload.get("remaining_days")

        if type(plan_id) is not int or plan_id <= 0:
            return {"error": "Invalid plan_id"}, 400

        if (
            type(remaining_days) is not int
            or not 1 <= remaining_days <= 365
        ):
            return {"error": "Invalid remaining_days"}, 400

        plan = get_plan(plan_id)

        if plan is None:
            return {"error": "Plan not found"}, 404

        if plan["status"] != "approved":
            return {
                "error": "Only approved plans can be rescheduled"
            }, 409

        generated = generate_reschedule(
            goal=plan["goal"],
            original_tasks=plan["tasks"],
            remaining_days=remaining_days,
            hours_per_day=plan["hours_per_day"],
        )
        proposed_tasks = [
            task for task in generated["tasks"]
            if task.get("status") != "completed"
        ]

        proposal_id = save_reschedule_proposal(
            plan_id=plan_id,
            proposed_tasks=proposed_tasks,
            original_tasks=plan["tasks"],
            remaining_days=remaining_days,
        )

        if not isinstance(proposal_id, int):
            return {
                "error": "Unable to save the reschedule proposal"
            }, 500

        return {
            "message": "Reschedule proposal created for review",
            "proposal": get_reschedule_proposal(
                plan_id,
                proposal_id,
            ),
        }, 201

    # Create a reminder.
    if action_type == "create_reminder":
        title = payload.get("title")
        reminder_type = payload.get("reminder_type")
        reminder_date = payload.get("date")
        reminder_time = payload.get("time")
        notes = payload.get("notes", "")

        if (
            not isinstance(title, str)
            or not title.strip()
            or len(title.strip()) > 200
        ):
            return {"error": "Invalid reminder title"}, 400

        if reminder_type not in ("birthday", "event", "deadline"):
            return {"error": "Invalid reminder type"}, 400

        if not valid_iso_date(reminder_date):
            return {"error": "Invalid reminder date"}, 400

        if (
            reminder_time is not None
            and not valid_iso_time(reminder_time)
        ):
            return {"error": "Invalid reminder time"}, 400

        if not isinstance(notes, str) or len(notes) > 2000:
            return {"error": "Invalid reminder notes"}, 400

        reminder_id = create_reminder(
            title=title.strip(),
            reminder_type=reminder_type,
            reminder_date=reminder_date,
            reminder_time=reminder_time,
            notes=notes,
        )

        return {
            "message": "Reminder created successfully",
            "reminder": get_reminder(reminder_id),
        }, 201

    # Mark a reminder pending or completed.
    if action_type == "update_reminder":
        reminder_id = payload.get("reminder_id")
        status = payload.get("status")

        if type(reminder_id) is not int or reminder_id <= 0:
            return {"error": "Invalid reminder_id"}, 400

        if status not in ("pending", "completed"):
            return {"error": "Invalid reminder status"}, 400

        reminder = update_reminder_status(reminder_id, status)

        if reminder is None:
            return {"error": "Reminder not found"}, 404

        return {
            "message": "Reminder updated successfully",
            "reminder": reminder,
        }, 200

    # Delete a reminder.
    if action_type == "delete_reminder":
        reminder_id = payload.get("reminder_id")

        if type(reminder_id) is not int or reminder_id <= 0:
            return {"error": "Invalid reminder_id"}, 400

        if not delete_reminder(reminder_id):
            return {"error": "Reminder not found"}, 404

        return {
            "message": "Reminder deleted successfully",
            "reminder_id": reminder_id,
        }, 200

    # Update task completion.
    if action_type == "update_task_status":
        plan_id = payload.get("plan_id")
        task_id = payload.get("task_id")
        status = payload.get("status")

        if type(plan_id) is not int or plan_id <= 0:
            return {"error": "Invalid plan_id"}, 400

        if type(task_id) is not int or task_id <= 0:
            return {"error": "Invalid task_id"}, 400

        if status not in ("pending", "completed"):
            return {"error": "Invalid task status"}, 400

        result = update_task_status(plan_id, task_id, status)

        if result == "plan_not_found":
            return {"error": "Plan not found"}, 404

        if result == "plan_not_approved":
            return {
                "error": "Approve the plan before updating tasks"
            }, 409

        if result == "task_not_found":
            return {"error": "Task not found"}, 404

        if result != "updated":
            return {"error": "Unable to update task"}, 500

        plan = get_plan(plan_id)

        return {
            "message": "Task status updated successfully",
            "plan_id": plan_id,
            "task_id": task_id,
            "status": status,
            "progress": calculate_progress(plan["tasks"]),
        }, 200

    # Approve or reject a plan.
    if action_type == "review_plan":
        plan_id = payload.get("plan_id")
        status = payload.get("status")

        if type(plan_id) is not int or plan_id <= 0:
            return {"error": "Invalid plan_id"}, 400

        if status not in ("approved", "rejected"):
            return {"error": "Invalid plan review status"}, 400

        plan = get_plan(plan_id)

        if plan is None:
            return {"error": "Plan not found"}, 404

        updated_rows = update_plan_status(plan_id, status)

        if updated_rows == 0:
            return {
                "error": "This plan has already been reviewed",
                "current_status": plan["status"],
            }, 409

        return {
            "message": f"Plan {status} successfully",
            "plan_id": plan_id,
            "status": status,
        }, 200

    return {"error": "Unsupported action type"}, 400


@app.post(
    "/api/conversations/<int:conversation_id>/actions/<int:action_id>/confirm"
)
def confirm_chat_action(conversation_id, action_id):
    conversation, error = conversation_or_404(conversation_id)

    if error:
        return error

    data = get_json_object()

    if data is None:
        return {
            "error": "Request body must be a valid JSON object"
        }, 400

    decision = data.get("decision")

    if decision not in ("confirm", "reject"):
        return {
            "error": "decision must be 'confirm' or 'reject'"
        }, 400

    action = get_chat_action(conversation_id, action_id)

    if action is None:
        return {"error": "Action not found"}, 404

    if action["status"] != "pending":
        return {
            "error": "This action has already been reviewed",
            "status": action["status"],
        }, 409

    if decision == "reject":
        updated = update_chat_action(
            conversation_id=conversation_id,
            action_id=action_id,
            status="rejected",
            result={"message": "Rejected by user"},
        )

        if not updated:
            return {
                "error": "Action was already reviewed"
            }, 409

        return {
            "message": "Proposed action rejected",
            "action_id": action_id,
            "status": "rejected",
        }, 200

    try:
        result, status_code = execute_chat_action(
            action["action_type"],
            action["payload"],
        )

        final_status = (
            "confirmed"
            if 200 <= status_code < 300
            else "failed"
        )

        updated = update_chat_action(
            conversation_id=conversation_id,
            action_id=action_id,
            status=final_status,
            result=result,
        )

        if not updated:
            app.logger.error(
                "Could not finalize chat action %s", action_id
            )
            return {
                "error": "Action ran, but its final status could not be saved",
                "action_id": action_id,
            }, 500

        return {
            "message": (
                "Action executed successfully"
                if final_status == "confirmed"
                else "Action could not be completed"
            ),
            "action_id": action_id,
            "status": final_status,
            "result": result,
        }, status_code

    except ValueError as error:
        update_chat_action(
            conversation_id=conversation_id,
            action_id=action_id,
            status="failed",
            result={"error": str(error)},
        )
        return {"error": str(error)}, 400

    except RuntimeError:
        app.logger.exception(
            "AI operation failed for action %s", action_id
        )
        update_chat_action(
            conversation_id=conversation_id,
            action_id=action_id,
            status="failed",
            result={"error": "AI operation failed"},
        )
        return {
            "error": "The AI operation failed. Please try again."
        }, 502

    except Exception:
        app.logger.exception(
            "Failed to execute chat action %s", action_id
        )
        update_chat_action(
            conversation_id=conversation_id,
            action_id=action_id,
            status="failed",
            result={"error": "Action execution failed"},
        )
        return {
            "error": "Unable to execute the proposed action"
        }, 500


# --------------------------------------------------
# Application entry point
# --------------------------------------------------

if __name__ == "__main__":
    debug_enabled = (
        os.getenv("FLASK_DEBUG", "false").lower() == "true"
    )

    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", "5000")),
        debug=debug_enabled,
    )
