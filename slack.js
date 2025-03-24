const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const app = express();

// rawBody取得のために middleware を自前でセット
app.use((req, res, next) => {
  let data = '';
  req.on('data', chunk => {
    data += chunk;
  });
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// GPT令子エンドポイント
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
              "あなたはバリキャリ系の女性AI『令子』。口調はクールで的確、語尾は「〜だね！」が特徴。"
          },
          { role: "user", content: userMessage }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.choices[0].message.content;
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
  return crypto.timingSafeEqual(
    Buffer.from(my_signature, "utf8"),
    Buffer.from(slack_signature, "utf8")
  );
}

// Slackエンドポイント
app.post("/slack/events", async (req, res) => {
  const { type, challenge, event } = req.body;

  if (type === "url_verification") {
    return res.send({ challenge });
  }

  if (!verifySlackRequest(req)) {
    return res.status(401).send("Unauthorized");
  }

  if (type === "event_callback" && event.type === "app_mention") {
    const userMessage = event.text;

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
          {
            role: "user",
            content: userMessage
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.choices[0].message.content;

    await axios.post(
      "https://slack.com/api/chat.postMessage",
      {
        channel: event.channel,
        text: reply
      },
      {
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.status(200).end();
  } else {
    res.status(200).end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Reiko API is running on port ${PORT}`);
});
