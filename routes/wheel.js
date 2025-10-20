const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const axios = require("axios");
require("dotenv").config();

const router = express.Router();
router.use(authMiddleware);

// ===============================================================
// 💰 GET /api/wheel/invoice — створити платіж для 10 Telegram Stars
// ===============================================================
router.get("/invoice", async (req, res) => {
  try {
    const { telegramId } = req.user;

    const invoiceData = {
      title: "🎡 Wheel of Fortune Spin",
      description: "Try your luck and win tickets, NFTs, or stars!",
      payload: `wheel_spin_${telegramId}_${Date.now()}`,
      currency: "XTR", // Telegram Stars
      prices: [{ label: "Spin", amount: 1 }], // 10 stars
    };

    res.json({ success: true, invoice: invoiceData });
  } catch (err) {
    console.error("Invoice error:", err);
    res.status(500).json({ success: false, message: "Failed to create invoice" });
  }
});

// ===============================================================
// 🎡 POST /api/wheel/spin — обробити виграш після успішної оплати
// ===============================================================
router.post("/spin", async (req, res) => {
  try {
    const { telegramId } = req.user;

    // Перевірка існування користувача
    const userResult = await db.query(
      "SELECT telegram_id FROM users WHERE telegram_id = $1",
      [telegramId]
    );
    if (userResult.rows.length === 0)
      return res.status(404).json({ success: false, message: "User not found" });

    // 🎲 Генеруємо випадковий результат
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
      await db.query(
        "UPDATE users SET raffle_tickets = raffle_tickets + 1 WHERE telegram_id = $1",
        [telegramId]
      );
    }

    // 🧾 Запис у історію
    await db.query(
      `INSERT INTO user_spins (user_id, reward_type, reward_value)
       VALUES ($1, $2, $3)`,
      [telegramId, reward.type, reward.value.toString()]
    );

    // ⚙️ Отримати оновлений баланс
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
