---
title: Working with widgets
order: 1
published: true
---

A widget has an `id`, a `name` and a `stock` count.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable, opaque |
| `name` | string | Display name |
| `stock` | number | Units available |

1. List widgets with `GET /widgets`
2. Read one with `GET /widgets/{id}`
3. Order with `POST /widgets/orders`

See the [getting started guide](/docs/guides/getting-started) for authentication.
