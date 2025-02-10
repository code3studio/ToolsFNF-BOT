import {
  AttachmentBuilder,
  Client,
  CommandInteractionOptionResolver,
  GatewayIntentBits,
} from "discord.js";
import { ConfirmedSignatureInfo, Connection, PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";
import { createCanvas, loadImage } from "canvas";
import path from "path";

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
});

client.login(process.env.DISCORD_BOT_TOKEN);

async function generateImage(data: any) {
  const width = 800;
  const height = 450;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const backgroundPath = path.join(__dirname, "../public/assets/background.png");
  const background = await loadImage(backgroundPath);
  ctx.drawImage(background, 0, 0, width, height);

  // Helper function for drawing SOL values with a Solana gradient.
  function drawSolGradientText(text: string, x: number, y: number) {
    const textWidth = ctx.measureText(text).width;
    const gradient = ctx.createLinearGradient(x, y, x + textWidth, y);
    gradient.addColorStop(0, "#9945FF"); // Solana purple
    gradient.addColorStop(1, "#14F195"); // Solana green
    ctx.fillStyle = gradient;
    ctx.fillText(text, x, y);
  }

  // Helper function for drawing ROI and Profit USD values with a money-inspired green gradient.
  function drawMoneyGradientText(text: string, x: number, y: number) {
    const textWidth = ctx.measureText(text).width;
    const gradient = ctx.createLinearGradient(x, y, x + textWidth, y);
    gradient.addColorStop(0, "#56ab2f"); // dark green
    gradient.addColorStop(1, "#a8e063"); // light green
    ctx.fillStyle = gradient;
    ctx.fillText(text, x, y);
  }

  // New helper function for drawing text with a gold gradient and enhanced glow.
  function drawGoldGlowText(text: string, x: number, y: number) {
    ctx.font = "bold 30px 'Times New Roman'";
    const textWidth = ctx.measureText(text).width;
    const gradient = ctx.createLinearGradient(x, y, x + textWidth, y);
    // Set up a gold gradient.
    gradient.addColorStop(0, "#b8860b"); // dark goldenrod
    gradient.addColorStop(0.5, "#ffd700"); // gold
    gradient.addColorStop(1, "#daa520"); // goldenrod
    ctx.fillStyle = gradient;
    
    // Add a glow effect to make the text pop.
    ctx.shadowColor = "rgba(255, 223, 0, 0.8)"; // a bright, gold-ish glow
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    ctx.fillText(text, x, y);
    
    // Reset the shadow settings.
    ctx.shadowColor = "transparent";
  }

  // --- Ticker Name ---
  // Render the token symbol using our gold glow function.
  drawGoldGlowText(`$${data.token_symbol}`, 200, 40);

  // --- BOUGHT Section ---
  ctx.font = "bold 20px 'Times New Roman'";
  ctx.fillStyle = "white";
  ctx.fillText("BOUGHT", 40, 90);
  drawSolGradientText(`${data.totalSpentSOL.toFixed(2)} SOL`, 40, 120);

  // --- SOLD Section ---
  ctx.fillStyle = "white";
  ctx.fillText("SOLD", 180, 90);
  drawSolGradientText(`${data.totalSalesSOL.toFixed(2)} SOL`, 180, 120);

  // --- HOLDING Section ---
  ctx.fillStyle = "white";
  ctx.fillText("HOLDING", 320, 90);
  drawSolGradientText(`${data.holding.toFixed(2)} SOL`, 320, 120);

  // --- ROI Percentage with Money-Inspired Green Gradient ---
  ctx.font = "bold 60px 'Times New Roman'";
  drawMoneyGradientText(
    `${data.roi >= 0 ? "+" : "-"}${data.roi.toFixed(2)} %`,
    125,
    220
  );

  // --- PROFIT Section ---
  ctx.font = "bold 25px 'Times New Roman'";
  ctx.fillStyle = "white";
  ctx.fillText("PROFIT SOL", 50, 320);
  drawSolGradientText(`${data.profitSOL.toFixed(2)} SOL`, 50, 355);

  ctx.fillStyle = "white";
  ctx.fillText("PROFIT USD", 275, 320);
  drawMoneyGradientText(`${data.profitUSD.toFixed(2)} $`, 275, 355);

  // --- Signature / Branding ---
  // Render the signature "GreedFNF" in the bottom left with the gold glow effect.
  const signatureX = 20;
  const signatureY = height - 15; // lowered by 5 pixels from before
  drawGoldGlowText("GreedFNF", signatureX, signatureY);

  return canvas.toBuffer();
}








async function calculatePumpFunProfit(
  walletAddress: PublicKey,
  myToken: PublicKey
) {
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

  do {
    let sigs;
    try {
      sigs = await getSignaturesWithRetry(walletAddress, {
        limit: 500,
        before: lastTxn,
      });
    } catch (error) {
      console.error("Error fetching signatures:", error);
      break;
    }

    if (!sigs.length) break;
    lastTxn = sigs[sigs.length - 1]?.signature;

    const sigsChunked: string[][] = [];

    for (let i = 0; i < sigs.length; i++) {
      const chunkIndex = Math.trunc(i / 100);
      if (!sigsChunked[chunkIndex]) sigsChunked[chunkIndex] = [];
      sigsChunked[chunkIndex].push(sigs[i].signature);
    }

    console.log(sigsChunked)
    for (const chunk of sigsChunked) {
      let chunkHasToken = false;
      let res: Response | null = null;

      do {
        res = await fetch(
          "https://api.helius.xyz/v0/transactions?api-key=" +
            heliusKey,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transactions: chunk }),
          }
        );
      } while (!res?.ok);

      const txnArr: HeliusResponse[] = await res.json();

      for (const txn of txnArr) {
        if (txn.transactionError) continue;

        const containsToken = txn.accountData.some((ad) =>
          ad.tokenBalanceChanges.some((tbc) => tbc.mint == myToken.toString())
        );
        if (!containsToken) continue;

        const accountData = txn.accountData.find(
          (ad) => ad.account == walletAddress.toString()
        );
        if (!accountData) continue;

        chunkHasToken = true;

        // Calculate total investment
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
              totalSpentUSD += transfer.tokenAmount * tokenInfo.price_per_token;
            } else if (
              transfer.toUserAccount === walletAddress.toString() &&
              transfer.mint != myToken.toString()
            ) {
              totalSalesUSD += transfer.tokenAmount * tokenInfo.price_per_token;
            }
            console.log("Total Spent USD: ", totalSpentUSD);
            console.log("Total Sales USD: ", totalSalesUSD);
          }
        });

        // Calculate total fees
        totalFeesUSD += (txn.fee / 10 ** 9) * solana_price;
      }

      if (!chunkHasToken) {
        continue;
      }
    }
  } while (true);

  const profitUSD = totalSalesUSD + balanceUSD - totalSpentUSD - totalFeesUSD;
  console.log("Profit USD: ", profitUSD);
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

async function getSignaturesWithRetry(
  address: PublicKey,
  options: { limit?: number; before?: string },
  maxRetries = 3
) {
  let retries = 0;
  let signatures: ConfirmedSignatureInfo[] = [];
  while (retries < maxRetries) {
    try {
      const temp_signatures = await connection.getSignaturesForAddress(address, options);
      
      if (temp_signatures.length === (options.limit || 10)) {
        return temp_signatures;
      } else {
        signatures = signatures.length > temp_signatures.length ? signatures : temp_signatures;
      }

      console.warn(`Received ${signatures.length} signatures, retrying (attempt ${retries + 1})...`);
      retries ++;
      await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
    } catch (error) {
      console.error(
        `Error fetching signatures (attempt ${retries + 1}):`,
        error
      );
      retries++;
      await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
    }
  }

  return signatures;
}

async function getSolanaPrice() {
  try {
    const JUPITER_API_URL =
      `https://api.jup.ag/price/v2?ids=${solTokenAddress}`;

    const response = await fetch(
      JUPITER_API_URL,
      {
        method: "GET",
        headers: {"Content-Type": "application/json"},
      }
    );

    const data = await response.json();
    const solPrice = data.data[solTokenAddress].price;

    return solPrice;
  } catch (error) {
    console.error("Error fetching Solana price:", error);
    return 0;
  }
}

async function getTokenInfo(mintAddress: string) {
  try {
    const url = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
  
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAsset",
        params: { id: mintAddress },
      }),
    });
  
    const data = await response.json();
    const price_per_token = data.result.token_info.price_info.price_per_token;
    const decimals = data.result.token_info.decimals;
    const symbol = data.result.token_info.symbol;
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
