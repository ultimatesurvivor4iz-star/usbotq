
require("dotenv").config();

async function getServerStatus() {
  const token = process.env.NITRADO_TOKEN;
  const serviceId = process.env.NITRADO_SERVICE_ID;

  if (!token || !serviceId) {
    throw new Error(
      "Missing NITRADO_TOKEN or NITRADO_SERVICE_ID in .env"
    );
  }

  if (!/^\d+$/.test(serviceId)) {
    throw new Error("NITRADO_SERVICE_ID must be numeric.");
  }

  const response = await fetch(
    `https://api.nitrado.net/services/${serviceId}/gameservers`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(15000)
    }
  );

  if (!response.ok) {
    throw new Error(
      `Nitrado API error: HTTP ${response.status}`
    );
  }

  const result = await response.json();

  return result.data?.gameserver ?? result.data;
}

module.exports = { getServerStatus };
