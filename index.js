app.post("/slack/events", async (req, res) => {
  const { type, challenge, event } = req.body;

  if (type === "url_verification" && challenge) {
    return res.status(200).json({ challenge });
  }

  if (event && event.type === "message") {
    const messageText = event.text;

    // 公開チャンネル（令子宛）とプライベートチャンネル処理
    if (["channel", "group"].includes(event.channel_type)) {
      // ①DeepSeek分類（既存処理）
      const dsResponse = await axios.post("https://api.deepseek.com/v1/chat/completions", {
        model: "deepseek-chat",
        messages: [{ role: "user", content: event.text }],
      }, {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json"
        }
      });

      const resultJson = JSON.parse(dsResponse.data.choices[0].message.content);

      // Supabaseのproject_logsに保存（既存処理）
      await axios.post(`${process.env.SUPABASE_URL}/rest/v1/project_logs`, resultJson, {
        headers: {
          "apikey": process.env.SUPABASE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_KEY}`,
          "Content-Type": "application/json"
        }
      });

    // 🚨 追加ここから（Ray宛の個別DMをray_memoriesに保存）
    } else if (event.channel_type === "im") {
      console.log("🔔 Ray宛の個別DMを検知！");

      // レイ専用の記憶テーブル(ray_memories)に保存
      await axios.post(`${process.env.SUPABASE_URL}/rest/v1/ray_memories`, {
        content: event.text,
        category: "slack_dm",
        processed: false
      }, {
        headers: {
          "apikey": process.env.SUPABASE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_KEY}`,
          "Content-Type": "application/json"
        }
      });

      console.log("✅ Ray Memoriesに保存完了");
    }
  }

  // URL認証対応
  if (type === "url_verification") return res.status(200).json({ challenge });

  res.status(200).end();
});
