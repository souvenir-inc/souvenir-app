# Dashboard warehouse API: back-end fixes

**Date:** 2026-11-24
**Area:** `back-end/services/warehouse/` (`router.py`, `schemas.py`, `client.py`), `core/config.py`
**Reference:** the API spec `front-end/docs-v2/dashboard-api.yaml`
**Tracked in:** souvenir-server#628 (the full ticket, including the security items)
**Found by:** a read-only review of the back-end code against the front end and the spec. Nothing below has been reproduced against a running server.

The dashboard's calls all reach a matching route, and the data shapes mostly line up. The issues below are about safety, error handling and the spec falling behind the code. The front end has already been made tolerant where it could be (it accepts any sync status, count metrics without `column`/`where`, and a summary without `defaultBoard`).

---

## Security

BE-1 to BE-3 (organization check, role checks, path escaping) are tracked privately in souvenir-server#628, not in this public repo.

---

## Errors and config

### BE-4. A missing warehouse secret crashes with a raw 500
- **Where:** `client.py` ~25-28. `core/config.py` ~84-85 reads `WAREHOUSE_BASE_URL` (default empty) and `WAREHOUSE_API_SECRET` (no default).
- **Problem:** with the URL set but no secret, `jwt.encode(..., None)` throws.
- **Fix:** treat a missing secret the same as a missing URL (503 "not configured"), or fail at startup.

### BE-5. Upstream refusals without a JSON `detail` become 500s
- **Where:** `client.py` ~37-38 calls `response.json()["detail"]` on 403, 404, 409 and 422.
- **Problem:** if the body is empty, HTML, or JSON without `detail`, the back end crashes instead of passing the real status through.
- **Fix:** pass the status through with a fallback detail (`response.text` or a generic message).

### BE-6. Metric definitions aren't checked
- **Where:** `schemas.py` `MetricEntry.value` and `CustomMetricRequest.value` are `dict[str, Any]` (~lines 66, 78).
- **Problem:** the spec allows only an Aggregate (`kind`: `sum` | `count`) or an Expression (`add`, `subtract`, `multiply`, `ratio`; `add` and `multiply` need at least 2 terms). Nothing enforces this.
- **Fix:** model the union in Pydantic, at least on the request, so a bad definition is refused with a 422 instead of reaching the front end.

### BE-7. "No organization" is a 404, the same code as a missing warehouse
- **Where:** `router.py` ~line 54: "Join an organization first".
- **Problem:** the front end can't tell this apart from a failed load without parsing the message text.
- **Fix:** use a distinct status or a machine-readable code, and note it in the spec.

### BE-9. Boards need a version so concurrent edits don't overwrite each other
- **Where:** `PUT /{id}/boards/{boardId}` takes the whole board and replaces it; there is no version or ETag.
- **Problem:** two people editing the same board: the last write wins, silently. The front end now saves on its own (800 ms after a change, on leaving the board, and retrying after a failure), so a stale copy can overwrite newer work without anyone pressing anything.
- **Fix:** return a version (or `updatedAt` as an ETag) with each board, accept `If-Match` on PUT, and answer 409 when it no longer matches. The front end will then offer Reload or Overwrite.

---

## Small

### BE-8. The Slack upload is always labelled PNG
- **Where:** `router.py` ~line 266.
- **Problem:** `"image/png"` is hard-coded whatever the upload's content type.
- **Fix:** use `image.content_type`, or reject non-PNG uploads.

---

## The spec is behind the code

The back end and front end agree on all of these; only `dashboard-api.yaml` is out of date. Please bring the spec up to date (owner: whoever maintains the spec):

1. **Missing routes:**
   - `GET /warehouse/slack/channels`
   - `PUT /warehouse/{id}/default-board` (admin only, 403 otherwise)
   - `POST /warehouse/{id}/boards/draft` (the Ask the AI board conversation)
   - `POST /warehouse/{id}/boards/{boardId}/slack` (multipart: `image`, `channelId`, `text`; 204; 409 when Slack isn't connected; 502 when Slack refuses)
2. **`WarehouseSummary.defaultBoard`** (uuid or null) is missing.
3. **Units:** the `Unit` list is missing `percent`.
4. **Board sharing model:** the spec still has `shared: boolean` (default false). The code has:
   - `general`: none | view | edit, **defaulting to `view`** (new boards are visible to every member, the opposite of the spec's default)
   - `grants`: a list of `{userId, role: view|edit}`
   - a read-only `role` on each board: owner | edit | view
   - a 422 when a grant names someone who isn't a member

   The `GET /boards` description ("shared boards plus the viewer's own") also needs updating. Please confirm the `view` default is intended.
5. **Schema names:** the spec calls the draft request `MetricChatRequest`/`MetricChatMessage`; the code calls it `DraftRequest`/`DraftMessage`, and it is shared with `/boards/draft`.
6. **Errors:** the back end's own 422s from request validation, where `detail` is an array, aren't described in the spec.

---

## Not a back-end issue, for context

- **Several warehouses:** the dashboard uses only the first warehouse an organization has, although the back end supports several.
- **Creating a warehouse:** nothing in the front end creates one. One must already exist from linking the store connection (`connectors/connection.py` ~173).
