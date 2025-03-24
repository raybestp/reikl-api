const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

app.post("/webhook/reiko", async (req, res) => {
    const message = req.body.event && req.body.event.text;
    if (!message) return res.status(400).send("No message provided");

    try {
        // DeepSeek APIで分類
        const dsResponse = await axios.post("https://api.deepseek.com/v1/chat/completions", {
            model: "deepseek-chat",
            messages: [
                { role: "system", content: "Slackメッセージを task / progress / decision / chat に分類し、project, content, due を含むJSON形式で出力してください。" },
                { role: "user", content: message }
            ]
        }, {
            headers: {
                "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                "Content-Type": "application/json"
            }
        });

        const result = dsResponse.data.choices[0].message.content;

        // Supabaseへ保存
        await axios.post(`${process.env.SUPABASE_URL}/rest/v1/project_logs`, JSON.parse(result), {
            headers: {
                "apikey": process.env.SUPABASE_KEY,
                "Authorization": `Bearer ${process.env.SUPABASE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
        });

        res.status(200).send("Reiko logged!");
    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).send("Error during Reiko execution");
    }
});

app.get("/", (req, res) => res.send("Reiko is active"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Reiko server running on ${PORT}`));
