const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const axios = require("axios");

const router = express.Router();
router.use(authMiddleware);

// ===============================================================
// 🧾 POST /api/wheel/create_invoice
// (Цей роут залишається без змін)
// ===============================================================
router.post("/create_invoice", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const spinPrice = 10; // 1 XTR

    const botToken = process.env.BOT_TOKEN;

    const response = await axios.post(
      `https://api.telegram.org/bot${botToken}/createInvoiceLink`,
      {
        title: "Wheel of Fortune Spin",
        description: "Spin the wheel for awesome rewards!",
        payload: `wheel_spin_${telegramId}_${Date.now()}`,
        provider_token: "",
        currency: "XTR",
        prices: [{ label: "Spin Cost", amount: spinPrice }],
      }
    );

    if (response.data && response.data.ok && response.data.result) {
      res.json({ success: true, invoice_link: response.data.result });
    } else {
      throw new Error("Failed to get invoice link from Telegram API");
    }
  } catch (err) {
    console.error(
      "Create wheel invoice error:",
      err.response?.data || err.message
    );
    res.status(500).json({ success: false, message: "Failed to create invoice" });
  }
});

// ===============================================================
// 🎡 POST /api/wheel/spin
// (Оновлена логіка шансів)
// ===============================================================
router.post("/spin", async (req, res) => {
  try {
    const { telegramId } = req.user;

    const roll = Math.random() * 100; // Розіграш від 0 до 99.99
    let reward;

    // ❗️ ОСЬ ТУТ ВАШІ НОВІ ШАНСИ:

    // 80% Ticket (діапазон 0 - 79.99)
if (roll < 90) {
  // 90% NFT
  reward = { type: "nft", value: "Mystery Box" };
  // ... (логіка NFT, якщо потрібна)
} 
else if (roll < 95) {
  // 5% квиток
  reward = { type: "raffle_ticket", value: 1 };
  await db.query(
    "UPDATE users SET tickets = tickets + 1 WHERE telegram_id = $1",
    [telegramId]
  );
} 
else if (roll < 98) {
  // 3% буст
  reward = { type: "boost", value: "x2 Clicks" };
  await db.query(
    "UPDATE users SET tap_power = tap_power + 2 WHERE telegram_id = $1",
    [telegramId]
  );
} 
else {
  // 2% зірки
  reward = { type: "stars", value: 5 };
  await db.query(
    "UPDATE users SET balance = balance + 5 WHERE telegram_id = $1",
    [telegramId]
  );
}

    // Записуємо історію спіну
    await db.query(
      `INSERT INTO user_spins (user_id, reward_type, reward_value)
       VALUES ($1, $2, $3)`,
      [telegramId, reward.type, reward.value.toString()]
    );

    // Повертаємо оновлені дані, включаючи tap_power
    const updatedUser = await db.query(
      "SELECT balance, tickets, tap_power FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (updatedUser.rows.length === 0) {
      console.error(`User not found with telegramId ${telegramId} after spin`);
      return res.status(404).json({ success: false, message: "User not found after spin" });
    }

    res.json({
      success: true,
      result: reward, // 'result' тепер коректно відповідає тому, що сталося
      balance: updatedUser.rows[0].balance,
      tickets: updatedUser.rows[0].tickets,
      tap_power: updatedUser.rows[0].tap_power,
    });
  } catch (err) {
    console.error("Wheel spin error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;