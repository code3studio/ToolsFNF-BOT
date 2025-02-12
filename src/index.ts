import {
  AttachmentBuilder,
  Client,
  CommandInteractionOptionResolver,
  GatewayIntentBits,
} from "discord.js";
import { ConfirmedSignatureInfo, Connection, PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";
import { createCanvas, loadImage } from "canvas";
import path, { resolve } from "path";
import TopHolders from "./top_holders";

dotenv.config();

const heliusKey = process.env.HELIUS_KEY;

const solTokenAddress = "So11111111111111111111111111111111111111112";
const usdcAddress = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const connection = new Connection(
  "https://mainnet.helius-rpc.com/?api-key=" + heliusKey
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

class RateLimiter {
  private tokens: number;
  private readonly rate: number;
  private readonly interval: number;
  private last: number;

  constructor(rate: number, interval: number, maxTokens: number) {
    this.rate = rate;
    this.interval = interval;
    this.tokens = maxTokens;
    this.last = Date.now();
  }

  private replenishTokens(): void {
    const now = Date.now();
    const elapsed = now - this.last;
    this.tokens += elapsed * this.rate / this.interval;
    this.tokens = Math.min(this.tokens, 10);
    this.last = now;
  }
  
  async delayForToken(): Promise<void> {
    let hasToken = this.take();
    while (!hasToken) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      hasToken = this.take();
    }
  }

  private take(): boolean {
    this.replenishTokens();
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    return false;
  }
}

const limiter = new RateLimiter(10, 1000, 10);

async function fetchWithRateLimit(url: string, options: RequestInit): Promise<any> {
  await limiter.delayForToken();
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok && data.error && data.error.code === -32429) {
    console.error("Rate limit hit, delaying next request...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    return fetchWithRateLimit(url, options);
  }
  return data;
}

client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user?.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === "pnl") {
    await interaction.deferReply();

    const walletAddress = (
      interaction.options as CommandInteractionOptionResolver
    ).getString("wallet", true);
    const contractAddress = (
      interaction.options as CommandInteractionOptionResolver
    ).getString("contract", true);

    try {
      const pnlData = await calculatePumpFunProfit(
        new PublicKey(walletAddress),
        new PublicKey(contractAddress)
      );
      const imageBuffer = await generateImage(pnlData);
      const attachment = new AttachmentBuilder(imageBuffer, {
        name: "pnl.png",
      });
      interaction.followUp({ files: [attachment] });
    } catch (error) {
      interaction.followUp("An error occurred while fetching PNL data");
      console.error(error);
    }
  }
  if (interaction.commandName === "top-holders") {
    await interaction.deferReply();

    const contractAddress = (
      interaction.options as CommandInteractionOptionResolver
    ).getString("contract", true);

    try {
      const token_info = await getTokenInfo(contractAddress);
      const top_holders = await TopHolders(contractAddress);
      console.log(top_holders);
      const formattedHolders = top_holders
        .map((holder: { address: any; uiAmount: number }, index: number) => {
          // Add an emoji for special notes or based on your own criteria
          const specialNote = index === 0 ? "🔝" : ""; // Example to add a top holder icon to the first holder
          return `#${index + 1} ${holder.address} | **${holder.uiAmount.toFixed(
            2
          )} ${token_info.symbol}** ${specialNote}`;
        })
        .join("\n");
      await interaction.followUp({
        content: `**Top holders for $${token_info.symbol}:**\n${formattedHolders}`,
      });
    } catch (error) {
      interaction.followUp("An error occurred while fetching top holders data");
      console.error(error);
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);

async function generateImage(data: any) {
  const width = 800;
  const height = 450;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const backgroundPath = path.join(
    __dirname,
    "../public/assets/background.png"
  );
  const background = await loadImage(backgroundPath);
  ctx.drawImage(background, 0, 0, width, height);

  ctx.font = "bold 30px Arial";
  ctx.fillStyle = "white";
  ctx.fillText(`$${data.token_symbol}`, 200, 40);

  ctx.font = "bold 20px Arial";
  ctx.fillStyle = "yellow";
  ctx.fillText(`BOUGHT`, 40, 90);
  ctx.fillText(`${data.totalSpentSOL.toFixed(2)} SOL`, 40, 120);
  ctx.fillText(`SOLD`, 200, 90);
  ctx.fillText(`${data.totalSalesSOL.toFixed(2)} SOL`, 180, 120);
  ctx.fillText(`HOLDING`, 320, 90);
  ctx.fillText(`${data.holding.toFixed(2)} SOL`, 320, 120);

  ctx.font = "bold 60px Arial";
  ctx.fillStyle = "green";
  ctx.fillText(
    `${data.roi >= 0 ? "+" : "-"}${data.roi.toFixed(2)} %`,
    130,
    220
  );

  ctx.font = "bold 20px Arial";
  ctx.fillStyle = "yellow";
  ctx.fillText(`PROFIT SOL`, 50, 320);
  ctx.fillText(`${data.profitSOL.toFixed(2)} SOL`, 50, 355);
  ctx.fillText(`PROFIT USD`, 275, 320);
  ctx.fillText(`${data.profitUSD.toFixed(2)} $`, 275, 355);

  return canvas.toBuffer();
}

async function calculatePumpFunProfit(
  walletAddress: PublicKey,
  myToken: PublicKey
): Promise<any> {
  console.log("Wallet Address: ", walletAddress.toString());
  console.log("Contract Address: ", myToken.toString());

  const usdc_info = await getTokenInfo(usdcAddress);
  const contract_info = await getTokenInfo(myToken.toString());
  const balance = await fetchTokenBalance(
    walletAddress.toString(),
    myToken.toString()
  );
  const balanceUSD = balance * contract_info.price_per_token;
  const solana_price = await getSolanaPrice();

  let totalSpentUSD = 0;
  let totalSalesUSD = 0;
  let totalFeesUSD = 0;
  let lastTxn: string | undefined = undefined;
  let count = 0;

  do {
    let sigs = await getSignaturesWithRetry(walletAddress, {
      limit: 1000,
      before: lastTxn,
    });
    console.log("Count = ", count);
    count ++;
    // console.log(sigs);
    if (sigs.length === 0) break;
    lastTxn = sigs[sigs.length - 1]?.signature;

    for (let i = 0; i < sigs.length; i += 100) {
      const chunk = sigs.slice(i, i + 100).map((sig) => sig.signature);
      let res: Response | null = null;

      try {
        await limiter.delayForToken(); // Enforce rate limit
        res = await fetch(
          "https://api.helius.xyz/v0/transactions?api-key=" + heliusKey,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transactions: chunk }),
          }
        );

        if (!res.ok) {
          console.error(`Failed to fetch transactions, status: ${res.status}`);
          continue; // Skip this batch if the request failed
        }

        console.log("Successfully fetch chunk");
        console.log("i = ", i);
        const txnArr: HeliusResponse[] = await res.json();

        for (const txn of txnArr) {
          if (txn.transactionError) continue;

          const containsToken = txn.accountData.some((ad) =>
            ad.tokenBalanceChanges.some(
              (tbc) => tbc.mint == myToken.toString()
            )
          );
          if (!containsToken) continue;

          const accountData = txn.accountData.find(
            (ad) => ad.account === walletAddress.toString()
          );
          if (!accountData) continue;

          txn.tokenTransfers.forEach(async (transfer) => {
            if (
              transfer.fromUserAccount === walletAddress.toString() ||
              transfer.toUserAccount === walletAddress.toString()
            ) {
              let tokenInfo;
              if (transfer.mint === myToken.toString()) {
                tokenInfo = contract_info;
              } else if (transfer.mint === usdcAddress) {
                tokenInfo = usdc_info;
              } else {
                tokenInfo = await getTokenInfo(transfer.mint);
              }
              if (
                transfer.fromUserAccount === walletAddress.toString() &&
                transfer.mint != myToken.toString()
              ) {
                console.log("Signature: ", txn.signature);
                console.log(transfer);
                totalSpentUSD +=
                  transfer.tokenAmount * tokenInfo.price_per_token;
                  console.log("Total Spent USD: ", totalSpentUSD);
              } else if (
                transfer.toUserAccount === walletAddress.toString() &&
                transfer.mint != myToken.toString()
              ) {
                console.log("Signature: ", txn.signature);
                console.log(transfer)
                totalSalesUSD +=
                  transfer.tokenAmount * tokenInfo.price_per_token;
                console.log("Total Sales USD: ", totalSalesUSD);
              }
            }
          });

          // Calculate total fees
          totalFeesUSD += (txn.fee / 10 ** 9) * solana_price;
        }
      } catch (error) {
        console.error("Error processing transaction chunk:", error);
      }
    }
  } while (lastTxn);

  const profitUSD = totalSalesUSD + balanceUSD - totalSpentUSD - totalFeesUSD;
  const roi = (profitUSD / totalSpentUSD) * 100;

  return {
    totalSpentUSD,
    totalFeesUSD,
    totalSalesUSD,
    totalSpentSOL: totalSpentUSD / solana_price,
    totalFeesSOL: totalFeesUSD / solana_price,
    totalSalesSOL: totalSalesUSD / solana_price,
    holding: balanceUSD / solana_price,
    profitUSD,
    profitSOL: profitUSD / solana_price,
    token_symbol: contract_info.symbol,
    roi,
  };
}
interface SignatureOptions {
  limit?: number;
  before?: string;
}

async function getSignaturesWithRetry(
  address: PublicKey,
  options: SignatureOptions,
  maxRetries = 3
): Promise<ConfirmedSignatureInfo[]> {
  let retries = 0;
  let signatures: ConfirmedSignatureInfo[] = [];
  while (retries < maxRetries) {
    try {
      const tempSignatures = await connection.getSignaturesForAddress(
        address,
        { limit: options.limit || 10, before: options.before }
      );

      signatures = signatures.length > tempSignatures.length ? signatures : tempSignatures;
      if (signatures.length === (options.limit || 10)) {
        console.log("Successfully fetched")
        return signatures;
      }

    } catch (error) {
      console.error(
        `Error fetching signatures (attempt ${retries + 1}):`,
        error
      );
    }
    console.log("Retrying ", retries)
    retries++;
    await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
  }

  console.warn(`Returning after ${retries} retries with ${signatures.length} signatures`);
  return signatures;
}

async function getSolanaPrice() {
  try {
    const JUPITER_API_URL = `https://api.jup.ag/price/v2?ids=${solTokenAddress}`;

    const response = await fetch(JUPITER_API_URL, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();
    const solPrice = data.data[solTokenAddress].price;

    return solPrice;
  } catch (error) {
    console.error("Error fetching Solana price:", error);
    return 0;
  }
}

interface TokenInfo {
  price_per_token: number;
  decimals: number;
  symbol: string;
}

async function getTokenInfo(mintAddress: string): Promise<TokenInfo> {
  const url = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;

  const options: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAsset",
      params: { id: mintAddress },
    }),
  };
  try {

    const data = await fetchWithRateLimit(url, options);
    if (data.error) throw new Error(data.error.message);
    const price_per_token = data.result.token_info.price_info.price_per_token;
    const decimals = data.result.token_info.decimals;
    const symbol = data.result.token_info.symbol;
    console.log("Price Per Token: ", price_per_token)
    return { price_per_token, decimals, symbol };
  } catch (error) {
    console.error("Error fetching token info:", error);
    return { price_per_token: 0, decimals: 0, symbol: "" };
  }
}

const fetchTokenBalance = async (
  walletAddress: string,
  contractAddress: string
) => {
  const response = await fetch(
    `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          `${walletAddress}`,
          { mint: `${contractAddress}` },
          { encoding: "jsonParsed" },
        ],
      }),
    }
  );

  const data = await response.json();

  const balance =
    data.result.value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ||
    0;
  return balance;
};

interface HeliusResponse {
  accountData: [
    {
      account: string;
      nativeBalanceChange: number;
      tokenBalanceChanges: [
        {
          userAccount: string;
          tokenAccount: string;
          mint: string;
          rawTokenAmount: {
            tokenAmount: bigint;
            decimals: bigint;
          };
        }
      ];
    }
  ];
  transactionError: any;
  fee: number;
  signature: string;
  tokenTransfers: [
    {
      fromUserAccount: string;
      toUserAccount: string;
      fromTokenAccount: string;
      toTokenAccount: string;
      tokenAmount: number;
      mint: string;
    }
  ];
}
