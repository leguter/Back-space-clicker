// /db/index.js
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // якщо ти на Render, це обов’язково!
});

module.exports = pool;
