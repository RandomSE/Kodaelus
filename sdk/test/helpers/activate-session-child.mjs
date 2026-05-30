import { activateSession } from "../../../install/hooks/lib/session-store.mjs";

const [, , cursorHome, conversationId] = process.argv;
process.env.CURSOR_HOME = cursorHome;
activateSession(conversationId);
