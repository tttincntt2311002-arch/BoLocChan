from datetime import timedelta

from app.models.models import utcnow


def test_organization_creation_and_membership_permissions(ctx, event):
    client, headers = ctx.client, ctx.headers
    org_id = event["organization_id"]
    path = f"/api/v1/organizations/{org_id}"
    assert (
        client.post(
            "/api/v1/organizations", headers=headers["participant"], json={"name": "Intruder Org", "slug": "intruder"}
        ).status_code
        == 403
    )
    assert client.patch(path, headers=headers["outsider"], json={"name": "Hijacked"}).status_code == 403
    assert client.get(path + "/members", headers=headers["outsider"]).status_code == 403
    payload = {"user_id": ctx.users["participant"].id, "role": "organizer"}
    assert client.post(path + "/members", headers=headers["organizer"], json=payload).status_code == 409
    payload["role"] = "member"
    assert client.post(path + "/members", headers=headers["organizer"], json=payload).status_code == 201
    assert client.post(path + "/members", headers=headers["organizer"], json=payload).status_code == 409
    own_path = path + "/members/" + ctx.users["participant"].id
    assert client.patch(own_path, headers=headers["participant"], json={"role": "organizer"}).status_code == 403
    owner_path = path + "/members/" + ctx.users["organizer"].id
    assert client.delete(owner_path, headers=headers["organizer"]).status_code == 409
    assert client.patch(owner_path, headers=headers["organizer"], json={"role": "member"}).status_code == 409


def test_organization_manager_removal_revokes_event_access(ctx, event):
    path = f"/api/v1/organizations/{event['organization_id']}/members"
    outsider_id = ctx.users["outsider"].id
    response = ctx.client.post(
        path, headers=ctx.headers["organizer"], json={"user_id": outsider_id, "role": "organizer"}
    )
    assert response.status_code == 201, response.text
    event_path = f"/api/v1/events/{event['id']}"
    assert (
        ctx.client.patch(event_path, headers=ctx.headers["outsider"], json={"name": "Manager update"}).status_code
        == 200
    )
    # A delegated event manager cannot assign other organization managers.
    assert (
        ctx.client.post(path, headers=ctx.headers["outsider"], json={"user_id": ctx.users["other"].id}).status_code
        == 403
    )
    assert ctx.client.delete(path + "/" + outsider_id, headers=ctx.headers["organizer"]).status_code == 204
    assert (
        ctx.client.patch(event_path, headers=ctx.headers["outsider"], json={"name": "After removal"}).status_code == 403
    )


def test_event_visibility_filters_and_transitions(ctx, event):
    path = f"/api/v1/events/{event['id']}"
    headers, client = ctx.headers, ctx.client
    assert client.get("/api/v1/events").status_code == 401
    assert client.patch(path, headers=headers["outsider"], json={"name": "Stolen event"}).status_code == 403
    assert client.patch(path, headers=headers["participant"], json={"name": "Stolen event"}).status_code == 403
    result = client.get(
        "/api/v1/events",
        headers=headers["participant"],
        params={"q": "certificate", "status": "active", "organization_id": event["organization_id"]},
    )
    assert result.status_code == 200
    assert result.json()["total"] == 1
    assert client.get("/api/v1/events?q=absent", headers=headers["participant"]).json()["total"] == 0
    assert client.post(path + "/close", headers=headers["organizer"]).status_code == 200
    assert client.post(path + "/register", headers=headers["other"]).status_code == 409
    assert client.patch(path, headers=headers["organizer"], json={"status": "active"}).status_code == 409
    assert client.patch(path, headers=headers["organizer"], json={"status": "completed"}).status_code == 200
    assert client.patch(path, headers=headers["organizer"], json={"name": "Changed history"}).status_code == 409


def test_draft_visibility_and_safe_delete(ctx, event):
    start = utcnow() + timedelta(days=3)
    payload = {
        "organization_id": event["organization_id"],
        "name": "Secret draft",
        "start_date": start.isoformat(),
        "end_date": (start + timedelta(hours=1)).isoformat(),
    }
    draft = ctx.client.post("/api/v1/events", headers=ctx.headers["organizer"], json=payload).json()
    path = f"/api/v1/events/{draft['id']}"
    assert ctx.client.get(path, headers=ctx.headers["participant"]).status_code == 404
    assert ctx.client.get(path, headers=ctx.headers["outsider"]).status_code == 404
    assert ctx.client.get("/api/v1/events?status=draft", headers=ctx.headers["participant"]).json()["total"] == 0
    assert ctx.client.get("/api/v1/events?status=draft", headers=ctx.headers["organizer"]).json()["total"] == 1
    assert ctx.client.get("/api/v1/events?status=draft", headers=ctx.headers["admin"]).json()["total"] == 1
    assert ctx.client.delete(path, headers=ctx.headers["outsider"]).status_code == 403
    assert ctx.client.delete(path, headers=ctx.headers["organizer"]).status_code == 204
    assert ctx.client.delete(f"/api/v1/events/{event['id']}", headers=ctx.headers["organizer"]).status_code == 409


def test_event_rejects_bad_dates_and_immutable_fields(ctx, event):
    path = f"/api/v1/events/{event['id']}"
    header = ctx.headers["organizer"]
    assert ctx.client.patch(path, headers=header, json={"end_date": event["start_date"]}).status_code == 422
    assert ctx.client.patch(path, headers=header, json={"name": None}).status_code == 422
    assert ctx.client.patch(path, headers=header, json={"start_date": "2027-01-01T10:00:00"}).status_code == 422
    assert ctx.client.patch(path, headers=header, json={"organizer_id": ctx.users["outsider"].id}).status_code == 422
    assert ctx.client.patch(path, headers=header, json={"organization_id": ctx.users["outsider"].id}).status_code == 422
    assert ctx.client.get("/api/v1/events?start_from=invalid", headers=header).status_code == 422
