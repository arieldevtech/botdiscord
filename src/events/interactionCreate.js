cket will be deleted in 10 seconds."
                })]
              });
            } else {
              await interaction.editReply({
                embeds: [errorEmbed("❌ Error while closing the ticket.")]
              });
            }
            return;

          case "cancel_close":
            await interaction.update({
              embeds: [brandEmbed({
                title: "❌ Closure Cancelled",
                description: "The ticket closure has been cancelled."
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
                    flags: 64,
                    embeds: [errorEmbed("❌ Quote not found.")]
                  });
                }

                if (quote.status !== 'pending') {
                  return interaction.reply({
                    flags: 64,
                    embeds: [errorEmbed("❌ This quote is no longer available.")]
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
                  title: "✅ **Quote Accepted**",
                  description: `Thank you for accepting our quote! Click the button below to proceed with the secure payment.`,
                  fields: [
                    { name: "💰 Amount", value: `**€${(quote.amount_cents / 100).toFixed(2)}**`, inline: true },
                    { name: "🔒 Security", value: "Secured by Stripe", inline: true },
                    { name: "📝 Description", value: quote.description, inline: false }
                  ]
                });

                const row = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setLabel("💳 Pay Now")
                    .setURL(session.url)
                );

                await interaction.reply({ embeds: [embed], components: [row] });

                // Notifier dans le ticket
                const ticketEmbed = brandEmbed({
                  title: "✅ **Quote Accepted by Client**",
                  description: `${interaction.user} has accepted the quote and can now proceed with payment.`,
                  fields: [
                    { name: "💰 Amount", value: `**€${(quote.amount_cents / 100).toFixed(2)}**`, inline: true },
                    { name: "🔗 Stripe Session", value: `\`${session.id}\``, inline: true },
                    { name: "⏰ Next Steps", value: "Wait for payment confirmation", inline: false }
                  ]
                });

                await interaction.followUp({ embeds: [ticketEmbed] });

              } catch (error) {
                console.error('Error accepting quote:', error);
                await interaction.reply({
                  flags: 64,
                  embeds: [errorEmbed("❌ Error while accepting the quote.")]
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
                    title: "❌ **Quote Declined**",
                    description: "You have declined this quote. Our support team has been notified and will discuss alternative options with you."
                  })]
                });

                // Notifier dans le ticket
                const ticketEmbed = brandEmbed({
                  title: "❌ **Quote Declined by Client**",
                  description: `${interaction.user} has declined the quote. Please discuss alternative options or pricing.`
                });

                await interaction.followUp({ embeds: [ticketEmbed] });

              } catch (error) {
                console.error('Error rejecting quote:', error);
                await interaction.reply({
                  flags: 64,
                  embeds: [errorEmbed("❌ Error while rejecting the quote.")]
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
              embeds: [errorEmbed("❌ Database not available.")],
              components: []
            });
          }

          const product = products[productIndex];
          products.splice(productIndex, 1);
          currentConfig.products = products;
          fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), "utf8");

          const embed = brandEmbed({
            title: "🗑️ Product Deleted",
            description: `The product **${product.name}** has been removed from the catalog.`,
            fields: [
              { name: "SKU", value: `\`${sku}\``, inline: true },
              { name: "Price", value: `€${product.priceEUR}`, inline: true }
            ]
          });

          await interaction.update({ embeds: [embed], components: [] });

          // Actualiser la vitrine
          try {
            const { ensureProductShowcase } = require("../modules/catalog/seed");
            await ensureProductShowcase(interaction.client);
          } catch (e) {
            console.error("Error refreshing showcase:", e);
          }
          return;
        }

        if (action === "cancel_delete") {
          await interaction.update({
            embeds: [brandEmbed({
              title: "❌ Deletion Cancelled",
              description: "The product deletion has been cancelled."
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
          return interaction.reply({ embeds: [brandEmbed({ title: "⚠️ Permission Denied", description: "You don't have the required permissions to run this command." })], flags: 64 });
        }
      }

      const cd = command.cooldown ?? 3;
      const gate = checkAndSetCooldown(client, interaction.user.id, command, cd);
      if (!gate.allowed) {
        return interaction.reply({ embeds: [brandEmbed({ title: "Please wait", description: `Please wait ${gate.remaining}s before trying again.` })], flags: 64 });
      }

      await command.execute(interaction, client);
    } catch (err) {
      logger.error("interactionCreate handler error:", err);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ embeds: [brandEmbed({ title: "❌ Error", description: "Something went wrong, please try again later." })], flags: 64 });
        } else {
          await interaction.reply({ embeds: [brandEmbed({ title: "❌ Error", description: "Something went wrong, please try again later." })], flags: 64 });
        }
      } catch (_) {}
    }
  },
};