import http from "node:http";
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";

const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsOriginFor(req) {
  const requestOrigin = req.headers.origin;
  if (!requestOrigin) return allowedOrigins[0] || "*";
  if (allowedOrigins.includes("*") || allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  return allowedOrigins[0] || requestOrigin;
}

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "stranger_chat",
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

function jsonResponse(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": body.__corsOrigin || allowedOrigins[0] || "*",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  delete body.__corsOrigin;
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

async function cleanupExpired() {
  await pool.query("DELETE FROM active_chats WHERE expires_at < NOW()");
  await pool.query("DELETE FROM waiting_pool WHERE created_at < NOW() - INTERVAL 30 MINUTE");
  await pool.query("DELETE FROM chat_events WHERE created_at < NOW() - INTERVAL 2 HOUR");
}

async function joinPool(body) {
  const sessionId = String(body.sessionId || "");
  const filters = normalizeFilters(body.filters);
  const publicKey = String(body.publicKey || "");

  if (!sessionId) return { status: 400, body: { error: "sessionId required" } };

  await cleanupExpired();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM waiting_pool WHERE session_id = ?", [sessionId]);

    const [poolRows] = await conn.query(
      "SELECT * FROM waiting_pool WHERE session_id <> ? ORDER BY created_at ASC FOR UPDATE",
      [sessionId]
    );

    let bestMatch = null;
    let bestScore = -1;

    for (const candidate of poolRows) {
      const candidateFilters = normalizeFilters(parseJson(candidate.filters, []));
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

        await conn.query("DELETE FROM waiting_pool WHERE session_id IN (?, ?)", [
          sessionId,
          bestMatch.session_id,
        ]);
        await conn.query(
          `INSERT INTO active_chats
            (id, user_a_session, user_b_session, user_a_public_key, user_b_public_key, matched_filters, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 2 HOUR))`,
          [
            chatId,
            sessionId,
            bestMatch.session_id,
            publicKey,
            bestMatch.public_key || "",
            JSON.stringify(matchedFilters),
          ]
        );

        await conn.commit();
        return {
          status: 200,
          body: {
            matched: true,
            chatId,
            peerPublicKey: bestMatch.public_key,
            matchedFilters,
            isInitiator: true,
          },
        };
      }
    }

    await conn.query(
      "INSERT INTO waiting_pool (session_id, filters, public_key) VALUES (?, ?, ?)",
      [sessionId, JSON.stringify(filters), publicKey]
    );
    await conn.commit();
    return { status: 200, body: { matched: false, status: "waiting" } };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function checkMatch(body) {
  const sessionId = String(body.sessionId || "");
  if (!sessionId) return { status: 400, body: { error: "sessionId required" } };

  await cleanupExpired();

  const [chatRows] = await pool.query(
    `SELECT * FROM active_chats
     WHERE user_a_session = ? OR user_b_session = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [sessionId, sessionId]
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
        matchedFilters: parseJson(chat.matched_filters, []),
        isInitiator: isUserA,
      },
    };
  }

  const [poolRows] = await pool.query(
    "SELECT session_id FROM waiting_pool WHERE session_id = ? LIMIT 1",
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
  const sessionId = String(body.sessionId || "");
  const chatId = body.chatId ? String(body.chatId) : "";
  if (!sessionId) return { status: 400, body: { error: "sessionId required" } };

  await pool.query("DELETE FROM waiting_pool WHERE session_id = ?", [sessionId]);
  if (chatId) {
    await pool.query("DELETE FROM active_chats WHERE id = ?", [chatId]);
  }

  return { status: 200, body: { success: true } };
}

async function reportChat(body) {
  const chatId = String(body.chatId || "");
  const reporterSession = String(body.reporterSession || "");
  const reason = String(body.reason || "");

  if (!chatId || !reporterSession) {
    return { status: 400, body: { error: "chatId and reporterSession required" } };
  }

  await pool.query(
    "INSERT INTO chat_reports (chat_id, reporter_session, reason) VALUES (?, ?, ?)",
    [chatId, reporterSession, reason]
  );

  return { status: 200, body: { success: true } };
}

async function addEvent(body) {
  const chatId = String(body.chatId || "");
  const sessionId = String(body.sessionId || "");
  const event = String(body.event || "");
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};

  if (!chatId || !sessionId || !event) {
    return { status: 400, body: { error: "chatId, sessionId, and event required" } };
  }

  await pool.query(
    "INSERT INTO chat_events (chat_id, session_id, event_name, payload) VALUES (?, ?, ?, ?)",
    [chatId, sessionId, event, JSON.stringify(payload)]
  );

  return { status: 200, body: { success: true } };
}

async function getEvents(url) {
  const chatId = url.searchParams.get("chatId") || "";
  const since = Number(url.searchParams.get("since") || 0);
  if (!chatId) return { status: 400, body: { error: "chatId required" } };

  const [rows] = await pool.query(
    `SELECT id, session_id, event_name, payload
     FROM chat_events
     WHERE chat_id = ? AND id > ?
     ORDER BY id ASC
     LIMIT 100`,
    [chatId, since]
  );

  return {
    status: 200,
    body: {
      events: rows.map((row) => ({
        id: row.id,
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
  const withCors = (body) => ({ ...body, __corsOrigin: corsOriginFor(req) });

  if (req.method === "OPTIONS") {
    jsonResponse(res, 204, withCors({}));
    return;
  }

  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
      jsonResponse(res, 200, withCors({ ok: true }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/chat/events") {
      const result = await getEvents(url);
      jsonResponse(res, result.status, withCors(result.body));
      return;
    }

    const handler = handlers[url.pathname];
    if (req.method === "POST" && handler) {
      const result = await handler(await readJson(req));
      jsonResponse(res, result.status, withCors(result.body));
      return;
    }

    jsonResponse(res, 404, withCors({ error: "Not found" }));
  } catch (error) {
    console.error(error);
    jsonResponse(res, 500, withCors({ error: "Internal server error" }));
  }
});

server.listen(port, () => {
  console.log(`MySQL chat API listening on http://localhost:${port}`);
});
