const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { brandEmbed, errorEmbed, successEmbed } = require("../../lib/embeds");
const { readJson, writeJson } = require("../../utils/cache");
const config = require("../../../config.json");
const fs = require("fs");
const path = require("path");

function saveConfig(newConfig) {
  const configPath = path.join(process.cwd(), "config.json");
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), "utf8");
}

function generateSKU(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 20) + '-' + Date.now().toString().slice(-4);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("product")
    .setDescription("Gérer le catalogue de produits")
    .addSubcommand(sub =>
      sub.setName("add")
        .setDescription("Ajouter un nouveau produit")
        .addStringOption(opt => opt.setName("nom").setDescription("Nom du produit").setRequired(true))
        .addIntegerOption(opt => opt.setName("prix").setDescription("Prix en euros").setRequired(true))
        .addStringOption(opt => opt.setName("description").setDescription("Description du produit").setRequired(true))
        .addStringOption(opt => opt.setName("licence").setDescription("Politique de licence").setRequired(false))
        .addStringOption(opt => opt.setName("fichier").setDescription("Fichier livrable (chemin relatif)").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("edit")
        .setDescription("Modifier un produit existant")
        .addStringOption(opt => opt.setName("sku").setDescription("SKU du produit à modifier").setRequired(true).setAutocomplete(true))
        .addStringOption(opt => opt.setName("nom").setDescription("Nouveau nom").setRequired(false))
        .addIntegerOption(opt => opt.setName("prix").setDescription("Nouveau prix en euros").setRequired(false))
        .addStringOption(opt => opt.setName("description").setDescription("Nouvelle description").setRequired(false))
        .addStringOption(opt => opt.setName("licence").setDescription("Nouvelle politique de licence").setRequired(false))
        .addStringOption(opt => opt.setName("fichier").setDescription("Nouveau fichier livrable").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("remove")
        .setDescription("Supprimer un produit")
        .addStringOption(opt => opt.setName("sku").setDescription("SKU du produit à supprimer").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(sub =>
      sub.setName("list")
        .setDescription("Lister tous les produits")
    )
    .addSubcommand(sub =>
      sub.setName("refresh")
        .setDescription("Actualiser la vitrine produits")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 5,
  async autocomplete(interaction) {
    const products = config.products || [];
    const focused = interaction.options.getFocused().toLowerCase();
    const filtered = products
      .filter(p => p.sku.toLowerCase().includes(focused) || p.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(p => ({ name: `${p.name} (${p.sku})`, value: p.sku }));
    await interaction.respond(filtered);
  },
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const currentConfig = { ...config };
    const products = currentConfig.products || [];

    switch (subcommand) {
      case "add": {
        const nom = interaction.options.getString("nom");
        const prix = interaction.options.getInteger("prix");
        const description = interaction.options.getString("description");
        const licence = interaction.options.getString("licence") || "Usage standard";
        const fichier = interaction.options.getString("fichier") || "";

        if (prix <= 0) {
          return interaction.reply({ ephemeral: true, embeds: [errorEmbed("❌ Le prix doit être supérieur à 0.")] });
        }

        const sku = generateSKU(nom);
        const newProduct = {
          sku,
          name: nom,
          priceEUR: prix,
          description,
          images: [],
          licensePolicy: licence,
          deliverableFile: fichier
        };

        products.push(newProduct);
        currentConfig.products = products;
        saveConfig(currentConfig);

        const embed = successEmbed(`✅ Produit ajouté avec succès !`, {
          fields: [
            { name: "SKU", value: `\`${sku}\``, inline: true },
            { name: "Nom", value: nom, inline: true },
            { name: "Prix", value: `€${prix}`, inline: true },
            { name: "Description", value: description, inline: false },
            { name: "Licence", value: licence, inline: true },
            { name: "Fichier", value: fichier || "Aucun", inline: true }
          ]
        });

        await interaction.reply({ embeds: [embed] });
        break;
      }

      case "edit": {
        const sku = interaction.options.getString("sku");
        const productIndex = products.findIndex(p => p.sku === sku);

        if (productIndex === -1) {
          return interaction.reply({ ephemeral: true, embeds: [errorEmbed("❌ Produit non trouvé.")] });
        }

        const product = products[productIndex];
        const changes = [];

        const nom = interaction.options.getString("nom");
        const prix = interaction.options.getInteger("prix");
        const description = interaction.options.getString("description");
        const licence = interaction.options.getString("licence");
        const fichier = interaction.options.getString("fichier");

        if (nom && nom !== product.name) {
          product.name = nom;
          changes.push(`Nom: ${nom}`);
        }
        if (prix && prix !== product.priceEUR) {
          if (prix <= 0) {
            return interaction.reply({ ephemeral: true, embeds: [errorEmbed("❌ Le prix doit être supérieur à 0.")] });
          }
          product.priceEUR = prix;
          changes.push(`Prix: €${prix}`);
        }
        if (description && description !== product.description) {
          product.description = description;
          changes.push(`Description mise à jour`);
        }
        if (licence && licence !== product.licensePolicy) {
          product.licensePolicy = licence;
          changes.push(`Licence: ${licence}`);
        }
        if (fichier !== null && fichier !== product.deliverableFile) {
          product.deliverableFile = fichier;
          changes.push(`Fichier: ${fichier || "Aucun"}`);
        }

        if (changes.length === 0) {
          return interaction.reply({ ephemeral: true, embeds: [errorEmbed("❌ Aucune modification spécifiée.")] });
        }

        products[productIndex] = product;
        currentConfig.products = products;
        saveConfig(currentConfig);

        const embed = successEmbed(`✅ Produit modifié avec succès !`, {
          fields: [
            { name: "SKU", value: `\`${sku}\``, inline: true },
            { name: "Modifications", value: changes.join("\n"), inline: false }
          ]
        });

        await interaction.reply({ embeds: [embed] });
        break;
      }

      case "remove": {
        const sku = interaction.options.getString("sku");
        const productIndex = products.findIndex(p => p.sku === sku);

        if (productIndex === -1) {
          return interaction.reply({ ephemeral: true, embeds: [errorEmbed("❌ Produit non trouvé.")] });
        }

        const product = products[productIndex];
        
        const confirmEmbed = brandEmbed({
          title: "⚠️ Confirmation de suppression",
          description: `Êtes-vous sûr de vouloir supprimer ce produit ?\n\n**${product.name}** (${product.sku})`,
          fields: [
            { name: "Prix", value: `€${product.priceEUR}`, inline: true },
            { name: "Description", value: product.description, inline: false }
          ]
        });

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`product:confirm_delete:${sku}`)
              .setLabel("Confirmer la suppression")
              .setStyle(ButtonStyle.Danger)
              .setEmoji("🗑️"),
            new ButtonBuilder()
              .setCustomId("product:cancel_delete")
              .setLabel("Annuler")
              .setStyle(ButtonStyle.Secondary)
              .setEmoji("❌")
          );

        await interaction.reply({ embeds: [confirmEmbed], components: [row] });
        break;
      }

      case "list": {
        if (products.length === 0) {
          return interaction.reply({ ephemeral: true, embeds: [errorEmbed("❌ Aucun produit dans le catalogue.")] });
        }

        const fields = products.map(p => ({
          name: `${p.name} (${p.sku})`,
          value: `**Prix:** €${p.priceEUR}\n**Description:** ${p.description.slice(0, 100)}${p.description.length > 100 ? '...' : ''}`,
          inline: false
        }));

        const embed = brandEmbed({
          title: `📦 Catalogue produits (${products.length})`,
          fields: fields.slice(0, 10) // Limite Discord
        });

        if (products.length > 10) {
          embed.setFooter({ text: `... et ${products.length - 10} autres produits` });
        }

        await interaction.reply({ embeds: [embed] });
        break;
      }

      case "refresh": {
        try {
          const { ensureProductShowcase } = require("../../modules/catalog/seed");
          await ensureProductShowcase(interaction.client);
          await interaction.reply({ embeds: [successEmbed("✅ Vitrine produits actualisée avec succès !")] });
        } catch (error) {
          console.error("Erreur lors de l'actualisation:", error);
          await interaction.reply({ ephemeral: true, embeds: [errorEmbed("❌ Erreur lors de l'actualisation de la vitrine.")] });
        }
        break;
      }
    }
  }
};