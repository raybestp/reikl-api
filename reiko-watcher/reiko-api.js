const chrono = require("chrono-node");
const axios = require("axios");
require("dotenv").config();

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ⏱ 自然言語から日付に変換
const normalizeDue = (text) => {
  const parsed = chrono.parseDate(text, { forwardDate: true });
  if (!parsed) return null;
  return parsed.toISOString().split("T")[0];
};

// 🔍 ネストされたJSONでも安全にフィールドを取得
const extract = (field, log) => {
  return log[field] || (log.details && log.details[field]) || null;
};

const run = async () => {
  console.log("🟢 Reiko監視スクリプト 起動");

  while (true) {
    try {
      // 1. Supabaseから未処理ログを取得
      const res = await axios.get(`${process.env.SUPABASE_URL}/rest/v1/project_logs?processed=is.false`, {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`
        }
      });

      const newLogs = res.data;

      for (const log of newLogs) {
        const id = log.id;
        const classification = extract("classification", log);
        const content = extract("content", log);
        const project = extract("project", log);
        const dueRaw = extract("due", log);
        const due = normalizeDue(dueRaw || content);

        if (["task", "decision", "progress"].includes(classification)) {
          console.log(`📤 判断依頼中: ${content}`);

          // 2. RayにPOST
          await axios.post(process.env.RAY_API_URL, {
            classification,
            content,
            project,
            due
          });

          // 3. Supabaseで processed = true に更新
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

    await delay(30000); // 30秒ごとに再チェック
  }
};

run();
