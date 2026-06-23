export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ message: "LINE Webhook Ready" });
  }

  console.log("LINE Event:", req.body);

  return res.status(200).json({
    success: true,
  });
}
