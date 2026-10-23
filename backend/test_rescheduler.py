
import pytest

from rescheduler import validate_reschedule
import json
import rescheduler

@pytest.fixture
def original_tasks():
    return [
        {
            "task_id": 1,
            "title": "Learn Python basics",
            "day": 1,
            "duration_hours": 1,
            "priority": "high",
            "status": "completed",
        },
        {
            "task_id": 2,
            "title": "Practice Python functions",
            "day": 2,
            "duration_hours": 2,
            "priority": "medium",
            "status": "pending",
        },
        {
            "task_id": 3,
            "title": "Build a Python project",
            "day": 3,
            "duration_hours": 2,
            "priority": "low",
            "status": "pending",
        },
    ]


def test_completed_tasks_are_preserved(original_tasks):
    proposed = [
        {
            "task_id": 3,
            "title": "Build a Python project",
            "day": 1,
            "duration_hours": 2,
            "priority": "high",
        },
        {
            "task_id": 2,
            "title": "Practice Python functions",
            "day": 1,
            "duration_hours": 2,
            "priority": "medium",
        },
    ]

    result = validate_reschedule(original_tasks, proposed, 2, 4)

    completed = [task for task in result if task["status"] == "completed"]

    assert completed == [original_tasks[0]]


def test_original_tasks_are_not_mutated(original_tasks):
    import copy

    original_copy = copy.deepcopy(original_tasks)

    proposed = [
        {
            "task_id": 2,
            "title": "Practice Python functions",
            "day": 1,
            "duration_hours": 2,
            "priority": "high",
        },
        {
            "task_id": 3,
            "title": "Build a Python project",
            "day": 2,
            "duration_hours": 2,
            "priority": "medium",
        },
    ]

    validate_reschedule(original_tasks, proposed, 2, 2)

    assert original_tasks == original_copy


def test_missing_task_is_rejected(original_tasks):
    with pytest.raises(ValueError, match="every unfinished task"):
        validate_reschedule(original_tasks, [], 3, 4)


def test_task_outside_deadline_is_rejected(original_tasks):
    proposed = [
        {
            "task_id": 2,
            "title": "Practice Python functions",
            "day": 4,
            "duration_hours": 2,
            "priority": "medium",
        },
        {
            "task_id": 3,
            "title": "Build a Python project",
            "day": 1,
            "duration_hours": 2,
            "priority": "low",
        },
    ]

    with pytest.raises(ValueError, match="outside the remaining deadline"):
        validate_reschedule(original_tasks, proposed, 3, 4)


def test_daily_time_limit_is_enforced(original_tasks):
    proposed = [
        {
            "task_id": 2,
            "title": "Practice Python functions",
            "day": 1,
            "duration_hours": 2,
            "priority": "medium",
        },
        {
            "task_id": 3,
            "title": "Build a Python project",
            "day": 1,
            "duration_hours": 2,
            "priority": "low",
        },
    ]

    with pytest.raises(ValueError, match="daily time limit"):
        validate_reschedule(original_tasks, proposed, 2, 3)


def test_task_title_cannot_be_changed(original_tasks):
    proposed = [
        {
            "task_id": 2,
            "title": "Different task",
            "day": 1,
            "duration_hours": 2,
            "priority": "medium",
        },
        {
            "task_id": 3,
            "title": "Build a Python project",
            "day": 2,
            "duration_hours": 2,
            "priority": "low",
        },
    ]

    with pytest.raises(ValueError, match="title cannot be changed"):
        validate_reschedule(original_tasks, proposed, 2, 2)


def test_invalid_priority_is_rejected(original_tasks):
    proposed = [
        {
            "task_id": 2,
            "title": "Practice Python functions",
            "day": 1,
            "duration_hours": 2,
            "priority": "urgent",
        },
        {
            "task_id": 3,
            "title": "Build a Python project",
            "day": 2,
            "duration_hours": 2,
            "priority": "low",
        },
    ]

    with pytest.raises(ValueError, match="invalid priority"):
        validate_reschedule(original_tasks, proposed, 2, 2)

def test_generate_reschedule_uses_ai_and_validates_proposal(
    original_tasks, monkeypatch
):
    pending = [
        task for task in original_tasks
        if task["status"] != "completed"
    ]

    proposed = [
        {
            "task_id": task["task_id"],
            "title": task["title"],
            "day": 1 if task["task_id"] == 2 else 2,
            "duration_hours": task["duration_hours"],
            "priority": task["priority"],
        }
        for task in pending
    ]

    class FakeCompletions:
        def create(self, **kwargs):
            message = type("Message", (), {"content": json.dumps({"tasks": proposed})})()
            choice = type("Choice", (), {"message": message})()
            return type("FakeResponse", (), {"choices": [choice]})()

    class FakeClient:
        def __init__(self, api_key):
            self.chat = type("Chat", (), {"completions": FakeCompletions()})()

    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setattr(rescheduler, "Groq", FakeClient)

    result = rescheduler.generate_reschedule(
        goal="Learn Python",
        original_tasks=original_tasks,
        remaining_days=2,
        hours_per_day=2,
    )

    assert len(result["tasks"]) == 3

    completed = next(
        task for task in result["tasks"]
        if task["task_id"] == 1
    )
    assert completed == original_tasks[0]

    assert {
        task["task_id"] for task in result["tasks"]
    } == {1, 2, 3}
