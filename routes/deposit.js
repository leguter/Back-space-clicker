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
        payload: `deposit_${telegramId}_${amount}_${Date.now()}`, // унікальний payload
        provider_token: "", // ⚠️ Вкажи токен платіжного провайдера
        currency: "XTR",
        prices: [{ label: "Deposit", amount }],
      }
    );

    if (response.data?.ok && response.data.result) {
      // Повертаємо payload для фронту, щоб він надсилав на complete
      res.json({
        success: true,
        invoice_link: response.data.result,
        payload: response.data.result.invoice_payload || response.data.result, 
      });
    } else {
      throw new Error("Telegram API error");
    }
  } catch (err) {
    console.error("Create deposit invoice error:", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Failed to create deposit invoice" });
  }
});

// ===============================================================
// 💳 POST /api/deposit/complete
// Підтвердження оплати через payload Telegram та оновлення internal_stars
// ===============================================================
router.post("/complete", authMiddleware, async (req, res) => {
  try {
    const { telegramId } = req.user;
    const { payload } = req.body;

    if (!payload) return res.status(400).json({ success: false });

    // 🔹 Перевірка платежу через Telegram API
    const botToken = process.env.BOT_TOKEN;
    const invoiceResponse = await axios.post(
      `https://api.telegram.org/bot${botToken}/getInvoiceLink`, 
      { payload }
    );

    const paymentSuccess = invoiceResponse.data?.ok && invoiceResponse.data.result?.is_paid;
    if (!paymentSuccess) return res.status(400).json({ success: false, message: "Payment not confirmed" });

    const [, payloadTelegramId, amountStr] = payload.split("_");
    const amount = parseInt(amountStr, 10);

    const depositCheck = await db.query(
      "SELECT COUNT(*) AS total FROM deposits WHERE telegram_id = $1",
      [telegramId]
    );
    const isFirstDeposit = parseInt(depositCheck.rows[0].total, 10) === 0;

    let bonus = 0;
    if (amount === 100) bonus = 20;
    else if (amount === 500) bonus = 100;
    else if (amount === 1000) bonus = 300;

    const totalStars = amount + (isFirstDeposit ? bonus : 0);

    await db.query(
      "UPDATE users SET internal_stars = internal_stars + $1 WHERE telegram_id = $2",
      [totalStars, telegramId]
    );

    await db.query(
      "INSERT INTO deposits (telegram_id, amount, bonus, total_added) VALUES ($1,$2,$3,$4)",
      [telegramId, amount, isFirstDeposit ? bonus : 0, totalStars]
    );

    res.json({ success: true, internal_stars: totalStars });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
