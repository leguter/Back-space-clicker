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
    console.error("Create wheel invoice error:", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Failed to create invoice" });
  }
});

// ===============================================================
// 🎡 POST /api/wheel/spin
// ===============================================================
router.post("/spin", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const spinCost = 10; // Вартість спіну в internal_stars

    // Перевіряємо баланс і списуємо спін
    const userCheck = await db.query(
      "SELECT internal_stars FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (!userCheck.rows[0]) return res.status(404).json({ success: false, message: "User not found" });

    const currentStars = parseInt(userCheck.rows[0].internal_stars, 10);
    if (currentStars < spinCost) return res.json({ success: false, message: "Недостатньо зірок" });

    await db.query(
      "UPDATE users SET internal_stars = internal_stars - $1 WHERE telegram_id = $2",
      [spinCost, telegramId]
    );

    // Розіграш призу
    const roll = Math.random() * 100;
    let reward;

    if (roll < 80) {
      reward = { type: "raffle_ticket", value: 1 };
      await db.query("UPDATE users SET tickets = tickets + 1 WHERE telegram_id = $1", [telegramId]);
    } else if (roll < 98) {
      reward = { type: "boost", value: "x2 Clicks" };
      await db.query("UPDATE users SET tap_power = tap_power + 2 WHERE telegram_id = $1", [telegramId]);
    } else if (roll < 99) {
      reward = { type: "stars", value: 5 };
      await db.query("UPDATE users SET internal_stars = internal_stars + 5 WHERE telegram_id = $1", [telegramId]);
    } else {
      reward = { type: "nft", value: "Mystery Box" };
    }

    await db.query(
      `INSERT INTO user_spins (user_id, reward_type, reward_value)
       VALUES ($1, $2, $3)`,
      [telegramId, reward.type, reward.value.toString()]
    );

    const updatedUser = await db.query(
      "SELECT balance, tickets, tap_power, internal_stars, referral_spins, last_daily_spin FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    res.json({
      success: true,
      result: reward,
      balance: updatedUser.rows[0].balance,
      tickets: updatedUser.rows[0].tickets,
      tap_power: updatedUser.rows[0].tap_power,
      new_internal_stars: updatedUser.rows[0].internal_stars,
    });
  } catch (err) {
    console.error("Wheel spin error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ===============================================================
// 🟢 GET /api/wheel/referral_status
// Повертає кількість доступних реферальних спінів
// ===============================================================
router.get("/referral_status", async (req, res) => {
  try {
    const { telegramId } = req.user;

    const user = await db.query(
      "SELECT referral_spins FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (!user.rows[0]) return res.status(404).json({ success: false, message: "User not found" });

    res.json({ success: true, referral_spins: user.rows[0].referral_spins });
  } catch (err) {
    console.error("Referral status error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ===============================================================
// 🟢 POST /api/wheel/referral_spin
// Використання одного реферального спіну
// ===============================================================
router.post("/referral_spin", async (req, res) => {
  try {
    const { telegramId } = req.user;

    const userCheck = await db.query(
      "SELECT referral_spins FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (!userCheck.rows[0]) return res.status(404).json({ success: false, message: "User not found" });

    const spins = parseInt(userCheck.rows[0].referral_spins, 10);
    if (spins <= 0) return res.json({ success: false, message: "No referral spins left" });

    // Зменшуємо на 1
    await db.query(
      "UPDATE users SET referral_spins = referral_spins - 1 WHERE telegram_id = $1",
      [telegramId]
    );

    res.json({ success: true, message: "Referral spin used" });
  } catch (err) {
    console.error("Referral spin error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ===============================================================
// 🟢 GET /api/wheel/daily_status
// Повертає, чи доступний щоденний спін
// ===============================================================
router.get("/daily_status", async (req, res) => {
  try {
    const { telegramId } = req.user;

    const user = await db.query(
      "SELECT last_daily_spin FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (!user.rows[0]) return res.status(404).json({ success: false, message: "User not found" });

    const lastSpin = user.rows[0].last_daily_spin;
    const now = new Date();
    const available = !lastSpin || (now - lastSpin) / 1000 / 60 / 60 >= 24;

    res.json({ success: true, daily_available: available });
  } catch (err) {
    console.error("Daily status error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ===============================================================
// 🟢 POST /api/wheel/daily_spin
// Використання щоденного спіну
// ===============================================================
router.post("/daily_spin", async (req, res) => {
  try {
    const { telegramId } = req.user;

    const userCheck = await db.query(
      "SELECT last_daily_spin FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (!userCheck.rows[0]) return res.status(404).json({ success: false, message: "User not found" });

    const lastSpin = userCheck.rows[0].last_daily_spin;
    const now = new Date();
    if (lastSpin && (now - lastSpin) / 1000 / 60 / 60 < 24) {
      return res.json({ success: false, message: "Daily spin not available yet" });
    }

    // Оновлюємо час останнього спіну
    await db.query(
      "UPDATE users SET last_daily_spin = NOW() WHERE telegram_id = $1",
      [telegramId]
    );

    res.json({ success: true, message: "Daily spin used" });
  } catch (err) {
    console.error("Daily spin error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
