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
