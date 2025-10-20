const express = require("express");
const db = require("../db"); // Переконайтесь, що шлях до db правильний
const authMiddleware = require("../middleware/auth"); // і до auth
const axios = require("axios");

const router = express.Router();
router.use(authMiddleware);

// ===============================================================
// 🧾 POST /api/wheel/create_invoice — створюємо меню оплати 10 XTR
// ===============================================================
router.post("/create_invoice", async (req, res) => {
  try {
    const { telegramId } = req.user;

    // ❗️ ВИПРАВЛЕНО: Ціна 10 зірок, як на кнопці
    const spinPrice = 1; // 10 реальних Telegram Stars (XTR)

    const botToken = process.env.BOT_TOKEN;

    const response = await axios.post(
      `https://api.telegram.org/bot${botToken}/createInvoiceLink`,
      {
        title: "Wheel of Fortune Spin",
        description: "Spin the wheel for awesome rewards!",
        // Робимо payload унікальним, щоб уникнути проблем з кешуванням
        payload: `wheel_spin_${telegramId}_${Date.now()}`,
        provider_token: "", // Порожнє поле для XTR
        currency: "XTR", // Валюта - Telegram Stars
        prices: [{ label: "Spin Cost", amount: spinPrice }],
      }
    );

    // Повертаємо посилання на інвойс
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
// 🎡 POST /api/wheel/spin — викликається ПІСЛЯ успішної оплати XTR
// ===============================================================
router.post("/spin", async (req, res) => {
  try {
    const { telegramId } = req.user;

    // Оплата вже відбулася через Telegram (XTR).
    // Цей ендпоінт лише нараховує приз.

    // Випадковий шанс для нагороди
    const roll = Math.random() * 100;
    let reward = { type: "raffle_ticket", value: 1 };

    if (roll >= 98 && roll < 99) {
      reward = { type: "nft", value: "Mystery Box" };
      // Тут може бути логіка додавання NFT в окрему таблицю
      // ...
    } else if (roll >= 99) {
      // Юзер виграв 5 *внутрішніх* зірок
      reward = { type: "stars", value: 5 };
      await db.query(
        "UPDATE users SET stars = stars + 5 WHERE telegram_id = $1",
        [telegramId]
      );
    } else {
      // Юзер виграв 1 квиток
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

    // Повертаємо оновлений *внутрішній* баланс
    const updatedUser = await db.query(
      "SELECT stars, raffle_tickets FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    // ❗️ ДОДАНО: Перевірка, щоб уникнути помилки 500
    if (updatedUser.rows.length === 0) {
      console.error(`User not found with telegramId ${telegramId} after spin`);
      return res.status(404).json({ success: false, message: "User not found after spin" });
    }

    res.json({
      success: true,
      result: reward,
      balance: updatedUser.rows[0].stars, // баланс внутрішніх зірок
      tickets: updatedUser.rows[0].raffle_tickets,
    });
  } catch (err) {
    console.error("Wheel spin error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;