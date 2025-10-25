const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const axios = require("axios");
require("dotenv").config();

const router = express.Router();
router.use(authMiddleware);

// ===============================================================
// ✅ GET /api/user/me — Отримати дані користувача
// ===============================================================
router.get("/me", async (req, res) => {
  try {
    const { telegramId } = req.user;

    const userResult = await db.query(
      `
      SELECT 
        telegram_id, 
        first_name, 
        username, 
        balance, 
        tap_power, 
        tickets,
        internal_stars,
        click_progress,
        (
          SELECT COUNT(*) 
          FROM referrals 
          WHERE referrer_telegram_id = users.telegram_id
        ) AS referrals
      FROM users 
      WHERE telegram_id = $1
      `,
      [telegramId]
    );

    if (userResult.rows.length === 0)
      return res.status(404).json({ message: "User not found" });

    res.json(userResult.rows[0]);
  } catch (error) {
    console.error("User fetch error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ===============================================================
// ✅ POST /api/user/tap — Обробка натискання (оновлює баланс і прогрес)
// ===============================================================
router.post("/tap", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const userResult = await db.query(
      "SELECT tap_power, click_progress FROM users WHERE telegram_id = $1",
      [telegramId]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ message: "User not found" });

    const { tap_power, click_progress } = userResult.rows[0];
    const tapPower = Number(tap_power) || 1;

    // Інкремент прогресу — один тап додає tapPower/1000
    const progressIncrement = tapPower / 1000;
    const current = Number(click_progress) || 0;
    const newProgress = Math.min(current + progressIncrement, 1);

    const result = await db.query(
      `UPDATE users 
       SET balance = balance + $2, click_progress = $3 
       WHERE telegram_id = $1
       RETURNING balance, click_progress`,
      [telegramId, tapPower, newProgress]
    );

    return res.json({
      newBalance: result.rows[0].balance,
      progress: Number(result.rows[0].click_progress),
      tapPower,
    });
  } catch (err) {
    console.error("❌ /tap error:", err);
    return res.status(500).json({ message: "Server error during tap" });
  }
});

// POST /api/user/update-clicks
router.post("/update-clicks", async (req, res) => {
  try {
    const { telegramId } = req.user;
    
    // Ми очікуємо, що фронтенд надсилає { clickCount: 100 }
    // (де 100 - це загальна сума кліків, яку треба додати)
    const { clickCount } = req.body;

    if (typeof clickCount !== "number" || !Number.isFinite(clickCount) || clickCount <= 0) {
      return res.status(400).json({ message: "Invalid clickCount value" });
    }

    // 1. Отримуємо поточний прогрес
    const userResult = await db.query(
      "SELECT click_progress FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (userResult.rows.length === 0) return res.status(404).json({ message: "User not found" });

    // 2. Розраховуємо новий прогрес
    // (Логіка така сама, як у тебе: 1000 "кліків" = 1 повний бар)
    const progressIncrement = clickCount / 1000.0; 
    const currentProgress = Number(userResult.rows[0].click_progress) || 0;
    
    let newProgress = currentProgress + progressIncrement;
    // Ми не скидаємо прогрес тут, ми просто обмежуємо його 1.
    // Скидання (progress = 0) відбувається тільки в /claim-ticket
    if (newProgress > 1) newProgress = 1; 

    // 3. ❗️ ГОЛОВНЕ ВИПРАВЛЕННЯ:
    // Оновлюємо І БАЛАНС, І ПРОГРЕС
    const updateResult = await db.query(
      `UPDATE users 
       SET 
         balance = balance + $1,  -- ⬅️ ЦЬОГО РЯДКА НЕ БУЛО
         click_progress = $2 
       WHERE telegram_id = $3
       RETURNING balance, click_progress`,
      [clickCount, newProgress, telegramId]
    );

    return res.json({
      message: "Balance and progress updated",
      newBalance: updateResult.rows[0].balance,
      progress: Number(updateResult.rows[0].click_progress),
    });

  } catch (err) {
    console.error("❌ /update-clicks error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/user/claim-ticket
router.post("/claim-ticket", async (req, res) => {
  try {
    const { telegramId } = req.user;

    const result = await db.query(
      "SELECT click_progress, tickets FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });

    const user = result.rows[0];
    const progress = Number(user.click_progress) || 0;
    if (progress < 1) return res.status(400).json({ message: "Progress not complete yet" });

    const newTickets = (user.tickets || 0) + 1;
    await db.query(
      "UPDATE users SET tickets = $1, click_progress = 0 WHERE telegram_id = $2",
      [newTickets, telegramId]
    );

    return res.json({ message: "Ticket claimed", tickets: newTickets, progress: 0 });
  } catch (err) {
    console.error("❌ /claim-ticket error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ===============================================================
// ✅ POST /api/user/claim/subscription — Нагорода за підписку на канал
// ===============================================================
router.post("/claim/subscription", async (req, res) => {
  const { telegramId } = req.user;
  const taskId = "follow_telegram_channel";

  try {
    const existingTaskResult = await db.query(
      "SELECT * FROM user_tasks WHERE user_telegram_id = $1 AND task_id = $2",
      [telegramId, taskId]
    );

    if (existingTaskResult.rows.length > 0)
      return res.status(409).json({ message: "Нагорода вже отримана." });

    const botToken = process.env.BOT_TOKEN;
    const channelId = process.env.TELEGRAM_CHANNEL_ID;

    if (!botToken || !channelId)
      return res.status(500).json({ message: "BOT_TOKEN або TELEGRAM_CHANNEL_ID не задані." });

    const apiUrl = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channelId}&user_id=${telegramId}`;
    const response = await axios.get(apiUrl);
    const memberStatus = response.data.result?.status;
    const isSubscribed = ["member", "administrator", "creator"].includes(memberStatus);

    if (!isSubscribed)
      return res.status(403).json({ message: "Ви не підписані на канал." });

    const client = await db.connect();
    try {
      await client.query("BEGIN");


      const updateUserResult = await client.query(
        "UPDATE users SET tap_power = tap_power + 2, tickets = COALESCE(tickets, 0) + 2 WHERE telegram_id = $1 RETURNING tap_power, tickets",
        [telegramId]
      );

      await client.query(
        "INSERT INTO user_tasks (user_telegram_id, task_id) VALUES ($1, $2)",
        [telegramId, taskId]
      );

      await client.query("COMMIT");

      res.json({
        message: "Нагороду успішно отримано!",
        newTapPower: updateUserResult.rows[0].tap_power,
        newTickets: updateUserResult.rows[0].tickets,
      });
    } catch (dbError) {
      await client.query("ROLLBACK");
      console.error("DB transaction error:", dbError);
      res.status(500).json({ message: "Помилка при оновленні користувача." });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Claim subscription general error:", error);
    res.status(500).json({ message: "Внутрішня помилка сервера." });
  }
});

// ===============================================================
// ✅ GET /api/user/tasks — Отримати список виконаних завдань
// ===============================================================
router.get("/tasks", async (req, res) => {
  try {
    const { telegramId } = req.user;

    const result = await db.query(
      "SELECT task_id FROM user_tasks WHERE user_telegram_id = $1",
      [telegramId]
    );

    res.json({ completedTasks: result.rows.map((row) => row.task_id) });
  } catch (error) {
    console.error("Error fetching user tasks:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ===============================================================
// ✅ POST /api/user/create_invoice — Покупка бустерів через Telegram Stars
// ===============================================================
router.post("/create_invoice", async (req, res) => {
  const { booster } = req.body;

  const pricesInStars = {
    speed: 15,
    auto_clicker: 40,
  };

  const title = booster === "speed" ? "x2 Speed Booster" : "Auto Clicker";
  const stars = pricesInStars[booster] || 1;
  const amount = stars;

  try {
    const botToken = process.env.BOT_TOKEN;
    const response = await axios.post(
      `https://api.telegram.org/bot${botToken}/createInvoiceLink`,
      {
        title,
        description: `Purchase ${title}`,
        payload: `booster_${booster}`,
        provider_token: "",
        currency: "XTR",
        prices: [{ label: `${title}`, amount }],
      }
    );

    res.json({ invoice_link: response.data.result });
  } catch (err) {
    console.error("Create invoice error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

// ===============================================================
// ✅ POST /api/user/referral/register — Реєстрація реферала
// ===============================================================
router.post("/referral/register", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const { referrerId } = req.body;

    if (!referrerId)
      return res.status(400).json({ message: "referrerId is required" });
    if (telegramId === Number(referrerId))
      return res.status(400).json({ message: "You cannot refer yourself" });

    const existing = await db.query(
      "SELECT * FROM referrals WHERE referred_telegram_id = $1",
      [telegramId]
    );
    if (existing.rows.length > 0)
      return res.status(409).json({ message: "Referral already registered" });

    const referrer = await db.query(
      "SELECT telegram_id FROM users WHERE telegram_id = $1",
      [referrerId]
    );
    if (referrer.rows.length === 0)
      return res.status(404).json({ message: "Referrer not found" });

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        "INSERT INTO referrals (referrer_telegram_id, referred_telegram_id) VALUES ($1, $2)",
        [referrerId, telegramId]
      );

      await client.query(
        "UPDATE users SET tickets = COALESCE(tickets, 0) + 2 WHERE telegram_id = $1",
        [referrerId]
      );

      await client.query("COMMIT");
      res.json({ message: "Referral registered successfully!" });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Referral transaction error:", err);
      res.status(500).json({ message: "Failed to register referral" });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Referral register error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ===============================================================
// ✅ GET /api/user/referrals/count — Кількість рефералів
// ===============================================================
router.get("/referrals/count", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const result = await db.query(
      "SELECT COUNT(*) FROM referrals WHERE referrer_telegram_id = $1",
      [telegramId]
    );
    res.json({ referralsCount: Number(result.rows[0].count) });
  } catch (error) {
    console.error("Get referrals count error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
