const express = require("express");
const axios = require("axios");
const chrono = require("chrono-node");
require("dotenv").config();

const app = express();
app.use(express.json());

// ⏱ 自然言語から日付をISO形式に変換
const normalizeDue = (text) => {
  if (!text) return null;
  const parsed = chrono.parseDate(text, { forwardDate: true });
  return parsed ? parsed.toISOString().split("T")[0] : null;
};

// Slack Event Endpoint（完全統合版！）
app.post("/slack/events", async (req, res) => {
  const { type, challenge, event } = req.body;

  // Slackイベント認証
  if (type === "url_verification") {
    return res.status(200).json({ challenge });
  }

  if (!event || !event.text) {
    return res.status(200).send("no event or no text");
  }

  const messageText = event.text;

  try {
    // 公開＆プライベートチャンネルの処理 (令子宛)
    if (["channel", "group"].includes(event.channel_type)) {
      const dsResponse = await axios.post("https://api.deepseek.com/v1/chat/completions", {
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "Slackメッセージを task / progress / decision / chat に分類し、project, content, due を含むJSON形式で出力してください。"
          },
          { role: "user", content: messageText }
        ]
      }, {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json"
        }
      });

      let resultText = dsResponse.data.choices[0].message.content.replace(/```json|```/g, "").trim();
      let resultJson = JSON.parse(resultText);

      // due の自然言語 → ISO変換
      if (resultJson.due) {
        resultJson.due = normalizeDue(resultJson.due);
      }

      // Supabase に保存 (project_logs)
      await axios.post(`${process.env.SUPABASE_URL}/rest/v1/project_logs`, resultJson, {
        headers: {
          "apikey": process.env.SUPABASE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_KEY}`,
          "Content-Type": "application/json"
        }
      });

      console.log("✅ project_logsに保存完了:", resultJson);

    // Ray宛の個別DM処理
    } else if (event.channel_type === "im") {
      await axios.post(`${process.env.SUPABASE_URL}/rest/v1/ray_memories`, {
        content: messageText,
        category: "slack_dm",
        processed: false
      }, {
        headers: {
          "apikey": process.env.SUPABASE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_KEY}`,
          "Content-Type": "application/json"
        }
      });

      console.log("✅ ray_memoriesに保存完了（レイ宛DM）:", messageText);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("🚨 エラー発生:", err.response?.data || err.message || err);
    res.status(500).send("Server Error");
  }
});

app.get("/", (req, res) => res.send("Reiko is active"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Reiko server running on port ${PORT}`));
