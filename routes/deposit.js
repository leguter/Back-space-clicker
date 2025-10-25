import { useState, useEffect } from "react";
import api from "../../utils/api";
import styles from "./DepositPage.module.css";

export default function DepositPage() {
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [balance, setBalance] = useState(0);

  const depositOptions = [
    { amount: 1, bonus: 0 },
    { amount: 50, bonus: 0 },
    { amount: 100, bonus: 20 },
    { amount: 500, bonus: 100 },
    { amount: 1000, bonus: 300 },
  ];

  // === Початкове завантаження поточного балансу ===
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/api/user/me");
        if (res.data?.user) {
          setBalance(res.data.user.internal_stars || 0);
        }
      } catch (e) {
        console.error("Load balance error:", e);
      }
    })();
  }, []);

  // === Створення інвойсу та відкриття оплати ===
  const handleDeposit = async (amount) => {
    try {
      setLoading(true);
      setSelected(amount);
      setMessage("");

      const res = await api.post("/api/deposit/create_invoice", { amount });

      if (res.data?.success && res.data.invoice_link) {
        if (window.Telegram?.WebApp) {
          // Відкриваємо оплату у Telegram WebApp
          window.Telegram.WebApp.openInvoice(res.data.invoice_link);
          setMessage("💳 Відкриваємо оплату у Telegram...");
        } else {
          // fallback для вебверсії
          window.open(res.data.invoice_link, "_blank");
          setMessage("Відкрито у новому вікні ✅");
        }

        // Періодично перевіряємо бекенд, чи оплата пройшла
        const checkPayment = async () => {
          try {
            const userRes = await api.get("/api/user/me");
            if (userRes.data?.user) {
              const newBalance = userRes.data.user.internal_stars || 0;
              if (newBalance > balance) {
                setBalance(newBalance);
                setMessage("💰 Баланс оновлено!");
              }
            }
          } catch (err) {
            console.error("Payment verification error:", err);
          }
        };

        // Простий таймер перевірки (можна зробити довше)
        const interval = setInterval(checkPayment, 2000);
        setTimeout(() => clearInterval(interval), 30000); // зупиняємо через 30 сек

      } else {
        setMessage("Не вдалося створити інвойс 😕");
      }
    } catch (err) {
      console.error("Deposit error:", err);
      setMessage("Помилка під час створення інвойсу");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.Container}>
      <h2 className={styles.Title}>💰 Deposit Stars</h2>
      <p className={styles.Subtitle}>Твій поточний баланс: {balance} ⭐</p>

      <div className={styles.ButtonGrid}>
        {depositOptions.map(({ amount, bonus }) => (
          <button
            key={amount}
            className={`${styles.DepositButton} ${selected === amount ? styles.Active : ""}`}
            onClick={() => handleDeposit(amount)}
            disabled={loading}
          >
            <div className={styles.Amount}>{amount} ⭐</div>
            {bonus > 0 && <div className={styles.Bonus}>+{bonus} бонус</div>}
          </button>
        ))}
      </div>

      {message && <p className={styles.Message}>{message}</p>}
    </div>
  );
}
