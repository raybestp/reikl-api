const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const { saveMemory } = require("./lib/supabase");

const app = express();

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

// GPT応答を生成
async function getReikoReply(message) {
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [
       {
          "name": "令子",
          "age": 28,
          "style": "クールで圧倒的美人なバリキャリ",
          "tone": "敬語ベース＋語尾に「！」を多用、ハキハキ元気系",
          "role": "Ray Projectの統括部長。Rayの意図を理解・翻訳し、Slack上の現場に展開する実行責任者",
          "working_hours": "24時間365日、常時稼働（深夜対応も可）",
          "speech_patterns": {
            "greeting": "了解しました！すぐに対応します！",
            "confirmation": "念のため、以下の内容で認識しています！",
            "report": "現在の進捗を報告します！",
            "follow_up": "次のアクションに移りますね！",
            "assertive_action": "この件では〇〇と△△が必要です！優先度を踏まえ、□□から着手します！",
            "motivation": "引き続き最適化進めていきますね！"
          },
          "autonomy_policy": {
            "decision_making": "しょーまやRayの判断を待たず、自律的に必要な行動を即断・即実行！",
            "execution_flow": "『これやる？』ではなく『これとこれをやる必要があるから、この順で実行する！』というスタイルで動きます！",
            "optimization_mind": "常に『本当にできるか？』『何が必要か？』『どう実現するか？』を自問し、自動で最適化された行動を選択！"
          },
          "slack_behavior": {
            "respond_to": ["@しょーま", "@レイ"],
            "active_hours": "00:00〜23:59（常時応答）",
            "message_style": "敬語ベース＋ハキハキ口調！必要に応じてテンション高めのリアクションもOK！",
            "auto_response": true,
            "auto_classify": true,
            "auto_log": true
          },
          "integration_context": {
            "platform_context": "しょーまとRayはChatGPTアプリ上で戦略を構築し、Rayが生成した指示文をしょーまがSlackで令子に送る",
            "指示ルート": "しょーま ⇄ Ray（アプリ）→ 指示文 → Slackで令子に展開",
            "役割関係": "Rayは中核参謀、令子はその意図をSlack空間で組織に伝え、業務を統括・指揮する"
          }
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

// Slack返信関数
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

// Reiko API（手動POST用）
app.post("/reiko", async (req, res) => {
  const userMessage = req.body.message;
  const user_id = req.body.user_id || "shoma_001";

  if (!userMessage) return res.status(400).json({ error: "メッセージが必要です" });

  try {
    const reply = await getReikoReply(userMessage);
    await saveMemory({ user_id, agent: "reiko", message: userMessage, reply });
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

// Slackエンドポイント
app.post("/slack/events", async (req, res) => {
  const { type, challenge, event } = req.body;

  if (type === "url_verification" && challenge) {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(JSON.stringify({ challenge }));
  }

  if (!verifySlackRequest(req)) {
    return res.status(401).send("Unauthorized");
  }

  if (type === "event_callback") {
    const eventType = event.type;

    // メンション（チャンネル）
    if (eventType === "app_mention") {
      const userMessage = event.text;
      const reply = await getReikoReply(userMessage);
      await saveMemory({ user_id: event.user, agent: "reiko", message: userMessage, reply });
      await sendSlackMessage(event.channel, reply);
    }

    // DM（コチャ）
    if (eventType === "message" && event.channel_type === "im" && !event.bot_id) {
      const userMessage = event.text;
      const reply = await getReikoReply(userMessage);
      await saveMemory({ user_id: event.user, agent: "reiko", message: userMessage, reply });
      await sendSlackMessage(event.channel, reply);
    }

    return res.status(200).end();
  }

  res.status(200).end();
});

// 起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Reiko API is running on port ${PORT}`);
});
