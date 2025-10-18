// const express = require("express");
// const db = require("../db");
// const authMiddleware = require("../middleware/auth");

// const router = express.Router();
// router.use(authMiddleware);

// // ✅ Отримати дані користувача
// router.get("/me", async (req, res) => {
//   try {
//     const { telegramId } = req.user;
//     const userResult = await db.query(
//       "SELECT telegram_id, first_name, username, balance, tap_power FROM users WHERE telegram_id = $1",
//       [telegramId]
//     );

//     if (userResult.rows.length === 0) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     res.json(userResult.rows[0]);
//   } catch (error) {
//     console.error("User fetch error:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // ✅ Обробка натискання (tap)
// router.post("/tap", async (req, res) => {
//   try {
//     const { telegramId } = req.user;

//     // Отримуємо поточну силу натискання користувача
//     const userResult = await db.query(
//       "SELECT tap_power FROM users WHERE telegram_id = $1",
//       [telegramId]
//     );

//     if (userResult.rows.length === 0) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     const tapPower = userResult.rows[0].tap_power || 1;

//     // Атомарно оновлюємо баланс із урахуванням tapPower
//     const result = await db.query(
//       "UPDATE users SET balance = balance + $2 WHERE telegram_id = $1 RETURNING balance",
//       [telegramId, tapPower]
//     );

//     res.json({
//       newBalance: result.rows[0].balance,
//       added: tapPower, // скільки додалось
//     });
//   } catch (error) {
//     console.error("Tap error:", error);
//     res.status(500).json({ message: "Server error during tap" });
//   }
// });

// module.exports = router;
// // user.js

// const express = require("express");
// const db = require("../db");
// const authMiddleware = require("../middleware/auth");
// const axios = require("axios"); // Переконайтесь, що axios встановлено (npm install axios)

// // Важливо: для завантаження змінних з .env файлу
// require('dotenv').config();

// routes/user.js

const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const axios = require("axios");
require("dotenv").config();

const router = express.Router();
router.use(authMiddleware);

// ====================================================================
// ✅ Отримати дані користувача
// ====================================================================
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
        (
          SELECT COUNT(*) 
          FROM users 
          WHERE referred_by = users.telegram_id
        ) AS referrals
      FROM users 
      WHERE telegram_id = $1
      `,
      [telegramId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(userResult.rows[0]);
  } catch (error) {
    console.error("User fetch error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


// ====================================================================
// ✅ Обробка натискання (tap)
// ====================================================================
router.post("/tap", async (req, res) => {
  try {
    const { telegramId } = req.user;

    const userResult = await db.query(
      "SELECT tap_power FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });

    }

    const tapPower = userResult.rows[0].tap_power || 1;

    const result = await db.query(
      "UPDATE users SET balance = balance + $2 WHERE telegram_id = $1 RETURNING balance",
      [telegramId, tapPower]
    );

    res.json({
      newBalance: result.rows[0].balance,
      tapPower: tapPower,
    });
  } catch (error) {
    console.error("Tap error:", error);
    res.status(500).json({ message: "Server error during tap" });
  }
});

// ====================================================================
// ✅ НОВИЙ РОУТ: Перевірка підписки на канал та нарахування нагороди
// ====================================================================
router.post("/claim/subscription", async (req, res) => {
  const { telegramId } = req.user;
  const taskId = "follow_telegram_channel";

  try {
    // 1. Перевіряємо, чи вже отримував нагороду
    const existingTaskResult = await db.query(
      "SELECT * FROM user_tasks WHERE user_telegram_id = $1 AND task_id = $2",
      [telegramId, taskId]
    );

    if (existingTaskResult.rows.length > 0) {
      return res.status(409).json({ message: "Нагорода вже отримана." });
    }

    // 2. Перевіряємо підписку через Telegram API
    const botToken = process.env.BOT_TOKEN;
    const channelId = process.env.TELEGRAM_CHANNEL_ID; // Наприклад '@my_channel'

    if (!botToken || !channelId) {
      console.error("Відсутні BOT_TOKEN або TELEGRAM_CHANNEL_ID у .env");
      return res.status(500).json({ message: "Помилка конфігурації сервера." });
    }

    const apiUrl = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channelId}&user_id=${telegramId}`;
    let memberStatus;

    try {
      const response = await axios.get(apiUrl);
      memberStatus = response.data.result?.status;
    } catch (apiError) {
      console.error("Telegram API error:", apiError.response?.data || apiError.message);
      return res.status(502).json({ message: "Не вдалося перевірити підписку. Спробуйте пізніше." });
    }

    const isSubscribed = ["member", "administrator", "creator"].includes(memberStatus);

    if (!isSubscribed) {
      return res.status(403).json({ message: "Ви не підписані на канал." });
    }

    // 3. Транзакційно оновлюємо користувача
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const updateUserResult = await client.query(
        "UPDATE users SET tap_power = tap_power * 2, tickets = COALESCE(tickets, 0) + 2 WHERE telegram_id = $1 RETURNING tap_power, tickets",
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
      res.status(500).json({ message: "Помилка при оновленні даних користувача." });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Claim subscription general error:", error);
    res.status(500).json({ message: "Внутрішня помилка сервера." });
  }
});

// ====================================================================
// ✅ Отримати список виконаних завдань
// ====================================================================
router.get("/tasks", async (req, res) => {
  try {
    const { telegramId } = req.user;

    const result = await db.query(
      "SELECT task_id FROM user_tasks WHERE user_telegram_id = $1",
      [telegramId]
    );

    const completedTasks = result.rows.map(row => row.task_id);
    res.json({ completedTasks });
  } catch (error) {
    console.error("Error fetching user tasks:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/create_invoice", async (req, res) => {
  const { booster } = req.body;

  // 💫 Вказуєш скільки ЗІРОК коштує бустер (у звичних одиницях)
  const pricesInStars = {
    speed: 1,          // 1 ⭐
    auto_clicker: 2,   // 2 ⭐
  };

  const title = booster === "speed" ? "x2 Speed Booster" : "Auto Clicker";
  const stars = pricesInStars[booster] || 1;

  // 🔹 Telegram API очікує значення у “копійках” (1⭐ = 100)
  const amount = stars;

  try {
    const botToken = process.env.BOT_TOKEN;
    const response = await axios.post(
      `https://api.telegram.org/bot${botToken}/createInvoiceLink`,
      {
        title,
        description: `Purchase ${title}`,
        payload: `booster_${booster}`,
        provider_token: "", // для Telegram Stars залишаємо пустим
        currency: "XTR", // Telegram Stars
        prices: [{ label: `${title}`, amount }],
      }
    );

    res.json({ invoice_link: response.data.result });
  } catch (err) {
    console.error("Create invoice error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to create invoice" });
  }

  // referal logic 

  router.post("/referral/register", async (req, res) => {
  try {
    const { telegramId } = req.user; // ID користувача, який увійшов (новачок)
    const { referrerId } = req.body; // ID користувача, який запросив

    if (!referrerId) {
      return res.status(400).json({ message: "referrerId is required" });
    }

    if (telegramId === Number(referrerId)) {
      return res.status(400).json({ message: "You cannot refer yourself" });
    }

    // Перевіряємо, чи цей користувач вже має реферера
    const existing = await db.query(
      "SELECT * FROM referrals WHERE referred_telegram_id = $1",
      [telegramId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "Referral already registered" });
    }

    // Перевіряємо, чи існує реферер у базі
    const referrer = await db.query(
      "SELECT telegram_id FROM users WHERE telegram_id = $1",
      [referrerId]
    );
    if (referrer.rows.length === 0) {
      return res.status(404).json({ message: "Referrer not found" });
    }

    // Транзакція
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // 1️⃣ Зберігаємо зв'язок
      await client.query(
        "INSERT INTO referrals (referrer_telegram_id, referred_telegram_id) VALUES ($1, $2)",
        [referrerId, telegramId]
      );

      // 2️⃣ Нараховуємо бонус рефереру
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
});

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

router.post("/update-clicks", async (req, res) => {
  try {
    const { clickCount } = req.body;
    const { telegramId } = req.user;

    if (typeof clickCount !== "number" || clickCount < 0) {
      return res.status(400).json({ message: "Invalid click count" });
    }

    await db.query(
      "UPDATE users SET click_count = $1 WHERE telegram_id = $2",
      [clickCount, telegramId]
    );

    res.json({ message: "Click count updated", clickCount });
  } catch (err) {
    console.error("❌ /update-clicks error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================================
// POST /api/user/claim-ticket
// Видача квитка після досягнення певної кількості кліків
// ================================
router.post("/claim-ticket", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const clicksPerTicket = 1000;

    // Отримуємо поточний click_count
    const result = await db.query(
      "SELECT click_count, tickets FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.rows[0];

    if (user.click_count < clicksPerTicket) {
      return res.status(400).json({ message: "Not enough clicks to claim a ticket" });
    }

    // Додаємо квиток та скидаємо click_count
    const newTickets = (user.tickets || 0) + 1;
    await db.query(
      "UPDATE users SET tickets = $1, click_count = 0 WHERE telegram_id = $2",
      [newTickets, telegramId]
    );

    res.json({ message: "Ticket claimed!", tickets: newTickets, clickCount: 0 });
  } catch (err) {
    console.error("❌ /claim-ticket error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
