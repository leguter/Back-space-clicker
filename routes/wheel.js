// const express = require("express");
// const db = require("../db");
// const authMiddleware = require("../middleware/auth");
// const axios = require("axios");

// const router = express.Router();
// router.use(authMiddleware);

// // ===============================================================
// // 🧾 POST /api/wheel/create_invoice
// // (Цей роут залишається без змін)
// // ===============================================================
// router.post("/create_invoice", async (req, res) => {
//   try {
//     const { telegramId } = req.user;
//     const spinPrice = 10; // 1 XTR

//     const botToken = process.env.BOT_TOKEN;

//     const response = await axios.post(
//       `https://api.telegram.org/bot${botToken}/createInvoiceLink`,
//       {
//         title: "Wheel of Fortune Spin",
//         description: "Spin the wheel for awesome rewards!",
//         payload: `wheel_spin_${telegramId}_${Date.now()}`,
//         provider_token: "",
//         currency: "XTR",
//         prices: [{ label: "Spin Cost", amount: spinPrice }],
//       }
//     );

//     if (response.data && response.data.ok && response.data.result) {
//       res.json({ success: true, invoice_link: response.data.result });
//     } else {
//       throw new Error("Failed to get invoice link from Telegram API");
//     }
//   } catch (err) {
//     console.error(
//       "Create wheel invoice error:",
//       err.response?.data || err.message
//     );
//     res.status(500).json({ success: false, message: "Failed to create invoice" });
//   }
// });

// // ===============================================================
// // 🎡 POST /api/wheel/spin
// // (Оновлена логіка шансів)
// // ===============================================================
// router.post("/spin", async (req, res) => {
//   try {
//     const { telegramId } = req.user;

//     const roll = Math.random() * 100; // Розіграш від 0 до 99.99
//     let reward;

//     // ❗️ ОСЬ ТУТ ВАШІ НОВІ ШАНСИ:

//     // 80% Ticket (діапазон 0 - 79.99)
//     if (roll < 80) {
//       reward = { type: "raffle_ticket", value: 1 };
//       await db.query(
//         "UPDATE users SET tickets = tickets + 1 WHERE telegram_id = $1",
//         [telegramId]
//       );
//     } 
//     // 18% Boost (діапазон 80 - 97.99)
//     else if (roll < 98) { // (80 + 18 = 98)
//       reward = { type: "boost", value: "x2 Clicks" };
//       await db.query(
//         "UPDATE users SET tap_power = tap_power +2 2 WHERE telegram_id = $1",
//         [telegramId]
//       );
//     } 
//     // 1% Stars (діапазон 98 - 98.99)
//     else if (roll < 99) { // (98 + 1 = 99)
//       reward = { type: "stars", value: 5 };
//       await db.query(
//         "UPDATE users SET balance = balance + 5 WHERE telegram_id = $1",
//         [telegramId]
//       );
//     } 
//     // 1% NFT (діапазон 99 - 99.99)
//     else {
//       reward = { type: "nft", value: "Mystery Box" };
//       // ... (логіка NFT, якщо потрібна)
//     }

//     // Записуємо історію спіну
//     await db.query(
//       `INSERT INTO user_spins (user_id, reward_type, reward_value)
//        VALUES ($1, $2, $3)`,
//       [telegramId, reward.type, reward.value.toString()]
//     );

//     // Повертаємо оновлені дані, включаючи tap_power
//     const updatedUser = await db.query(
//       "SELECT balance, tickets, tap_power FROM users WHERE telegram_id = $1",
//       [telegramId]
//     );

//     if (updatedUser.rows.length === 0) {
//       console.error(`User not found with telegramId ${telegramId} after spin`);
//       return res.status(404).json({ success: false, message: "User not found after spin" });
//     }

//     res.json({
//       success: true,
//       result: reward, // 'result' тепер коректно відповідає тому, що сталося
//       balance: updatedUser.rows[0].balance,
//       tickets: updatedUser.rows[0].tickets,
//       tap_power: updatedUser.rows[0].tap_power,
//     });
//   } catch (err) {
//     console.error("Wheel spin error:", err);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

// module.exports = router;
const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const axios = require("axios");

const router = express.Router();
router.use(authMiddleware);

// ===============================================================
// 🧾 POST /api/wheel/create_invoice
// (Виправлено: видалено 'provider_token')
// ===============================================================
router.post("/create_invoice", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const spinPrice = 10; // 10 XTR

    const botToken = process.env.BOT_TOKEN;

    const response = await axios.post(
      `https://api.telegram.org/bot${botToken}/createInvoiceLink`,
      {
        title: "Wheel of Fortune Spin",
        description: "Spin the wheel for awesome rewards!",
        payload: `wheel_spin_${telegramId}_${Date.now()}`,
        // provider_token: "", // ⛔️ ВИДАЛЕНО! Це поле не потрібне для XTR
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
// (Виправлено: додано списання, виправлено SQL та нарахування)
// ===============================================================
router.post("/spin", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const spinCost = 10; // 🟢 Вартість спіну в internal_stars

    // 🟢 КРОК 1: Перевіряємо баланс і списуємо 10 зірок
    const userCheck = await db.query(
      "SELECT internal_stars FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (!userCheck.rows[0]) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const currentStars = parseInt(userCheck.rows[0].internal_stars, 10);

    // Перевіряємо, чи достатньо зірок
    if (currentStars < spinCost) {
      return res.json({ success: false, message: "Недостатньо зірок" });
    }

    // Списуємо зірки
    await db.query(
      "UPDATE users SET internal_stars = internal_stars - $1 WHERE telegram_id = $2",
      [spinCost, telegramId]
    );

    // 🟢 КРОК 2: Розіграш призу
    const roll = Math.random() * 100; // Розіграш від 0 до 99.99
    let reward;

    // 80% Ticket
    if (roll < 80) {
      reward = { type: "raffle_ticket", value: 1 };
      await db.query(
        "UPDATE users SET tickets = tickets + 1 WHERE telegram_id = $1",
        [telegramId]
      );
    }
    // 18% Boost
    else if (roll < 98) { // (80 + 18 = 98)
      reward = { type: "boost", value: "x2 Clicks" };
      await db.query(
        // ⚠️ ВИПРАВЛЕНО СИНТАКСИС (було +2 2)
        "UPDATE users SET tap_power = tap_power + 2 WHERE telegram_id = $1",
        [telegramId]
      );
    }
    // 1% Stars
    else if (roll < 99) { // (98 + 1 = 99)
      reward = { type: "stars", value: 5 };
      await db.query(
        // ⚠️ ВИПРАВЛЕНО: Додаємо до 'internal_stars', а не 'balance'
        "UPDATE users SET internal_stars = internal_stars + 5 WHERE telegram_id = $1",
        [telegramId]
      );
    }
    // 1% NFT
    else {
      reward = { type: "nft", value: "Mystery Box" };
      // ... (логіка NFT, якщо потрібна)
    }

    // 🟢 КРОК 3: Записуємо історію спіну
    await db.query(
      `INSERT INTO user_spins (user_id, reward_type, reward_value)
       VALUES ($1, $2, $3)`,
      [telegramId, reward.type, reward.value.toString()]
    );

    // 🟢 КРОК 4: Повертаємо оновлені дані (включаючи internal_stars)
    const updatedUser = await db.query(
      // ⚠️ ВИПРАВЛЕНО: Додано 'internal_stars'
      "SELECT balance, tickets, tap_power, internal_stars FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (updatedUser.rows.length === 0) {
      console.error(`User not found with telegramId ${telegramId} after spin`);
      return res.status(404).json({ success: false, message: "User not found after spin" });
    }

    res.json({
      success: true,
      result: reward,
      balance: updatedUser.rows[0].balance,
      tickets: updatedUser.rows[0].tickets,
      tap_power: updatedUser.rows[0].tap_power,
      // ⚠️ ВИПРАВЛЕНО: Повертаємо новий баланс,
      // якого очікує фронтенд
      new_internal_stars: updatedUser.rows[0].internal_stars,
    });
  } catch (err) {
    console.error("Wheel spin error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// ===============================================================
// 🎁 POST /api/wheel/referral_spin
// (Доступний лише, якщо користувач має хоча б 1 реферала без використання раніше)
// ===============================================================
router.post("/referral_spin", async (req, res) => {
  try {
    const { telegramId } = req.user;

    // Перевіряємо, чи є активний невикористаний реферальний спін
    const checkReferral = await db.query(
      `SELECT referral_spins FROM users WHERE telegram_id = $1`,
      [telegramId]
    );

    if (!checkReferral.rows[0]) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const referralSpins = parseInt(checkReferral.rows[0].referral_spins || 0, 10);

    if (referralSpins <= 0) {
      return res.json({ success: false, message: "Немає доступних реферальних спінів" });
    }

    // Зменшуємо кількість реферальних спінів
    await db.query(
      `UPDATE users SET referral_spins = referral_spins - 1 WHERE telegram_id = $1`,
      [telegramId]
    );

    // 🎯 Виконуємо спін з особливими шансами
    const roll = Math.random() * 100;
    let reward;

    // Трохи покращені шанси для реферального спіну
    if (roll < 70) {
      reward = { type: "raffle_ticket", value: 2 };
      await db.query(
        `UPDATE users SET tickets = tickets + 2 WHERE telegram_id = $1`,
        [telegramId]
      );
    } else if (roll < 95) {
      reward = { type: "stars", value: 10 };
      await db.query(
        `UPDATE users SET internal_stars = internal_stars + 10 WHERE telegram_id = $1`,
        [telegramId]
      );
    } else if (roll < 99) {
      reward = { type: "boost", value: "x3 Clicks" };
      await db.query(
        `UPDATE users SET tap_power = tap_power + 3 WHERE telegram_id = $1`,
        [telegramId]
      );
    } else {
      reward = { type: "nft", value: "Referral NFT Box" };
    }

    await db.query(
      `INSERT INTO user_spins (user_id, reward_type, reward_value, spin_type)
       VALUES ($1, $2, $3, 'referral')`,
      [telegramId, reward.type, reward.value.toString()]
    );

    const updatedUser = await db.query(
      `SELECT balance, tickets, tap_power, internal_stars, referral_spins
       FROM users WHERE telegram_id = $1`,
      [telegramId]
    );

    res.json({
      success: true,
      result: reward,
      ...updatedUser.rows[0],
    });
  } catch (err) {
    console.error("Referral spin error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ===============================================================
// 🌞 POST /api/wheel/daily_spin
// (Доступний раз на добу, безкоштовний)
// ===============================================================
router.post("/daily_spin", async (req, res) => {
  try {
    const { telegramId } = req.user;

    // Отримуємо час останнього щоденного спіну
    const userData = await db.query(
      `SELECT last_daily_spin FROM users WHERE telegram_id = $1`,
      [telegramId]
    );

    if (!userData.rows[0]) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const lastSpin = userData.rows[0].last_daily_spin;
    const now = new Date();

    // Якщо вже крутив сьогодні — не даємо повторити
    if (lastSpin && new Date(lastSpin).toDateString() === now.toDateString()) {
      return res.json({ success: false, message: "Щоденний спін вже використано сьогодні" });
    }

    // 🎯 Розіграш щоденного призу
    const roll = Math.random() * 100;
    let reward;

    if (roll < 60) {
      reward = { type: "raffle_ticket", value: 1 };
      await db.query(
        `UPDATE users SET tickets = tickets + 1 WHERE telegram_id = $1`,
        [telegramId]
      );
    } else if (roll < 90) {
      reward = { type: "stars", value: 5 };
      await db.query(
        `UPDATE users SET internal_stars = internal_stars + 5 WHERE telegram_id = $1`,
        [telegramId]
      );
    } else {
      reward = { type: "boost", value: "x2 Clicks" };
      await db.query(
        `UPDATE users SET tap_power = tap_power + 2 WHERE telegram_id = $1`,
        [telegramId]
      );
    }

    // Оновлюємо дату останнього спіну
    await db.query(
      `UPDATE users SET last_daily_spin = NOW() WHERE telegram_id = $1`,
      [telegramId]
    );

    // Записуємо історію
    await db.query(
      `INSERT INTO user_spins (user_id, reward_type, reward_value, spin_type)
       VALUES ($1, $2, $3, 'daily')`,
      [telegramId, reward.type, reward.value.toString()]
    );

    const updatedUser = await db.query(
      `SELECT balance, tickets, tap_power, internal_stars, last_daily_spin
       FROM users WHERE telegram_id = $1`,
      [telegramId]
    );

    res.json({
      success: true,
      result: reward,
      ...updatedUser.rows[0],
    });
  } catch (err) {
    console.error("Daily spin error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;