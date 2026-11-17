
const SUPABASE_URL = "https://kuuvasyxneknpidokjmb.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_lme71GPt3a5y1blUq6OO_w_fxVfoWid";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

console.log("LABTRACK Supabase client initialized");

async function testSupabaseConnection() {
  const { data, error } = await supabaseClient
    .from("laboratory_orders")
    .select("order_id")
    .limit(1);

  if (error) {
    console.log(
      "Supabase access test:",
      error.message
    );
    return;
  }

  console.log(
    "Supabase request completed.",
    "Visible records:",
    data.length
  );
}

testSupabaseConnection();
