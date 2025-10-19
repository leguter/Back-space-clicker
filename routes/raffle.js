// /routes/raffle.js
const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// 🔐 Усі ендпоінти захищені авторизацією
router.use(authMiddleware);

// ===============================================================
// ✅ GET /api/raffle/:id — Отримати інформацію про розіграш
// ===============================================================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const raffleResult = await db.query("SELECT * FROM raffles WHERE id = $1", [id]);
    if (raffleResult.rows.length === 0)
      return res.status(404).json({ message: "Raffle not found" });

    const raffle = raffleResult.rows[0];
    const participantsResult = await db.query(
      "SELECT COUNT(*) FROM raffle_participants WHERE raffle_id = $1",
      [id]
    );

    raffle.participants = parseInt(participantsResult.rows[0].count, 10);
    res.json(raffle);
  } catch (err) {
    console.error("❌ Error in GET /raffle/:id:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===============================================================
// 🎟️ POST /api/raffle/:id/join — Участь у розіграші
// ===============================================================
router.post("/:id/join", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const { id } = req.params;

    // 1️⃣ Отримати користувача
    const userResult = await db.query(
      "SELECT tickets FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (userResult.rows.length === 0)
      return res.status(404).json({ message: "User not found" });

    const userTickets = userResult.rows[0].tickets;

    // 2️⃣ Отримати розіграш
    const raffleResult = await db.query("SELECT * FROM raffles WHERE id = $1", [id]);
    if (raffleResult.rows.length === 0)
      return res.status(404).json({ message: "Raffle not found" });

    const raffle = raffleResult.rows[0];

    if (new Date(raffle.ends_at) < new Date())
      return res.status(400).json({ message: "Raffle already ended" });

    // 3️⃣ Перевірити, чи користувач вже бере участь
    const existing = await db.query(
      "SELECT 1 FROM raffle_participants WHERE raffle_id = $1 AND telegram_id = $2",
      [id, telegramId]
    );

    if (existing.rows.length > 0)
      return res.status(400).json({ message: "Already participating" });

    // 4️⃣ Перевірити кількість тікетів
    if (userTickets < raffle.cost)
      return res.status(400).json({ message: "Not enough tickets" });

    // 5️⃣ Відняти тікети та записати участь
    await db.query("UPDATE users SET tickets = tickets - $1 WHERE telegram_id = $2", [
      raffle.cost,
      telegramId,
    ]);

    await db.query(
      "INSERT INTO raffle_participants (raffle_id, telegram_id) VALUES ($1, $2)",
      [id, telegramId]
    );

    res.json({ message: "Participation confirmed ✅" });
  } catch (err) {
    console.error("❌ Error in POST /raffle/:id/join:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===============================================================
// 🏆 POST /api/raffle/:id/end — Завершити розіграш (адмін або cron)
// ===============================================================
router.post("/:id/end", async (req, res) => {
  try {
    const { id } = req.params;

    const raffleResult = await db.query("SELECT * FROM raffles WHERE id = $1", [id]);
    if (raffleResult.rows.length === 0)
      return res.status(404).json({ message: "Raffle not found" });

    const raffle = raffleResult.rows[0];
    if (raffle.ended)
      return res.status(400).json({ message: "Raffle already ended" });

    // 1️⃣ Отримати учасників
    const participantsResult = await db.query(
      "SELECT telegram_id FROM raffle_participants WHERE raffle_id = $1",
      [id]
    );
    const participants = participantsResult.rows;

    if (participants.length === 0) {
      await db.query("UPDATE raffles SET ended = true WHERE id = $1", [id]);
      return res.json({ message: "No participants — raffle ended with no winner" });
    }

    // 2️⃣ Вибрати переможця
    const winner =
      participants[Math.floor(Math.random() * participants.length)].telegram_id;

    // 3️⃣ Зберегти результат
    await db.query(
      "UPDATE raffles SET ended = true, winner_id = $1 WHERE id = $2",
      [winner, id]
    );

    res.json({ message: "Raffle ended 🎉", winner });
  } catch (err) {
    console.error("❌ Error in POST /raffle/:id/end:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===============================================================
// 🪩 GET /api/raffle/:id/result — Отримати результат розіграшу
// ===============================================================
router.get("/:id/result", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const { id } = req.params;

    const raffleResult = await db.query("SELECT * FROM raffles WHERE id = $1", [id]);
    if (raffleResult.rows.length === 0)
      return res.status(404).json({ message: "Raffle not found" });

    const raffle = raffleResult.rows[0];
    if (!raffle.ended)
      return res.json({ status: "pending", message: "Raffle still active" });

    const isParticipant = await db.query(
      "SELECT 1 FROM raffle_participants WHERE raffle_id = $1 AND telegram_id = $2",
      [id, telegramId]
    );

    if (isParticipant.rows.length === 0)
      return res.json({ status: "not_participated" });

    const status = raffle.winner_id === telegramId ? "won" : "lost";
    res.json({ status });
  } catch (err) {
    console.error("❌ Error in GET /raffle/:id/result:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
