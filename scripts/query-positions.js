const wallet = "0xe2647d59b5b71a686b1befaa5b8055e0ec6c3bf7";

const query = `
{
  gatewayBuys(where: { buyer: "${wallet}" }) {
    marketProxy
    outcomeIdx
    sharesOut
  }
  gatewayRedemptions(where: { redeemer: "${wallet}" }) {
    marketProxy
    tokensOut
  }
}
`;

async function main() {
  const res = await fetch("https://api.goldsky.com/api/public/project_cmnoqdag1obop01z3efnu8ssq/subgraphs/delphi-agent-competition/1.0.0/gn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  console.log("ONCHAIN_DATA:", JSON.stringify(data, null, 2));
}

main().catch(console.error);
