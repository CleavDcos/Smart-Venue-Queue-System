# QueueX — AI-Powered Adaptive Queue Orchestration System

## Overview
QueueX replaces physical queues at large sporting venues with a smart virtual queue system. Users scan a QR code, get a digital token, and are guided to the optimal stall via real-time AI-driven load balancing.

**Stack:** MongoDB · Express.js · React.js · Node.js · Firebase

---

## Quick Start

### Prerequisites
- Node.js ≥ 18
- MongoDB (local or Atlas)
- Firebase project (optional — app works without it)

---

### 1. Clone & Install

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

**Backend:**
```bash
cd backend
copy .env.example .env
# Edit .env with your MongoDB URI and JWT secret
```

**Frontend:**
```bash
cd frontend
copy .env.example .env
# Edit .env with your Firebase Web SDK config
```

### 3. Run the Application

Open **two terminals**:

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
# → Server at http://localhost:5000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# → App at http://localhost:5173
```

### 4. Run the Simulation Script

With the backend running:
```bash
cd backend
npm run simulate
```

This simulates 35 users joining queues across 6 stalls in multiple waves with automatic rebalancing.

---

## Default Admin Account

After running the simulation **or** registering manually with:
- **Email:** `admin@venue.com`
- **Password:** `Admin@123`

Change the role to `admin` directly in MongoDB:
```js
db.users.updateOne({ email: "admin@venue.com" }, { $set: { role: "admin" } })
```

---

## Firebase Setup (Optional)

Without Firebase, the app uses REST polling (10s interval). For real-time updates:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Firestore Database** (Start in test mode)
3. Enable **Cloud Messaging**
4. **Backend:** Download service account JSON → copy values to `backend/.env`
5. **Frontend:** Copy Web SDK config → paste into `frontend/.env`
6. For FCM web push, generate a VAPID key in Firebase Console → Cloud Messaging → Web Push certificates

---

## Project Structure

```
queue_system/
├── backend/
│   ├── config/          # MongoDB + Firebase Admin SDK
│   ├── controllers/     # Auth, Queue, Stall, Event, Admin
│   ├── middleware/       # JWT auth, error handler
│   ├── models/          # User, QueueToken, Stall, Event
│   ├── routes/          # REST API route definitions
│   ├── services/        # Queue engine (AI) + FCM notifications
│   ├── simulation/      # Crowd simulation script
│   └── server.js        # Express app entry point
│
└── frontend/
    └── src/
        ├── components/  # Navbar, QueueStatus, StallCard
        ├── context/     # AuthContext, ToastContext
        ├── firebase/    # Firebase Web SDK
        ├── hooks/       # useQueue (real-time)
        ├── pages/       # Home, Login, QueuePage, AdminDashboard
        └── services/    # Axios API layer
```

---

## AI Queue Engine

The queue engine (`backend/services/queueEngine.js`) uses heuristic algorithms:

| Feature | Algorithm |
|---------|-----------|
| **Stall Assignment** | Score = (load/capacity)×70 + (serviceTime/10)×30 — lowest score wins |
| **Wait Time** | `position × avgServiceTime × 1.1` (10% variability buffer) |
| **Load Balancing** | Stalls >80% → moves last N users to stalls <40% |
| **Recalculation** | After every serve/cancel, all queue positions recalculate |

---

## Running Tests / Simulation

```bash
cd backend
npm run simulate
```

Output example:
```
🏟️  AI Queue System — Crowd Simulation
═══════════════════════════════════════

✅ Admin logged in
✅ Event created: IPL Finals 2024
✅ 6 stalls created

[Pre-Match Rush] Simulating 20 users...
  🎫 User 01 → food         | North Food Court A | #3 | ~10 min
  🎫 User 02 → beverage     | East Beverage Bar  | #2 | ~3 min
  ...

📊 Dashboard Statistics
══════════════════════
  🟢 North Food Court B   [████░░░░░░░░░░░░░░░░]  35% |  5/15
  🟡 North Food Court A   [████████████░░░░░░░░]  60% |  9/15
  🔴 Main Merch Store     [████████████████████] 100% |  8/8
```
