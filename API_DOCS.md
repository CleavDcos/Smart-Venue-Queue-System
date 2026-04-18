# QueueX API Documentation

Base URL: `http://localhost:5000/api`

All protected routes require:
```
Authorization: Bearer <jwt_token>
```

---

## Authentication

### POST `/auth/register`
Register a new user.

**Body:**
```json
{ "name": "Rahul Sharma", "email": "rahul@example.com", "password": "mypass123" }
```
**Response 201:**
```json
{
  "success": true,
  "data": {
    "user": { "_id": "...", "name": "Rahul Sharma", "email": "rahul@example.com", "role": "user" },
    "token": "eyJhbGciOiJIUzI1NiJ9..."
  }
}
```

---

### POST `/auth/login`
**Body:**
```json
{ "email": "rahul@example.com", "password": "mypass123" }
```
**Response 200:** Same structure as register.

---

### GET `/auth/me` 🔒
Returns the current authenticated user's profile.

---

### PUT `/auth/fcm-token` 🔒
Update Firebase Cloud Messaging token for push notifications.

**Body:** `{ "fcmToken": "fcm_device_token_string" }`

---

## Events

### GET `/events`
List all events. Optional query: `?status=active`

**Response:**
```json
{ "success": true, "data": { "events": [...] } }
```

### GET `/events/:id`
Get single event details.

### POST `/events` 🔒 Admin
Create a new event.

**Body:**
```json
{
  "name": "IPL Finals 2024",
  "venue": "Wankhede Stadium",
  "date": "2024-05-26T19:00:00.000Z",
  "expectedCapacity": 45000,
  "description": "Season finale"
}
```
**Response 201:** Returns event object with generated QR code.

### PUT `/events/:id/status` 🔒 Admin
**Body:** `{ "status": "active" }` — values: `upcoming | active | closed`

### DELETE `/events/:id` 🔒 Admin

---

## Stalls

### GET `/stalls/event/:eventId`
Get all stalls for an event (public). Returns stalls with current load and wait times.

### GET `/stalls/:id`
Single stall details.

### POST `/stalls` 🔒 Admin
Create a stall.

**Body:**
```json
{
  "name": "North Food Court A",
  "category": "food",
  "location": "North Stand, Level 1",
  "navigationInstructions": "Follow blue signs from Gate 3",
  "capacity": 15,
  "avgServiceTime": 3,
  "eventId": "<eventId>"
}
```

**Categories:** `food | beverage | merchandise | medical | information`

### PUT `/stalls/:id` 🔒 Admin
Update stall fields.

### PUT `/stalls/:id/toggle` 🔒 Admin
Toggle stall open/closed status.

### DELETE `/stalls/:id` 🔒 Admin

---

## Queue

### POST `/queue/join` 🔒
Join the virtual queue. The AI engine automatically assigns the optimal stall.

**Body:**
```json
{ "eventId": "<eventId>", "category": "food", "notes": "vegetarian only" }
```

**Response 201:**
```json
{
  "success": true,
  "message": "Joined queue successfully! You are #3 at North Food Court A",
  "data": {
    "token": {
      "_id": "...",
      "tokenNumber": "FOOD-003",
      "qrCode": "data:image/png;base64,...",
      "position": 3,
      "estimatedWaitMinutes": 10,
      "status": "waiting",
      "stall": {
        "name": "North Food Court A",
        "location": "North Stand, Level 1",
        "navigationInstructions": "Follow blue signs from Gate 3",
        "category": "food"
      }
    }
  }
}
```

---

### GET `/queue/my-token` 🔒
Get the current user's active token (waiting or serving).

**Response:**
```json
{
  "success": true,
  "data": {
    "token": {
      "_id": "...", "tokenNumber": "FOOD-003",
      "position": 2, "estimatedWaitMinutes": 7,
      "status": "waiting",
      "stallId": { "name": "...", "location": "...", "navigationInstructions": "..." },
      "eventId": { "name": "IPL Finals 2024", "venue": "Wankhede Stadium" }
    }
  }
}
```

---

### GET `/queue/history` 🔒
Get the user's last 20 queue tokens.

---

### POST `/queue/cancel` 🔒
Cancel the user's active (waiting) token. Triggers queue position recalculation.

---

### POST `/queue/call-next/:stallId` 🔒 Admin
Call the next waiting user to a stall. Sends a push notification.

**Response:**
```json
{ "success": true, "message": "Called Rahul to stall", "data": { "token": {...} } }
```

---

### POST `/queue/complete/:tokenId` 🔒 Admin
Mark a token's service as complete. Recalculates queue, increments stall served count.

---

### GET `/queue/stall/:stallId` 🔒 Admin
Get all waiting/serving tokens for a stall.

---

## Admin

### GET `/admin/dashboard/:eventId` 🔒 Admin
Live dashboard snapshot.

**Response:**
```json
{
  "success": true,
  "data": {
    "event": { "name": "...", "venue": "...", "status": "active" },
    "overview": {
      "totalInQueue": 15,
      "totalServed": 42,
      "totalCancelled": 3,
      "avgWaitMinutes": 8,
      "openStalls": 5,
      "totalStalls": 6
    },
    "tokenSummary": { "waiting": 12, "serving": 3, "done": 42, "cancelled": 3 },
    "stalls": [
      {
        "_id": "...", "name": "North Food Court A",
        "currentLoad": 9, "capacity": 15,
        "loadRatio": 0.6, "heatLevel": 0.6,
        "estimatedWaitMinutes": 28,
        "totalServed": 18, "isOpen": true
      }
    ]
  }
}
```

---

### GET `/admin/analytics/:eventId` 🔒 Admin
Historical analytics: hourly throughput, category breakdown, per-stall service metrics.

---

### POST `/admin/rebalance/:eventId` 🔒 Admin
Trigger AI rebalancing — moves users from overloaded stalls to underloaded ones.

**Response:**
```json
{
  "success": true,
  "message": "Rebalancing complete. Moved 3 user(s).",
  "data": {
    "moved": 3,
    "changes": [
      { "tokenNumber": "FOOD-018", "from": "North Food Court A", "to": "South Food Court" }
    ]
  }
}
```

---

### POST `/admin/broadcast/:eventId` 🔒 Admin
Send push notification to all active users at the event.

**Body:** `{ "title": "Halftime!", "message": "All stalls now open. Shorter queues at South stands." }`

---

### GET `/admin/users` 🔒 Admin
Paginated user list. Query: `?page=1&limit=20`

---

## Error Responses

All errors follow this format:
```json
{ "success": false, "message": "Human-readable error description" }
```

| Code | Meaning |
|------|---------|
| 400 | Validation error |
| 401 | Unauthenticated |
| 403 | Unauthorized (not admin) |
| 404 | Resource not found |
| 409 | Conflict (duplicate) |
| 500 | Internal server error |
