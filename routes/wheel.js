const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

// ===============================================================
// 🎡 POST /api/wheel/spin — крутити колесо
// ===============================================================
router.post("/spin", async (req, res) => {
  try {
    const { telegramId } = req.user;

    // 1️⃣ Отримати користувача
    const userResult = await db.query(
      "SELECT stars FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = userResult.rows[0];

    // 2️⃣ Перевірка балансу
    if (user.stars < 10) {
      return res.status(400).json({
        success: false,
        message: "Not enough stars to spin the wheel",
      });
    }

    // 3️⃣ Зняти оплату
    await db.query("UPDATE users SET stars = stars - 10 WHERE telegram_id = $1", [
      telegramId,
    ]);

    // 4️⃣ Визначення виграшу
    const roll = Math.random() * 100;
    let reward = { type: "raffle_ticket", value: 1 };

    if (roll >= 98 && roll < 99) {
      reward = { type: "nft", value: "Mystery Box" };
    } else if (roll >= 99) {
      reward = { type: "stars", value: 5 };
      await db.query("UPDATE users SET stars = stars + 5 WHERE telegram_id = $1", [
        telegramId,
      ]);
    } else {
      // raffle ticket — можеш додати поле tickets у таблиці users
      await db.query("UPDATE users SET raffle_tickets = raffle_tickets + 1 WHERE telegram_id = $1", [
        telegramId,
      ]);
    }

    // 5️⃣ Зберегти у таблиці user_spins
    await db.query(
      `INSERT INTO user_spins (user_id, reward_type, reward_value)
       VALUES ($1, $2, $3)`,
      [telegramId, reward.type, reward.value.toString()]
    );

    // 6️⃣ Отримати оновлений баланс
    const updatedUser = await db.query(
      "SELECT stars, raffle_tickets FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    res.json({
      success: true,
      result: reward,
      balance: updatedUser.rows[0].stars,
      tickets: updatedUser.rows[0].raffle_tickets,
    });
  } catch (err) {
    console.error("Wheel spin error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
