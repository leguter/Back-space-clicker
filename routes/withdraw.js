const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const axios = require("axios");

const router = express.Router();
router.use(authMiddleware);

// ===============================================================
// 🪙 POST /api/withdraw/request — створення заявки на вивід
// ===============================================================
router.post("/request", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const { stars, clicks } = req.body; // 'clicks' тут - це сума з запиту, це ОК

    // 1️⃣ Отримати користувача
    // ❗️ ЗМІНА 1: 'clicks' видалено з запиту, бо такої колонки немає.
    // Ми вже вибираємо 'balance'.
    const userResult = await db.query(
      `SELECT
         username,
         balance,
         (SELECT COUNT(*)
           FROM referrals
           WHERE referrer_telegram_id = users.telegram_id
         ) AS referrals
       FROM users
       WHERE telegram_id = $1`,
      [telegramId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Користувач не знайдений" });
    }

    const user = userResult.rows[0];

    // 2️⃣ Перевірка рефералів
    if (user.referrals < 5) {
      return res.status(400).json({
        success: false,
        message: "❗ Для виводу потрібно мати мінімум 5 рефералів",
      });
    }

    // 3️⃣ Перевірка кліків
    // ❗️ ЗМІНА 2: Перевіряємо 'user.balance' замість 'user.clicks'
    if (user.balance < clicks) {
      return res.status(400).json({
        success: false,
        message: "❗ Недостатньо кліків для цієї операції",
      });
    }

    // 4️⃣ Оновити кількість кліків
    // ❗️ ЗМІНА 3: Оновлюємо 'balance' замість 'clicks'
    await db.query(
      "UPDATE users SET balance = balance - $1 WHERE telegram_id = $2",
      [clicks, telegramId]
    );

    // 5️⃣ Створити запис у таблиці withdrawals
    await db.query(
      `INSERT INTO withdrawals (telegram_id, stars, clicks, status)
       VALUES ($1, $2, $3, 'pending')`,
      [telegramId, stars, clicks]
    );

    // 6️⃣ Надіслати повідомлення в Telegram модераторам
    const botToken = process.env.BOT_TOKEN;
    const adminChatId = process.env.ADMIN_CHAT_ID;

    if (!botToken || !adminChatId) {
      console.error("BOT_TOKEN або ADMIN_CHAT_ID не вказано у .env");
    } else {
      const username = user.username ? `@${user.username}` : "—";

      const message = `
📬 *Нова заявка на вивід*

👤 *Користувач:* ${username}
🆔 *Telegram ID:* ${telegramId}
⭐ *Stars:* ${stars}
🖱 *Кліків списано:* ${clicks.toLocaleString()}

Статус: 🔸 очікує підтвердження
`;

      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: adminChatId,
        text: message,
        parse_mode: "Markdown",
      });
    }

    res.json({ success: true, message: "✅ Заявка створена! Очікуйте підтвердження." });
  } catch (err) {
    console.error("Withdraw request error:", err);
    res.status(500).json({ success: false, message: "Помилка сервера при створенні заявки" });
  }
});

module.exports = router;