// // /routes/raffle.js
// const express = require("express");
// const db = require("../db");
// const authMiddleware = require("../middleware/auth");

// const router = express.Router();

// // 🔐 Усі ендпоінти захищені авторизацією
// router.use(authMiddleware);

// // ===============================================================
// // ✅ GET /api/raffle/:idOrSlug — Отримати інформацію про розіграш
// // ===============================================================
// router.get("/:idOrSlug", async (req, res) => {
//   try {
//     const { idOrSlug } = req.params;
//     let raffleResult;

//     const id = parseInt(idOrSlug, 10);
//     if (!isNaN(id)) {
//       raffleResult = await db.query("SELECT * FROM raffles WHERE id = $1", [id]);
//     } else {
//       raffleResult = await db.query("SELECT * FROM raffles WHERE slug = $1", [idOrSlug]);
//     }

//     if (raffleResult.rows.length === 0)
//       return res.status(404).json({ message: "Raffle not found" });

//     const raffle = raffleResult.rows[0];

//     const participantsResult = await db.query(
//       "SELECT COUNT(*) FROM raffle_participants WHERE raffle_id = $1",
//       [raffle.id]
//     );

//     raffle.participants = parseInt(participantsResult.rows[0].count, 10);
//     res.json(raffle);
//   } catch (err) {
//     console.error("❌ Error in GET /raffle/:idOrSlug:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // ===============================================================
// // 🎟️ POST /api/raffle/:idOrSlug/join — Участь у розіграші
// // ===============================================================
// router.post("/:idOrSlug/join", async (req, res) => {
//   try {
//     const { telegramId } = req.user;
//     const { idOrSlug } = req.params;
//     let raffleResult;

//     const id = parseInt(idOrSlug, 10);
//     if (!isNaN(id)) {
//       raffleResult = await db.query("SELECT * FROM raffles WHERE id = $1", [id]);
//     } else {
//       raffleResult = await db.query("SELECT * FROM raffles WHERE slug = $1", [idOrSlug]);
//     }

//     if (raffleResult.rows.length === 0)
//       return res.status(404).json({ message: "Raffle not found" });

//     const raffle = raffleResult.rows[0];

//     // 1️⃣ Отримати користувача
//     const userResult = await db.query(
//       "SELECT tickets FROM users WHERE telegram_id = $1",
//       [telegramId]
//     );

//     if (userResult.rows.length === 0)
//       return res.status(404).json({ message: "User not found" });

//     const userTickets = userResult.rows[0].tickets;

//     if (new Date(raffle.ends_at) < new Date())
//       return res.status(400).json({ message: "Raffle already ended" });

//     // 2️⃣ Перевірити, чи користувач вже бере участь
//     const existing = await db.query(
//       "SELECT 1 FROM raffle_participants WHERE raffle_id = $1 AND telegram_id = $2",
//       [raffle.id, telegramId]
//     );

//     if (existing.rows.length > 0)
//       return res.status(400).json({ message: "Already participating" });

//     // 3️⃣ Перевірити кількість тікетів
//     if (userTickets < raffle.cost)
//       return res.status(400).json({ message: "Not enough tickets" });

//     // 4️⃣ Відняти тікети та записати участь
//     await db.query("UPDATE users SET tickets = tickets - $1 WHERE telegram_id = $2", [
//       raffle.cost,
//       telegramId,
//     ]);

//     await db.query(
//       "INSERT INTO raffle_participants (raffle_id, telegram_id) VALUES ($1, $2)",
//       [raffle.id, telegramId]
//     );

//     res.json({ message: "Participation confirmed ✅" });
//   } catch (err) {
//     console.error("❌ Error in POST /raffle/:idOrSlug/join:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // ===============================================================
// // 🏆 POST /api/raffle/:idOrSlug/end — Завершити розіграш (адмін або cron)
// // ===============================================================
// router.post("/:idOrSlug/end", async (req, res) => {
//   try {
//     const { idOrSlug } = req.params;
//     let raffleResult;

//     const id = parseInt(idOrSlug, 10);
//     if (!isNaN(id)) {
//       raffleResult = await db.query("SELECT * FROM raffles WHERE id = $1", [id]);
//     } else {
//       raffleResult = await db.query("SELECT * FROM raffles WHERE slug = $1", [idOrSlug]);
//     }

//     if (raffleResult.rows.length === 0)
//       return res.status(404).json({ message: "Raffle not found" });

//     const raffle = raffleResult.rows[0];

//     if (raffle.ended)
//       return res.status(400).json({ message: "Raffle already ended" });

//     // 1️⃣ Отримати учасників
//     const participantsResult = await db.query(
//       "SELECT telegram_id FROM raffle_participants WHERE raffle_id = $1",
//       [raffle.id]
//     );
//     const participants = participantsResult.rows;

//     if (participants.length === 0) {
//       await db.query("UPDATE raffles SET ended = true WHERE id = $1", [raffle.id]);
//       return res.json({ message: "No participants — raffle ended with no winner" });
//     }

//     // 2️⃣ Вибрати переможця
//     const winner =
//       participants[Math.floor(Math.random() * participants.length)].telegram_id;

//     // 3️⃣ Зберегти результат
//     await db.query(
//       "UPDATE raffles SET ended = true, winner_id = $1 WHERE id = $2",
//       [winner, raffle.id]
//     );

//     res.json({ message: "Raffle ended 🎉", winner });
//   } catch (err) {
//     console.error("❌ Error in POST /raffle/:idOrSlug/end:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // ===============================================================
// // 🪩 GET /api/raffle/:idOrSlug/result — Отримати результат розіграшу
// // ===============================================================
// router.get("/:idOrSlug/result", async (req, res) => {
//   try {
//     const { telegramId } = req.user;
//     const { idOrSlug } = req.params;
//     let raffleResult;

//     const id = parseInt(idOrSlug, 10);
//     if (!isNaN(id)) {
//       raffleResult = await db.query("SELECT * FROM raffles WHERE id = $1", [id]);
//     } else {
//       raffleResult = await db.query("SELECT * FROM raffles WHERE slug = $1", [idOrSlug]);
//     }

//     if (raffleResult.rows.length === 0)
//       return res.status(404).json({ message: "Raffle not found" });

//     const raffle = raffleResult.rows[0];
//     if (!raffle.ended)
//       return res.json({ status: "pending", message: "Raffle still active" });

//     const isParticipant = await db.query(
//       "SELECT 1 FROM raffle_participants WHERE raffle_id = $1 AND telegram_id = $2",
//       [raffle.id, telegramId]
//     );

//     if (isParticipant.rows.length === 0)
//       return res.json({ status: "not_participated" });

//     const status = raffle.winner_id === telegramId ? "won" : "lost";
//     res.json({ status });
//   } catch (err) {
//     console.error("❌ Error in GET /raffle/:idOrSlug/result:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// });

// module.exports = router;

// /routes/raffle.js
const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const cron = require("node-cron");

const router = express.Router();

// 🔐 Усі ендпоінти захищені авторизацією
router.use(authMiddleware);

// ===============================================================
// ✅ GET /api/raffle/:idOrSlug — Отримати інформацію про розіграш
// ===============================================================
router.get("/:idOrSlug", async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    let raffleResult;

    const id = parseInt(idOrSlug, 10);
    if (!isNaN(id)) {
      raffleResult = await db.query("SELECT * FROM raffles WHERE id = $1", [id]);
    } else {
      raffleResult = await db.query("SELECT * FROM raffles WHERE slug = $1", [idOrSlug]);
    }

    if (raffleResult.rows.length === 0)
      return res.status(404).json({ message: "Raffle not found" });

    const raffle = raffleResult.rows[0];

    const participantsResult = await db.query(
      "SELECT COUNT(*) FROM raffle_participants WHERE raffle_id = $1",
      [raffle.id]
    );

    raffle.participants = parseInt(participantsResult.rows[0].count, 10);
    res.json(raffle);
  } catch (err) {
    console.error("❌ Error in GET /raffle/:idOrSlug:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===============================================================
// 🎟️ POST /api/raffle/:idOrSlug/join — Участь у розіграші
// ===============================================================
router.post("/:idOrSlug/join", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const { idOrSlug } = req.params;
    let raffleResult;

    const id = parseInt(idOrSlug, 10);
    if (!isNaN(id)) {
      raffleResult = await db.query("SELECT * FROM raffles WHERE id = $1", [id]);
    } else {
      raffleResult = await db.query("SELECT * FROM raffles WHERE slug = $1", [idOrSlug]);
    }

    if (raffleResult.rows.length === 0)
      return res.status(404).json({ message: "Raffle not found" });

    const raffle = raffleResult.rows[0];

    // 1️⃣ Отримати користувача
    const userResult = await db.query(
      "SELECT tickets FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (userResult.rows.length === 0)
      return res.status(404).json({ message: "User not found" });

    const userTickets = userResult.rows[0].tickets;

    if (new Date(raffle.end_time) < new Date())
      return res.status(400).json({ message: "Raffle already ended" });

    // 2️⃣ Перевірити, чи користувач вже бере участь
    const existing = await db.query(
      "SELECT 1 FROM raffle_participants WHERE raffle_id = $1 AND telegram_id = $2",
      [raffle.id, telegramId]
    );

    if (existing.rows.length > 0)
      return res.status(400).json({ message: "Already participating" });

    // 3️⃣ Перевірити кількість тікетів
    if (userTickets < raffle.cost)
      return res.status(400).json({ message: "Not enough tickets" });

    // 4️⃣ Відняти тікети та записати участь
    await db.query("UPDATE users SET tickets = tickets - $1 WHERE telegram_id = $2", [
      raffle.cost,
      telegramId,
    ]);

    await db.query(
      "INSERT INTO raffle_participants (raffle_id, telegram_id) VALUES ($1, $2)",
      [raffle.id, telegramId]
    );

    res.json({ message: "Participation confirmed ✅" });
  } catch (err) {
    console.error("❌ Error in POST /raffle/:idOrSlug/join:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===============================================================
// 🏆 POST /api/raffle/:idOrSlug/end — Завершити розіграш вручну
// ===============================================================
router.post("/:idOrSlug/end", async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    let raffleResult;

    const id = parseInt(idOrSlug, 10);
    if (!isNaN(id)) {
      raffleResult = await db.query("SELECT * FROM raffles WHERE id = $1", [id]);
    } else {
      raffleResult = await db.query("SELECT * FROM raffles WHERE slug = $1", [idOrSlug]);
    }

    if (raffleResult.rows.length === 0)
      return res.status(404).json({ message: "Raffle not found" });

    const raffle = raffleResult.rows[0];

    if (!raffle.is_active)
      return res.status(400).json({ message: "Raffle already ended" });

    // 1️⃣ Отримати учасників
    const participantsResult = await db.query(
      "SELECT telegram_id FROM raffle_participants WHERE raffle_id = $1",
      [raffle.id]
    );
    const participants = participantsResult.rows;

    let winner = null;
    if (participants.length > 0) {
      winner = participants[Math.floor(Math.random() * participants.length)].telegram_id;
    }

    // 2️⃣ Закрити розіграш
    await db.query(
      "UPDATE raffles SET is_active = false, winner_id = $1 WHERE id = $2",
      [winner, raffle.id]
    );

    // 3️⃣ Очистити учасників
    await db.query(
      "DELETE FROM raffle_participants WHERE raffle_id = $1",
      [raffle.id]
    );

    res.json({ message: "Raffle ended 🎉", winner });
  } catch (err) {
    console.error("❌ Error in POST /raffle/:idOrSlug/end:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===============================================================
// 🪩 GET /api/raffle/:idOrSlug/result — Отримати результат розіграшу
// ===============================================================
router.get("/:idOrSlug/result", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const { idOrSlug } = req.params;
    let raffleResult;

    const id = parseInt(idOrSlug, 10);
    if (!isNaN(id)) {
      raffleResult = await db.query("SELECT * FROM raffles WHERE id = $1", [id]);
    } else {
      raffleResult = await db.query("SELECT * FROM raffles WHERE slug = $1", [idOrSlug]);
    }

    if (raffleResult.rows.length === 0)
      return res.status(404).json({ message: "Raffle not found" });

    const raffle = raffleResult.rows[0];
    if (raffle.is_active)
      return res.json({ status: "pending", message: "Raffle still active" });

    const isParticipant = await db.query(
      "SELECT 1 FROM raffle_participants WHERE raffle_id = $1 AND telegram_id = $2",
      [raffle.id, telegramId]
    );

    if (isParticipant.rows.length === 0)
      return res.json({ status: "not_participated" });

    const status = raffle.winner_id === telegramId ? "won" : "lost";
    res.json({ status });
  } catch (err) {
    console.error("❌ Error in GET /raffle/:idOrSlug/result:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===============================================================
// 🔁 CRON — Автоматичний перезапуск розіграшів з очищенням учасників
// ===============================================================
cron.schedule("*/1 * * * *", async () => {
  try {
    console.log("⏰ Перевірка активних розіграшів...");

    const { rows: endedRaffles } = await db.query(
      "SELECT * FROM raffles WHERE is_active = true AND end_time <= NOW()"
    );

    for (const raffle of endedRaffles) {
      console.log(`🎯 Завершуємо розіграш: ${raffle.title}`);

      // 1️⃣ Отримати учасників
      const { rows: participants } = await db.query(
        "SELECT telegram_id FROM raffle_participants WHERE raffle_id = $1",
        [raffle.id]
      );

      let winner = null;
      if (participants.length > 0) {
        winner = participants[Math.floor(Math.random() * participants.length)].telegram_id;
        console.log(`🏆 Переможець: ${winner}`);
      } else {
        console.log("❌ Без учасників — просто закрито");
      }

      // 2️⃣ Закрити поточний розіграш
      await db.query(
        "UPDATE raffles SET is_active = false, winner_id = $1 WHERE id = $2",
        [winner, raffle.id]
      );

      // 3️⃣ Видалити учасників старого розіграшу
      await db.query(
        "DELETE FROM raffle_participants WHERE raffle_id = $1",
        [raffle.id]
      );

      // 4️⃣ Створити новий розіграш
      const newEnd = new Date(Date.now() + raffle.duration * 60 * 1000);
      await db.query(
        `INSERT INTO raffles (title, duration, end_time, is_active, rarity, image, color)
         VALUES ($1, $2, $3, true, $4, $5, $6)`,
        [
          raffle.title,
          raffle.duration,
          newEnd,
          raffle.rarity,
          raffle.image,
          raffle.color,
        ]
      );

      console.log(`🔁 Новий розіграш "${raffle.title}" створено`);
    }
  } catch (err) {
    console.error("❌ Помилка в cron-задачі:", err);
  }
});
router.get("/active", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM raffles WHERE ended = false ORDER BY ends_at ASC LIMIT 1"
    );

    if (result.rows.length === 0)
      return res.status(404).json({ message: "No active raffle" });

    const raffle = result.rows[0];

    const participantsResult = await db.query(
      "SELECT COUNT(*) FROM raffle_participants WHERE raffle_id = $1",
      [raffle.id]
    );
    raffle.participants = parseInt(participantsResult.rows[0].count, 10);

    res.json(raffle);
  } catch (err) {
    console.error("❌ Error in GET /raffle/active:", err);
    res.status(500).json({ message: "Server error" });
  }
});
module.exports = router;
