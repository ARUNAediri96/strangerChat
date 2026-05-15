import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface MatchRequest {
  sessionId: string;
  filters: string[];
  publicKey: string;
  mode?: "chat" | "video";
  gender?: "male" | "female";
}

function calculateSimilarity(filtersA: string[], filtersB: string[]): number {
  if (filtersA.length === 0 && filtersB.length === 0) return 100;
  if (filtersA.length === 0 || filtersB.length === 0) return 0;

  const setA = new Set(filtersA.map((f) => f.toLowerCase()));
  const setB = new Set(filtersB.map((f) => f.toLowerCase()));
  let matches = 0;
  for (const tag of setA) {
    if (setB.has(tag)) matches++;
  }
  return (matches / Math.max(setA.size, setB.size)) * 100;
}

function normalizeMode(value: unknown): "chat" | "video" {
  return value === "video" ? "video" : "chat";
}

function normalizeGender(value: unknown): "male" | "female" {
  return value === "female" ? "female" : "male";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method === "POST") {
      const url = new URL(req.url);
      const pathname = url.pathname;
      // pathname could be /join, /functions/v1/match/join, etc.
      // Extract the last segment
      const segments = pathname.split("/").filter(Boolean);
      const action = segments[segments.length - 1];

      if (action === "join") {
        const body: MatchRequest = await req.json();
        const { sessionId, filters, publicKey } = body;
        const mode = normalizeMode(body.mode);
        const gender = normalizeGender(body.gender);

        if (!sessionId) {
          return new Response(
            JSON.stringify({ error: "sessionId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Remove any existing entry for this session
        await supabase.from("waiting_pool").delete().eq("session_id", sessionId);

        // Try to find a match immediately
        const { data: pool, error: poolError } = await supabase
          .from("waiting_pool")
          .select("*")
          .neq("session_id", sessionId)
          .eq("mode", mode)
          .neq("gender", gender)
          .order("created_at", { ascending: true });

        if (poolError) {
          return new Response(
            JSON.stringify({ error: poolError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (pool && pool.length > 0) {
          let bestMatch = pool[0];
          let bestScore = -1;

          for (const candidate of pool) {
            const score = calculateSimilarity(filters, candidate.filters);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = candidate;
            }
          }

          // Match if: both have no filters (random match), or they share at least one filter
          const bothNoFilters = filters.length === 0 && bestMatch.filters.length === 0;
          const hasFilterMatch = bestScore > 0;

          if (bothNoFilters || hasFilterMatch) {
            // Remove both from pool
            await supabase.from("waiting_pool").delete().eq("session_id", sessionId);
            await supabase.from("waiting_pool").delete().eq("session_id", bestMatch.session_id);

            // Create active chat
            const matchedFilters = filters.filter((f) =>
              bestMatch.filters.some((bf: string) => bf.toLowerCase() === f.toLowerCase())
            );

            const { data: chat, error: chatError } = await supabase
              .from("active_chats")
              .insert({
                user_a_session: sessionId,
                user_b_session: bestMatch.session_id,
                user_a_public_key: publicKey || "",
                user_b_public_key: bestMatch.public_key || "",
                matched_filters: matchedFilters,
                mode,
              })
              .select()
              .single();

            if (chatError) {
              return new Response(
                JSON.stringify({ error: chatError.message }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }

            return new Response(
              JSON.stringify({
                matched: true,
                chatId: chat.id,
                peerPublicKey: bestMatch.public_key,
                matchedFilters: matchedFilters,
                isInitiator: true,
                mode,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // No match found, add to pool
        const { error: insertError } = await supabase.from("waiting_pool").insert({
          session_id: sessionId,
          filters,
          public_key: publicKey || "",
          mode,
          gender,
        });

        if (insertError) {
          return new Response(
            JSON.stringify({ error: insertError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ matched: false, status: "waiting" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "check") {
        const body = await req.json();
        const { sessionId } = body;

        // Check if user has been matched (exists in active_chats)
        const { data: chatAsA } = await supabase
          .from("active_chats")
          .select("*")
          .eq("user_a_session", sessionId)
          .maybeSingle();

        const { data: chatAsB } = await supabase
          .from("active_chats")
          .select("*")
          .eq("user_b_session", sessionId)
          .maybeSingle();

        const chat = chatAsA || chatAsB;

        if (chat) {
          const isUserA = chat.user_a_session === sessionId;
          return new Response(
            JSON.stringify({
              matched: true,
              chatId: chat.id,
              peerPublicKey: isUserA ? chat.user_b_public_key : chat.user_a_public_key,
              matchedFilters: chat.matched_filters,
              isInitiator: isUserA,
              mode: normalizeMode(chat.mode),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if still in pool
        const { data: poolEntry } = await supabase
          .from("waiting_pool")
          .select("*")
          .eq("session_id", sessionId)
          .maybeSingle();

        if (poolEntry) {
          return new Response(
            JSON.stringify({ matched: false, status: "waiting" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ matched: false, status: "not_in_pool" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "leave") {
        const body = await req.json();
        const { sessionId, chatId } = body;

        // Remove from pool if waiting
        await supabase.from("waiting_pool").delete().eq("session_id", sessionId);

        // Delete chat if exists
        if (chatId) {
          await supabase.from("active_chats").delete().eq("id", chatId);
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "report") {
        const body = await req.json();
        const { chatId, reporterSession, reason } = body;

        await supabase.from("chat_reports").insert({
          chat_id: chatId,
          reporter_session: reporterSession,
          reason,
        });

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "cleanup") {
        await supabase.rpc("cleanup_expired_chats");
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
