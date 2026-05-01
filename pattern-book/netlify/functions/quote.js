exports.handler = async (event) => {
  const ticker = event.queryStringParameters?.ticker;
  if (!ticker) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing ticker parameter" }) };
  }

  const apiKey = process.env.FD_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "FD_API_KEY not configured" }) };
  }

  try {
    const res = await fetch(
      `https://api.financialdatasets.ai/prices/snapshot?ticker=${encodeURIComponent(ticker)}`,
      { headers: { "X-API-KEY": apiKey } }
    );

    if (!res.ok) {
      const text = await res.text();
      return { statusCode: res.status, body: text };
    }

    const data = await res.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
