// /routes/user.js
const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// Всі маршрути в цьому файлі будуть захищені
router.use(authMiddleware);

// Ендпоінт для отримання даних поточного користувача
router.get("/me", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const userResult = await db.query("SELECT telegram_id, first_name, username, balance FROM users WHERE telegram_id = $1", [telegramId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(userResult.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});


// Ендпоінт для обробки "тапу"
router.post("/tap", async (req, res) => {
  try {
    
    const { telegramId } = req.user;
    // Атомарно збільшуємо баланс і повертаємо нове значення
    const result = await db.query(
      "UPDATE users SET balance = balance + 1 WHERE telegram_id = $1 RETURNING balance",
      [telegramId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ newBalance: result.rows[0].balance });
  } catch (error) {
    console.error("Tap error:", error);
    res.status(500).json({ message: "Server error during tap" });
  }
});

module.exports = router;