const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const axios = require("axios");

const router = express.Router();
router.use(authMiddleware);

// ===============================================================
// 🧾 GET /api/wheel/invoice — створення Telegram invoice для оплати спіну
// ===============================================================
router.get("/invoice", async (req, res) => {
  try {
    const { telegramId } = req.user;

    // Дані для інвойсу Telegram Stars
    const invoice = {
      title: "Wheel of Fortune Spin",
      description: "Spin the wheel for awesome rewards!",
      payload: `wheel_spin_${telegramId}`,
      currency: "XTR", // Telegram Stars
      prices: [{ label: "Spin", amount: 1 }], // 10 зірок
    };

    res.json({ success: true, invoice });
  } catch (err) {
    console.error("Invoice error:", err);
    res.status(500).json({ success: false, message: "Failed to create invoice" });
  }
});

// ===============================================================
// 🎡 POST /api/wheel/spin — логіка обертання після оплати
// ===============================================================
router.post("/spin", async (req, res) => {
  try {
    const { telegramId } = req.user;

    // 1️⃣ Перевіряємо користувача
    const userResult = await db.query(
      "SELECT telegram_id FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // 2️⃣ Випадковий шанс (98% квиток, 1% NFT, 1% зірки)
    const roll = Math.random() * 100;
    let reward = { type: "raffle_ticket", value: 1 };

    if (roll >= 98 && roll < 99) {
      reward = { type: "nft", value: "Mystery Box" };
    } else if (roll >= 99) {
      reward = { type: "stars", value: 5 };

      // +5 зірок користувачу
      await db.query("UPDATE users SET stars = stars + 5 WHERE telegram_id = $1", [
        telegramId,
      ]);
    } else {
      // +1 квиток
      await db.query(
        "UPDATE users SET raffle_tickets = raffle_tickets + 1 WHERE telegram_id = $1",
        [telegramId]
      );
    }

    // 3️⃣ Запис у таблицю user_spins (історія)
    await db.query(
      `INSERT INTO user_spins (user_id, reward_type, reward_value)
       VALUES ($1, $2, $3)`,
      [telegramId, reward.type, reward.value.toString()]
    );

    // 4️⃣ Повертаємо оновлений баланс
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
