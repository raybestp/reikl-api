const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function saveMemory({ user_id, agent, message, reply }) {
  const { error } = await supabase
    .from("memories")
    .insert([{ user_id, agent, message, reply }]);

  if (error) {
    console.error("🛑 記憶保存エラー:", error.message);
  } else {
    console.log("✅ 記憶保存完了！");
  }
}

module.exports = { saveMemory };
