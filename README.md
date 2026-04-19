# QueueX — AI-Powered Adaptive Queue Orchestration System

## Overview
QueueX replaces physical queues at large sporting venues with a smart virtual queue system. Users scan a QR code, get a digital token, and are guided to the optimal stall via real-time AI-driven load balancing.

**Stack:** MongoDB · Express.js · React.js · Node.js · Firebase Admin SDK · Firestore · Google Maps · Google Analytics

---

## 🌐 Google Services Integration

This system actively uses four Google Cloud services:

| Service | Role | Where Used |
|---------|------|-----------|
| **Firebase Admin SDK** | Backend Firestore writes using `firebase-admin` | `backend/config/firebaseAdmin.js` → all queue controllers |
| **Firebase Firestore** | Real-time mirror layer — frontend subscribes via `onSnapshot` | Admin Dashboard, QueueStatus component |
| **Google Maps JavaScript API** | Interactive venue map with load-coloured stall markers | Admin Dashboard → Heatmap tab → Venue Map |
| **Google Analytics 4 (GA4)** | Tracks page views, queue joins, cancellations, admin actions | `frontend/src/services/analytics.js` |

### Firebase Admin SDK (Backend)
The backend initialises the Firebase Admin SDK in `backend/config/firebaseAdmin.js` using service account credentials from environment variables. After every queue mutation (join, rebalance, call-next, complete, cancel), a minimal snapshot is written non-blocking to Firestore:

```js
// backend/config/firebaseAdmin.js
const { writeQueueSnapshot } = require('./config/firebaseAdmin');

writeQueueSnapshot(tokenId, {
  eventId, stallId, position, estimatedWaitMinutes, status
}).catch(console.error);  // fire-and-forget — never blocks API response
```

### Firebase Firestore (Frontend Real-Time)
The Admin Dashboard and QueueStatus component subscribe to live Firestore changes:

```js
// No polling — pure push from Firestore
onSnapshot(query(collection(db, 'queueTokens'), where('eventId', '==', selectedEventId)), snapshot => {
  // updates arrive within milliseconds of backend write
});
```

### Google Maps
The **Venue Map** card in the Admin Dashboard Heatmap tab renders an interactive Google Map:
- Blue marker = event venue
- Green/Yellow/Red markers = stalls, colour-coded by load ratio
- Requires `VITE_GOOGLE_MAPS_API_KEY` — falls back to a styled placeholder if absent

### Google Analytics 4
Events tracked automatically:

| GA4 Event | Trigger |
|-----------|---------|
| `page_view` | Every route navigation |
| `queue_join` | User joins a queue (includes category + stall) |
| `queue_cancel` | User leaves a queue |
| `queue_status_view` | User views their live token |
| `admin_dashboard_view` | Admin opens dashboard for an event |
| `rebalance_trigger` | Admin triggers load rebalancing |

---

## Quick Start

### Prerequisites
- Node.js ≥ 18
- MongoDB (local or Atlas)
- Firebase project (optional — app works without it in graceful-degradation mode)

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

**Backend (`backend/.env`):**
```bash
cd backend
copy .env.example .env
# Fill in MONGODB_URI, JWT_SECRET, and FIREBASE_* credentials
```

**Frontend (`frontend/.env`):**
```bash
cd frontend
copy .env.example .env
# Fill in VITE_FIREBASE_*, VITE_GOOGLE_MAPS_API_KEY, VITE_GA_MEASUREMENT_ID
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

## Firebase Setup

Without Firebase, the app uses one-time REST fetches on mount. For full real-time features:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Firestore Database** (start in test mode)
3. **Backend:** Project Settings → Service Accounts → Generate new private key → copy values to `backend/.env`
4. **Frontend:** Project Settings → Your apps → Web → copy SDK config → paste into `frontend/.env`
5. **Google Maps:** Enable "Maps JavaScript API" in [Google Cloud Console](https://console.cloud.google.com) → copy API key to `VITE_GOOGLE_MAPS_API_KEY`
6. **Google Analytics:** Create a GA4 property → copy Measurement ID (`G-XXXXXXXXXX`) to `VITE_GA_MEASUREMENT_ID`

---

## Project Structure

```
queue_system/
├── backend/
│   ├── config/
│   │   ├── firebase.js          # Firebase Admin SDK initialisation
│   │   └── firebaseAdmin.js     # Named Admin SDK entry-point + Firestore helpers
│   ├── controllers/             # Auth, Queue, Stall, Event, Admin
│   ├── middleware/              # JWT auth, rate limiting, sanitisation
│   ├── models/                  # User, QueueToken, Stall, Event (with indexes)
│   ├── routes/                  # REST API route definitions
│   ├── services/                # Queue engine (AI) + FCM notifications
│   ├── simulation/              # Crowd simulation script
│   └── server.js                # Express app entry point
│
└── frontend/
    └── src/
        ├── components/
        │   ├── Navbar.jsx        # Accessible navigation landmark
        │   ├── QueueStatus.jsx   # Real-time token card (Firestore onSnapshot)
        │   ├── StallCard.jsx     # Keyboard-accessible stall selector
        │   └── VenueMap.jsx      # Google Maps venue + stall visualisation
        ├── context/              # AuthContext, ToastContext
        ├── firebase/             # Firebase Web SDK initialisation
        ├── hooks/                # useQueue (real-time token hook)
        ├── pages/
        │   ├── Home.jsx          # Event listing + queue join (GA4 tracked)
        │   ├── Login.jsx         # Auth
        │   ├── QueuePage.jsx     # Live token status (GA4 tracked)
        │   └── AdminDashboard.jsx# Real-time control centre (Firestore + Maps + GA4)
        └── services/
            ├── api.js            # Axios layer
            └── analytics.js      # Google Analytics 4 helpers
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

## Security

- `helmet` — HTTP secure headers
- `express-rate-limit` — 100 req / 15 min per IP on all `/api` routes
- `express-mongo-sanitize` — strips `$` and `.` from inputs (NoSQL injection prevention)
- JWT authentication on all protected routes

---

## Running Tests

```bash
cd backend
npm test                  # All test suites (unit + integration)
npm run test:integration  # End-to-end queue assignment tests
```
