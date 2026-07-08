import { activateSession } from "../../../install/hooks/lib/session-store.mjs";

const [, , cursorHome, conversationId] = process.argv;
process.env.CURSOR_HOME = cursorHome;

const LOCK_POLL_MS = Number(process.env.KODAELUS_STORE_LOCK_POLL_MS) || 10;
const maxAttempts = 12;

function sleepSync(ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    // Match session-store lock poll interval.
  }
}

let lastError;

for (let attempt = 0; attempt < maxAttempts; attempt++) {
  try {
    activateSession(conversationId);
    process.exit(0);
  } catch (err) {
    lastError = err;
    if (attempt < maxAttempts - 1) {
      sleepSync(LOCK_POLL_MS);
    }
  }
}

console.error(lastError);
process.exit(1);
