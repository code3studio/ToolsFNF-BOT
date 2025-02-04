import dotenv from "dotenv";

dotenv.config();

export default function TopHolders(mint: string) {
  console.log(mint);
  const GetLargestTokenAccounts = async () => {
    const body = {
      method: "getTokenLargestAccounts",
      jsonrpc: "2.0",
      params: [mint],
      id: 1,
    };
    const response = await fetch(
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_KEY}`,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const json = await response.json();
    console.log(json);
    const resultValues = json.result.value;
    console.log(resultValues);
    return resultValues;
  };
  GetLargestTokenAccounts();
}

TopHolders("3s5NwTxQKZwegP9mzrod1JLdK9LV1uyRh9gmfyhkpump");
