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
  console.log("🌐 RAY_API_URL:", process.env.RAY_API_URL);
  console.log("🗄️ SUPABASE_URL:", process.env.SUPABASE_URL);

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

      if (newLogs.length === 0) {
        console.log("📭 未処理ログなし（待機中）");
      }

      for (const log of newLogs) {
        console.log("📝 ログ検出:", log);

        const id = log.id;
        const classification = extract("classification", log);
        const content = extract("content", log);
        const project = extract("project", log);
        const dueRaw = extract("due", log);
        const due = normalizeDue(dueRaw || content);

        console.log("🔍 判定情報:", { classification, content, project, due });

        if (["task", "decision", "progress"].includes(classification)) {
          console.log(`📤 判断依頼中: ${content}`);

          try {
            // 2. RayにPOST
            const rayRes = await axios.post(process.env.RAY_API_URL, {
              classification,
              content,
              project,
              due
            });

            console.log("✅ Ray API応答:", rayRes.data);

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
          } catch (postErr) {
            console.error("❌ RayへのPOST失敗:", postErr.response?.data || postErr.message);
          }

        } else {
          console.log(`⚠️ 判定対象外: classification = "${classification}"`);
        }
      }
    } catch (err) {
      console.error("❌ 監視エラー:", err.response?.data || err.message);
    }

    await delay(30000); // 30秒ごとに再チェック
  }
};

run();
