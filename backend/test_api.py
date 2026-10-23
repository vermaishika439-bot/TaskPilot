
import pytest

import run as taskpilot


@pytest.fixture
def client():
    taskpilot.app.config["TESTING"] = True

    with taskpilot.app.test_client() as test_client:
        yield test_client


def test_health_endpoint(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_empty_goal_is_rejected(client):
    response = client.post(
        "/api/plans",
        json={
            "goal": "",
            "days": 5,
            "hours_per_day": 2
        }
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "A goal is required"


def test_missing_plan_returns_404(client):
    response = client.get("/api/plans/999999")

    assert response.status_code == 404


def test_plan_can_be_approved(client, monkeypatch):
    monkeypatch.setattr(
        taskpilot,
        "create_plan",
        lambda goal, days, hours_per_day: {
            "goal": goal,
            "days_available": days,
            "hours_per_day": hours_per_day,
            "tasks": [
                {
                    "task_id": 1,
                    "title": "Review Python basics",
                    "day": 1,
                    "duration_hours": 1,
                    "priority": "high",
                    "status": "pending"
                }
            ]
        }
    )

    monkeypatch.setattr(taskpilot, "save_plan", lambda plan: 987654)
    monkeypatch.setattr(
        taskpilot,
        "get_plan",
        lambda plan_id: {
            "id": plan_id,
            "status": "pending"
        }
    )
    monkeypatch.setattr(
        taskpilot,
        "update_plan_status",
        lambda plan_id, status: 1
    )

    response = client.post(
        "/api/plans",
        json={
            "goal": "Learn Python",
            "days": 1,
            "hours_per_day": 2
        }
    )

    assert response.status_code == 201
    assert response.get_json()["status"] == "pending"

    response = client.patch(
        "/api/plans/987654/status",
        json={"status": "approved"}
    )

    assert response.status_code == 200
    assert response.get_json()["status"] == "approved"


def test_already_reviewed_plan_cannot_be_reviewed_again(
    client, monkeypatch
):
    monkeypatch.setattr(
        taskpilot,
        "get_plan",
        lambda plan_id: {
            "id": plan_id,
            "status": "approved"
        }
    )
    monkeypatch.setattr(
        taskpilot,
        "update_plan_status",
        lambda plan_id, status: 0
    )

    response = client.patch(
        "/api/plans/987654/status",
        json={"status": "approved"}
    )

    assert response.status_code == 409
    assert response.get_json()["current_status"] == "approved"


def test_invalid_status_is_rejected(client):
    response = client.patch(
        "/api/plans/2/status",
        json={"status": "maybe"}
    )

    assert response.status_code == 400


def test_task_completion_updates_progress(client, monkeypatch):
    tasks = [
        {"task_id": 1, "title": "Task 1", "status": "pending"},
        {"task_id": 2, "title": "Task 2", "status": "pending"},
    ]

    monkeypatch.setattr(
        taskpilot,
        "update_task_status",
        lambda plan_id, task_id, status: (
            tasks.__setitem__(
                task_id - 1,
                {**tasks[task_id - 1], "status": status}
            ) or "updated"
        )
        if task_id in (1, 2) else "task_not_found"
    )

    monkeypatch.setattr(
        taskpilot,
        "get_plan",
        lambda plan_id: {
            "id": plan_id,
            "goal": "Test progress",
            "status": "approved",
            "tasks": tasks
        }
    )

    response = client.patch(
        "/api/plans/55/tasks/1",
        json={"status": "completed"}
    )

    assert response.status_code == 200
    assert response.get_json()["progress"]["completed_tasks"] == 1
    assert response.get_json()["progress"]["total_tasks"] == 2
    assert response.get_json()["progress"]["percentage"] == 50.0


def test_unapproved_plan_cannot_track_tasks(client, monkeypatch):
    monkeypatch.setattr(
        taskpilot,
        "update_task_status",
        lambda plan_id, task_id, status: "plan_not_approved"
    )

    response = client.patch(
        "/api/plans/55/tasks/1",
        json={"status": "completed"}
    )

    assert response.status_code == 409


def test_missing_task_returns_404(client, monkeypatch):
    monkeypatch.setattr(
        taskpilot,
        "update_task_status",
        lambda plan_id, task_id, status: "task_not_found"
    )

    response = client.patch(
        "/api/plans/55/tasks/999",
        json={"status": "completed"}
    )

    assert response.status_code == 404


def test_progress_calculation(client, monkeypatch):
    monkeypatch.setattr(
        taskpilot,
        "get_plan",
        lambda plan_id: {
            "id": plan_id,
            "goal": "Test progress",
            "status": "approved",
            "tasks": [
                {"task_id": 1, "status": "completed"},
                {"task_id": 2, "status": "completed"},
                {"task_id": 3, "status": "pending"},
                {"task_id": 4, "status": "pending"},
            ]
        }
    )

    response = client.get("/api/plans/55/progress")

    assert response.status_code == 200

    progress = response.get_json()["progress"]

    assert progress["completed_tasks"] == 2
    assert progress["total_tasks"] == 4
    assert progress["percentage"] == 50.0

def test_list_plans_returns_summaries(client, monkeypatch):
    from run import app

    sample_plans = [
        {
            "id": 2,
            "goal": "Prepare for Python exam",
            "days_available": 5,
            "hours_per_day": 2,
            "status": "approved",
            "created_at": "2026-10-17 08:52:15",
            "tasks": [
                {"task_id": 1, "status": "completed"},
                {"task_id": 2, "status": "pending"},
            ],
        }
    ]

    monkeypatch.setattr(
        "run.get_all_plans",
        lambda: sample_plans,
    )

    response = client.get("/api/plans")
    data = response.get_json()

    assert response.status_code == 200
    assert data["total_plans"] == 1
    assert len(data["plans"]) == 1
    assert data["plans"][0]["id"] == 2
    assert data["plans"][0]["status"] == "approved"
    assert data["plans"][0]["progress"]["completed_tasks"] == 1
    assert data["plans"][0]["progress"]["total_tasks"] == 2
    assert data["plans"][0]["progress"]["percentage"] == 50.0
    assert "tasks" not in data["plans"][0]

def test_reschedule_ai_failure_returns_502(client, monkeypatch):
    import run as taskpilot

    monkeypatch.setattr(
        taskpilot,
        "get_plan",
        lambda plan_id: {
            "id": plan_id,
            "goal": "Prepare for Python exam",
            "status": "approved",
            "hours_per_day": 2,
            "tasks": [
                {
                    "task_id": 1,
                    "title": "Revise loops",
                    "duration_hours": 1.0,
                    "priority": "high",
                    "day": 1,
                    "status": "pending",
                }
            ],
        },
    )

    def fake_generate_reschedule(**kwargs):
        raise RuntimeError("Simulated AI failure")

    monkeypatch.setattr(
        taskpilot,
        "generate_reschedule",
        fake_generate_reschedule,
    )

    response = client.post(
        "/api/plans/123/reschedule",
        json={
            "remaining_days": 1,
            "availability": [
                {
                    "date": "2026-10-24",
                    "hours": 2,
                    "start_time": "17:00",
                    "end_time": "19:00",
                }
            ],
        },
    )

    assert response.status_code == 502
    assert "Unable to generate a reschedule proposal" in (
        response.get_json()["error"]
    )

def test_rejecting_reschedule_proposal_does_not_change_plan(
    client, monkeypatch
):
    import run as taskpilot

    original_plan = {
        "id": 123,
        "goal": "Prepare for Python exam",
        "status": "approved",
        "hours_per_day": 2,
        "tasks": [
            {
                "task_id": 1,
                "title": "Revise loops",
                "duration_hours": 1.0,
                "priority": "high",
                "day": 1,
                "status": "pending",
            }
        ],
    }

    monkeypatch.setattr(
        taskpilot,
        "get_plan",
        lambda plan_id: original_plan,
    )

    monkeypatch.setattr(
        taskpilot,
        "review_reschedule_proposal",
        lambda **kwargs: "rejected",
    )

    response = client.post(
        "/api/plans/123/reschedule/456/review",
        json={"decision": "reject"},
    )

    assert response.status_code == 200
    assert response.get_json()["status"] == "rejected"
    assert original_plan["tasks"][0]["day"] == 1
    assert original_plan["tasks"][0]["status"] == "pending"
