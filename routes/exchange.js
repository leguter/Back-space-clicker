// routes/exchange.js
const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

// ===============================================================
// 🔄 POST /api/exchange — обмін кліків на внутрішні зірки
// ===============================================================
router.post("/", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const { stars, clicks } = req.body; // з фронтенду приходить скільки кліків і скільки зірок

    // 1️⃣ Отримати користувача
    const userResult = await db.query(
      `SELECT
         username,
         balance,
         internal_stars,
         (SELECT COUNT(*) FROM referrals WHERE referrer_telegram_id = users.telegram_id) AS referrals
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
        message: "❗ Для обміну потрібно мати мінімум 5 рефералів",
      });
    }

    // 3️⃣ Перевірка кліків (чи вистачає)
    if (user.balance < clicks) {
      return res.status(400).json({
        success: false,
        message: "❗ Недостатньо кліків для обміну",
      });
    }

    // 4️⃣ Списуємо кліки і додаємо зірки на внутрішній баланс
    await db.query(
      "UPDATE users SET balance = balance - $1, internal_stars = internal_stars + $2 WHERE telegram_id = $3",
      [clicks, stars, telegramId]
    );

    res.json({
      success: true,
      message: `✅ Обмін успішний! Додано ${stars} внутрішніх зірок.`,
    });
  } catch (err) {
    console.error("Exchange error:", err);
    res.status(500).json({ success: false, message: "Помилка сервера при обміні" });
  }
});

module.exports = router;
