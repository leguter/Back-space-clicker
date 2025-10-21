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
//     const spinPrice = 1; // 1 XTR

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
//         "UPDATE users SET tap_power = tap_power * 2 WHERE telegram_id = $1",
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

import { useState } from "react";
import { motion } from "framer-motion";
import api from "../../utils/api";
import styles from "./HorizontalWheel.module.css";

// Кожен тип призу унікальний
const segments = [
  { label: "🎁 NFT Box", type: "nft", color: "linear-gradient(135deg, #ff0077, #ff55cc)" },
  { label: "🎟 Ticket", type: "raffle_ticket", color: "linear-gradient(135deg, #0066ff, #00ccff)" },
  { label: "🌟 5 Stars", type: "stars", color: "linear-gradient(135deg, #ffee55, #ffaa00)" },
  { label: "🚀 Boost", type: "boost", color: "linear-gradient(135deg, #00ff99, #00ffaa)" },
];

export default function HorizontalWheel() {
  const [spinning, setSpinning] = useState(false);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState(null);
  // 1. Додаємо стан для налаштувань анімації
  const [transition, setTransition] = useState({ duration: 4, ease: "easeOut" });

  const segmentWidth = 160; // ширина одного сегмента
  const totalSegments = segments.length;
  const wheelCycleLength = totalSegments * segmentWidth; // 4 * 160 = 640px
  // 2. Зсув для центрування сегмента під маркером (160 / 2 = 80)
  const centeringOffset = segmentWidth / 2;

  // 🔹 Оновлена функція обертання
  const spinToReward = (rewardType) => {
    // знаходимо індекс призу
    const winningIndex = segments.findIndex(s => s.type === rewardType);

    if (winningIndex === -1) {
      console.error("Приз не знайдено:", rewardType);
      setSpinning(false);
      return;
    }

    // 3. Розраховуємо цільову позицію, щоб сегмент був у центрі
    // (напр. 1 * -160 + 80 = -80px)
    const targetPosition = (winningIndex * -segmentWidth) + centeringOffset;

    // 4. Поточна "базова" позиція (залишок від ділення)
    const currentBaseOffset = offset % wheelCycleLength;
    
    // 5. Кількість повних обертів (завжди ціле число)
    const randomTurns = 4 + Math.floor(Math.random() * 3); // 4, 5, or 6
    const spinDistance = (totalSegments * randomTurns) * segmentWidth;

    // 6. Нова фінальна позиція
    // Ми беремо поточну базу, віднімаємо дистанцію обертів,
    // і додаємо різницю, щоб потрапити на цільову позицію.
    const finalOffset = currentBaseOffset - spinDistance + (targetPosition - currentBaseOffset);

    // 7. Встановлюємо нормальну анімацію і запускаємо її
    setTransition({ duration: 4, ease: "easeOut" });
    setResult(null);
    setOffset(finalOffset);

    // після завершення анімації показуємо результат
    setTimeout(() => {
      setSpinning(false);
      setResult(segments[winningIndex]);
    }, 4500); // 4000ms анімація + 500ms буфер
  };

  // 8. 🔹 Нова функція: "невидиме" скидання позиції
  const handleAnimationComplete = () => {
    if (spinning) return; // Ігнорувати, якщо анімація ще не завершена
    
    // 9. Визначаємо, на якій "базовій" позиції ми зупинилися
    // (Це та сама логіка 'targetPosition', що й у spinToReward)
    const winningIndex = result ? segments.findIndex(s => s.type === result.type) : -1;

    if (winningIndex !== -1) {
      const targetPosition = (winningIndex * -segmentWidth) + centeringOffset;
      // 10. Встановлюємо анімацію на 0 секунд
      setTransition({ duration: 0 });
      // 11. "Телепортуємо" колесо на базову позицію
      setOffset(targetPosition);
    }
  };

  // 🔹 Обробка спіну з оплатою
  const handleSpin = async () => {
    if (spinning) return;
    setSpinning(true);
    setResult(null);

    try {
      // 1️⃣ створюємо інвойс
      const { data: invoice } = await api.post("/api/wheel/create_invoice");
      if (!invoice.success) throw new Error("Не вдалося створити інвойс");

      const link = invoice.invoice_link;

      // 2️⃣ оплата через Telegram
      if (window.Telegram?.WebApp?.openInvoice) {
        window.Telegram.WebApp.openInvoice(link, async (status) => {
          if (status === "paid") {
            // 3️⃣ отримуємо результат від бекенду
            const { data: spinData } = await api.post("/api/wheel/spin");
            if (!spinData.success) throw new Error("Спін не вдався");

            // 4️⃣ запускаємо обертання до правильного призу
            spinToReward(spinData.result.type);
          } else {
            setSpinning(false);
          }
        });
      } else {
        // 🧪 Тест без Telegram
        const { data: spinData } = await api.post("/api/wheel/spin");
        spinToReward(spinData.result.type);
      }
    } catch (err) {
      console.error("Помилка спіну:", err);
      setSpinning(false);
    }
  };

  return (
    <div className={styles.container}>
      <h2>🎡 Wheel of Fortune</h2>

      <div className={styles.wheelWrapper}>
        <motion.div
          className={styles.wheel}
          animate={{ x: offset }}
          // 12. Використовуємо transition зі стану
          transition={transition}
          // 13. Додаємо обробник завершення анімації
          onAnimationComplete={handleAnimationComplete}
        >
          {[...Array(8)].flatMap((_, i) =>
            segments.map((seg, idx) => (
              <div
                key={`${i}-${idx}`}
                className={styles.segment}
                style={{ background: seg.color }}
              >
                {seg.label}
              </div>
            ))
          )}
        </motion.div>

        <div className={styles.marker}>▼</div>
      </div>

      <button
        onClick={handleSpin}
        disabled={spinning}
        className={styles.spinButton}
      >
        {spinning ? "Spinning..." : "Spin for 1 XTR"}
      </button>

      {result && (
        <div className={styles.result}>
          🎉 You won: <strong>{result.label}</strong>
        </div>
      )}
    </div>
  );
}