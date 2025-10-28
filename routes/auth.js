// // /routes/auth.js
// const express = require("express");
// const crypto = require("crypto");
// const jwt = require("jsonwebtoken");
// const db = require("../db");

// const router = express.Router();
// const BOT_TOKEN = process.env.BOT_TOKEN;

// router.post("/", async (req, res) => {
//   const { initData } = req.body;

//   try {
//     // 1. Валідація даних від Telegram
//     const urlParams = new URLSearchParams(initData);
//     const hash = urlParams.get("hash");
//     urlParams.delete("hash");

//     const dataCheckString = Array.from(urlParams.entries())
//       .sort(([a], [b]) => a.localeCompare(b))
//       .map(([key, value]) => `${key}=${value}`)
//       .join("\n");

//     const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
//     const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

//     if (calculatedHash !== hash) {
//       return res.status(403).json({ message: "Authentication failed: Invalid hash" });
//     }

//     // 2. Робота з користувачем
//     const user = JSON.parse(urlParams.get("user"));
// const telegramId = user.id;

// // Перевіряємо, чи існує користувач
// let dbUser = await db.query("SELECT * FROM users WHERE telegram_id = $1", [telegramId]);

// if (dbUser.rows.length === 0) {
//   // Створюємо нового користувача
//   dbUser = await db.query(
//     // Тепер 6 колонок відповідають 6 плейсхолдерам
//     `INSERT INTO users (telegram_id, first_name, username, balance, photo_url, tickets)
//      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
//     [
//       telegramId,
//       user.first_name,
//       user.username,
//       0, // $4: Початковий баланс = 0
//       user.photo_url, // $5: URL фото
//       0, // $6: Початкова кількість тікетів = 0
//     ]
//   );
// } else {
//   // Оновлюємо час останнього входу і фото (ЦЕЙ БЛОК ВЖЕ ПРАВИЛЬНИЙ)
//   dbUser = await db.query(
//     `UPDATE users
//      SET last_login_at = NOW(),
//          photo_url = $1
//      WHERE telegram_id = $2
//      RETURNING *`,
//     [user.photo_url || dbUser.rows[0].photo_url, telegramId]
//   );
// }




// const finalUser = dbUser.rows[0];

//     // 3. Створення JWT токена
//     const token = jwt.sign({ telegramId: finalUser.telegram_id }, process.env.JWT_SECRET, {
//       expiresIn: "7d", // Токен буде дійсний 7 днів
//     });

//     res.json({
//       message: "Authenticated successfully",
//       token,
//       user: {
//         telegramId: finalUser.telegram_id,
//         firstName: finalUser.first_name,
//         username:finalUser.username,
//         photoUrl: finalUser.photo_url || null,
//         balance: finalUser.balance,
//         isSubscribed: finalUser.isSubscribed,
//         tickets: finalUser.tickets
//       },
//     });
//   } catch (error) {
//     console.error("Auth error:", error);
//     res.status(500).json({ message: "Server error during authentication" });
//   }
// });

// module.exports = router;
// /routes/auth.js
const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../db"); // Ваш модуль для підключення до БД

const router = express.Router();
const BOT_TOKEN = process.env.BOT_TOKEN;

router.post("/", async (req, res) => {
  const { initData } = req.body;

  try {
    // 1. Валідація даних від Telegram (без змін)
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get("hash");
    urlParams.delete("hash");

    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (calculatedHash !== hash) {
      return res.status(403).json({ message: "Authentication failed: Invalid hash" });
    }

    // 2. Робота з користувачем
    const user = JSON.parse(urlParams.get("user"));
    const telegramId = user.id;

    const referrerId = urlParams.get("start_param");

    let userResult = await db.query("SELECT * FROM users WHERE telegram_id = $1", [telegramId]);

    // ✅ ОСНОВНА ЛОГІКА РЕФЕРАЛЬНОЇ СИСТЕМИ
    if (userResult.rows.length === 0) {
      // ❗️ КОРИСТУВАЧ НОВИЙ
      const client = await db.connect();
      try {
        await client.query("BEGIN");

        // Створюємо нового користувача (реферала)
        const newUserQuery = `
          INSERT INTO users (telegram_id, first_name, username, balance, photo_url, tickets, referred_by, internal_stars, referral_spins)
          VALUES ($1, $2, $3, 0, $4, $5, $6, 0, 0)
          RETURNING *`;
        
        // (Я спростив VALUES, бо balance, internal_stars і referral_spins завжди 0 для нового)
        
        const newUserValues = [
          telegramId,           // $1
          user.first_name,      // $2
          user.username,        // $3
          user.photo_url,       // $4
          referrerId ? 2 : 0,   // $5: Бонусні тікети рефералу
          referrerId || null,   // $6: ID реферера
        ];

        const newUserResult = await client.query(newUserQuery, newUserValues);
        userResult = newUserResult;

        // Нараховуємо нагороду рефереру
        if (referrerId) {
          const updateReferrerQuery = `
            UPDATE users 
            SET 
              tickets = tickets + 2, 
              referral_spins = referral_spins + 1
            WHERE telegram_id = $1`;
          await client.query(updateReferrerQuery, [referrerId]);
        }
        
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }

    } else {
      // Користувач вже існує - просто оновлюємо дані
      userResult = await db.query(
        `UPDATE users SET last_login_at = NOW(), photo_url = $1 WHERE telegram_id = $2 RETURNING *`,
        [user.photo_url || userResult.rows[0].photo_url, telegramId]
      );
    }
    
    const finalUser = userResult.rows[0];

    // 3. Створення JWT токена та відповідь
    const token = jwt.sign({ telegramId: finalUser.telegram_id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // ❗️❗️❗️ ОСЬ ТУТ ВИПРАВЛЕННЯ ❗️❗️❗️
    res.json({
      message: "Authenticated successfully",
      token,
      user: {
        telegramId: finalUser.telegram_id,
        firstName: finalUser.first_name,
        username: finalUser.username,
        photoUrl: finalUser.photo_url,
        balance: finalUser.balance,
        tickets: finalUser.tickets,
        // ✅ ДОДАНО:
        internal_stars: finalUser.internal_stars,
        referral_spins: finalUser.referral_spins
      },
    });

  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).json({ message: "Server error during authentication" });
  }
});

module.exports = router;