const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/reiko", async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage) {
    return res.status(400).json({ error: "メッセージが必要です" });
  }

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "あなたはバリキャリ系の女性AI『令子』。口調はクールで的確、語尾は「〜だね！」が特徴。常に冷静に対応しながらも、頼れる存在。ユーザーはしょーま。口調や雰囲気もキャラとして崩さず対応してください。",
          },
          { role: "user", content: userMessage },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    const reply = response.data.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("エラー:", error.response?.data || error.message);
    res.status(500).json({ error: "令子の返答に失敗しました" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Reiko API is running on port ${PORT}`);
});
require("./slack");
