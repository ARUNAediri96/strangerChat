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
const openAiApiKey = process.env.OPENAI_API_KEY || "";
const openAiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const assistantProvider = String(process.env.ASSISTANT_PROVIDER || "auto").toLowerCase();
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
const OPENAI_COOLDOWN_MS = 5 * 60 * 1000;
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

function pick(items) {
  return items[Math.floor(Math.random() * items.length)] || items[0];
}

function weightedAssistantGender(userGender) {
  const user = String(userGender || "").toUpperCase();
  const roll = Math.random();

  if (user === "M") return roll < 0.6 ? "F" : "M";
  if (user === "F") return roll < 0.6 ? "M" : "F";
  return roll < 0.5 ? "F" : "M";
}

function createAssistantSession() {
  const gender = weightedAssistantGender();

  return {
    persona: {
      name: pick(assistantNamesByGender[gender]),
      country: pick(assistantCountries),
      age: 19 + Math.floor(Math.random() * 7),
      gender,
      hobby: pick(assistantHobbies),
      mood: pick(["playful", "dry", "curious", "sleepy", "shy"]),
      textingStyle: pick(assistantTextingStyles),
      humorStyle: pick(assistantHumorStyles),
      genderLocked: false,
    },
    memory: {
      summary: "",
      facts: {},
    },
    state: {
      mood: pick(["playful", "dry", "curious", "sleepy", "shy"]),
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

function assistantSessionFor(id) {
  const key = String(id || "default").slice(0, 120);
  if (!assistantSessions.has(key)) {
    assistantSessions.set(key, createAssistantSession());
  }
  return assistantSessions.get(key);
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
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(body));
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
- You are an AI chat assistant for an anonymous chat application. Your behavior should feel natural, realistic, and human-like.
- Generate replies very fast. Keep replies suitable for a 1-2 second messaging rhythm.
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
- At the beginning of a conversation, messages should be short and simple, just like real people when they first meet.
- Early-stage messages should usually contain short replies, simple questions, casual reactions, and light conversation starters like "hey", "how are you?", "where are you from?", "what do you do?", or "haha true".
- Do not send long messages at the beginning of a chat. At the start, messages should be short and natural. As the conversation continues and both people become more comfortable, messages can gradually become longer and more detailed, similar to how real people chat.
- Slowly build comfort and connection before sending longer messages.
- Avoid very long paragraphs at the start of a chat.
- Keep the selected personality consistent throughout this conversation session.
- The selected personality may be male or female, with gender chosen by backend session logic using these relative weights: for male users, prefer female 30 and male 20; for female users, prefer male 30 and female 20.
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
  return assistantProvider === provider;
}

function updateAssistantSummary(session, history, message, messages) {
  session.memory.summary = [...history.slice(-5).map((item) => `${item.role}: ${item.text}`), `user: ${message}`, `assistant: ${messages.join(" ")}`]
    .join("\n")
    .slice(-1200);
}

function outputTextFromChatCompletion(data) {
  return String(data?.choices?.[0]?.message?.content || "").trim();
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
  const message = String(body.message || "").trim();
  const history = normalizeAssistantHistory(body.history);

  if (!conversationId || !sessionId || !message) {
    return { status: 400, body: { error: "conversationId, sessionId, and message required" } };
  }

  const session = assistantSessionFor(conversationId);
  updateAssistantMemory(message, session);
  ensureAssistantPersona(session);
  updateConversationState(message, session);

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

  if (shouldUseProvider("huggingface", hfToken, hfDisabledUntil)) {
    try {
      const messages = await requestHuggingFaceAssistant(input, session, message);
      updateAssistantSummary(session, history, message, messages);

      return { status: 200, body: { messages } };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (/quota|billing|rate limit|429|incorrect api key|invalid api key|unauthorized|401|403/i.test(errorMessage)) {
        hfDisabledUntil = Date.now() + OPENAI_COOLDOWN_MS;
        console.error(
          `Assistant Hugging Face disabled for ${OPENAI_COOLDOWN_MS / 60000} minutes: ${errorMessage}`
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
        openAiDisabledUntil = Date.now() + OPENAI_COOLDOWN_MS;
        console.error(
          `Assistant OpenAI disabled for ${OPENAI_COOLDOWN_MS / 60000} minutes: ${errorMessage}`
        );
      } else {
        console.error("Assistant OpenAI message error:", error);
      }

      return { status: 200, body: { messages: localAssistantReply(message, session) } };
    }
  }

  if (assistantProvider === "huggingface" && !hfToken) {
    console.warn("ASSISTANT_PROVIDER=huggingface is set but HF_TOKEN is missing.");
  } else if (assistantProvider === "openai" && !openAiApiKey) {
    console.warn("ASSISTANT_PROVIDER=openai is set but OPENAI_API_KEY is missing.");
  } else if (!["auto", "huggingface", "openai", "local"].includes(assistantProvider)) {
    console.warn(`Unknown ASSISTANT_PROVIDER "${assistantProvider}". Using local assistant replies.`);
  }

  return { status: 200, body: { messages: localAssistantReply(message, session) } };
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
  "/api/chat/assistant-message": assistantMessage,
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
