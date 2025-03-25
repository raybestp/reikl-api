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

// Slack Event Verification（サブスク初期化用）
app.post("/webhook/reiko", async (req, res) => {
  if (req.body.type === "url_verification") {
    return res.status(200).send(req.body.challenge);
  }

  const message = req.body.event && req.body.event.text;
  const user = req.body.event && req.body.event.user;

  if (!message || !user) {
    return res.status(400).send("No message or user found in request");
  }

  try {
    // 1. DeepSeekで分類
    const dsResponse = await axios.post("https://api.deepseek.com/v1/chat/completions", {
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "Slackメッセージを task / progress / decision / chat に分類し、project, content, due を含むJSON形式で出力してください。"
        },
        { role: "user", content: message }
      ]
    }, {
      headers: {
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    let resultText = dsResponse.data.choices[0].message.content;
    console.log("DeepSeek raw output:", resultText);

    // ```json や ``` を削除
    resultText = resultText.replace(/```json|```/g, "").trim();

    let resultJson;
    try {
      resultJson = JSON.parse(resultText);

      // 古い "type" キー対応
      if (resultJson.type && !resultJson.classification) {
        resultJson.classification = resultJson.type;
        delete resultJson.type;
      }

      // due の自然言語 → ISO変換
      if (resultJson.due) {
        const convertedDue = normalizeDue(resultJson.due);
        if (convertedDue) {
          resultJson.due = convertedDue;
        } else {
          console.warn("日付変換に失敗。due を null にします。");
          resultJson.due = null;
        }
      }

    } catch (e) {
      console.error("Invalid JSON from DeepSeek:", resultText);
      return res.status(500).send("Invalid JSON returned from DeepSeek");
    }

    // 2. Supabase に保存
    const supabaseRes = await axios.post(`${process.env.SUPABASE_URL}/rest/v1/project_logs`, resultJson, {
      headers: {
        "apikey": process.env.SUPABASE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      }
    });

    console.log("Logged to Supabase:", supabaseRes.data);
    res.status(200).send("Reiko logged successfully!");
  } catch (err) {
    console.error("Reiko Error:", err.response?.data || err.message || err);
    res.status(500).send("Error during Reiko execution");
  }
});

app.get("/", (req, res) => res.send("Reiko is active"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Reiko server running on port ${PORT}`));