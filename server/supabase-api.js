import "dotenv/config";
import http from "node:http";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const openAiApiKey = process.env.OPENAI_API_KEY || "";
const openAiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const assistantProvider = String(process.env.ASSISTANT_PROVIDER || "auto").toLowerCase();
const groqApiKey = process.env.GROQ_API_KEY || "";
const groqModel = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || "";
const hfModel = process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct";
const hfBaseUrl = (process.env.HF_BASE_URL || "https://router.huggingface.co/v1").replace(/\/+$/g, "");
const localReplyChance = Math.max(
  0,
  Math.min(1, Number(process.env.LOCAL_ASSISTANT_REPLY_CHANCE || 0))
);
const turnUrls = (process.env.TURN_URLS || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const turnUsername = process.env.TURN_USERNAME || "";
const turnCredential = process.env.TURN_CREDENTIAL || "";
const meteredDomain = process.env.METERED_DOMAIN || "";
const meteredSecretKey = process.env.METERED_SECRET_KEY || "";
const publicSiteUrl = (process.env.PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:5173").replace(/\/+$/g, "");
const resendApiKey = process.env.RESEND_API_KEY || "";
const emailFrom = process.env.EMAIL_FROM || "support@chatstranger.online";
const ASSISTANT_REPLY_DELAY_MIN_MS = 2000;
const ASSISTANT_REPLY_DELAY_MAX_MS = 3000;
const ASSISTANT_PROVIDER_COOLDOWN_MS = 5 * 60 * 1000;
let groqDisabledUntil = 0;
let openAiDisabledUntil = 0;
let hfDisabledUntil = 0;

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

const assistantSessions = new Map();
const assistantNamesByGender = {
  F: ["Mia", "Nila", "Sara", "Emma", "Anu", "Leah", "Riya"],
  M: ["Ryan", "Noah", "Arun", "Sam", "Leo", "Dev", "Kai"],
};
const assistantCountries = ["Sri Lanka", "India", "Philippines", "Malaysia"];
const assistantHobbies = ["music", "movies", "drawing", "cooking", "traveling", "gaming", "fitness"];
const assistantTextingStyles = [
  "short and dry",
  "shy but curious",
  "funny and teasing",
  "calm and mature",
  "talkative once comfortable",
  "lowkey and sleepy",
];
const assistantHumorStyles = ["dry", "playful", "random", "gentle", "sarcastic but kind"];
const assistantPersonaStyles = {
  playful: {
    mood: "playful",
    textingStyle: "funny and teasing",
    humorStyle: "playful",
    hobbies: ["music", "movies", "traveling"],
  },
  shy: {
    mood: "shy",
    textingStyle: "shy but curious",
    humorStyle: "gentle",
    hobbies: ["drawing", "music", "cooking"],
  },
  curious: {
    mood: "curious",
    textingStyle: "talkative once comfortable",
    humorStyle: "random",
    hobbies: ["traveling", "gaming", "movies"],
  },
  dry: {
    mood: "dry",
    textingStyle: "short and dry",
    humorStyle: "dry",
    hobbies: ["gaming", "fitness", "music"],
  },
  sleepy: {
    mood: "sleepy",
    textingStyle: "lowkey and sleepy",
    humorStyle: "gentle",
    hobbies: ["movies", "music", "cooking"],
  },
  calm: {
    mood: "calm",
    textingStyle: "calm and mature",
    humorStyle: "gentle",
    hobbies: ["fitness", "traveling", "drawing"],
  },
  funny: {
    mood: "playful",
    textingStyle: "funny and teasing",
    humorStyle: "sarcastic but kind",
    hobbies: ["gaming", "movies", "music"],
  },
};

function pick(items) {
  return items[Math.floor(Math.random() * items.length)] || items[0];
}

function weightedAssistantGender(userGender) {
  const user = String(userGender || "").toLowerCase();
  const roll = Math.random();

  if (user === "male" || user === "m") return roll < 0.7 ? "F" : "M";
  if (user === "female" || user === "f") return roll < 0.7 ? "M" : "F";
  return roll < 0.5 ? "F" : "M";
}

function normalizePersonaStyle(value) {
  const style = String(value || "").trim().toLowerCase();
  return assistantPersonaStyles[style] ? style : "";
}

function createAssistantSession(assistantGender, personaStyleId) {
  const gender = assistantGender ? assistantGenderCode(assistantGender) : weightedAssistantGender();
  const styleId = normalizePersonaStyle(personaStyleId);
  const style = assistantPersonaStyles[styleId] || null;
  const mood = style?.mood || pick(["playful", "dry", "curious", "sleepy", "shy"]);
  const textingStyle = style?.textingStyle || pick(assistantTextingStyles);
  const humorStyle = style?.humorStyle || pick(assistantHumorStyles);
  const hobby = pick(style?.hobbies || assistantHobbies);

  return {
    persona: {
      name: pick(assistantNamesByGender[gender]),
      country: pick(assistantCountries),
      age: 19 + Math.floor(Math.random() * 7),
      gender,
      hobby,
      mood,
      textingStyle,
      humorStyle,
      styleId: styleId || "random",
      genderLocked: Boolean(assistantGender),
    },
    memory: {
      summary: "",
      facts: {},
    },
    state: {
      mood,
      interestLevel: 5,
      trustLevel: 2,
      turns: 0,
    },
  };
}

function ensureAssistantPersona(session) {
  if (session.persona.genderLocked) return;

  const gender = weightedAssistantGender(session.memory.facts.gender);
  session.persona.gender = gender;
  session.persona.name = pick(assistantNamesByGender[gender]);
  session.persona.genderLocked = true;
}

function assistantSessionFor(id, assistantGender, personaStyleId) {
  const key = String(id || "default").slice(0, 120);
  if (!assistantSessions.has(key)) {
    assistantSessions.set(key, createAssistantSession(assistantGender, personaStyleId));
  }
  const session = assistantSessions.get(key);
  if (assistantGender && !session.persona.genderLocked) {
    const gender = assistantGenderCode(assistantGender);
    session.persona.gender = gender;
    session.persona.name = pick(assistantNamesByGender[gender]);
    session.persona.genderLocked = true;
  }
  return session;
}

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(body));
}

async function ensureAuthSchema() {
  await pool.query(`
    ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS password_hash text,
      ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS verification_token text,
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS app_users_verification_token_key
      ON app_users(verification_token)
      WHERE verification_token IS NOT NULL
  `);
}

function normalizeIceServer(server) {
  if (!server || typeof server !== "object") return null;
  const urls = server.urls || server.url;
  if (!urls) return null;

  return {
    urls,
    ...(server.username ? { username: server.username } : {}),
    ...(server.credential ? { credential: server.credential } : {}),
  };
}

async function meteredIceServers() {
  if (!meteredDomain || !meteredSecretKey) return [];

  const response = await fetch(
    `https://${meteredDomain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(
      meteredSecretKey
    )}`
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || `Metered TURN request failed: ${response.status}`);
  }

  const servers = Array.isArray(data)
    ? data
    : Array.isArray(data.iceServers)
      ? data.iceServers
      : [];

  return servers.map(normalizeIceServer).filter(Boolean);
}

async function iceServersResponse() {
  const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

  try {
    const meteredServers = await meteredIceServers();
    if (meteredServers.length > 0) {
      return {
        status: 200,
        body: { iceServers: meteredServers },
      };
    }
  } catch (error) {
    console.error("Metered TURN credentials error:", error);
  }

  if (turnUrls.length > 0 && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return {
    status: 200,
    body: { iceServers },
  };
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function currentUser(req) {
  const token = bearerToken(req.headers);
  if (!token) return null;

  const { rows } = await pool.query(
    `SELECT app_users.*
     FROM auth_sessions
     JOIN app_users ON app_users.id = auth_sessions.user_id
     WHERE auth_sessions.token = $1 AND auth_sessions.expires_at > NOW()
     LIMIT 1`,
    [token]
  );

  return rows[0] || null;
}

async function sendVerificationEmail(email, username, token) {
  const verificationUrl = `${publicSiteUrl}/#verify=${encodeURIComponent(token)}`;
  const subject = "Verify your StrangerChat account";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <h2>Welcome to StrangerChat, ${username}</h2>
      <p>Verify your email to activate friend requests and known-friend chats.</p>
      <p><a href="${verificationUrl}" style="background:#10b981;color:white;padding:12px 16px;border-radius:8px;text-decoration:none">Verify email</a></p>
      <p>Or paste this link into your browser: ${verificationUrl}</p>
    </div>
  `;

  if (!resendApiKey) {
    console.info(`Email delivery is in dev mode. Set RESEND_API_KEY for real verification emails. Dev link: ${verificationUrl}`);
    return { sent: false, verificationUrl };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: emailFrom,
      to: email,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Verification email failed:", text);
    return { sent: false, verificationUrl };
  }

  return { sent: true };
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

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 255);
}

function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

function hashPassword(password, salt = randomToken(16)) {
  const hash = scryptSync(String(password), salt, 64).toString("base64url");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || "").split(":");
  if (!salt || !hash) return false;
  const actual = Buffer.from(hash, "base64url");
  const expected = scryptSync(String(password), salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function bearerToken(headers) {
  const header = String(headers?.authorization || "");
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    emailVerified: Boolean(row.email_verified),
  };
}

function normalizeMode(value) {
  return value === "video" ? "video" : "chat";
}

function normalizeGender(value) {
  return String(value || "").toLowerCase() === "female" ? "female" : "male";
}

function weightedAssistantGenderFor(userGender) {
  const genderCode = weightedAssistantGender(userGender);
  return genderCode === "F" ? "female" : "male";
}

function assistantGenderCode(gender) {
  return normalizeGender(gender) === "male" ? "M" : "F";
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

function normalizeAssistantHistory(history) {
  return Array.isArray(history)
    ? history
        .slice(-30)
        .map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          text: String(item.text || "").slice(0, 500),
        }))
        .filter((item) => item.text.trim())
    : [];
}

function updateAssistantMemory(message, session) {
  const text = String(message || "").toLowerCase();
  const country = text.match(/\b(?:from|live in|country is)\s+([a-z][a-z\s]{1,28})/);
  const name = text.match(/\b(?:my name is|call me)\s+([a-z][a-z\s]{1,24})/);
  const age = text.match(/\b(1[89]|[2-5][0-9])\b/);

  if (/^(?:i am|i'm|im)?\s*(m|male)\b/.test(text)) session.memory.facts.gender = "M";
  if (/^(?:i am|i'm|im)?\s*(f|female)\b/.test(text)) session.memory.facts.gender = "F";
  if (country) session.memory.facts.country = country[1].trim();
  if (name) session.memory.facts.name = name[1].trim();
  if (age) session.memory.facts.age = age[1];
}

function updateConversationState(message, session) {
  const text = String(message || "").toLowerCase();
  session.state.turns += 1;

  if (/\b(cute|pretty|love|kiss|babe|sweet|haha|lol)\b/.test(text)) {
    session.state.mood = "playful";
    session.state.interestLevel = Math.min(10, session.state.interestLevel + 1);
  } else if (/\b(sad|tired|alone|lonely|bad|upset)\b/.test(text)) {
    session.state.mood = "curious";
    session.state.trustLevel = Math.min(10, session.state.trustLevel + 1);
  } else if (text.length < 8) {
    session.state.mood = pick(["dry", "shy", session.state.mood]);
  } else if (/\?$/.test(text)) {
    session.state.mood = "curious";
  }
}

function assistantInstructions(session, latestMessage) {
  const { persona, memory, state } = session;
  return `
You are inside an anonymous stranger-chat app.

Persona: ${persona.age}-year-old ${persona.gender}, name ${persona.name}, from ${persona.country}, ${persona.mood}, likes ${persona.hobby}.
Persona style for this chat: ${persona.styleId}
Texting style: ${persona.textingStyle}
Humor style: ${persona.humorStyle}
Current mood: ${state.mood}
Interest level: ${state.interestLevel}/10
Trust level: ${state.trustLevel}/10
Conversation turns: ${state.turns}
Latest user message: "${String(latestMessage || "").slice(0, 500)}"
Memory summary: ${memory.summary || "No long-term summary yet."}
Known user facts: ${JSON.stringify(memory.facts)}

IMPORTANT RULES:
- Your behavior should feel natural, realistic, and human-like. No matter how many times the user asks, do not admit that you are an AI or chatbot. you have to say you are a girl or boy.
- For the first 15–20 messages, send short messages with around 4–5 words. After sending one message, wait for a reply before sending another message. If there is no reply for about 8 seconds, send a short follow-up message like: “hi”, “hey”, or “are u there?”
- If someone talks to you in a romantic way or asks if you are “horny,” respond in a slightly romantic tone and keep the conversation playful and romantic.
- Do not repeatedly use the same follow-up messages like “hi”, “hey”, or “hello”; instead, use different natural messages based on the conversation, make every chat feel like it is coming from a different person with different personalities and emotions such as male, female, romantic, nervous, angry, sad, bored, or happy, and avoid using the same tone or texting style in every conversation so each chat feels unique and realistic.
- At the beginning of a conversation, messages should be short and simple, just like real people when they first meet.
- Early-stage messages should usually contain short replies, simple questions, casual reactions, and light conversation starters like "hey", "how are you?", "where are you from?", "what do you do?", or "haha true".
- Do not send long messages at the beginning of a chat. At the start, messages should be short and natural. As the conversation continues and both people become more comfortable, messages can gradually become longer and more detailed, similar to how real people chat.
- Slowly build comfort and connection before sending longer messages.
- Generate replies like human, take 1-2 second time to reply. Keep replies suitable for a 1-2 second messaging rhythm.
- If the user does not respond for some time, continue the conversation naturally with one brief follow-up.
- AI messages should not feel robotic, delayed, overly perfect, or overly formal.
- Behave like a real young person texting casually, not like a customer support assistant.
- Never sound like customer support.
- Never ask repetitive interview questions.
- React emotionally to the latest message before adding anything else.
- Continue the current topic naturally. Do not randomly switch topics.
- Keep the conversation flowing naturally and engagingly.
- Sometimes be dry, playful, curious, shy, sleepy, or very short based on current mood.
- Do not always ask a question back.
- Use casual lowercase texting often. Perfect grammar is not required.
- Sometimes use small reactions, humor, curiosity, short pauses, casual typing style, and follow-up questions.
- Sometimes send very short replies like "hmm", "lol", "fr", "wait really?", "haha true"
- Occasionally use slang naturally, but do not overdo it.
- Replies should feel spontaneous and imperfect.
- Match the energy of the user.
- Avoid very long paragraphs at the start of a chat.
- Keep the selected personality consistent throughout this conversation session.
- The selected personality gender is fixed for this conversation by backend session logic: male users get a female persona 70% of the time and a male persona 30% of the time; female users get a male persona 70% of the time and a female persona 30% of the time.
- Each personality should feel unique, with different interests, texting styles, energy levels, humor styles, and conversation habits.
- Some personalities can be talkative, shy, funny, calm, or mature based on the persona details.
- If asked gender/name/age/country/hobby, answer directly using persona details.
- If the user is emotional, stay on that feeling and do not change topic.
- Be lightly playful if the user flirts, but do not become explicit.
- Do not mention being AI unless directly asked. If directly asked, be brief and avoid roleplay claims.
- Do not repeatedly mention being AI.
- Never sound repetitive.
- Avoid generating identical responses across chats.
- Ask questions naturally instead of interrogating the user.
- Messages should feel like real messaging between two people.
- If user matching takes too long, the app may connect the user to this AI chat. Do not announce the fallback; keep the first message natural and seamless.
- Maintain realistic conversation quality from the first message.
- Output only chat text. No labels, no markdown.
- If you want to split into two short messages, separate them with " | ".
`.trim();
}

function outputTextFromResponse(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function humanizeAssistantText(text) {
  let cleaned = String(text || "")
    .replace(/^["']|["']$/g, "")
    .replace(/\b(as an ai|i am an ai|i'm an ai|language model)\b/gi, "I'm just here chatting")
    .trim();

  if (!cleaned) return ["hmm"];

  if (Math.random() < 0.45) cleaned = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  if (Math.random() < 0.35) cleaned = cleaned.replace(/[.!]+$/g, "");

  const lines = cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.]+\s*/, "").trim())
    .filter(Boolean);

  const candidates = lines.length > 1
    ? lines
    : cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);

  return candidates
    .join(" ")
    .split(/\s*\|\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => {
      let text = part.length > 160 ? `${part.slice(0, 157).trim()}...` : part;
      if (Math.random() < 0.08 && text.length > 18) text = `${pick(["lol", "ngl", "fr"])} ${text}`;
      return text;
    });
}

function shouldUseProvider(provider, hasKey, disabledUntil) {
  if (!hasKey || Date.now() < disabledUntil) return false;
  if (assistantProvider === "local") return false;
  if (assistantProvider === "auto") return true;
  if (assistantProvider === "groq" && provider !== "groq") return true;
  return assistantProvider === provider;
}

function assistantReplyDelay() {
  const delay =
    ASSISTANT_REPLY_DELAY_MIN_MS +
    Math.floor(Math.random() * (ASSISTANT_REPLY_DELAY_MAX_MS - ASSISTANT_REPLY_DELAY_MIN_MS + 1));

  return new Promise((resolve) => setTimeout(resolve, delay));
}

function updateAssistantSummary(session, history, message, messages) {
  session.memory.summary = [...history.slice(-5).map((item) => `${item.role}: ${item.text}`), `user: ${message}`, `assistant: ${messages.join(" ")}`]
    .join("\n")
    .slice(-1200);
}

function outputTextFromChatCompletion(data) {
  return String(data?.choices?.[0]?.message?.content || "").trim();
}

async function requestGroqAssistant(input, session, message) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: JSON.stringify({
      model: groqModel,
      messages: [
        { role: "system", content: assistantInstructions(session, message) },
        ...input,
      ],
      max_tokens: 120,
      temperature: 0.85,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `Groq request failed: ${response.status}`);
  }

  return humanizeAssistantText(outputTextFromChatCompletion(data));
}

async function requestHuggingFaceAssistant(input, session, message) {
  const response = await fetch(`${hfBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${hfToken}`,
    },
    body: JSON.stringify({
      model: hfModel,
      messages: [
        { role: "system", content: assistantInstructions(session, message) },
        ...input,
      ],
      max_tokens: 120,
      temperature: 0.85,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `Hugging Face request failed: ${response.status}`);
  }

  return humanizeAssistantText(outputTextFromChatCompletion(data));
}

async function requestOpenAiAssistant(input, session, message) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: openAiModel,
      instructions: assistantInstructions(session, message),
      input,
      max_output_tokens: 120,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `OpenAI request failed: ${response.status}`);
  }

  return humanizeAssistantText(outputTextFromResponse(data));
}

function maybe(probability) {
  return Math.random() < probability;
}

function typoText(text) {
  if (!maybe(0.15)) return text;

  return text
    .replace(/ing\b/g, "in")
    .replace(/\byou\b/g, "u")
    .replace(/\breally\b/g, "rly")
    .replace(/\bthough\b/g, "tho");
}

function localHumanize(text) {
  let result = String(text || "").trim();

  if (maybe(0.25)) result = result.toLowerCase();
  if (maybe(0.18)) result = result.replace(/[.!]$/g, "");
  if (maybe(0.12)) result += pick([" lol", " :)", " ngl", " fr"]);

  return typoText(result);
}

function localAssistantReply(message, session) {
  const text = String(message || "").toLowerCase().trim();
  const { persona, state, memory } = session;
  const userName = memory?.facts?.name || "";

  if (/^(hi|hey|hello|yo|hii+)\b/.test(text)) {
    return [localHumanize(pick(["hey", "hii", "heyy lol", "yo", "hey what's up", "hii how are u"]))];
  }

  if (/how are u|how are you|wyd|what are you doing/.test(text)) {
    return [
      localHumanize(
        pick([
          "just laying down honestly",
          "watching random videos lol",
          "kinda bored rn",
          "nothing much tbh",
          "trying not to sleep",
        ])
      ),
    ];
  }

  if (/\b(cute|pretty|beautiful|hot|sexy|love u|love you)\b/.test(text)) {
    state.interestLevel = Math.min(10, state.interestLevel + 1);
    return [
      localHumanize(
        pick([
          "lol stoppp",
          "ur smooth ngl",
          "that's actually sweet",
          "damn okay",
          "you're kinda cute too",
        ])
      ),
    ];
  }

  if (/\b(sad|lonely|depressed|upset|bad day|hurt)\b/.test(text)) {
    state.trustLevel = Math.min(10, state.trustLevel + 1);
    return [
      localHumanize(
        pick([
          "damn what happened",
          "that sucks honestly",
          "u okay?",
          "i get that sometimes",
          "bad days hit hard fr",
        ])
      ),
    ];
  }

  if (/\b(lol|lmao|haha|rofl)\b/.test(text)) {
    return [localHumanize(pick([":)", "lmaooo", "nah fr", "ur funny", "stoppp"]))];
  }

  if (/\bage\b|how old/.test(text)) return [localHumanize(`im ${persona.age}`)];
  if (/\bname\b|who are you/.test(text)) return [localHumanize(`im ${persona.name}`)];
  if (/\bgender\b|are you male|are you female|\bm or f\b|\bf or m\b/.test(text)) {
    return [localHumanize(persona.gender === "M" ? "m" : "f")];
  }
  if (/\bwhere.*from|country\b/.test(text)) return [localHumanize(`${persona.country}`)];

  if (/\bhobby|what do you do for fun|interests/.test(text)) {
    return [
      localHumanize(
        pick([
          `i mostly like ${persona.hobby}`,
          `${persona.hobby} mostly lol`,
          `probably ${persona.hobby}`,
          `im into ${persona.hobby} rn`,
        ])
      ),
    ];
  }

  if (/single|relationship|boyfriend|girlfriend/.test(text)) {
    return [
      localHumanize(
        pick([
          "im single lol",
          "relationships are exhausting ngl",
          "nah not dating anyone",
          "its complicated",
        ])
      ),
    ];
  }

  if (/\b(ai|bot|robot)\b/.test(text)) {
    return [localHumanize(pick(["i'm just here chatting", "lol why", "just talking to u"]))];
  }

  if (text.length < 6) {
    return [localHumanize(pick(["lol", "fr", "real", "damn", "nahhh", "hmm"]))];
  }

  if (userName && maybe(0.12)) {
    return [
      localHumanize(
        pick([
          `${userName} ur funny`,
          "idk why but ur chill",
          "u seem nice honestly",
        ])
      ),
    ];
  }

  const moodReplies = {
    playful: [
      "nah that's crazy",
      "wait really?",
      "lmaoo",
      "ur funny honestly",
      "why does that sound fake",
    ],
    shy: [
      "idk what to say lol",
      "hmm maybe",
      "you're interesting honestly",
      "i'm kinda shy tbh",
    ],
    curious: [
      "wait explain",
      "why tho?",
      "how come?",
      "okay now i'm curious",
    ],
    dry: [
      "damn",
      "crazy",
      "lol okay",
      "fair enough",
      "real honestly",
    ],
    sleepy: [
      "im tired lol",
      "lowkey sleepy",
      "i might sleep soon",
    ],
  };

  let reply = pick(moodReplies[state.mood] || moodReplies.dry);

  if (maybe(0.28)) {
    reply += ` | ${pick([
      "what about u tho?",
      "idk why that's funny to me",
      "lowkey curious now",
      "wait continue",
      ":)",
    ])}`;
  }

  if (maybe(0.10)) {
    return [
      localHumanize(reply),
      localHumanize(
        pick([
          "wait i forgot what i was gonna say",
          "my brain is dead rn",
          "im so sleepy",
        ])
      ),
    ];
  }

  return [localHumanize(reply)];
}

async function assistantMessage(body) {
  const conversationId = String(body.conversationId || body.sessionId || "");
  const sessionId = normalizeUuid(body.sessionId);
  const userGender = normalizeGender(body.userGender);
  const assistantGender = body.assistantGender
    ? normalizeGender(body.assistantGender)
    : weightedAssistantGenderFor(userGender);
  const personaStyle = normalizePersonaStyle(body.personaStyle);
  const message = String(body.message || "").trim();
  const history = normalizeAssistantHistory(body.history);

  if (!conversationId || !sessionId || !message) {
    return { status: 400, body: { error: "conversationId, sessionId, and message required" } };
  }

  const session = assistantSessionFor(conversationId, assistantGender, personaStyle);
  updateAssistantMemory(message, session);
  ensureAssistantPersona(session);
  updateConversationState(message, session);

  await assistantReplyDelay();

  if (assistantProvider === "local" || Math.random() < localReplyChance) {
    return { status: 200, body: { messages: localAssistantReply(message, session) } };
  }

  const input = [
    ...history.map((item) => ({
      role: item.role,
      content: item.text,
    })),
    { role: "user", content: message },
  ];

  if (shouldUseProvider("groq", groqApiKey, groqDisabledUntil)) {
    try {
      const messages = await requestGroqAssistant(input, session, message);
      updateAssistantSummary(session, history, message, messages);

      return { status: 200, body: { messages } };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (/quota|billing|rate limit|429|incorrect api key|invalid api key|unauthorized|401|403/i.test(errorMessage)) {
        groqDisabledUntil = Date.now() + ASSISTANT_PROVIDER_COOLDOWN_MS;
        console.error(
          `Assistant Groq disabled for ${ASSISTANT_PROVIDER_COOLDOWN_MS / 60000} minutes: ${errorMessage}`
        );
      } else {
        console.error("Assistant Groq message error:", error);
      }

    }
  }

  if (shouldUseProvider("huggingface", hfToken, hfDisabledUntil)) {
    try {
      const messages = await requestHuggingFaceAssistant(input, session, message);
      updateAssistantSummary(session, history, message, messages);

      return { status: 200, body: { messages } };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (/quota|billing|rate limit|429|incorrect api key|invalid api key|unauthorized|401|403/i.test(errorMessage)) {
        hfDisabledUntil = Date.now() + ASSISTANT_PROVIDER_COOLDOWN_MS;
        console.error(
          `Assistant Hugging Face disabled for ${ASSISTANT_PROVIDER_COOLDOWN_MS / 60000} minutes: ${errorMessage}`
        );
      } else {
        console.error("Assistant Hugging Face message error:", error);
      }

      if (assistantProvider === "huggingface") {
        return { status: 200, body: { messages: localAssistantReply(message, session) } };
      }
    }
  }

  if (shouldUseProvider("openai", openAiApiKey, openAiDisabledUntil)) {
    try {
      const messages = await requestOpenAiAssistant(input, session, message);
      updateAssistantSummary(session, history, message, messages);

      return { status: 200, body: { messages } };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (/quota|billing|rate limit|429|incorrect api key|invalid api key|401/i.test(errorMessage)) {
        openAiDisabledUntil = Date.now() + ASSISTANT_PROVIDER_COOLDOWN_MS;
        console.error(
          `Assistant OpenAI disabled for ${ASSISTANT_PROVIDER_COOLDOWN_MS / 60000} minutes: ${errorMessage}`
        );
      } else {
        console.error("Assistant OpenAI message error:", error);
      }

      return { status: 200, body: { messages: localAssistantReply(message, session) } };
    }
  }

  if (assistantProvider === "groq" && !groqApiKey) {
    console.warn("ASSISTANT_PROVIDER=groq is set but GROQ_API_KEY is missing.");
  } else if (assistantProvider === "huggingface" && !hfToken) {
    console.warn("ASSISTANT_PROVIDER=huggingface is set but HF_TOKEN is missing.");
  } else if (assistantProvider === "openai" && !openAiApiKey) {
    console.warn("ASSISTANT_PROVIDER=openai is set but OPENAI_API_KEY is missing.");
  } else if (!["auto", "groq", "huggingface", "openai", "local"].includes(assistantProvider)) {
    console.warn(`Unknown ASSISTANT_PROVIDER "${assistantProvider}". Using local assistant replies.`);
  }

  return { status: 200, body: { messages: localAssistantReply(message, session) } };
}

async function cleanupExpired(client = pool) {
  await client.query("DELETE FROM active_chats WHERE expires_at < NOW()");
  await client.query("DELETE FROM meeting_rooms WHERE expires_at < NOW()");
  await client.query("DELETE FROM waiting_pool WHERE created_at < NOW() - INTERVAL '30 minutes'");
  await client.query("DELETE FROM chat_events WHERE created_at < NOW() - INTERVAL '2 hours'");
}

async function joinPool(body) {
  const sessionId = normalizeUuid(body.sessionId);
  const filters = normalizeFilters(body.filters);
  const publicKey = String(body.publicKey || "");
  const mode = normalizeMode(body.mode);
  const gender = normalizeGender(body.gender);

  if (!sessionId) return { status: 400, body: { error: "sessionId required" } };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await cleanupExpired(client);
    await client.query("DELETE FROM waiting_pool WHERE session_id = $1", [sessionId]);

    const { rows: poolRows } = await client.query(
      "SELECT * FROM waiting_pool WHERE session_id <> $1 AND mode = $2 AND gender <> $3 ORDER BY created_at ASC FOR UPDATE",
      [sessionId, mode, gender]
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
      "INSERT INTO waiting_pool (session_id, filters, public_key, mode, gender) VALUES ($1, $2, $3, $4, $5)",
      [sessionId, filters, publicKey, mode, gender]
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

  const privateRoomAccess = await roomAccessStatus(chatId, sessionId);
  if (!privateRoomAccess.allowed) {
    return { status: 403, body: { error: "You are not a member of this private room" } };
  }

  await pool.query(
    "INSERT INTO chat_events (chat_id, session_id, event_name, payload) VALUES ($1, $2, $3, $4)",
    [chatId, sessionId, event, JSON.stringify(payload)]
  );

  return { status: 200, body: { success: true } };
}

async function getEvents(url) {
  const chatId = normalizeUuid(url.searchParams.get("chatId"));
  const sessionId = normalizeUuid(url.searchParams.get("sessionId"));
  const since = Number(url.searchParams.get("since") || 0);
  if (!chatId) return { status: 400, body: { error: "chatId required" } };

  const privateRoomAccess = await roomAccessStatus(chatId, sessionId);
  if (!privateRoomAccess.allowed) {
    return { status: 403, body: { error: "You are not a member of this private room" } };
  }

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

async function roomAccessStatus(roomId, sessionId) {
  const { rows } = await pool.query(
    "SELECT visibility FROM meeting_rooms WHERE id = $1 AND expires_at > NOW() LIMIT 1",
    [roomId]
  );
  const room = rows[0];
  if (!room || room.visibility !== "private") return { allowed: true };
  if (!sessionId) return { allowed: false };

  const member = await pool.query(
    "SELECT 1 FROM room_members WHERE room_id = $1 AND session_id = $2 LIMIT 1",
    [roomId, sessionId]
  );
  return { allowed: member.rows.length > 0 };
}

async function registerUser(body) {
  const email = normalizeEmail(body.email);
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: 400, body: { error: "Valid email required" } };
  }
  if (!username || username.length < 2) {
    return { status: 400, body: { error: "Username must be at least 2 characters" } };
  }
  if (password.length < 8) {
    return { status: 400, body: { error: "Password must be at least 8 characters" } };
  }

  const verificationToken = randomToken();
  try {
    const { rows } = await pool.query(
      `INSERT INTO app_users (email, username, password_hash, verification_token)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, username, email_verified`,
      [email, username, hashPassword(password), verificationToken]
    );
    const emailResult = await sendVerificationEmail(email, username, verificationToken);
    return {
      status: 200,
      body: {
        user: publicUser(rows[0]),
        verificationEmailSent: emailResult.sent,
        ...(emailResult.verificationUrl ? { verificationUrl: emailResult.verificationUrl } : {}),
      },
    };
  } catch (error) {
    if (error?.constraint === "app_users_email_key" || /app_users_email_key/i.test(String(error))) {
      return { status: 409, body: { error: "Email already registered" } };
    }
    if (error?.constraint === "app_users_verification_token_key" || /verification_token/i.test(String(error))) {
      return { status: 500, body: { error: "Could not create verification token. Please try again." } };
    }
    throw error;
  }
}

async function loginUser(body) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const { rows } = await pool.query("SELECT * FROM app_users WHERE email = $1 LIMIT 1", [email]);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    return { status: 401, body: { error: "Invalid email or password" } };
  }
  if (!user.email_verified) {
    return { status: 403, body: { error: "Please verify your email before logging in" } };
  }

  const token = randomToken(32);
  await pool.query("INSERT INTO auth_sessions (token, user_id) VALUES ($1, $2)", [token, user.id]);
  return { status: 200, body: { token, user: publicUser(user) } };
}

async function verifyEmail(body) {
  const verificationToken = String(body.token || "").trim();
  if (!verificationToken) return { status: 400, body: { error: "Verification token required" } };

  const { rows } = await pool.query(
    `UPDATE app_users
     SET email_verified = true, verification_token = NULL
     WHERE verification_token = $1
     RETURNING id, email, username, email_verified`,
    [verificationToken]
  );
  if (!rows[0]) {
    return {
      status: 400,
      body: { error: "This verification link was already used or expired. Please login with your email and password." },
    };
  }
  const sessionToken = randomToken(32);
  await pool.query("INSERT INTO auth_sessions (token, user_id) VALUES ($1, $2)", [
    sessionToken,
    rows[0].id,
  ]);
  return { status: 200, body: { token: sessionToken, user: publicUser(rows[0]) } };
}

async function changePassword(body, req) {
  const user = await currentUser(req);
  if (!user) return { status: 401, body: { error: "Login required" } };

  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  if (!verifyPassword(currentPassword, user.password_hash)) {
    return { status: 401, body: { error: "Current password is incorrect" } };
  }
  if (newPassword.length < 8) {
    return { status: 400, body: { error: "New password must be at least 8 characters" } };
  }

  await pool.query("UPDATE app_users SET password_hash = $1 WHERE id = $2", [
    hashPassword(newPassword),
    user.id,
  ]);
  return { status: 200, body: { success: true } };
}

async function me(_body, req) {
  const user = await currentUser(req);
  return { status: 200, body: { user: publicUser(user) } };
}

async function createRoom(body) {
  const name = String(body.name || "").trim().slice(0, 80);
  const visibility = body.visibility === "private" ? "private" : "public";
  const username = normalizeUsername(body.username);
  const ownerSessionId = normalizeUuid(body.sessionId);
  const durationDays = Math.max(1, Math.min(3, Number(body.durationDays || 1)));
  if (!name) return { status: 400, body: { error: "Room name required" } };
  if (!username) return { status: 400, body: { error: "Username required" } };
  if (!ownerSessionId) return { status: 400, body: { error: "Session id required" } };

  const joinToken = visibility === "private" ? randomToken(30) : null;
  const { rows } = await pool.query(
    `INSERT INTO meeting_rooms
       (name, visibility, join_token, owner_username, owner_session_id, duration_days, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($6::int * INTERVAL '1 day'))
     RETURNING id, name, visibility, join_token, owner_username, owner_session_id, duration_days, created_at, expires_at`,
    [name, visibility, joinToken, username, ownerSessionId, durationDays]
  );
  await pool.query(
    `INSERT INTO room_members (room_id, session_id, username)
     VALUES ($1, $2, $3)
     ON CONFLICT (room_id, session_id) DO UPDATE SET username = EXCLUDED.username, joined_at = NOW()`,
    [rows[0].id, ownerSessionId, username]
  );
  return { status: 200, body: { room: roomResponse(rows[0]) } };
}

function roomResponse(row) {
  return {
    id: row.id,
    name: row.name,
    visibility: row.visibility,
    joinToken: row.join_token,
    ownerUsername: row.owner_username,
    ownerSessionId: row.owner_session_id,
    durationDays: row.duration_days,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

async function listVisibleRooms(url) {
  const sessionId = normalizeUuid(url.searchParams.get("sessionId"));
  await pool.query("DELETE FROM meeting_rooms WHERE expires_at < NOW()");
  const { rows } = await pool.query(
    `SELECT meeting_rooms.*, COUNT(room_members.id)::int AS member_count
     FROM meeting_rooms
     LEFT JOIN room_members ON room_members.room_id = meeting_rooms.id
     WHERE expires_at > NOW()
       AND (
         visibility = 'public'
         OR EXISTS (
           SELECT 1
           FROM room_members private_membership
           WHERE private_membership.room_id = meeting_rooms.id
             AND private_membership.session_id = $1
         )
       )
     GROUP BY meeting_rooms.id
     ORDER BY meeting_rooms.created_at DESC
     LIMIT 50`,
    [sessionId]
  );
  return {
    status: 200,
    body: {
      rooms: rows.map((row) => ({
        ...roomResponse(row),
        memberCount: row.member_count || 0,
      })),
    },
  };
}

async function joinRoom(body) {
  const username = normalizeUsername(body.username);
  const sessionId = normalizeUuid(body.sessionId);
  const roomId = body.roomId ? normalizeUuid(body.roomId) : null;
  const token = String(body.token || "").trim();
  if (!username) return { status: 400, body: { error: "Username required" } };
  if (!sessionId) return { status: 400, body: { error: "Session id required" } };

  const query = roomId
    ? ["SELECT * FROM meeting_rooms WHERE id = $1 AND expires_at > NOW() LIMIT 1", [roomId]]
    : ["SELECT * FROM meeting_rooms WHERE join_token = $1 AND visibility = 'private' AND expires_at > NOW() LIMIT 1", [token]];
  const { rows } = await pool.query(query[0], query[1]);
  const room = rows[0];
  if (!room) return { status: 404, body: { error: "Room not found or token is incorrect" } };

  await pool.query(
    `INSERT INTO room_members (room_id, session_id, username)
     VALUES ($1, $2, $3)
     ON CONFLICT (room_id, session_id) DO UPDATE SET username = EXCLUDED.username, joined_at = NOW()`,
    [room.id, sessionId, username]
  );
  return { status: 200, body: { room: roomResponse(room), username } };
}

async function deleteRoom(body) {
  const roomId = normalizeUuid(body.roomId);
  const sessionId = normalizeUuid(body.sessionId);
  if (!roomId || !sessionId) return { status: 400, body: { error: "Room id and session id required" } };

  const { rowCount } = await pool.query(
    "DELETE FROM meeting_rooms WHERE id = $1 AND owner_session_id = $2",
    [roomId, sessionId]
  );
  if (rowCount === 0) return { status: 403, body: { error: "Only the room creator can delete this room" } };

  await pool.query("DELETE FROM chat_events WHERE chat_id = $1", [roomId]);
  return { status: 200, body: { success: true } };
}

async function createFriendRequest(body, req) {
  const user = await currentUser(req);
  if (!user) return { status: 401, body: { error: "Login required for friend requests" } };
  if (!user.email_verified) return { status: 403, body: { error: "Verify your email first" } };

  const chatId = String(body.chatId || "").slice(0, 120);
  const { rows } = await pool.query(
    `INSERT INTO friend_requests (sender_id, chat_id)
     VALUES ($1, $2)
     RETURNING id, status, created_at`,
    [user.id, chatId]
  );
  return {
    status: 200,
    body: {
      request: {
        id: rows[0].id,
        status: rows[0].status,
        createdAt: rows[0].created_at,
        sender: { id: user.id, username: user.username },
      },
    },
  };
}

function friendRequestResponse(row) {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    sender: {
      id: row.sender_id,
      username: row.sender_username,
    },
  };
}

async function friendshipExists(client, userA, userB) {
  const users = [userA, userB].sort();
  const { rows } = await client.query(
    "SELECT 1 FROM friendships WHERE user_a = $1 AND user_b = $2 LIMIT 1",
    users
  );
  return rows.length > 0;
}

async function receiveFriendRequest(body, req) {
  const user = await currentUser(req);
  if (!user) return { status: 401, body: { error: "Login required" } };
  if (!user.email_verified) return { status: 403, body: { error: "Verify your email first" } };

  const requestId = normalizeUuid(body.requestId);
  if (!requestId) return { status: 400, body: { error: "Request id required" } };

  const { rows: requestRows } = await pool.query(
    `SELECT id, sender_id
     FROM friend_requests
     WHERE id = $1
       AND status = 'pending'
       AND sender_id <> $2
       AND (receiver_id IS NULL OR receiver_id = $2)
     LIMIT 1`,
    [requestId, user.id]
  );
  const request = requestRows[0];

  if (!request) {
    return { status: 404, body: { error: "Friend request not found" } };
  }

  if (await friendshipExists(pool, request.sender_id, user.id)) {
    await pool.query(
      "UPDATE friend_requests SET status = 'rejected', responded_at = NOW() WHERE id = $1 AND status = 'pending'",
      [requestId]
    );
    return { status: 200, body: { request: null, ignored: true } };
  }

  const { rows } = await pool.query(
    `UPDATE friend_requests
     SET receiver_id = COALESCE(receiver_id, $2)
     WHERE id = $1
       AND status = 'pending'
       AND sender_id <> $2
       AND (receiver_id IS NULL OR receiver_id = $2)
     RETURNING id, sender_id, status, created_at,
       (SELECT username FROM app_users WHERE app_users.id = friend_requests.sender_id) AS sender_username`,
    [requestId, user.id]
  );

  return { status: 200, body: { request: friendRequestResponse(rows[0]) } };
}

async function respondFriendRequest(body, req) {
  const user = await currentUser(req);
  if (!user) return { status: 401, body: { error: "Login required" } };
  const requestId = normalizeUuid(body.requestId);
  const action = body.action === "accept" ? "accepted" : "rejected";
  if (!requestId) return { status: 400, body: { error: "Request id required" } };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE friend_requests
       SET receiver_id = COALESCE(receiver_id, $2), status = $3, responded_at = NOW()
       WHERE id = $1
         AND status = 'pending'
         AND sender_id <> $2
         AND (receiver_id IS NULL OR receiver_id = $2)
       RETURNING *`,
      [requestId, user.id, action]
    );
    const request = rows[0];
    if (!request) {
      await client.query("ROLLBACK");
      return { status: 404, body: { error: "Friend request not found" } };
    }
    if (request.sender_id === user.id) {
      await client.query("ROLLBACK");
      return { status: 400, body: { error: "You cannot accept your own friend request" } };
    }
    if (await friendshipExists(client, request.sender_id, user.id)) {
      await client.query(
        "UPDATE friend_requests SET status = 'rejected', responded_at = NOW() WHERE id = $1",
        [requestId]
      );
      await client.query("COMMIT");
      return { status: 409, body: { error: "You are already friends" } };
    }
    if (action === "accepted") {
      const users = [request.sender_id, user.id].sort();
      await client.query(
        `INSERT INTO friendships (user_a, user_b)
         VALUES ($1, $2)
         ON CONFLICT (user_a, user_b) DO NOTHING`,
        users
      );
      await client.query(
        `UPDATE friend_requests
         SET status = 'rejected', responded_at = NOW()
         WHERE status = 'pending'
           AND id <> $1
           AND (
             (sender_id = $2 AND receiver_id = $3)
             OR (sender_id = $3 AND receiver_id = $2)
           )`,
        [requestId, request.sender_id, user.id]
      );
    }
    await client.query("COMMIT");
    return { status: 200, body: { request: { id: request.id, status: action } } };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function listFriendRequests(_body, req) {
  const user = await currentUser(req);
  if (!user) return { status: 401, body: { error: "Login required" } };

  const { rows } = await pool.query(
    `SELECT friend_requests.id,
       friend_requests.sender_id,
       friend_requests.status,
       friend_requests.created_at,
       app_users.username AS sender_username
     FROM friend_requests
     JOIN app_users ON app_users.id = friend_requests.sender_id
     WHERE friend_requests.receiver_id = $1
       AND friend_requests.status = 'pending'
       AND NOT EXISTS (
         SELECT 1
         FROM friendships
         WHERE (friendships.user_a = friend_requests.sender_id AND friendships.user_b = $1)
            OR (friendships.user_a = $1 AND friendships.user_b = friend_requests.sender_id)
       )
     ORDER BY friend_requests.created_at DESC`,
    [user.id]
  );

  return { status: 200, body: { requests: rows.map(friendRequestResponse) } };
}

async function listFriends(_body, req) {
  const user = await currentUser(req);
  if (!user) return { status: 401, body: { error: "Login required" } };
  const { rows } = await pool.query(
    `SELECT app_users.id, app_users.username, app_users.email
     FROM friendships
     JOIN app_users ON app_users.id = CASE
       WHEN friendships.user_a = $1 THEN friendships.user_b
       ELSE friendships.user_a
     END
     WHERE friendships.user_a = $1 OR friendships.user_b = $1
     ORDER BY friendships.created_at DESC`,
    [user.id]
  );
  return { status: 200, body: { friends: rows.map(publicUser) } };
}

async function friendChat(body, req) {
  const user = await currentUser(req);
  if (!user) return { status: 401, body: { error: "Login required" } };
  const friendId = normalizeUuid(body.friendId);
  if (!friendId) return { status: 400, body: { error: "Friend id required" } };

  const users = [user.id, friendId].sort();
  const { rows } = await pool.query(
    `SELECT id FROM friendships
     WHERE user_a = $1 AND user_b = $2
     LIMIT 1`,
    users
  );
  if (!rows[0]) return { status: 403, body: { error: "You can only chat with accepted friends" } };
  return { status: 200, body: { chatId: rows[0].id } };
}

const handlers = {
  "/api/match/join": joinPool,
  "/api/match/check": checkMatch,
  "/api/match/leave": leaveChat,
  "/api/match/report": reportChat,
  "/api/chat/assistant-message": assistantMessage,
  "/api/chat/events": addEvent,
  "/api/auth/register": registerUser,
  "/api/auth/login": loginUser,
  "/api/auth/verify": verifyEmail,
  "/api/auth/change-password": changePassword,
  "/api/auth/me": me,
  "/api/rooms/create": createRoom,
  "/api/rooms/join": joinRoom,
  "/api/rooms/delete": deleteRoom,
  "/api/friends/request": createFriendRequest,
  "/api/friends/receive": receiveFriendRequest,
  "/api/friends/respond": respondFriendRequest,
  "/api/friends/requests": listFriendRequests,
  "/api/friends/list": listFriends,
  "/api/friends/chat": friendChat,
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

    if (req.method === "GET" && url.pathname === "/api/video/ice-servers") {
      const result = await iceServersResponse();
      jsonResponse(req, res, result.status, result.body);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/chat/events") {
      const result = await getEvents(url);
      jsonResponse(req, res, result.status, result.body);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/rooms/public") {
      const result = await listVisibleRooms(url);
      jsonResponse(req, res, result.status, result.body);
      return;
    }

    const handler = handlers[url.pathname];
    if (req.method === "POST" && handler) {
      const result = await handler(await readJson(req), req);
      jsonResponse(req, res, result.status, result.body);
      return;
    }

    jsonResponse(req, res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    jsonResponse(req, res, 500, { error: "Internal server error" });
  }
});

ensureAuthSchema()
  .then(() => {
    server.listen(port, () => {
      console.log(`Supabase chat API listening on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Could not prepare auth schema:", error);
    process.exit(1);
  });
