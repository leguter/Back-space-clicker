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
// user.js

const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const axios = require("axios"); // 👈 Додайте axios

const router = express.Router();
router.use(authMiddleware);

// ... (ваш існуючий код для /me та /tap)

// ✅ Новий роут для отримання нагороди за підписку
router.post("/claim/subscription", async (req, res) => {
  const { telegramId } = req.user;
  const taskId = "follow_channel"; // Унікальний ID для цього завдання

  try {
    // 1. Перевіряємо, чи користувач вже виконав це завдання
    const existingTask = await db.query(
      "SELECT * FROM user_tasks WHERE user_telegram_id = $1 AND task_id = $2",
      [telegramId, taskId]
    );

    if (existingTask.rows.length > 0) {
      return res.status(409).json({ message: "Reward already claimed." }); // 409 Conflict
    }

    // 2. Робимо запит до Telegram API для перевірки підписки
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const channelId = process.env.TELEGRAM_CHANNEL_ID;
    const apiUrl = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channelId}&user_id=${telegramId}`;

    const response = await axios.get(apiUrl);
    const memberStatus = response.data.result.status;

    // Статуси, які підтверджують членство в каналі
    const isMember = ["member", "administrator", "creator"].includes(memberStatus);

    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of the channel." }); // 403 Forbidden
    }

    // 3. Якщо підписка є - нараховуємо нагороди
    // Використовуємо транзакцію для гарантії цілісності даних
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Подвоюємо tap_power та додаємо 2 квитки
      const updateUserQuery = `
        UPDATE users
        SET
          tap_power = tap_power * 2,
          tickets = tickets + 2
        WHERE telegram_id = $1
        RETURNING tap_power, tickets;
      `;
      const updatedUser = await client.query(updateUserQuery, [telegramId]);

      // Позначаємо завдання як виконане
      const insertTaskQuery = `
        INSERT INTO user_tasks (user_telegram_id, task_id)
        VALUES ($1, $2);
      `;
      await client.query(insertTaskQuery, [telegramId, taskId]);

      await client.query("COMMIT");

      res.json({
        message: "Reward claimed successfully!",
        newTapPower: updatedUser.rows[0].tap_power,
        newTickets: updatedUser.rows[0].tickets,
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Subscription claim error:", error.response ? error.response.data : error.message);
    res.status(500).json({ message: "Server error during claim process" });
  }
});


module.exports = router;
