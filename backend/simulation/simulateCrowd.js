/**
 * simulation/simulateCrowd.js - Crowd Load Simulation Script
 *
 * Simulates a large sporting event with multiple waves of users joining queues.
 * Useful for:
 *   - Demo/testing the queue engine's load balancing
 *   - Stress testing the API
 *   - Generating data for the admin dashboard
 *
 * Phases:
 *   1. Setup: Creates an event + stalls via API
 *   2. Wave 1: 20 users join at event start (rush)
 *   3. Rebalance: Admin triggers queue rebalancing
 *   4. Wave 2: 15 more users join (halftime rush)
 *   5. Service: Admin completes service for first batch
 *   6. Report: Print final queue state
 *
 * Usage: node simulation/simulateCrowd.js
 */

require('dotenv').config({ path: '../.env' });

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:5000/api';
const ADMIN_EMAIL = 'admin@venue.com';
const ADMIN_PASSWORD = 'Admin@123';
const USER_PASSWORD = 'User@123';

const CATEGORIES = ['food', 'beverage', 'merchandise'];

// Stall config for the simulation
const STALL_CONFIG = [
  { name: 'North Food Court A', category: 'food', location: 'North Stand, Level 1', capacity: 15, avgServiceTime: 3 },
  { name: 'North Food Court B', category: 'food', location: 'North Stand, Level 2', capacity: 10, avgServiceTime: 4 },
  { name: 'South Food Court', category: 'food', location: 'South Stand, Gate 7', capacity: 20, avgServiceTime: 2.5 },
  { name: 'East Beverage Bar', category: 'beverage', location: 'East Stand, Level 1', capacity: 12, avgServiceTime: 1.5 },
  { name: 'West Beverage Bar', category: 'beverage', location: 'West Stand, Gate 2', capacity: 15, avgServiceTime: 2 },
  { name: 'Main Merch Store', category: 'merchandise', location: 'Main Entrance, Lobby', capacity: 8, avgServiceTime: 5 },
];

// ─── Utility Helpers ──────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

const log = (emoji, msg) => console.log(`${emoji}  ${msg}`);

let adminToken = '';
let eventId = '';
let stallIds = [];
let userTokens = [];

// ─── Step 1: Admin Login ──────────────────────────────────────────────────────

async function setupAdmin() {
  log('🔐', 'Setting up admin account...');
  try {
    // Try to register admin
    await axios.post(`${BASE_URL}/auth/register`, {
      name: 'Venue Admin',
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
    });
    log('✅', 'Admin registered');
  } catch {
    log('ℹ️ ', 'Admin already exists, logging in...');
  }

  const { data } = await axios.post(`${BASE_URL}/auth/login`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  adminToken = data.data.token;
  log('✅', `Admin logged in (token: ${adminToken.substring(0, 20)}...)`);
}

// ─── Step 2: Create Event ─────────────────────────────────────────────────────

async function createEvent() {
  log('🏟️ ', 'Creating sporting event...');
  const { data } = await axios.post(
    `${BASE_URL}/events`,
    {
      name: 'IPL Finals 2024 — Mumbai vs Bangalore',
      venue: 'Wankhede Stadium',
      description: 'Final match of the season',
      date: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
      expectedCapacity: 45000,
    },
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );

  eventId = data.data.event._id;
  log('✅', `Event created: ${data.data.event.name} (ID: ${eventId})`);

  // Activate the event
  await axios.put(
    `${BASE_URL}/events/${eventId}/status`,
    { status: 'active' },
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  log('✅', 'Event status set to active');
}

// ─── Step 3: Create Stalls ────────────────────────────────────────────────────

async function createStalls() {
  log('🏪', `Creating ${STALL_CONFIG.length} stalls...`);
  for (const stallConfig of STALL_CONFIG) {
    const { data } = await axios.post(
      `${BASE_URL}/stalls`,
      { ...stallConfig, eventId, navigationInstructions: `Head to ${stallConfig.location}. Look for the blue signs.` },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    stallIds.push(data.data.stall._id);
    log('  ✅', `${stallConfig.name} (${stallConfig.category}, cap: ${stallConfig.capacity})`);
  }
}

// ─── Step 4: Register & Join Queue (Simulated Users) ─────────────────────────

async function simulateUsers(count, label) {
  log('👥', `\n[${label}] Simulating ${count} users joining queues...`);
  console.log('─'.repeat(60));

  const promises = [];

  for (let i = 1; i <= count; i++) {
    const userId = `sim_${Date.now()}_${i}`;
    const category = randomItem(CATEGORIES);

    const task = async () => {
      try {
        // Register user
        const email = `user_${userId}@sim.com`;
        let token;

        try {
          const reg = await axios.post(`${BASE_URL}/auth/register`, {
            name: `SimUser ${userId}`,
            email,
            password: USER_PASSWORD,
          });
          token = reg.data.data.token;
        } catch {
          const login = await axios.post(`${BASE_URL}/auth/login`, { email, password: USER_PASSWORD });
          token = login.data.data.token;
        }

        // Join queue
        const res = await axios.post(
          `${BASE_URL}/queue/join`,
          { eventId, category },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const t = res.data.data.token;
        userTokens.push({ authToken: token, tokenId: t._id });

        log(
          '  🎫',
          `User ${i.toString().padStart(2, '0')} → ${category.padEnd(12)} | ${t.stall.name} | #${t.position} | ~${t.estimatedWaitMinutes} min`
        );
      } catch (error) {
        log('  ❌', `User ${i} failed: ${error.response?.data?.message || error.message}`);
      }
    };

    promises.push(task());

    // Stagger requests to avoid overwhelming the server
    if (i % 5 === 0) await sleep(200);
  }

  await Promise.all(promises);
}

// ─── Step 5: Trigger Rebalancing ─────────────────────────────────────────────

async function triggerRebalance() {
  log('\n⚖️ ', 'Triggering queue rebalancing...');
  const { data } = await axios.post(
    `${BASE_URL}/admin/rebalance/${eventId}`,
    {},
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  log('✅', `Rebalance result: moved ${data.data.moved} user(s)`);
  if (data.data.changes?.length) {
    data.data.changes.forEach((c) => {
      log('  🔄', `${c.tokenNumber}: ${c.from} → ${c.to}`);
    });
  }
}

// ─── Step 6: Print Dashboard Stats ────────────────────────────────────────────

async function printDashboard(label) {
  log('\n📊', `[${label}] Dashboard Statistics`);
  console.log('═'.repeat(60));

  const { data } = await axios.get(`${BASE_URL}/admin/dashboard/${eventId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  const { overview, stalls } = data.data;
  console.log(`  Event: ${data.data.event.name}`);
  console.log(`  Total in queue: ${overview.totalInQueue}`);
  console.log(`  Total served:   ${overview.totalServed}`);
  console.log(`  Avg wait:       ${overview.avgWaitMinutes} min`);
  console.log(`  Open stalls:    ${overview.openStalls}/${overview.totalStalls}`);
  console.log('');
  console.log('  Stall Load Heatmap:');
  console.log('  ' + '─'.repeat(56));

  stalls.forEach((stall) => {
    const loadPct = Math.round(stall.loadRatio * 100);
    const heatChar = loadPct >= 80 ? '🔴' : loadPct >= 50 ? '🟡' : '🟢';
    const bar = '█'.repeat(Math.round(stall.loadRatio * 20)).padEnd(20, '░');
    console.log(
      `  ${heatChar} ${stall.name.padEnd(22)} [${bar}] ${loadPct.toString().padStart(3)}% | ${stall.currentLoad}/${stall.capacity} | ~${stall.estimatedWaitMinutes}min`
    );
  });
  console.log('═'.repeat(60));
}

// ─── Step 7: Simulate Service Completion ─────────────────────────────────────

async function simulateServiceCompletion(count) {
  log('\n✅', `Simulating service completion for ${count} tokens...`);

  // Get serving/waiting tokens via admin
  for (let i = 0; i < Math.min(count, stallIds.length); i++) {
    try {
      // Call next user for each stall
      const callRes = await axios.post(
        `${BASE_URL}/queue/call-next/${stallIds[i]}`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const tokenId = callRes.data.data.token._id;
      log('  📞', `Called token ${callRes.data.data.token.tokenNumber} to stall`);

      // Complete service
      await sleep(100);
      await axios.post(
        `${BASE_URL}/queue/complete/${tokenId}`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      log('  ✅', `Completed service for token ${callRes.data.data.token.tokenNumber}`);
    } catch (error) {
      log('  ⚠️ ', `Service completion skip: ${error.response?.data?.message || error.message}`);
    }
  }
}

// ─── Main Runner ──────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '█'.repeat(60));
  console.log('  🏟️  AI Queue System — Crowd Simulation');
  console.log(`  📍 Target: ${BASE_URL}`);
  console.log('█'.repeat(60) + '\n');

  try {
    // Phase 1: Setup
    await setupAdmin();
    await sleep(300);
    await createEvent();
    await sleep(300);
    await createStalls();
    await sleep(500);

    // Phase 2: Pre-match rush (Wave 1)
    await simulateUsers(20, 'Pre-Match Rush');
    await sleep(500);
    await printDashboard('After Wave 1');

    // Phase 3: Rebalance
    await sleep(300);
    await triggerRebalance();
    await sleep(300);
    await printDashboard('After Rebalance');

    // Phase 4: Halftime rush (Wave 2)
    await simulateUsers(15, 'Halftime Rush');
    await sleep(500);
    await printDashboard('After Wave 2');

    // Phase 5: Service completions
    await simulateServiceCompletion(6);
    await sleep(300);
    await printDashboard('Final State');

    console.log('\n✅ Simulation complete! Check /api/admin/dashboard for live data.\n');
  } catch (error) {
    console.error('\n❌ Simulation failed:', error.response?.data || error.message);
    console.error('Make sure the backend server is running (npm run dev)');
    process.exit(1);
  }
}

main();
