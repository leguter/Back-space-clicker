const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

// ✅ Отримати дані користувача
router.get("/me", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const userResult = await db.query(
      "SELECT telegram_id, first_name, username, balance, tap_power FROM users WHERE telegram_id = $1",
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

// ✅ Обробка натискання (tap)
router.post("/tap", async (req, res) => {
  try {
    const { telegramId } = req.user;

    // Отримуємо поточну силу натискання користувача
    const userResult = await db.query(
      "SELECT tap_power FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const tapPower = userResult.rows[0].tap_power || 1;

    // Атомарно оновлюємо баланс із урахуванням tapPower
    const result = await db.query(
      "UPDATE users SET balance = balance + $2 WHERE telegram_id = $1 RETURNING balance",
      [telegramId, tapPower]
    );

    res.json({
      newBalance: result.rows[0].balance,
      added: tapPower, // скільки додалось
    });
  } catch (error) {
    console.error("Tap error:", error);
    res.status(500).json({ message: "Server error during tap" });
  }
});

module.exports = router;
// user.js

// const express = require("express");
// const db = require("../db");
// const authMiddleware = require("../middleware/auth");
// const axios = require("axios"); // Переконайтесь, що axios встановлено (npm install axios)

// // Важливо: для завантаження змінних з .env файлу
// require('dotenv').config();

// const router = express.Router();
// router.use(authMiddleware);

// // ====================================================================
// // ВАШІ ІСНУЮЧІ РОУТИ (залишаються без змін)
// // ====================================================================

// // ✅ Отримати дані користувача
// router.get("/me", async (req, res) => {
//   // ... ваш код ...
// });

// // ✅ Обробка натискання (tap)
// router.post("/tap", async (req, res) => {
//   // ... ваш код ...
// });


// // ====================================================================
// // ✅ НОВИЙ РОУТ ДЛЯ ПЕРЕВІРКИ ПІДПИСКИ ТА ОТРИМАННЯ НАГОРОДИ
// // ====================================================================
// router.post("/claim/subscription", async (req, res) => {
//   const { telegramId } = req.user;
//   const taskId = "follow_telegram_channel"; // Унікальний ідентифікатор завдання

//   try {
//     // 1. ПЕРЕВІРКА: Чи не отримував користувач нагороду раніше?
//     const existingTaskResult = await db.query(
//       "SELECT * FROM user_tasks WHERE user_telegram_id = $1 AND task_id = $2",
//       [telegramId, taskId]
//     );

//     if (existingTaskResult.rows.length > 0) {
//       return res.status(409).json({ message: "Нагорода вже отримана." }); // 409 Conflict
//     }

//     // 2. ПЕРЕВІРКА ПІДПИСКИ ЧЕРЕЗ TELEGRAM API
//     const botToken = process.env.BOT_TOKEN;
//     const channelId = process.env.TELEGRAM_CHANNEL_ID; // Наприклад, '@my_channel'

//     if (!botToken || !channelId) {
//         console.error("Відсутні TELEGRAM_BOT_TOKEN або TELEGRAM_CHANNEL_ID в .env");
//         return res.status(500).json({ message: "Помилка конфігурації сервера." });
//     }

//     const apiUrl = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channelId}&user_id=${telegramId}`;
    
//     let memberStatus;
//     try {
//         const response = await axios.get(apiUrl);
//         memberStatus = response.data.result.status;
//     } catch (apiError) {
//         console.error("Помилка при зверненні до Telegram API:", apiError.response?.data || apiError.message);
//         return res.status(502).json({ message: "Не вдалося перевірити підписку. Спробуйте пізніше." }); // 502 Bad Gateway
//     }

//     // Дозволені статуси: member (учасник), administrator (адмін), creator (творець)
//     const isSubscribed = ["member", "administrator", "creator"].includes(memberStatus);

//     if (!isSubscribed) {
//       return res.status(403).json({ message: "Ви не підписані на канал." }); // 403 Forbidden
//     }

//     // 3. НАРАХУВАННЯ НАГОРОДИ (використовуємо транзакцію)
//     const client = await db.connect();
//     try {
//       await client.query("BEGIN");

//       // Подвоюємо силу кліку та додаємо 2 квитки
//       const updateUserResult = await client.query(
//         "UPDATE users SET tap_power = tap_power * 2, tickets = tickets + 2 WHERE telegram_id = $1 RETURNING tap_power, tickets",
//         [telegramId]
//       );

//       // Записуємо, що завдання виконано
//       await client.query(
//         "INSERT INTO user_tasks (user_telegram_id, task_id) VALUES ($1, $2)",
//         [telegramId, taskId]
//       );

//       await client.query("COMMIT");

//       res.json({
//         message: "Нагороду успішно отримано!",
//         newTapPower: updateUserResult.rows[0].tap_power,
//         newTickets: updateUserResult.rows[0].tickets,
//       });

//     } catch (dbError) {
//       await client.query("ROLLBACK"); // Відкат змін у разі помилки
//       console.error("Помилка транзакції:", dbError);
//       res.status(500).json({ message: "Помилка при оновленні даних користувача." });
//     } finally {
//       client.release(); // Повертаємо з'єднання в пул
//     }

//   } catch (error) {
//     console.error("Загальна помилка в /claim/subscription:", error);
//     res.status(500).json({ message: "Внутрішня помилка сервера." });
//   }
// });

// router.get("/tasks", async (req, res) => {
//   try {
//     const { telegramId } = req.user;
//     const result = await db.query(
//       "SELECT task_id FROM user_tasks WHERE user_telegram_id = $1",
//       [telegramId]
//     );
//     // Повертаємо масив рядків, наприклад: ["follow_telegram_channel"]
//     const completedTasks = result.rows.map(row => row.task_id);
//     res.json({ completedTasks });
//   } catch (error) {
//     console.error("Error fetching user tasks:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// });

// module.exports = router;