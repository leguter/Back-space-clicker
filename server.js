// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const raffleRoutes = require("./routes/raffle");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = [
    'https://space-nft-clicker-225d.vercel.app', // ✅ Ваша production URL
    'http://localhost:5173'  // ✅ URL для локальної розробки (порт може бути іншим, напр. 3000)
];

// Налаштування CORS
const corsOptions = {
    origin: function (origin, callback) {
        // Перевіряємо, чи є домен запиту у нашому білому списку
        if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
            // !origin дозволяє запити без 'origin' (напр. з мобільних додатків або Postman)
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
};

// 👇 Застосовуємо наші налаштування CORS
app.use(cors(corsOptions));
app.use(express.json()); // Дозволяє серверу читати JSON з тіла запиту

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/raffle", raffleRoutes);

// Проста перевірка, що сервер працює
app.get("/", (req, res) => {
  res.send("Tap Master Backend is running! 🚀");
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});