
import database


def test_accepting_proposal_updates_saved_plan(tmp_path, monkeypatch):
    """Accepting a valid proposal updates SQLite and preserves completed tasks."""

    # Give this test its own database so real plans remain untouched.
    test_db = tmp_path / "test_taskpilot.db"
    monkeypatch.setattr(database, "DB_PATH", test_db)
    database.initialize_db()

    plan_id = database.save_plan({
        "goal": "Prepare for Python exam",
        "days_available": 5,
        "hours_per_day": 2,
        "tasks": [
            {
                "task_id": 1,
                "title": "Revise loops",
                "day": 1,
                "duration_hours": 1.0,
                "priority": "high",
                "status": "completed",
            },
            {
                "task_id": 2,
                "title": "Practice functions",
                "day": 2,
                "duration_hours": 1.0,
                "priority": "medium",
                "status": "pending",
            },
        ],
    })

    assert database.update_plan_status(plan_id, "approved") == 1

    original_plan = database.get_plan(plan_id)
    original_tasks = original_plan["tasks"]

    proposal_id = database.save_reschedule_proposal(
        plan_id=plan_id,
        proposed_tasks=[
            {
                "task_id": 2,
                "title": "Practice functions",
                "day": 3,
                "duration_hours": 1.0,
                "priority": "high",
            }
        ],
        original_tasks=original_tasks,
        remaining_days=4,
    )

    result = database.review_reschedule_proposal(
        plan_id=plan_id,
        proposal_id=proposal_id,
        decision="accept",
    )

    assert result == "accepted"

    updated_plan = database.get_plan(plan_id)
    tasks_by_id = {
        task["task_id"]: task
        for task in updated_plan["tasks"]
    }

    # The completed task must remain unchanged.
    assert tasks_by_id[1] == original_tasks[0]

    # The pending task receives the proposed schedule.
    assert tasks_by_id[2]["day"] == 3
    assert tasks_by_id[2]["priority"] == "high"
    assert tasks_by_id[2]["duration_hours"] == 1.0
    assert tasks_by_id[2]["status"] == "pending"

    saved_proposal = database.get_reschedule_proposal(
        plan_id,
        proposal_id,
    )
    assert saved_proposal["status"] == "accepted"

def test_rejecting_proposal_keeps_saved_plan_unchanged(
    tmp_path, monkeypatch
):
    """Rejecting a proposal must not modify the saved tasks."""

    test_db = tmp_path / "test_reject_proposal.db"
    monkeypatch.setattr(database, "DB_PATH", test_db)
    database.initialize_db()

    plan_id = database.save_plan({
        "goal": "Prepare for Python exam",
        "days_available": 5,
        "hours_per_day": 2,
        "tasks": [
            {
                "task_id": 1,
                "title": "Revise loops",
                "day": 1,
                "duration_hours": 1.0,
                "priority": "high",
                "status": "pending",
            }
        ],
    })

    assert database.update_plan_status(plan_id, "approved") == 1

    original_tasks = database.get_plan(plan_id)["tasks"]

    proposal_id = database.save_reschedule_proposal(
        plan_id=plan_id,
        proposed_tasks=[
            {
                "task_id": 1,
                "title": "Revise loops",
                "day": 3,
                "duration_hours": 1.0,
                "priority": "low",
            }
        ],
        original_tasks=original_tasks,
        remaining_days=4,
    )

    result = database.review_reschedule_proposal(
        plan_id=plan_id,
        proposal_id=proposal_id,
        decision="reject",
    )

    assert result == "rejected"

    updated_tasks = database.get_plan(plan_id)["tasks"]
    assert updated_tasks == original_tasks

    saved_proposal = database.get_reschedule_proposal(
        plan_id,
        proposal_id,
    )
    assert saved_proposal["status"] == "rejected"

def test_stale_proposal_cannot_overwrite_newer_plan(
    tmp_path, monkeypatch
):
    """An outdated proposal must not overwrite newer task changes."""

    test_db = tmp_path / "test_stale_proposal.db"
    monkeypatch.setattr(database, "DB_PATH", test_db)
    database.initialize_db()

    plan_id = database.save_plan({
        "goal": "Prepare for Python exam",
        "days_available": 5,
        "hours_per_day": 2,
        "tasks": [
            {
                "task_id": 1,
                "title": "Revise loops",
                "day": 1,
                "duration_hours": 1.0,
                "priority": "high",
                "status": "pending",
            }
        ],
    })

    assert database.update_plan_status(plan_id, "approved") == 1

    original_tasks = database.get_plan(plan_id)["tasks"]

    proposal_id = database.save_reschedule_proposal(
        plan_id=plan_id,
        proposed_tasks=[
            {
                "task_id": 1,
                "title": "Revise loops",
                "day": 3,
                "duration_hours": 1.0,
                "priority": "low",
            }
        ],
        original_tasks=original_tasks,
        remaining_days=4,
    )

    # Simulate another update to the saved plan after the proposal
    # was generated.
    changed_tasks = [
        {
            **original_tasks[0],
            "day": 2,
            "priority": "medium",
        }
    ]

    with database.get_connection() as connection:
        connection.execute(
            "UPDATE plans SET tasks_json = ? WHERE id = ?",
            (database.json.dumps(changed_tasks), plan_id),
        )

    result = database.review_reschedule_proposal(
        plan_id=plan_id,
        proposal_id=proposal_id,
        decision="accept",
    )

    assert result == "proposal_stale"

    # The newer task details must remain untouched.
    assert database.get_plan(plan_id)["tasks"] == changed_tasks

    # The stale proposal must not be marked as accepted.
    saved_proposal = database.get_reschedule_proposal(
        plan_id,
        proposal_id,
    )
    assert saved_proposal["status"] == "pending"
