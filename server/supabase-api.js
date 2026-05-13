import "dotenv/config";
import http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  host: connectionString ? undefined : process.env.PGHOST || "localhost",
  port: connectionString ? undefined : Number(process.env.PGPORT || 5432),
  user: connectionString ? undefined : process.env.PGUSER || "postgres",
  password: connectionString ? undefined : process.env.PGPASSWORD || "",
  database: connectionString ? undefined : process.env.PGDATABASE || "postgres",
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  max: 10,
});

function corsOriginFor(req) {
  const requestOrigin = req.headers.origin;
  if (!requestOrigin) return allowedOrigins[0] || "*";
  if (allowedOrigins.includes("*") || allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  return allowedOrigins[0] || requestOrigin;
}

function jsonResponse(req, res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": corsOriginFor(req),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeFilters(filters) {
  return Array.isArray(filters)
    ? filters.map((filter) => String(filter).trim()).filter(Boolean)
    : [];
}

function normalizeUuid(value) {
  const id = String(value || "");
  return id || null;
}

function normalizeMode(value) {
  return value === "video" ? "video" : "chat";
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function calculateSimilarity(filtersA, filtersB) {
  if (filtersA.length === 0 && filtersB.length === 0) return 100;
  if (filtersA.length === 0 || filtersB.length === 0) return 0;

  const setA = new Set(filtersA.map((filter) => filter.toLowerCase()));
  const setB = new Set(filtersB.map((filter) => filter.toLowerCase()));
  let matches = 0;

  for (const tag of setA) {
    if (setB.has(tag)) matches += 1;
  }

  return (matches / Math.max(setA.size, setB.size)) * 100;
}

function matchedFiltersFor(filtersA, filtersB) {
  return filtersA.filter((filter) =>
    filtersB.some((candidate) => candidate.toLowerCase() === filter.toLowerCase())
  );
}

async function cleanupExpired(client = pool) {
  await client.query("DELETE FROM active_chats WHERE expires_at < NOW()");
  await client.query("DELETE FROM waiting_pool WHERE created_at < NOW() - INTERVAL '30 minutes'");
  await client.query("DELETE FROM chat_events WHERE created_at < NOW() - INTERVAL '2 hours'");
}

async function joinPool(body) {
  const sessionId = normalizeUuid(body.sessionId);
  const filters = normalizeFilters(body.filters);
  const publicKey = String(body.publicKey || "");
  const mode = normalizeMode(body.mode);

  if (!sessionId) return { status: 400, body: { error: "sessionId required" } };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await cleanupExpired(client);
    await client.query("DELETE FROM waiting_pool WHERE session_id = $1", [sessionId]);

    const { rows: poolRows } = await client.query(
      "SELECT * FROM waiting_pool WHERE session_id <> $1 AND mode = $2 ORDER BY created_at ASC FOR UPDATE",
      [sessionId, mode]
    );

    let bestMatch = null;
    let bestScore = -1;

    for (const candidate of poolRows) {
      const candidateFilters = normalizeFilters(candidate.filters);
      const score = calculateSimilarity(filters, candidateFilters);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { ...candidate, filters: candidateFilters };
      }
    }

    if (bestMatch) {
      const bothNoFilters = filters.length === 0 && bestMatch.filters.length === 0;
      const hasFilterMatch = bestScore > 0;

      if (bothNoFilters || hasFilterMatch) {
        const chatId = randomUUID();
        const matchedFilters = matchedFiltersFor(filters, bestMatch.filters);

        await client.query("DELETE FROM waiting_pool WHERE session_id = ANY($1::uuid[])", [
          [sessionId, bestMatch.session_id],
        ]);
        await client.query(
          `INSERT INTO active_chats
            (id, user_a_session, user_b_session, user_a_public_key, user_b_public_key, matched_filters, mode, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '2 hours')`,
          [
            chatId,
            sessionId,
            bestMatch.session_id,
            publicKey,
            bestMatch.public_key || "",
            matchedFilters,
            mode,
          ]
        );

        await client.query("COMMIT");
        return {
          status: 200,
          body: {
            matched: true,
            chatId,
            peerPublicKey: bestMatch.public_key,
            matchedFilters,
            isInitiator: true,
            mode,
          },
        };
      }
    }

    await client.query(
      "INSERT INTO waiting_pool (session_id, filters, public_key, mode) VALUES ($1, $2, $3, $4)",
      [sessionId, filters, publicKey, mode]
    );
    await client.query("COMMIT");
    return { status: 200, body: { matched: false, status: "waiting" } };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function checkMatch(body) {
  const sessionId = normalizeUuid(body.sessionId);
  if (!sessionId) return { status: 400, body: { error: "sessionId required" } };

  await cleanupExpired();

  const { rows: chatRows } = await pool.query(
    `SELECT * FROM active_chats
     WHERE user_a_session = $1 OR user_b_session = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [sessionId]
  );
  const chat = chatRows[0];

  if (chat) {
    const isUserA = chat.user_a_session === sessionId;
    return {
      status: 200,
      body: {
        matched: true,
        chatId: chat.id,
        peerPublicKey: isUserA ? chat.user_b_public_key : chat.user_a_public_key,
        matchedFilters: normalizeFilters(chat.matched_filters),
        isInitiator: isUserA,
        mode: normalizeMode(chat.mode),
      },
    };
  }

  const { rows: poolRows } = await pool.query(
    "SELECT session_id FROM waiting_pool WHERE session_id = $1 LIMIT 1",
    [sessionId]
  );

  return {
    status: 200,
    body: poolRows.length > 0
      ? { matched: false, status: "waiting" }
      : { matched: false, status: "not_in_pool" },
  };
}

async function leaveChat(body) {
  const sessionId = normalizeUuid(body.sessionId);
  const chatId = body.chatId ? normalizeUuid(body.chatId) : null;
  if (!sessionId) return { status: 400, body: { error: "sessionId required" } };

  await pool.query("DELETE FROM waiting_pool WHERE session_id = $1", [sessionId]);
  if (chatId) {
    await pool.query("DELETE FROM active_chats WHERE id = $1", [chatId]);
  }

  return { status: 200, body: { success: true } };
}

async function reportChat(body) {
  const chatId = normalizeUuid(body.chatId);
  const reporterSession = normalizeUuid(body.reporterSession);
  const reason = String(body.reason || "");

  if (!chatId || !reporterSession) {
    return { status: 400, body: { error: "chatId and reporterSession required" } };
  }

  await pool.query(
    "INSERT INTO chat_reports (chat_id, reporter_session, reason) VALUES ($1, $2, $3)",
    [chatId, reporterSession, reason]
  );

  return { status: 200, body: { success: true } };
}

async function addEvent(body) {
  const chatId = normalizeUuid(body.chatId);
  const sessionId = normalizeUuid(body.sessionId);
  const event = String(body.event || "");
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};

  if (!chatId || !sessionId || !event) {
    return { status: 400, body: { error: "chatId, sessionId, and event required" } };
  }

  await pool.query(
    "INSERT INTO chat_events (chat_id, session_id, event_name, payload) VALUES ($1, $2, $3, $4)",
    [chatId, sessionId, event, JSON.stringify(payload)]
  );

  return { status: 200, body: { success: true } };
}

async function getEvents(url) {
  const chatId = normalizeUuid(url.searchParams.get("chatId"));
  const since = Number(url.searchParams.get("since") || 0);
  if (!chatId) return { status: 400, body: { error: "chatId required" } };

  const { rows } = await pool.query(
    `SELECT id, session_id, event_name, payload
     FROM chat_events
     WHERE chat_id = $1 AND id > $2
     ORDER BY id ASC
     LIMIT 100`,
    [chatId, since]
  );

  return {
    status: 200,
    body: {
      events: rows.map((row) => ({
        id: Number(row.id),
        sessionId: row.session_id,
        event: row.event_name,
        payload: parseJson(row.payload, {}),
      })),
    },
  };
}

const handlers = {
  "/api/match/join": joinPool,
  "/api/match/check": checkMatch,
  "/api/match/leave": leaveChat,
  "/api/match/report": reportChat,
  "/api/chat/events": addEvent,
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    jsonResponse(req, res, 204, {});
    return;
  }

  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
      jsonResponse(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/chat/events") {
      const result = await getEvents(url);
      jsonResponse(req, res, result.status, result.body);
      return;
    }

    const handler = handlers[url.pathname];
    if (req.method === "POST" && handler) {
      const result = await handler(await readJson(req));
      jsonResponse(req, res, result.status, result.body);
      return;
    }

    jsonResponse(req, res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    jsonResponse(req, res, 500, { error: "Internal server error" });
  }
});

server.listen(port, () => {
  console.log(`Supabase chat API listening on http://localhost:${port}`);
});
