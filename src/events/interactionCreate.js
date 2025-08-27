const { InteractionType, PermissionFlagsBits, ComponentType, ChannelType } = require("discord.js");
const logger = require("../utils/logger");
const { checkAndSetCooldown } = require("../utils/cooldown");
const { brandEmbed, errorEmbed } = require("../lib/embeds");
const { createTicketChannel, buildTicketIntroEmbed } = require("../modules/support/seed");
const config = require("../../config.json");
const { readJson, writeJson } = require("../utils/cache");
const { getDatabase } = require("../services/database");
const { pageEmbeds, pageButtons, handleBuy } = require("../modules/catalog/seed");
const { TicketManager } = require("../modules/support/ticketManager");

module.exports = {
  name: "interactionCreate",
  once: false,
  async execute(interaction, client) {
    const ticketManager = new TicketManager(client);
    
    try {
      // 1) Autocomplete
      if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) {
          try { await command.autocomplete(interaction, client); } catch (e) { logger.error("autocomplete error:", e); }
        } else {
          await interaction.respond([]).catch(() => {});
        }
        return;
      }

      // 2) Help pagination buttons
      if (interaction.isButton() && interaction.customId.startsWith("help:")) {
        try {
          const cat = interaction.customId.split(":")[1];
          const help = require("../commands/system/help");
          if (cat === "index") {
            const embed = help.__buildIndexEmbed(client);
            const row = help.__helpButtons("index");
            return interaction.update({ embeds: [embed], components: [row] });
          }
          const embed = help.__buildCategoryEmbed(client, cat);
          const row = help.__helpButtons("cat");
          return interaction.update({ embeds: [embed], components: [row] });
        } catch (e) {
          logger.error("help button error:", e);
          return interaction.deferUpdate().catch(() => {});
        }
      }

      // 3) Support select menu → create ticket
      if (interaction.isStringSelectMenu() && interaction.customId === "support:select") {
        const categoryKey = interaction.values?.[0];
        const db = getDatabase();
        const userId = interaction.user.id;
        
        if (db.isEnabled()) {
          // Check if user exists in database
          let user = await db.getUserByDiscordId(userId);
          if (!user) {
            user = await db.createUser(userId, interaction.user.tag);
          }
          
          // Check for existing open ticket
          const existingTicket = await db.getOpenTicketByUserId(user.id);
          if (existingTicket) {
            return interaction.reply({ ephemeral: true, embeds: [errorEmbed("You already have an open ticket. Please close it before creating a new one.")] });
          }
        }

        await interaction.deferReply({ ephemeral: true });
        const channel = await createTicketChannel(interaction.guild, interaction.user, categoryKey);
        
        let ticket = null;
        if (db.isEnabled()) {
          // Create ticket in database
          const user = await db.getUserByDiscordId(userId) || await db.createUser(userId, interaction.user.tag);
          ticket = await db.createTicket(user.id, categoryKey, channel.id);
          
          // Log the action
          await db.logAction("ticket_created", userId, "ticket", ticket.id, { categoryKey, channelId: channel.id });
        }

        const intro = buildTicketIntroEmbed(categoryKey);
        
        // Create ticket buttons
        const buttons = ticket ? ticketManager.createTicketButtons(ticket.id, categoryKey) : [];
        
        await channel.send({ 
          content: `<@${userId}>`, 
          embeds: [intro], 
          components: buttons 
        });
        
        // DM notification
        try {
          await interaction.user.send({ embeds: [brandEmbed({ title: "🎫 Ticket Created", description: `Your ticket has been opened in ${channel}. A staff member will assist you shortly.` })] });
        } catch (_) {}

        await interaction.editReply({ embeds: [brandEmbed({ title: "🎫 Ticket Created", description: `Channel: ${channel}` })] });
        return;
      }

      // 4) Gestion des tickets - Boutons et modales
      if (interaction.customId && interaction.customId.startsWith("ticket:")) {
        const parts = interaction.customId.split(":");
        const action = parts[1];
        const ticketId = parts[2];

        switch (action) {
          case "answer":
            if (getDatabase().isEnabled()) {
              const ticket = await getDatabase().getTicketByChannelId(interaction.channel.id);
              if (ticket) {
                const modal = ticketManager.createAnswerModal(ticket.id, ticket.ticket_type);
                await interaction.showModal(modal);
              }
            } else {
              await interaction.reply({ ephemeral: true, embeds: [errorEmbed("❌ Database not available.")] });
            }
            return;

          case "modal":
            await ticketManager.handleAnswerSubmission(interaction, ticketId);
            return;

          case "claim":
            await ticketManager.handleClaim(interaction, ticketId);
            return;

          case "quote":
            if (getDatabase().isEnabled()) {
              const ticket = await getDatabase().getTicketByChannelId(interaction.channel.id);
              if (ticket) {
                await interaction.reply({
                  ephemeral: true,
                  embeds: [brandEmbed({
                    title: "💰 Créer un devis",
                    description: "Utilisez la commande `/quote create` pour créer un devis pour ce ticket."
                  })]
                });
              }
            }
            return;

          case "confirm_close":
            const userId = parts[3];
            if (interaction.user.id !== userId) {
              return interaction.reply({
                ephemeral: true,
                embeds: [errorEmbed("❌ Seul l'utilisateur qui a initié la fermeture peut confirmer.")]
              });
            }
            
            await interaction.deferReply();
            const success = await ticketManager.closeTicket(ticketId, interaction.user.id, "Fermé par l'utilisateur");
            
            if (success) {
              await interaction.editReply({
                embeds: [brandEmbed({
                  title: "🔒 Ticket fermé",
                  description: "Le ticket sera supprimé dans 10 secondes."
                })]
              });
            } else {
              await interaction.editReply({
                embeds: [errorEmbed("❌ Erreur lors de la fermeture du ticket.")]
              });
            }
            return;

          case "cancel_close":
            await interaction.update({
              embeds: [brandEmbed({
                title: "❌ Fermeture annulée",
                description: "La fermeture du ticket a été annulée."
              })],
              components: []
            });
            return;

          case "accept_quote":
            const quoteId = parts[2];
            if (getDatabase().isEnabled()) {
              try {
                const quote = await getDatabase().getQuoteById(quoteId);
                if (!quote) {
                  return interaction.reply({
                    ephemeral: true,
                    embeds: [errorEmbed("❌ Devis non trouvé.")]
                  });
                }

                if (quote.status !== 'pending') {
                  return interaction.reply({
                    ephemeral: true,
                    embeds: [errorEmbed("❌ Ce devis n'est plus disponible.")]
                  });
                }

                // Accepter le devis
                await getDatabase().updateQuoteStatus(quoteId, 'accepted');
                
                // Créer session de paiement
                const stripeServer = require("../payments/stripeServer");
                const session = await stripeServer.createQuoteCheckoutSession({
                  discord_user_id: interaction.user.id,
                  discord_username: interaction.user.username,
                  quote_id: quoteId,
                  amount_cents: quote.amount_cents,
                  description: quote.description,
                  currency: quote.currency || 'EUR'
                });

                const embed = brandEmbed({
                  title: "✅ Devis accepté",
                  description: `Votre devis a été accepté. Cliquez sur le bouton ci-dessous pour procéder au paiement.`,
                  fields: [
                    { name: "Montant", value: `${(quote.amount_cents / 100).toFixed(2)} €`, inline: true },
                    { name: "Description", value: quote.description, inline: false }
                  ]
                });

                const row = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setLabel("Payer maintenant")
                    .setURL(session.url)
                    .setEmoji("💳")
                );

                await interaction.reply({ embeds: [embed], components: [row] });

                // Notifier dans le ticket
                const ticketEmbed = brandEmbed({
                  title: "✅ Devis accepté par le client",
                  description: `${interaction.user} a accepté le devis et peut maintenant procéder au paiement.`,
                  fields: [
                    { name: "Montant", value: `${(quote.amount_cents / 100).toFixed(2)} €`, inline: true },
                    { name: "Session Stripe", value: `\`${session.id}\``, inline: true }
                  ]
                });

                await interaction.followUp({ embeds: [ticketEmbed] });

              } catch (error) {
                console.error('Erreur lors de l\'acceptation du devis:', error);
                await interaction.reply({
                  ephemeral: true,
                  embeds: [errorEmbed("❌ Erreur lors de l'acceptation du devis.")]
                });
              }
            }
            return;

          case "reject_quote":
            const rejectQuoteId = parts[2];
            if (getDatabase().isEnabled()) {
              try {
                await getDatabase().updateQuoteStatus(rejectQuoteId, 'rejected');
                
                await interaction.reply({
                  embeds: [brandEmbed({
                    title: "❌ Devis refusé",
                    description: "Vous avez refusé ce devis. L'équipe support sera notifiée."
                  })]
                });

                // Notifier dans le ticket
                const ticketEmbed = brandEmbed({
                  title: "❌ Devis refusé par le client",
                  description: `${interaction.user} a refusé le devis.`
                });

                await interaction.followUp({ embeds: [ticketEmbed] });

              } catch (error) {
                console.error('Erreur lors du refus du devis:', error);
                await interaction.reply({
                  ephemeral: true,
                  embeds: [errorEmbed("❌ Erreur lors du refus du devis.")]
                });
              }
            }
            return;
        }
      }

      // 5) Gestion des produits - Boutons de confirmation
      if (interaction.isButton() && interaction.customId.startsWith("product:")) {
        const parts = interaction.customId.split(":");
        const action = parts[1];
        const sku = parts[2];

        if (action === "confirm_delete") {
          const fs = require("fs");
          const path = require("path");
          const configPath = path.join(process.cwd(), "config.json");
          const currentConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
          const products = currentConfig.products || [];
          
          const productIndex = products.findIndex(p => p.sku === sku);
          if (productIndex === -1) {
            return interaction.update({
              embeds: [errorEmbed("❌ Produit non trouvé.")],
              components: []
            });
          }

          const product = products[productIndex];
          products.splice(productIndex, 1);
          currentConfig.products = products;
          fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), "utf8");

          const embed = brandEmbed({
            title: "🗑️ Produit supprimé",
            description: `Le produit **${product.name}** a été supprimé du catalogue.`,
            fields: [
              { name: "SKU", value: `\`${sku}\``, inline: true },
              { name: "Prix", value: `€${product.priceEUR}`, inline: true }
            ]
          });

          await interaction.update({ embeds: [embed], components: [] });

          // Actualiser la vitrine
          try {
            const { ensureProductShowcase } = require("../modules/catalog/seed");
            await ensureProductShowcase(interaction.client);
          } catch (e) {
            console.error("Erreur lors de l'actualisation de la vitrine:", e);
          }
          return;
        }

        if (action === "cancel_delete") {
          await interaction.update({
            embeds: [brandEmbed({
              title: "❌ Suppression annulée",
              description: "La suppression du produit a été annulée."
            })],
            components: []
          });
          return;
        }
      }

      // 4) Catalog pagination and buy button
      if (interaction.isButton() && interaction.customId.startsWith("catalog:")) {
        const parts = interaction.customId.split(":");
        const action = parts[1];
        const arg = parts[2];
        const products = (require("../../config.json").products) || [];

        if (action === "buy") {
          return handleBuy(interaction, parts[2]);
        }

        // Pagination
        const cache = readJson(".cache/catalog.json", {});
        const page = Number(arg) || 0;
        let newPage = page;
        if (action === "next") newPage = page + 1;
        if (action === "prev") newPage = Math.max(0, page - 1);
        const pages = Math.max(1, Math.ceil(products.length / 5));
        if (newPage >= pages) newPage = pages - 1;

        const embeds = pageEmbeds(products, newPage);
        const components = pageButtons(products, newPage);
        await interaction.update({ content: `Product showcase (${products.length}) — Page ${newPage + 1}/${pages}`, embeds, components }).catch(() => {});
        writeJson(".cache/catalog.json", { ...cache, page: newPage, messageId: cache.messageId });
        return;
      }

      // 5) Slash commands handling
      if (interaction.type !== InteractionType.ApplicationCommand) return;

      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      if (command.permissions) {
        const member = interaction.member;
        const hasPerms = command.permissions.every((p) => member.permissions?.has(PermissionFlagsBits[p] ?? p));
        if (!hasPerms) {
          return interaction.reply({ ephemeral: true, embeds: [brandEmbed({ title: "⚠️ Permission Denied", description: "You don't have the required permissions to run this command." })] });
        }
      }

      const cd = command.cooldown ?? 3;
      const gate = checkAndSetCooldown(client, interaction.user.id, command, cd);
      if (!gate.allowed) {
        return interaction.reply({ ephemeral: true, embeds: [brandEmbed({ title: "Please wait", description: `Please wait ${gate.remaining}s before trying again.` })] });
      }

      await command.execute(interaction, client);
    } catch (err) {
      logger.error("interactionCreate handler error:", err);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ ephemeral: true, embeds: [brandEmbed({ title: "❌ Error", description: "Something went wrong, please try again later." })] });
        } else {
          await interaction.reply({ ephemeral: true, embeds: [brandEmbed({ title: "❌ Error", description: "Something went wrong, please try again later." })] });
        }
      } catch (_) {}
    }
  },
};