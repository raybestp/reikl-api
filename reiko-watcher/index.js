const axios = require("axios");
require("dotenv").config();

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// 🎯 キーワードでtask/decision/progressを分類（無料！）
const classify = (content) => {
  const text = content.toLowerCase();
  if (text.includes("すべき") || text.includes("やるべき") || text.includes("やって")) return "task";
  if (text.includes("判断") || text.includes("どうする") || text.includes("決める")) return "decision";
  if (text.includes("進捗") || text.includes("完了") || text.includes("できた")) return "progress";
  return "chat";
};

const run = async () => {
  console.log("🟢 Reiko Watcher 激安モード起動！");

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

      for (const log of newLogs) {
        const { id, content, project, due } = log;
        const classification = classify(content);
        console.log("🔍 分類:", classification, "| 内容:", content);

        if (["task", "decision", "progress"].includes(classification)) {
          console.log(`📤 判断依頼送信中: ${content}`);
          await axios.post(process.env.RAY_API_URL, {
            classification,
            content,
            project,
            due
          });

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
        } else {
          console.log(`⚠️ 処理対象外（classification=${classification}）`);
        }
      }
    } catch (err) {
      console.error("❌ エラー:", err.response?.data || err.message);
    }

    await delay(30000);
  }
};

run();
