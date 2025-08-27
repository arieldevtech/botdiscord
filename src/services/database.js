const { createClient } = require("@supabase/supabase-js");
const logger = require("../utils/logger");

class DatabaseService {
  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!url || !serviceKey) {
      logger.warn("Missing Supabase credentials (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)");
      logger.warn("Database features will be disabled. Bot will run in limited mode.");
      this.supabase = null;
      return;
    }
    
    this.supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    
    logger.success("Database service initialized");
  }

  isEnabled() {
    return this.supabase !== null;
  }

  // User management
  async createUser(discordId, discordTag) {
    if (!this.isEnabled()) return null;
    try {
      const { data, error } = await this.supabase
        .from("users")
        .insert({
          discord_id: discordId,
          discord_tag: discordTag,
          vip_level: 0,
          total_spent_cents: 0
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          return await this.getUserByDiscordId(discordId);
        }
        throw error;
      }

      logger.info(`[DB] Created user: ${discordTag} (${discordId})`);
      return data;
    } catch (error) {
      logger.error(`[DB] Failed to create user ${discordId}:`, error);
      throw error;
    }
  }

  async getUserByDiscordId(discordId) {
    try {
      const { data, error } = await this.supabase
        .from("users")
        .select("*")
        .eq("discord_id", discordId)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found is ok
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`[DB] Failed to get user ${discordId}:`, error);
      throw error;
    }
  }

  async updateUserTag(discordId, newTag) {
    try {
      const { data, error } = await this.supabase
        .from("users")
        .update({ discord_tag: newTag })
        .eq("discord_id", discordId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error(`[DB] Failed to update user tag ${discordId}:`, error);
      throw error;
    }
  }

  // Ticket management
  async createTicket(userId, ticketType, channelId, title = null, description = null) {
    try {
      const { data, error } = await this.supabase
        .from("tickets")
        .insert({
          user_id: userId,
          ticket_type: ticketType,
          channel_id: channelId,
          title,
          description,
          status: 'open'
        })
        .select()
        .single();

      if (error) throw error;

      logger.info(`[DB] Created ticket: ${ticketType} for user ${userId}`);
      return data;
    } catch (error) {
      logger.error(`[DB] Failed to create ticket:`, error);
      throw error;
    }
  }

  async getOpenTicketByUserId(userId) {
    try {
      const { data, error } = await this.supabase
        .from("tickets")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["open", "claimed", "in_progress", "waiting_payment"])
        .single();

      if (error && error.code !== 'PGRST116') { // Not found is ok
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`[DB] Failed to get open ticket for user ${userId}:`, error);
      throw error;
    }
  }

  async getTicketByChannelId(channelId) {
    try {
      const { data, error } = await this.supabase
        .from("tickets")
        .select(`
          *,
          users!inner(discord_id, discord_tag, vip_level)
        `)
        .eq("channel_id", channelId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`[DB] Failed to get ticket by channel ${channelId}:`, error);
      throw error;
    }
  }

  async updateTicketStatus(ticketId, status) {
    try {
      const updateData = { status };
      if (status === 'closed') {
        updateData.closed_at = new Date().toISOString();
      }
      
      const { data, error } = await this.supabase
        .from("tickets")
        .update(updateData)
        .eq("id", ticketId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error(`[DB] Failed to update ticket status:`, error);
      throw error;
    }
  }

  async updateTicketResponses(ticketId, responses) {
    try {
      const { data, error } = await this.supabase
        .from("tickets")
        .update({ responses })
        .eq("id", ticketId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error(`[DB] Failed to update ticket responses:`, error);
      throw error;
    }
  }

  // Ticket messages
  async addTicketMessage(ticketId, authorDiscordId, content, messageType = 'message') {
    try {
      const { data, error } = await this.supabase
        .from("ticket_messages")
        .insert({
          ticket_id: ticketId,
          author_discord_id: authorDiscordId,
          content,
          message_type: messageType
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error(`[DB] Failed to add ticket message:`, error);
      throw error;
    }
  }

  async getTicketMessages(ticketId, limit = 100) {
  async getQuoteById(quoteId) {
    try {
      const { data, error } = await this.supabase
        .from("quotes")
        .select("*")
        .eq("id", quoteId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`[DB] Failed to get quote ${quoteId}:`, error);
      throw error;
    }
  }

  async updateQuoteStatus(quoteId, status) {
    try {
      const updateData = { status };
      if (status === 'accepted') {
        updateData.accepted_at = new Date().toISOString();
      }
      
      const { data, error } = await this.supabase
        .from("quotes")
        .update(updateData)
        .eq("id", quoteId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error(`[DB] Failed to update quote status:`, error);
      throw error;
    }
  }

    try {
      const { data, error } = await this.supabase
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error(`[DB] Failed to get ticket messages:`, error);
      throw error;
    }
  }

  // Assignments
  async assignTicket(ticketId, assigneeDiscordId, roleType = 'support') {
    try {
      // Remove existing assignments
      await this.supabase
        .from("assignments")
        .delete()
        .eq("ticket_id", ticketId);

      // Add new assignment
      const { data, error } = await this.supabase
        .from("assignments")
        .insert({
          ticket_id: ticketId,
          assignee_discord_id: assigneeDiscordId,
          role_type: roleType
        })
        .select()
        .single();

      if (error) throw error;

      // Update ticket status
      await this.updateTicketStatus(ticketId, 'claimed');

      logger.info(`[DB] Assigned ticket ${ticketId} to ${assigneeDiscordId}`);
      return data;
    } catch (error) {
      logger.error(`[DB] Failed to assign ticket:`, error);
      throw error;
    }
  }

  async getTicketAssignment(ticketId) {
    try {
      const { data, error } = await this.supabase
        .from("assignments")
        .select("*")
        .eq("ticket_id", ticketId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`[DB] Failed to get ticket assignment:`, error);
      throw error;
    }
  }

  // Audit logging
  async logAction(action, actorDiscordId, targetType, targetId, details = {}) {
    try {
      const { data, error } = await this.supabase
        .from("audit_logs")
        .insert({
          action,
          actor_discord_id: actorDiscordId,
          target_type: targetType,
          target_id: targetId,
          details
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error(`[DB] Failed to log action:`, error);
      // Don't throw - audit logging shouldn't break main functionality
    }
  }

  // Health check
  async healthCheck() {
    if (!this.supabase) {
      return { healthy: false, error: "Supabase client not initialized" };
    }
    
    try {
      const { data, error } = await this.supabase
        .from("users")
        .select("count")
        .limit(1);

      if (error) throw error;
      return { healthy: true, timestamp: new Date().toISOString() };
    } catch (error) {
      logger.error("[DB] Health check failed:", error);
      return { healthy: false, error: error.message };
    }
  }
}

// Singleton instance
let dbInstance = null;

function getDatabase() {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
  }
  return dbInstance;
}

module.exports = { DatabaseService, getDatabase };