const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

// Slack Event Verification (for URL verification during subscription)
app.post("/webhook/reiko", async (req, res) => {
    // Slackの challenge 確認用
    if (req.body.type === "url_verification") {
        return res.status(200).send(req.body.challenge);
    }

    const message = req.body.event && req.body.event.text;
    const user = req.body.event && req.body.event.user;

    if (!message || !user) {
        return res.status(400).send("No message or user found in request");
    }

    try {
        // 1. DeepSeek へメッセージを送信して分類
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

        // ```json ... ``` を除去
        resultText = resultText.replace(/```json|```/g, "").trim();

        let resultJson;
        try {
            resultJson = JSON.parse(resultText);
                        // DeepSeekからのJSON変換後
            if (resultJson.type && !resultJson.classification) {
                resultJson.classification = resultJson.type;
                delete resultJson.type;
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
