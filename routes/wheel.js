const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const axios = require("axios");

const router = express.Router();
router.use(authMiddleware);

// ===============================================================
// 🧾 POST /api/wheel/create_invoice — створюємо меню оплати зірками
// ===============================================================
router.post("/create_invoice", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const spinPrice = 1; // вартість одного спіну у зірках

    const botToken = process.env.BOT_TOKEN;

    const response = await axios.post(
      `https://api.telegram.org/bot${botToken}/createInvoiceLink`,
      {
        title: "Wheel of Fortune Spin",
        description: "Spin the wheel for awesome rewards!",
        payload: `wheel_spin_${telegramId}`,
        provider_token: "", // для внутрішніх зірок
        currency: "XTR",
        prices: [{ label: "Spin", amount: spinPrice }],
      }
    );

    res.json({ success: true, invoice_link: response.data.result });
  } catch (err) {
    console.error("Create wheel invoice error:", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Failed to create invoice" });
  }
});

// ===============================================================
// 🎡 POST /api/wheel/spin — викликається після успішної оплати
// ===============================================================
router.post("/spin", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const spinPrice = 10; // вартість спіну

    // Перевіряємо баланс користувача
    const userResult = await db.query(
      "SELECT stars FROM users WHERE telegram_id = $1",
      [telegramId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (userResult.rows[0].stars < spinPrice) {
      return res.status(400).json({ success: false, message: "Not enough stars" });
    }

    // Віднімаємо зірки за спін
    await db.query("UPDATE users SET stars = stars - $1 WHERE telegram_id = $2", [
      spinPrice,
      telegramId,
    ]);

    // Випадковий шанс для нагороди
    const roll = Math.random() * 100;
    let reward = { type: "raffle_ticket", value: 1 };

    if (roll >= 98 && roll < 99) {
      reward = { type: "nft", value: "Mystery Box" };
    } else if (roll >= 99) {
      reward = { type: "stars", value: 5 };
      // додаємо зірки користувачу
      await db.query("UPDATE users SET stars = stars + 5 WHERE telegram_id = $1", [telegramId]);
    } else {
      // +1 квиток
      await db.query(
        "UPDATE users SET raffle_tickets = raffle_tickets + 1 WHERE telegram_id = $1",
        [telegramId]
      );
    }

    // Записуємо історію спіну
    await db.query(
      `INSERT INTO user_spins (user_id, reward_type, reward_value)
       VALUES ($1, $2, $3)`,
      [telegramId, reward.type, reward.value.toString()]
    );

    // Повертаємо оновлений баланс
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
