const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const axios = require("axios");

const router = express.Router();
router.use(authMiddleware);

// ===============================================================
// 💫 POST /api/withdraw/request — створення заявки на вивід зірок
// ===============================================================
router.post("/request", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const { stars, clicks } = req.body;

    // 1️⃣ Перевірка кількості рефералів
    const refResult = await db.query(
      "SELECT COUNT(*) FROM users WHERE invited_by = $1",
      [telegramId]
    );
    const refCount = parseInt(refResult.rows[0].count);

    if (refCount < 5) {
      return res.json({
        success: false,
        message: "Для виводу потрібно мати мінімум 5 рефералів.",
      });
    }

    // 2️⃣ Перевірка балансу кліків
    const userResult = await db.query(
      "SELECT clicks FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (userResult.rows.length === 0) {
      return res.json({ success: false, message: "Користувач не знайдений." });
    }

    const userClicks = parseInt(userResult.rows[0].clicks);
    if (userClicks < clicks) {
      return res.json({
        success: false,
        message: "Недостатньо кліків для обміну.",
      });
    }

    // 3️⃣ Списуємо кліки з балансу
    await db.query(
      "UPDATE users SET clicks = clicks - $1 WHERE telegram_id = $2",
      [clicks, telegramId]
    );

    // 4️⃣ Створюємо заявку в базі
    const insertResult = await db.query(
      `INSERT INTO withdraw_requests (telegram_id, stars, clicks, status, created_at)
       VALUES ($1, $2, $3, 'pending', NOW())
       RETURNING id`,
      [telegramId, stars, clicks]
    );

    const requestId = insertResult.rows[0].id;

    // 5️⃣ Відправляємо повідомлення модераторам у Telegram
    const botToken = process.env.BOT_TOKEN;
    const modChatId = process.env.MOD_CHAT_ID; // ⚠️ додай у .env

    const text = `💫 <b>Нова заявка на вивід</b>
👤 Користувач: <code>${telegramId}</code>
⭐ Зірки: <b>${stars}</b>
👆 Кліки: <b>${clicks.toLocaleString()}</b>
🆔 ID заявки: <code>${requestId}</code>`;

    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: modChatId,
      text,
      parse_mode: "HTML",
    });

    res.json({ success: true, message: "Заявка успішно створена!" });
  } catch (err) {
    console.error("Withdraw request error:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера при створенні заявки.",
    });
  }
});

module.exports = router;
