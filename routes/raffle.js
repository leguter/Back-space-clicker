// /routes/raffle.js
const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");

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

    if (new Date(raffle.ends_at) < new Date())
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
// 🏆 POST /api/raffle/:idOrSlug/end — Завершити розіграш (адмін або cron)
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

    if (raffle.ended)
      return res.status(400).json({ message: "Raffle already ended" });

    // 1️⃣ Отримати учасників
    const participantsResult = await db.query(
      "SELECT telegram_id FROM raffle_participants WHERE raffle_id = $1",
      [raffle.id]
    );
    const participants = participantsResult.rows;

    if (participants.length === 0) {
      await db.query("UPDATE raffles SET ended = true WHERE id = $1", [raffle.id]);
      return res.json({ message: "No participants — raffle ended with no winner" });
    }

    // 2️⃣ Вибрати переможця
    const winner =
      participants[Math.floor(Math.random() * participants.length)].telegram_id;

    // 3️⃣ Зберегти результат
    await db.query(
      "UPDATE raffles SET ended = true, winner_id = $1 WHERE id = $2",
      [winner, raffle.id]
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
    if (!raffle.ended)
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

module.exports = router;
