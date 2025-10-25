const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const axios = require("axios");

const router = express.Router();
router.use(authMiddleware);

// ===============================================================
// 🧾 POST /api/deposit/create_invoice
// Створення інвойсу Telegram для поповнення
// ===============================================================
router.post("/create_invoice", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const { amount } = req.body;

    if (!amount || amount <= 0)
      return res.status(400).json({ success: false, message: "Invalid amount" });

    const botToken = process.env.BOT_TOKEN;

    const response = await axios.post(
      `https://api.telegram.org/bot${botToken}/createInvoiceLink`,
      {
        title: "Deposit Stars",
        description: `Deposit ${amount}⭐ to your balance`,
        payload: `deposit_${telegramId}_${amount}_${Date.now()}`,
        provider_token: "", // ⚠️ Вкажи токен платіжного провайдера
        currency: "XTR",
        prices: [{ label: "Deposit", amount }],
      }
    );

    if (response.data?.ok && response.data.result) {
      res.json({ success: true, invoice_link: response.data.result });
    } else {
      throw new Error("Telegram API error");
    }
  } catch (err) {
    console.error("Create deposit invoice error:", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Failed to create deposit invoice" });
  }
});

// ===============================================================
// 💳 POST /api/deposit/webhook
// Обробка підтвердження платежів від Telegram
// ===============================================================
router.post("/webhook", async (req, res) => {
  try {
    const update = req.body;

    // 🔍 Telegram надсилає payment_successful
    if (update.message?.successful_payment) {
      const payment = update.message.successful_payment;

      const payload = payment.invoice_payload;
      if (!payload.startsWith("deposit_")) {
        console.log("Not a deposit payload");
        return res.sendStatus(200);
      }

      const [, telegramId, amountStr] = payload.split("_");
      const amount = parseInt(amountStr, 10);

      // 🎁 Розрахунок бонусів для першого депозиту
      let bonus = 0;
      if (amount === 100) bonus = 20;
      else if (amount === 500) bonus = 100;
      else if (amount === 1000) bonus = 300;

      // 🔍 Перевірка чи це перший депозит
      const depositCheck = await db.query(
        "SELECT COUNT(*) AS total FROM deposits WHERE telegram_id = $1",
        [telegramId]
      );
      const isFirstDeposit = parseInt(depositCheck.rows[0].total) === 0;

      // 💰 Додаємо зірки на баланс користувача
      const totalStars = amount + (isFirstDeposit ? bonus : 0);
      await db.query(
        "UPDATE users SET balance = balance + $1 WHERE telegram_id = $2",
        [totalStars, telegramId]
      );

      // 💾 Запис у таблицю депозитів
      await db.query(
        `INSERT INTO deposits (telegram_id, amount, bonus, total_added)
         VALUES ($1, $2, $3, $4)`,
        [telegramId, amount, isFirstDeposit ? bonus : 0, totalStars]
      );

      // 📨 Сповіщення адміну
      const botToken = process.env.BOT_TOKEN;
      const adminChatId = process.env.ADMIN_CHAT_ID;

      const message = `
💰 *Новий депозит!*
👤 ID: ${telegramId}
⭐ Сума: ${amount}
🎁 Бонус: ${isFirstDeposit ? bonus : 0}
💎 Додано на баланс: ${totalStars}
`;

      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: adminChatId,
        text: message,
        parse_mode: "Markdown",
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Deposit webhook error:", err);
    res.sendStatus(500);
  }
});

module.exports = router;
