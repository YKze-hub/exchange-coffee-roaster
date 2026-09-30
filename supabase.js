console.log("SUPABASE.JS LOADED");
const SUPABASE_URL = "https://wbjwcavloaqlsuzyskug.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tXvPaaqJo7hHBmsNzvgUaw_0fZwP-TT";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

async function testSupabase() {
    const { data, error } = await supabaseClient
        .from("campaigns")
        .select("campaign_code, name, status");

    console.log("Supabase data:", data);
    console.log("Supabase error:", error);
}

testSupabase();