// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors()); // Дозволяє запити з вашого React додатку
app.use(express.json()); // Дозволяє серверу читати JSON з тіла запиту

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

// Проста перевірка, що сервер працює
app.get("/", (req, res) => {
  res.send("Tap Master Backend is running! 🚀");
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});