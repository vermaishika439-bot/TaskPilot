
from flask import Flask, request
from flask_cors import CORS

from planner import create_plan
from rescheduler import generate_reschedule
from database import (
    save_plan,
    get_plan,
    get_all_plans,
    update_plan_status,
    update_task_status,
    save_reschedule_proposal,
    get_reschedule_proposal,
    review_reschedule_proposal,
)

app = Flask(__name__)
CORS(app)


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


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "message": "TaskPilot API is running",
    }, 200


@app.post("/api/plans")
def create_new_plan():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return {
            "error": "Request body must be a valid JSON object"
        }, 400

    goal = data.get("goal")
    days_available = data.get("days_available", data.get("days"))
    hours_per_day = data.get("hours_per_day")

    if not isinstance(goal, str) or not goal.strip():
        return {"error": "A goal is required"}, 400

    if isinstance(days_available, bool) or not isinstance(
        days_available, int
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
        plan = create_plan(
            goal=goal.strip(),
            days=days_available,
            hours_per_day=hours_per_day,
        )

        plan_id = save_plan(plan)
        saved_plan = get_plan(plan_id)

        return {
            "message": "Plan created successfully",
            "plan": saved_plan,
            "id": plan_id,
            "status": saved_plan.get("status", "pending"),
        }, 201

    except ValueError as error:
        return {"error": str(error)}, 400

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


@app.patch("/api/plans/<int:plan_id>/status")
def change_plan_status(plan_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
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

    return {
        "message": f"Plan {new_status} successfully",
        "plan_id": plan_id,
        "status": new_status,
    }, 200


@app.patch("/api/plans/<int:plan_id>/tasks/<int:task_id>")
def change_task_status(plan_id, task_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
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

    return {
        "message": "Task updated successfully",
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


# ==========================================
# TASKPILOT: AI RESCHEDULING API
# ==========================================

@app.post("/api/plans/<int:plan_id>/reschedule")
def create_reschedule_proposal(plan_id):
    """Generate a revised schedule without applying it immediately."""
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return {
            "error": "Request body must be a valid JSON object"
        }, 400

    remaining_days = data.get("remaining_days")

    if (
        isinstance(remaining_days, bool)
        or not isinstance(remaining_days, int)
        or not 1 <= remaining_days <= 365
    ):
        return {
            "error": "remaining_days must be an integer between 1 and 365"
        }, 400

    plan = get_plan(plan_id)

    if plan is None:
        return {"error": "Plan not found"}, 404

    if plan["status"] != "approved":
        return {
            "error": "Approve the plan before rescheduling it"
        }, 409

    try:
        generated = generate_reschedule(
            goal=plan["goal"],
            original_tasks=plan["tasks"],
            remaining_days=remaining_days,
            hours_per_day=plan["hours_per_day"],
        )

        # Save only unfinished tasks in the proposal.
        # Completed tasks remain in the original plan.
        proposed_tasks = [
            task
            for task in generated["tasks"]
            if task.get("status") != "completed"
        ]

        proposal_id = save_reschedule_proposal(
            plan_id=plan_id,
            proposed_tasks=proposed_tasks,
            original_tasks=plan["tasks"],
        )

        if proposal_id == "plan_not_found":
            return {"error": "Plan not found"}, 404

        if proposal_id == "plan_not_approved":
            return {
                "error": "Approve the plan before rescheduling it"
            }, 409

        return {
            "message": "Reschedule proposal generated for review",
            "plan_id": plan_id,
            "proposal": {
                "id": proposal_id,
                "status": "pending",
                "remaining_days": remaining_days,
                "tasks": proposed_tasks,
            },
            "applied": False,
        }, 201

    except ValueError as error:
        return {"error": str(error)}, 400

    except RuntimeError:
        app.logger.exception("AI rescheduling failed")
        return {
            "error": "Unable to generate a reschedule proposal. Please try again."
        }, 502

    except Exception:
        app.logger.exception("Failed to create reschedule proposal")
        return {
            "error": "Unable to create a reschedule proposal. Please try again."
        }, 500


@app.get(
    "/api/plans/<int:plan_id>/reschedule/<int:proposal_id>"
)
def retrieve_reschedule_proposal(plan_id, proposal_id):
    """Retrieve a saved reschedule proposal."""
    plan = get_plan(plan_id)

    if plan is None:
        return {"error": "Plan not found"}, 404

    proposal = get_reschedule_proposal(plan_id, proposal_id)

    if proposal is None:
        return {"error": "Reschedule proposal not found"}, 404

    return {"proposal": proposal}, 200


@app.post(
    "/api/plans/<int:plan_id>/reschedule/<int:proposal_id>/review"
)
def review_saved_reschedule_proposal(plan_id, proposal_id):
    """Accept or reject a saved proposal."""
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
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

    if result == "plan_not_found":
        return {"error": "Plan not found"}, 404

    if result == "proposal_not_found":
        return {"error": "Reschedule proposal not found"}, 404

    if result == "plan_not_approved":
        return {
            "error": "Only approved plans can be rescheduled"
        }, 409

    if result == "proposal_already_reviewed":
        return {
            "error": "This proposal has already been reviewed"
        }, 409

    if result == "proposal_stale":
        return {
            "error": (
                "The plan changed after this proposal was generated. "
                "Generate a new proposal before reviewing it."
            )
        }, 409

    if result == "invalid_decision":
        return {"error": "Invalid decision"}, 400

    if result == "invalid_proposal":
        return {
            "error": "The proposal failed validation and was not applied"
        }, 422

    if result not in ("accepted", "rejected"):
        app.logger.error(
            "Unexpected reschedule review result: %s", result
        )
        return {
            "error": "Unable to review reschedule proposal"
        }, 500

    response = {
        "message": (
            "Reschedule proposal accepted"
            if result == "accepted"
            else "Reschedule proposal rejected"
        ),
        "plan_id": plan_id,
        "proposal_id": proposal_id,
        "status": result,
    }

    if result == "accepted":
        response["plan"] = get_plan(plan_id)

    return response, 200


if __name__ == "__main__":
    app.run(debug=True, port=5000)
