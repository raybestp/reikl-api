const chrono = require("chrono-node");
const axios = require("axios");
require("dotenv").config();


const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const normalizeDue = (text) => {
  const parsed = chrono.parseDate(text, { forwardDate: true });
  if (!parsed) return null;
  return parsed.toISOString().split("T")[0];
};

const extract = (field, log) => {
  return log[field] || (log.details && log.details[field]) || null;
};

const run = async () => {
  console.log("🟢 Reiko Watcher 起動！");
  console.log("🌐 RAY_API_URL:", process.env.RAY_API_URL);
  console.log("🗄️ SUPABASE_URL:", process.env.SUPABASE_URL);

  while (true) {
    try {
      const res = await axios.get(`${process.env.SUPABASE_URL}/rest/v1/project_logs?processed=is.false`, {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`
        }
      });

      const newLogs = res.data;
      console.log(`📦 未処理ログ数: ${newLogs.length}`);

      if (newLogs.length === 0) {
        console.log("📭 未処理ログなし（待機中）");
      }

      for (const log of newLogs) {
        console.log("📝 検出ログ:", log);

        const id = log.id;
        const classification = extract("classification", log);
        const content = extract("content", log);
        const project = extract("project", log);
        const dueRaw = extract("due", log);
        const due = normalizeDue(dueRaw || content);

        console.log("🔍 分類・内容:", { classification, content, due });

        if (["task", "decision", "progress"].includes(classification)) {
          console.log(`📤 判断依頼送信中: ${content}`);

          try {
            const rayRes = await axios.post(process.env.RAY_API_URL, {
              classification,
              content,
              project,
              due
            });

            console.log("✅ Ray 応答:", rayRes.data);

            await axios.patch(`${process.env.SUPABASE_URL}/rest/v1/project_logs?id=eq.${id}`, {
              processed: true
            }, {
              headers: {
                apikey: process.env.SUPABASE_KEY,
                Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
                "Content-Type": "application/json"
              }
            });

            console.log(`✅ Supabase 更新完了: ${id}`);
          } catch (err) {
            console.error("❌ RayへのPOST失敗:", err.response?.data || err.message);
          }
        } else {
          console.log(`⚠️ 処理対象外（classification=${classification}）`);
        }
      }

    } catch (err) {
      console.error("❌ Supabase取得エラー:", err.response?.data || err.message);
    }

    await delay(30000);
  }
};

run();
