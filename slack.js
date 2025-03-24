const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

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

    // Slackへ返信
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
