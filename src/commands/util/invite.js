const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { brandEmbed } = require("../../lib/embeds");
const config = require("../../../config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Obtenir le lien d'invitation du serveur"),
  cooldown: 5,
  async execute(interaction) {
    const guild = interaction.guild;
    
    // Créer une invitation permanente
    let inviteUrl = null;
    try {
      const invite = await guild.invites.create(interaction.channel, {
        maxAge: 0, // Permanent
        maxUses: 0, // Illimité
        unique: true
      });
      inviteUrl = invite.url;
    } catch (error) {
      // Fallback si pas de permissions
      inviteUrl = `https://discord.gg/${guild.vanityURLCode || 'server'}`;
    }

    const embed = brandEmbed({
      title: `🎉 Inviter des amis sur ${guild.name}`,
      description: "Partagez ce lien avec vos amis pour qu'ils rejoignent notre communauté !",
      fields: [
        { name: "📋 Lien d'invitation", value: `[Cliquez ici pour copier](${inviteUrl})`, inline: false },
        { name: "👥 Membres actuels", value: `**${guild.memberCount}** membres`, inline: true },
        { name: "🎯 Pourquoi nous rejoindre ?", value: "• Support professionnel\n• Services de qualité\n• Communauté active", inline: false }
      ]
    });

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("📋 Copier le lien")
          .setURL(inviteUrl)
      );

    await interaction.reply({ 
      ephemeral: true, 
      embeds: [embed], 
      components: [row] 
    });
  }
};