import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ENV variables
const STORE = process.env.SHOP_DOMAIN;
const TOKEN = process.env.SHOP_ACCESS_TOKEN;
const API_VERSION = process.env.API_VERSION;

// Helper: Parse Shopify pagination link (kept here in case you need it later)
function getNextLink(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>; rel="next"/);
  return match ? match[1] : null;
}

// Helper: normalize email
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

app.get("/giftcard", async (req, res) => {
  const email = normalizeEmail(req.query.email);
  const customerId = req.query.customer_id
    ? String(req.query.customer_id).trim()
    : null;

  if (!email) {
    return res.status(400).json({ error: "Email missing" });
  }

  try {
    const now = new Date();

    // Build Shopify search query:
    // - email:"x@y.com" → exact match
    // - status:enabled  → only enabled (active) cards
    const searchParts = [
      `email:"${email}"`,
      "status:enabled",
    ];
    const searchQuery = searchParts.join(" AND ");

    const url = `https://${STORE}/admin/api/${API_VERSION}/gift_cards/search.json?query=${encodeURIComponent(
      searchQuery
    )}&limit=250&fields=id,balance,initial_value,currency,customer_id,disabled_at,expires_on,created_at,updated_at`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: "Shopify request failed",
        status: response.status,
        details: text,
      });
    }

    const data = await response.json();
    let cards = Array.isArray(data?.gift_cards) ? data.gift_cards : [];

    // Filter only TRULY active cards:
    // - balance > 0
    // - disabled_at is null
    // - not expired (expires_on in future)
    cards = cards.filter((gc) => {
      const bal = parseFloat(gc.balance || "0");
      if (!(bal > 0)) return false;
      if (gc.disabled_at) return false;

      if (gc.expires_on) {
        const exp = new Date(gc.expires_on);
        if (exp < now) return false;
      }

      return true;
    });

    // If customer_id provided → keep only that customer's cards
    if (customerId) {
      cards = cards.filter(
        (gc) =>
          gc.customer_id &&
          String(gc.customer_id).trim() === customerId
      );
    }

    const totalBalance = cards.reduce(
      (sum, gc) => sum + parseFloat(gc.balance || "0"),
      0
    );

    const customer_id = cards.length ? cards[0].customer_id : null;

    const slimCards = cards.map((gc) => ({
      id: gc.id,
      code: gc.code, // may be masked depending on Shopify
      balance: gc.balance,
      initial_value: gc.initial_value,
      currency: gc.currency,
      customer_id: gc.customer_id,
      disabled_at: gc.disabled_at,
      expires_on: gc.expires_on,
      created_at: gc.created_at,
      updated_at: gc.updated_at,
    }));

    return res.json({
      email,
      customer_id,
      total_balance: totalBalance,
      gift_cards: slimCards,
      count: slimCards.length,
    });
  } catch (err) {
    console.error("Giftcard API error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// HOME ROUTE
app.get("/", (req, res) => {
  res.send("Gift Card API Running ✔");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
