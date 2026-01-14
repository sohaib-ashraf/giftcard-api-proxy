app.get("/giftcard", async (req, res) => {
  const email = normalizeEmail(req.query.email);
  const requestedCustomerId = req.query.customer_id
    ? String(req.query.customer_id).trim()
    : null;

  if (!email) return res.status(400).json({ error: "Email missing" });

  try {
    let allGiftCards = [];

    // ✅ IMPORTANT: use SEARCH endpoint (query works here)
    const q = `email:${email}`;
    let url = `https://${STORE}/admin/api/${API_VERSION}/gift_cards/search.json` +
      `?query=${encodeURIComponent(q)}` +
      `&limit=250` +
      `&fields=id,balance,currency,customer_id,disabled_at,expires_on,created_at,updated_at`;

    while (url) {
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
      if (data?.gift_cards?.length) allGiftCards.push(...data.gift_cards);

      url = getNextLink(response.headers.get("link"));
    }

    const now = new Date();

    // same rules as your code, but server-side
    let filteredGiftCards = allGiftCards.filter((gc) => {
      const bal = parseFloat(gc.balance || "0");
      if (!(bal > 0)) return false;
      if (gc.disabled_at) return false;

      if (gc.expires_on) {
        const exp = new Date(gc.expires_on);
        if (exp < now) return false;
      }
      return true;
    });

    // ✅ If customer_id provided → return ONLY that customer's cards
    if (requestedCustomerId) {
      filteredGiftCards = filteredGiftCards.filter(
        (gc) => String(gc.customer_id || "").trim() === requestedCustomerId
      );
    }

    const totalBalance = filteredGiftCards.reduce(
      (sum, gc) => sum + parseFloat(gc.balance || "0"),
      0
    );

    return res.json({
      email,
      customer_id: requestedCustomerId || null,
      total_balance: totalBalance,
      gift_cards: filteredGiftCards,
      count: filteredGiftCards.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
