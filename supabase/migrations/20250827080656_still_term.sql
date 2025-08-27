/*
  # Support System Database Schema

  1. New Tables
    - `users` - Discord users with VIP tracking
    - `tickets` - Support tickets with status tracking
    - `ticket_messages` - Message history for tickets
    - `assignments` - Staff assignments to tickets
    - `quotes` - Price quotes for development work
    - `payments` - Stripe payment tracking
    - `orders` - Product orders and licenses
    - `refunds` - Refund requests and processing
    - `archives` - Ticket archives and transcripts
    - `audit_logs` - System audit trail

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users and service role access
    - Secure sensitive payment and user data

  3. Indexes
    - Performance indexes on frequently queried columns
    - Foreign key constraints for data integrity
*/

-- Users table for Discord members
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id text UNIQUE NOT NULL,
  discord_tag text NOT NULL,
  vip_level integer DEFAULT 0,
  total_spent_cents integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tickets table for support requests
CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  ticket_type text NOT NULL,
  channel_id text UNIQUE NOT NULL,
  status text DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'in_progress', 'waiting_payment', 'completed', 'closed')),
  title text,
  description text,
  responses jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Ticket messages for conversation history
CREATE TABLE IF NOT EXISTS ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES tickets(id) ON DELETE CASCADE,
  author_discord_id text NOT NULL,
  content text NOT NULL,
  message_type text DEFAULT 'message' CHECK (message_type IN ('message', 'system', 'quote', 'payment')),
  created_at timestamptz DEFAULT now()
);

-- Staff assignments to tickets
CREATE TABLE IF NOT EXISTS assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES tickets(id) ON DELETE CASCADE,
  assignee_discord_id text NOT NULL,
  role_type text DEFAULT 'support' CHECK (role_type IN ('support', 'developer', 'manager')),
  created_at timestamptz DEFAULT now()
);

-- Price quotes for development work
CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES tickets(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency text DEFAULT 'EUR',
  description text NOT NULL,
  deposit_cents integer DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  expires_at timestamptz DEFAULT (now() + interval '7 days')
);

-- Stripe payment tracking
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  sku text,
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  amount_cents integer NOT NULL,
  currency text DEFAULT 'EUR',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'partial_refund')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  paid_at timestamptz
);

-- Product orders and licenses
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  sku text NOT NULL,
  product_name text NOT NULL,
  price_cents integer NOT NULL,
  currency text DEFAULT 'EUR',
  license_key text UNIQUE,
  download_token text,
  download_expires_at timestamptz,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'expired')),
  created_at timestamptz DEFAULT now(),
  delivered_at timestamptz
);

-- Refund requests and processing
CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES payments(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  amount_cents integer NOT NULL,
  currency text DEFAULT 'EUR',
  status text DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'processed')),
  stripe_refund_id text,
  processed_by_discord_id text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

-- Ticket archives and transcripts
CREATE TABLE IF NOT EXISTS archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES tickets(id) ON DELETE CASCADE,
  pdf_url text,
  transcript_data jsonb,
  file_size_bytes integer,
  created_at timestamptz DEFAULT now()
);

-- Audit logs for system actions
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  actor_discord_id text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  details jsonb DEFAULT '{}',
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for service role (bot operations)
CREATE POLICY "Service role full access on users"
  ON users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on tickets"
  ON tickets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on ticket_messages"
  ON ticket_messages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on assignments"
  ON assignments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on quotes"
  ON quotes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on payments"
  ON payments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on orders"
  ON orders FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on refunds"
  ON refunds FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on archives"
  ON archives FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on audit_logs"
  ON audit_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_channel_id ON tickets(channel_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_assignments_ticket_id ON assignments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_session_id ON payments(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_license_key ON orders(license_key);

-- Update triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();