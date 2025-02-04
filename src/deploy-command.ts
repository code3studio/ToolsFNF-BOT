import { REST, Routes, SlashCommandBuilder } from "discord.js";
import * as dotenv from "dotenv";

dotenv.config();

const commands = [
  new SlashCommandBuilder()
    .setName("pnl")
    .setDescription("Generate a PNL report")
    .addStringOption((option) =>
      option
        .setName("wallet")
        .setDescription("Enter Wallet Address")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("contract")
        .setDescription("Enter Contract Address")
        .setRequired(true)
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(
  process.env.DISCORD_BOT_TOKEN as string
);

(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID as string),
      { body: commands }
    );
    console.log("✅ Slash commands registered successfully!");
  } catch (error) {
    console.error("Error registering commands:", error);
  }
})();
