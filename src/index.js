
require("dotenv").config({
  path: require("node:path").resolve(__dirname, "..", ".env")
});
const { listServers, getServer } = require("./server-registry");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags
} = require("discord.js");

const {
  ensurePlayer,
  getPlayer,
  purchase
} = require("./db");

const shop = require("./shop.json");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const SHOP_PAGE_SIZE = 10;

// Discover every category present in shop.json.
function getShopCategories() {
  return [...new Set(
    shop.map(item => (item.category || "other").toLowerCase())
  )].sort();
}

// Build the category dropdown and paginated shop embed.
function buildShopPage(category, page, userId) {
  const categories = getShopCategories();

  const categoryItems = shop.filter(
    item => (item.category || "other").toLowerCase() === category
  );

  const totalPages = Math.max(
    1,
    Math.ceil(categoryItems.length / SHOP_PAGE_SIZE)
  );

  page = Math.max(0, Math.min(page, totalPages - 1));

  const pageItems = categoryItems.slice(
    page * SHOP_PAGE_SIZE,
    (page + 1) * SHOP_PAGE_SIZE
  );

  const description = pageItems.length
    ? pageItems.map(item =>
        `**${item.name}** — ${item.price} coins\n` +
        `Item ID: \`${item.id}\``
      ).join("\n\n")
    : "No items are available in this category.";

  const titleCategory =
    category.charAt(0).toUpperCase() + category.slice(1);

  const embed = new EmbedBuilder()
    .setTitle(`DayZ Shop — ${titleCategory}`)
    .setColor(0xD4A017)
    .setDescription(description)
    .setFooter({
      text: `Page ${page + 1}/${totalPages} • ${categoryItems.length} items`
    });

  // Discord allows a maximum of 25 options in one select menu.
  const visibleCategories = categories.slice(0, 25);

  const categoryMenu = new StringSelectMenuBuilder()
    .setCustomId(`shopcat:${userId}`)
    .setPlaceholder("Choose a category")
    .addOptions(
      visibleCategories.map(cat => ({
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        value: cat,
        default: cat === category
      }))
    );

  const categoryRow = new ActionRowBuilder()
    .addComponents(categoryMenu);

  const previousButton = new ButtonBuilder()
    .setCustomId(`shoppage:prev:${userId}`)
    .setLabel("Previous")
    .setEmoji("◀️")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === 0);

  const nextButton = new ButtonBuilder()
    .setCustomId(`shoppage:next:${userId}`)
    .setLabel("Next")
    .setEmoji("▶️")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages - 1);

  const navigationRow = new ActionRowBuilder()
    .addComponents(previousButton, nextButton);

  return {
    embeds: [embed],
    components: [categoryRow, navigationRow]
  };
}

// Slash commands.
const commands = [
new SlashCommandBuilder()
  .setName("servers")
  .setDescription("List available DayZ servers"),
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your coin balance"),

  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Browse the DayZ shop by category"),

  


new SlashCommandBuilder()
  .setName("buy")
  .setDescription("Purchase an item")
  .addStringOption(option =>
    option
      .setName("item")
      .setDescription("Item ID from the shop")
      .setRequired(true)
      .setMaxLength(40)
  )
  .addStringOption(option =>
    option
      .setName("server")
      .setDescription("Server to purchase for")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addIntegerOption(option =>
    option
      .setName("quantity")
      .setDescription("Quantity to buy")
      .setMinValue(1)
      .setMaxValue(10)
  )
  .addNumberOption(option =>
    option
      .setName("x")
      .setDescription("Spawn position X coordinate")
      .setRequired(true)
  )
  .addNumberOption(option =>
    option
      .setName("y")
      .setDescription("Spawn position Y coordinate (height)")
      .setRequired(true)
  )
  .addNumberOption(option =>
    option
      .setName("z")
      .setDescription("Spawn position Z coordinate")
      .setRequired(true)
  )



].map(command => command.toJSON());

function getPlayerAccount(id) {
  ensurePlayer.run(
    id,
    Number(process.env.STARTING_COINS || 100)
  );

  return getPlayer.get(id);
}

client.once("clientReady", async () => {
  console.log(`Bot online as ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" })
      .setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.DISCORD_CLIENT_ID,
        process.env.DISCORD_GUILD_ID
      ),
      { body: commands }
    );

    console.log("Discord commands registered!");
  } catch (error) {
    console.error("Command registration failed:", error);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    // Category dropdown selection.
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith("shopcat:")
    ) {
      const ownerId = interaction.customId.split(":")[1];

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "Run /shop to open your own shop menu.",
          flags: MessageFlags.Ephemeral
        });
      }

      const category = interaction.values[0];

      return interaction.update(
        buildShopPage(category, 0, ownerId)
      );
    }

    // Previous / Next pagination.
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("shoppage:")
    ) {
      const [, direction, ownerId] =
        interaction.customId.split(":");

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "Run /shop to open your own shop menu.",
          flags: MessageFlags.Ephemeral
        });
      }

      // Store current category and page in the message embed.
      const footer = interaction.message.embeds[0]?.footer?.text || "";
      const pageMatch = footer.match(/Page (\d+)\/(\d+)/);
      const currentPage = pageMatch ? Number(pageMatch[1]) - 1 : 0;

      const title = interaction.message.embeds[0]?.title || "";
      const category = title.replace(/^DayZ Shop — /, "").toLowerCase();

      const nextPage = currentPage + (direction === "next" ? 1 : -1);

      return interaction.update(
        buildShopPage(category, nextPage, ownerId)
      );
    }
	
	if (interaction.isAutocomplete()) {
  if (
    interaction.commandName === "buy" &&
    interaction.options.getFocused(true).name === "server"
  ) {
    const focused = String(
      interaction.options.getFocused()
    ).toLowerCase();

    const choices = listServers()
      .filter(server =>
        server.configured &&
        (
          server.id.toLowerCase().includes(focused) ||
          server.name.toLowerCase().includes(focused)
        )
      )
      .slice(0, 25)
      .map(server => ({
        name: `${server.name} (${server.id})`.slice(0, 100),
        value: server.id
      }));

    return interaction.respond(choices);
  }

  return interaction.respond([]);
}

    if (!interaction.isChatInputCommand()) return;

    const userId = interaction.user.id;

    if (interaction.commandName === "balance") {
      const player = getPlayerAccount(userId);

      return interaction.reply({
        content: `🪙 You have **${player.coins} coins**.`,
        flags: MessageFlags.Ephemeral
      });
    }
	
	if (interaction.commandName === "servers") {
  const servers = listServers({ includeDisabled: true });

  const description = servers.map(server => {
    const state = !server.enabled
      ? "Disabled"
      : server.configured
        ? "Configured"
        : "Needs Nitrado service ID";

    const delivery = server.itemDeliveryEnabled
      ? "Delivery flag enabled; verification still required"
      : "Delivery disabled";

    return (
      `**${server.name}** (\`${server.id}\`)\n` +
      `Status: ${state}\n${delivery}`
    );
  }).join("\n\n");

  return interaction.reply({
    content: description || "No servers are configured.",
    flags: MessageFlags.Ephemeral
  });
}

    if (interaction.commandName === "shop") {
      const categories = getShopCategories();

      if (categories.length === 0) {
        return interaction.reply({
          content: "The shop catalogue is empty.",
          flags: MessageFlags.Ephemeral
        });
      }

      return interaction.reply(
        buildShopPage(categories[0], 0, userId)
      );
    }

    if (interaction.commandName === "buy") {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral
      });

      const itemId = interaction.options
        .getString("item", true)
        .toLowerCase();

      const quantity =
        interaction.options.getInteger("quantity") || 1;

      const item = shop.find(
        entry => entry.id.toLowerCase() === itemId
      );

      if (!item) {
        return interaction.editReply(
          "Item not found. Check its ID using /shop."
        );
      }
	  
	  const serverId = interaction.options.getString("server", true);
const server = getServer(serverId);

      const order = purchase(userId, item, quantity, server.id);

      return interaction.editReply(
  `✅ Order **#${order.id}** created!\n` +
  `Server: **${server.name}**\n` +
  `Item: **${item.name}**\n` +
  `Quantity: ${quantity}\n` +
  `Cost: ${order.total} coins\n` +
  `Delivery: **Pending — not spawned in-game yet.**`
);
    }
  } catch (error) {
    console.error("Interaction error:", error);

    const message = {
      content: `❌ Something went wrong: ${error.message}`,
      flags: MessageFlags.Ephemeral
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(message).catch(() => {});
    } else if (interaction.isRepliable()) {
      await interaction.reply(message).catch(() => {});
    }
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN in your .env file.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
