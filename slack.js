const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const app = require("./index"); // index.jsと同じapp使う想定（すでに読み込まれている）

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

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

// Slackイベント受け口
app.post("/slack/events", express.json(), async (req, res) => {
  const { type, challenge, event } = req.body;

  // ✅ challenge返し（Slack接続チェック用）
  if (type === "url_verification" && challenge) {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(JSON.stringify({ challenge }));
  }

  if (!verifySlackRequest(req)) {
    return res.status(401).send("Unauthorized");
  }

  // ✅ メンションに反応
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
