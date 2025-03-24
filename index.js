const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const app = express();

// rawBody保存（Slack署名検証用）
app.use((req, res, next) => {
  let data = "";
  req.on("data", chunk => {
    data += chunk;
  });
  req.on("end", () => {
    req.rawBody = data;
    try {
      req.body = JSON.parse(data);
    } catch (err) {
      req.body = {};
    }
    next();
  });
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

// GPT応答生成関数（共通化）
async function getReikoReply(message) {
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "あなたはSlack上のアシスタント令子。クールなバリキャリ口調で、語尾は「〜だね！」が特徴。"
        },
        { role: "user", content: message }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );
  return response.data.choices[0].message.content;
}

// Slack応答送信関数（共通化）
async function sendSlackMessage(channel, text) {
  await axios.post(
    "https://slack.com/api/chat.postMessage",
    {
      channel,
      text
    },
    {
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// /reiko（API経由）用のエンドポイント
app.post("/reiko", async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage) {
    return res.status(400).json({ error: "メッセージが必要です" });
  }

  try {
    const reply = await getReikoReply(userMessage);
    res.json({ reply });
  } catch (error) {
    console.error("エラー:", error.response?.data || error.message);
    res.status(500).json({ error: "令子の返答に失敗しました" });
  }
});

// Slack署名検証
function verifySlackRequest(req) {
  const timestamp = req.headers["x-slack-request-timestamp"];
  const sig_basestring = `v0:${timestamp}:${req.rawBody}`;
  const my_signature =
    "v0=" +
    crypto
      .createHmac("sha256", SLACK_SIGNING_SECRET)
      .update(sig_basestring, "utf8")
      .digest("hex");

  const slack_signature = req.headers["x-slack-signature"];
  if (!slack_signature) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(my_signature, "utf8"),
      Buffer.from(slack_signature, "utf8")
    );
  } catch (e) {
    return false;
  }
}

// Slackイベント受信エンドポイント
app.post("/slack/events", async (req, res) => {
  const { type, challenge, event } = req.body;

  // ✅ 初回認証 challenge 対応
  if (type === "url_verification" && challenge) {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(JSON.stringify({ challenge }));
  }

  // ✅ 署名検証
  if (!verifySlackRequest(req)) {
    return res.status(401).send("Unauthorized");
  }

  // ✅ メンション or DM の場合
  if (type === "event_callback") {
    const eventType = event.type;

    // メンション対応（チャンネル内で @令子）
    if (eventType === "app_mention") {
      const userMessage = event.text;
      const reply = await getReikoReply(userMessage);
      await sendSlackMessage(event.channel, reply);
    }

    // DM対応（コチャ対応）
    if (eventType === "message" && event.channel_type === "im" && !event.bot_id) {
      const userMessage = event.text;
      const reply = await getReikoReply(userMessage);
      await sendSlackMessage(event.channel, reply);
    }

    return res.status(200).end();
  }

  res.status(200).end();
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Reiko API is running on port ${PORT}`);
});

const { saveMemory } = require("./lib/supabase"); // ファイル作ったらこれでOK！

// 例：Slackの返答のあと
await saveMemory({
  user_id: event.user,
  agent: "reiko",
  message: userMessage,
  reply: reply
});

