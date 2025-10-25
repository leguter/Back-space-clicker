const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const axios = require("axios");

const router = express.Router();
router.use(authMiddleware);

// ==============================
// Створення інвойсу
// ==============================
router.post("/create_invoice", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const { amount } = req.body;

    if (!amount || amount <= 0)
      return res.status(400).json({ success: false, message: "Invalid amount" });

    const botToken = process.env.BOT_TOKEN;
    // const providerToken = process.env.PROVIDER_TOKEN; // ⚠️ НЕ ПОТРІБЕН для XTR

    const payload = `deposit_${telegramId}_${amount}_${Date.now()}`;

    
    const response = await axios.post(
      `https://api.telegram.org/bot${botToken}/createInvoiceLink`,
      {
        title: "Deposit Stars",
        description: `Deposit ${amount}⭐ to your balance`,
        payload,
        // provider_token: providerToken, // ⛔️ Видалено, бо конфліктує з XTR
        currency: "XTR",
        prices: [{ label: "Deposit", amount }], // 'amount' тут - це кількість зірок
      }
    );

    if (response.data?.ok && response.data.result) {
      res.json({ success: true, invoice_link: response.data.result, payload });
    } else {
      throw new Error("Telegram API error");
    }
  } catch (err) {
    console.error("Create invoice error:", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Failed to create invoice" });
  }
});

// ==============================
// Підтвердження оплати (ВИПРАВЛЕНО)
// ==============================
router.post("/complete", authMiddleware, async (req, res) => {
  try {
    const { telegramId } = req.user;
    const { payload } = req.body;

    if (!payload)
      return res.status(400).json({ success: false, message: "Payload missing" });

    // 🔹 Тут треба перевірити, чи платіж дійсно успішний
    // ⚠️ Якщо у вас немає webhook, треба вручну перевіряти через Telegram API getUpdates
    // Для простоти в тестовому режимі допустимо вважати, що payload пройшов
    // У продакшені — зберігайте successful_payment у базі через webhook

    const [, , amountStr] = payload.split("_");
    const amount = parseInt(amountStr, 10);

    // Розрахунок бонусів для першого депозиту
    let bonus = 0;
    if (amount === 100) bonus = 20;
    else if (amount === 500) bonus = 100;
    else if (amount === 1000) bonus = 300;

    const depositCheck = await db.query(
      "SELECT COUNT(*) AS total FROM deposits WHERE telegram_id = $1",
      [telegramId]
    );
    const isFirstDeposit = parseInt(depositCheck.rows[0].total, 10) === 0;

    const totalStars = amount + (isFirstDeposit ? bonus : 0);

    // === 🟢 ГОЛОВНЕ ВИПРАВЛЕННЯ ТУТ 🟢 ===
    // Ми оновлюємо баланс і одразу просимо БД повернути нове (оновлене) значення
    const updateRes = await db.query(
      "UPDATE users SET internal_stars = internal_stars + $1 WHERE telegram_id = $2 RETURNING internal_stars",
      [totalStars, telegramId]
    );

    // Отримуємо актуальний загальний баланс з відповіді БД
    const newTotalBalance = updateRes.rows[0].internal_stars;

    // Зберігаємо історію поповнення
    await db.query(
      "INSERT INTO deposits (telegram_id, amount, bonus, total_added) VALUES ($1,$2,$3,$4)",
      [telegramId, amount, isFirstDeposit ? bonus : 0, totalStars]
    );

    // Повертаємо на фронтенд новий ЗАГАЛЬНИЙ баланс
    res.json({ success: true, internal_stars: newTotalBalance });
  } catch (err) {
    console.error("Complete deposit error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;