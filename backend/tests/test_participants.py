import pytest


def upload(ctx, event, content):
    return ctx.client.post(
        f"/api/v1/events/{event['id']}/participants/import",
        headers=ctx.headers["organizer"],
        files={"file": ("participants.csv", content, "text/csv")},
    )


def test_registration_duplicate_attendance_and_privacy(ctx, event):
    root = f"/api/v1/events/{event['id']}"
    client, h = ctx.client, ctx.headers
    response = client.post(root + "/register", headers=h["participant"])
    assert response.status_code == 201, response.text
    participant_id = response.json()["id"]
    assert client.post(root + "/register", headers=h["participant"]).status_code == 409
    path = root + "/participants/" + participant_id
    assert client.patch(path, headers=h["participant"], json={"status": "attended"}).status_code == 403
    assert client.patch(path, headers=h["outsider"], json={"status": "attended"}).status_code == 403
    assert client.patch(path, headers=h["organizer"], json={"status": "confirmed"}).json()["status"] == "confirmed"
    response = client.patch(path, headers=h["organizer"], json={"status": "attended"})
    assert response.json()["attended_at"] is not None
    assert client.post(root + "/register", headers=h["other"]).status_code == 201
    own = client.get(root + "/participants", headers=h["participant"]).json()
    assert own["total"] == 1 and own["items"][0]["user_id"] == ctx.users["participant"].id
    assert client.get(root + "/participants", headers=h["organizer"]).json()["total"] == 2
    assert client.get(root + "/participants", headers=h["outsider"]).json()["total"] == 0


def test_csv_import_success_bom_and_duplicates(ctx, event):
    result = upload(ctx, event, b"\xef\xbb\xbfemail\r\nparticipant@example.com\r\nother@example.com\r\n")
    assert result.status_code == 201, result.text
    assert result.json()["imported"] == 2
    assert upload(ctx, event, b"email\nparticipant@example.com\n").status_code == 409


@pytest.mark.parametrize(
    "content,status",
    [
        (b"email\nother@example.com\nmissing@example.com\n", 422),
        (b"email\nother@example.com\nOTHER@example.com\n", 409),
        (b"email\ninvalid-email\n", 422),
        (b"email\n", 422),
        (b"name\nNobody\n", 422),
        (b"email,email\nother@example.com,other@example.com\n", 422),
        (b"email\nother@example.com,unexpected\n", 422),
        (b"email\n\xff\n", 422),
        (b'email\n"unterminated\n', 422),
    ],
)
def test_csv_failure_never_imports_partial_rows(ctx, event, content, status):
    result = upload(ctx, event, content)
    assert result.status_code == status, result.text
    listing = ctx.client.get(f"/api/v1/events/{event['id']}/participants", headers=ctx.headers["organizer"])
    assert listing.json()["total"] == 0


def test_csv_size_limit_and_authorization(ctx, event):
    assert upload(ctx, event, b"x" * (1048576 + 1)).status_code == 413
    result = ctx.client.post(
        f"/api/v1/events/{event['id']}/participants/import",
        headers=ctx.headers["outsider"],
        files={"file": ("data.csv", b"email\nother@example.com\n", "text/csv")},
    )
    assert result.status_code == 403


def test_manager_adds_user_and_prevents_cross_event_attendance(ctx, event):
    root = f"/api/v1/events/{event['id']}/participants"
    response = ctx.client.post(root, headers=ctx.headers["organizer"], json={"user_id": ctx.users["other"].id})
    assert response.status_code == 201, response.text
    assert (
        ctx.client.post(root, headers=ctx.headers["organizer"], json={"user_id": ctx.users["other"].id}).status_code
        == 409
    )
    assert (
        ctx.client.patch(
            root + "/" + response.json()["id"], headers=ctx.headers["organizer"], json={"status": "absent"}
        ).json()["attended_at"]
        is None
    )
