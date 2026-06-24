export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ message: "LINE webhook ready" });
  }

  const events = req.body.events || [];

  for (const event of events) {
    if (event.type !== "message" || event.message.type !== "text") continue;

    const userId = event.source.userId;
    const messageText = event.message.text;

    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/line_messages`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        user_name: "",
        message_text: messageText,
      }),
    });

    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        replyToken: event.replyToken,
        messages: [
          {
            type: "text",
            text: `メッセージを受け付けました。\n\n内容：${messageText}`,
          },
        ],
      }),
    });
  }

  return res.status(200).json({ success: true });
}
