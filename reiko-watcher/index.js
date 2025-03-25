const chrono = require("chrono-node");

const normalizeDue = (text) => {
  const parsed = chrono.parseDate(text, { forwardDate: true });
  if (!parsed) return null;
  return parsed.toISOString().split("T")[0];
};

const axios = require("axios");
require("dotenv").config();

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const run = async () => {
  console.log("🟢 Reiko監視スクリプト 起動");

  while (true) {
    try {
      // 1. Supabaseから未処理のログを取得
      const res = await axios.get(`${process.env.SUPABASE_URL}/rest/v1/project_logs?processed=is.false`, {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`
        }
      });

      const newLogs = res.data;

      for (const log of newLogs) {
        const { id, classification, content, project, due } = log;

        // 分類が task / decision / progress のときだけ処理
        if (["task", "decision", "progress"].includes(classification)) {
          console.log(`📤 判断依頼中: ${content}`);

          // 2. Rayに判断依頼
          await axios.post(process.env.RAY_API_URL, {
            classification,
            content,
            project,
            due
          });

          // 3. 処理済みフラグをSupabaseに書き戻す
          await axios.patch(`${process.env.SUPABASE_URL}/rest/v1/project_logs?id=eq.${id}`, {
            processed: true
          }, {
            headers: {
              apikey: process.env.SUPABASE_KEY,
              Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
              "Content-Type": "application/json"
            }
          });

          console.log(`✅ 処理完了: ${id}`);
        }
      }
    } catch (err) {
      console.error("❌ エラー:", err.response?.data || err.message);
    }

    await delay(30000); // 30秒待って再実行
  }
};

run();

