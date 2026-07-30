---
title: Getting started
order: 0
published: true
---

Every request needs an API key:

```bash
curl -H "Authorization: Bearer $DEMO_API_KEY" https://demo.example/widgets
```

## What you get

- A `widgets` collection you can list and read
- An `orders` endpoint for creating orders
- Standard HTTP status codes — `401` for a bad key, `422` for a bad payload

> Keys are issued per integration. Rotating one takes effect immediately.
