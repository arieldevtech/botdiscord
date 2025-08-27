const { SlashCommandBuilder } = require("discord.js");
const { brandEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show detailed information about a Discord user")
    .addUserOption((opt) => opt.setName("member").setDescription("Select a member").setRequired(false)),
  cooldown: 5,
  async execute(interaction) {
    const db = getDatabase();
    const user = interaction.options.getUser("member") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    await interaction.deferReply({ ephemeral: true });

    // Informations Discord de base
    const created = `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`;
    const joined = member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "—";
    const roles = member ? member.roles.cache.filter((r) => r.name !== "@everyone").sort((a, b) => b.position - a.position) : [];
    const topRoles = roles.first(5);
    const rolesStr = topRoles.length ? topRoles.map((r) => r.toString()).join(", ") : "None";
    const totalRoles = roles.size;
    
    // Statut et activité
    const status = member?.presence?.status || "offline";
    const statusEmojis = { online: "🟢", idle: "🟡", dnd: "🔴", offline: "⚫" };
    const statusText = `${statusEmojis[status]} ${status.charAt(0).toUpperCase() + status.slice(1)}`;
    
    const activity = member?.presence?.activities?.find(a => a.type !== 4); // Ignore custom status
    const activityText = activity ? `${activity.name}` : "None";
    
    // Permissions importantes
    const keyPermissions = [];
    if (member?.permissions.has("Administrator")) keyPermissions.push("Administrator");
    if (member?.permissions.has("ManageGuild")) keyPermissions.push("Manage Server");
    if (member?.permissions.has("ManageMessages")) keyPermissions.push("Manage Messages");
    if (member?.permissions.has("KickMembers")) keyPermissions.push("Kick Members");
    if (member?.permissions.has("BanMembers")) keyPermissions.push("Ban Members");
    const permissionsText = keyPermissions.length ? keyPermissions.join(", ") : "None";
    
    // Informations de base
    const fields = [
      { name: "🆔 **User Information**", value: `**ID:** \`${user.id}\`\n**Username:** ${user.username}\n**Display Name:** ${user.displayName || user.username}\n**Bot:** ${user.bot ? "Yes" : "No"}`, inline: true },
      { name: "📅 **Dates**", value: `**Account Created:** ${created}\n**Joined Server:** ${joined}`, inline: true },
      { name: "🎭 **Status & Activity**", value: `**Status:** ${statusText}\n**Activity:** ${activityText}`, inline: true },
      { name: `🎯 **Roles** (${totalRoles})`, value: rolesStr, inline: false }
    ];
    
    if (keyPermissions.length > 0) {
      fields.push({ name: "🔑 **Key Permissions**", value: permissionsText, inline: true });
    }
    
    // Informations de la base de données si disponible
    if (db.isEnabled()) {
      try {
        const dbUser = await db.getUserByDiscordId(user.id);
        if (dbUser) {
          const vipLevels = {
            0: "🥉 Bronze",
            1: "🥈 Silver",
            2: "🥇 Gold", 
            3: "💎 Diamond"
          };
          
          // Compter les tickets et commandes
          const [ticketsResult, ordersResult] = await Promise.all([
            db.supabase.from("tickets").select("status").eq("user_id", dbUser.id),
            db.supabase.from("orders").select("status").eq("user_id", dbUser.id)
          ]);
          
          const tickets = ticketsResult.data || [];
          const orders = ordersResult.data || [];
          const openTickets = tickets.filter(t => ['open', 'claimed', 'in_progress'].includes(t.status)).length;
          
          fields.push({
            name: "💎 **VIP Status**",
            value: `**Level:** ${vipLevels[dbUser.vip_level] || vipLevels[0]}\n**Total Spent:** €${(dbUser.total_spent_cents / 100).toFixed(2)}\n**Tickets:** ${tickets.length} (${openTickets} open)\n**Orders:** ${orders.length}`,
            inline: true
          });
        }
      } catch (error) {
        console.error("Error fetching database info:", error);
      }
    }
    
    // Badges Discord
    const badges = [];
    if (user.flags) {
      const flagsArray = user.flags.toArray();
      const badgeEmojis = {
        Staff: "👨‍💼",
        Partner: "🤝",
        Hypesquad: "🎉",
        BugHunterLevel1: "🐛",
        BugHunterLevel2: "🐛",
        HypesquadOnlineHouse1: "🏠",
        HypesquadOnlineHouse2: "🏠", 
        HypesquadOnlineHouse3: "🏠",
        PremiumEarlySupporter: "⭐",
        VerifiedDeveloper: "👨‍💻"
      };
      
      flagsArray.forEach(flag => {
        if (badgeEmojis[flag]) {
          badges.push(`${badgeEmojis[flag]} ${flag.replace(/([A-Z])/g, ' $1').trim()}`);
        }
      });
    }
    
    if (badges.length > 0) {
      fields.push({ name: "🏆 **Discord Badges**", value: badges.join("\n"), inline: false });
    }

    const embed = brandEmbed({
      title: `👤 ${user.tag}`,
      title: `👤 **${user.displayName || user.username}**`,
      description: user.tag !== user.username ? `*@${user.tag}*` : null,
      fields: fields
    });
    
    if (user.displayAvatarURL()) embed.setThumbnail(user.displayAvatarURL({ size: 256 }));
    
    // Couleur basée sur le rôle le plus élevé
    if (member && topRoles.length > 0) {
      const highestRole = topRoles[0];
      if (highestRole.color !== 0) {
        embed.setColor(highestRole.color);
      }
    }

    await interaction.editReply({ embeds: [embed] });
  },
};