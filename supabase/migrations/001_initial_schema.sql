-- ============================================================
--  MithaiBook — Full Supabase SQL Migration
--  Run this entire file in:
--  Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- SECTION 1: TABLES
-- ────────────────────────────────────────────────────────────

-- 1. shops
--    One row per shop owner. shop_id = auth.uid() of the owner.
CREATE TABLE IF NOT EXISTS shops (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      UUID NOT NULL UNIQUE,          -- = auth.uid() of the owner
  shop_name    TEXT NOT NULL,
  owner_name   TEXT NOT NULL,
  city         TEXT NOT NULL,
  setup_done   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. counter_items  (Finished Goods on counter)
CREATE TABLE IF NOT EXISTS counter_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           UUID NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  price_per_kg      NUMERIC(10, 2) NOT NULL,
  shelf_life_days   INTEGER NOT NULL DEFAULT 3,
  current_stock_kg  NUMERIC(10, 3) NOT NULL DEFAULT 0,
  expiry_date       DATE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT counter_items_stock_non_negative CHECK (current_stock_kg >= 0),
  CONSTRAINT counter_items_price_positive     CHECK (price_per_kg > 0)
);

-- 3. sales  (Transaction headers)
CREATE TABLE IF NOT EXISTS sales (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
  total_amount  NUMERIC(12, 2) NOT NULL,
  payment_mode  TEXT NOT NULL CHECK (payment_mode IN ('Cash', 'UPI', 'Card')),
  note          TEXT,
  created_by    UUID REFERENCES auth.users(id),
  sale_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. sale_items  (Line items per bill)
CREATE TABLE IF NOT EXISTS sale_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          UUID NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
  sale_id          UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  counter_item_id  UUID NOT NULL REFERENCES counter_items(id),
  item_name        TEXT NOT NULL,
  price_per_kg     NUMERIC(10, 2) NOT NULL,
  qty_kg           NUMERIC(10, 3) NOT NULL,
  line_total       NUMERIC(12, 2) NOT NULL,

  CONSTRAINT sale_items_qty_positive CHECK (qty_kg > 0)
);

-- 5. raw_materials  (Phase 2 — created now, used later)
CREATE TABLE IF NOT EXISTS raw_materials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  unit            TEXT NOT NULL,
  current_stock   NUMERIC(12, 3) NOT NULL DEFAULT 0,
  min_threshold   NUMERIC(12, 3) NOT NULL DEFAULT 0,
  supplier_name   TEXT,
  supplier_phone  TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT raw_materials_stock_non_negative CHECK (current_stock >= 0),
  CONSTRAINT raw_materials_threshold_positive CHECK (min_threshold >= 0)
);

-- 6. production_batches  (Phase 2)
CREATE TABLE IF NOT EXISTS production_batches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          UUID NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
  counter_item_id  UUID NOT NULL REFERENCES counter_items(id),
  item_name        TEXT NOT NULL,
  qty_kg           NUMERIC(10, 3) NOT NULL,
  status           TEXT NOT NULL DEFAULT 'in_progress'
                   CHECK (status IN ('in_progress', 'done', 'cancelled')),
  expiry_date      DATE,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,

  CONSTRAINT batch_qty_positive CHECK (qty_kg > 0)
);

-- 7. advance_orders  (Phase 3)
CREATE TABLE IF NOT EXISTS advance_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT NOT NULL,
  pickup_date     DATE NOT NULL,
  total_amount    NUMERIC(12, 2) NOT NULL,
  advance_paid    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  balance_amount  NUMERIC(12, 2) GENERATED ALWAYS AS (total_amount - advance_paid) STORED,
  status          TEXT NOT NULL DEFAULT 'Pending'
                  CHECK (status IN ('Pending', 'In Kitchen', 'Ready', 'Delivered')),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. advance_order_items  (Phase 3)
CREATE TABLE IF NOT EXISTS advance_order_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          UUID NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
  order_id         UUID NOT NULL REFERENCES advance_orders(id) ON DELETE CASCADE,
  counter_item_id  UUID NOT NULL REFERENCES counter_items(id),
  item_name        TEXT NOT NULL,
  price_per_kg     NUMERIC(10, 2) NOT NULL,
  qty_kg           NUMERIC(10, 3) NOT NULL,
  line_total       NUMERIC(12, 2) NOT NULL
);

-- 9. daily_reconciliations  (Phase 3)
CREATE TABLE IF NOT EXISTS daily_reconciliations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id        UUID NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
  recon_date     DATE NOT NULL,
  system_cash    NUMERIC(12, 2) NOT NULL,
  actual_cash    NUMERIC(12, 2) NOT NULL,
  difference     NUMERIC(12, 2) GENERATED ALWAYS AS (actual_cash - system_cash) STORED,
  total_upi      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_card     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_revenue  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (shop_id, recon_date)
);


-- ────────────────────────────────────────────────────────────
-- SECTION 2: ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

ALTER TABLE shops                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE counter_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_materials          ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_batches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE advance_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE advance_order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reconciliations  ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running (idempotent)
DROP POLICY IF EXISTS "owner_all_shops"                  ON shops;
DROP POLICY IF EXISTS "owner_all_counter_items"          ON counter_items;
DROP POLICY IF EXISTS "owner_all_sales"                  ON sales;
DROP POLICY IF EXISTS "owner_all_sale_items"             ON sale_items;
DROP POLICY IF EXISTS "owner_all_raw_materials"          ON raw_materials;
DROP POLICY IF EXISTS "owner_all_production_batches"     ON production_batches;
DROP POLICY IF EXISTS "owner_all_advance_orders"         ON advance_orders;
DROP POLICY IF EXISTS "owner_all_advance_order_items"    ON advance_order_items;
DROP POLICY IF EXISTS "owner_all_daily_reconciliations"  ON daily_reconciliations;

-- shops: owner sees/modifies only their own shop
CREATE POLICY "owner_all_shops"
  ON shops FOR ALL
  USING  (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

-- counter_items
CREATE POLICY "owner_all_counter_items"
  ON counter_items FOR ALL
  USING  (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

-- sales
CREATE POLICY "owner_all_sales"
  ON sales FOR ALL
  USING  (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

-- sale_items
CREATE POLICY "owner_all_sale_items"
  ON sale_items FOR ALL
  USING  (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

-- raw_materials
CREATE POLICY "owner_all_raw_materials"
  ON raw_materials FOR ALL
  USING  (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

-- production_batches
CREATE POLICY "owner_all_production_batches"
  ON production_batches FOR ALL
  USING  (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

-- advance_orders
CREATE POLICY "owner_all_advance_orders"
  ON advance_orders FOR ALL
  USING  (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

-- advance_order_items
CREATE POLICY "owner_all_advance_order_items"
  ON advance_order_items FOR ALL
  USING  (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

-- daily_reconciliations
CREATE POLICY "owner_all_daily_reconciliations"
  ON daily_reconciliations FOR ALL
  USING  (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());


-- ────────────────────────────────────────────────────────────
-- SECTION 3: INDEXES
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_counter_items_shop       ON counter_items(shop_id);
CREATE INDEX IF NOT EXISTS idx_counter_items_active     ON counter_items(shop_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sales_shop               ON sales(shop_id);
CREATE INDEX IF NOT EXISTS idx_sales_date               ON sales(shop_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale          ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_shop          ON sale_items(shop_id);
CREATE INDEX IF NOT EXISTS idx_raw_materials_shop       ON raw_materials(shop_id);
CREATE INDEX IF NOT EXISTS idx_production_shop          ON production_batches(shop_id);
CREATE INDEX IF NOT EXISTS idx_advance_orders_shop      ON advance_orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_advance_orders_pickup    ON advance_orders(shop_id, pickup_date);


-- ────────────────────────────────────────────────────────────
-- SECTION 4: record_sale() POSTGRES FUNCTION
--
--  Atomically:
--    1. Inserts a sales row
--    2. Inserts sale_items rows
--    3. Deducts stock from counter_items
--    4. Rolls back entirely if stock goes negative
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_sale(
  p_shop_id       UUID,
  p_payment_mode  TEXT,
  p_note          TEXT,
  p_created_by    UUID,
  p_items         JSONB
  -- p_items shape: [
  --   {
  --     "counter_item_id": "uuid",
  --     "item_name":       "Kaju Katli",
  --     "price_per_kg":    1200,
  --     "qty_kg":          0.5,
  --     "line_total":      600
  --   }, ...
  -- ]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale_id   UUID;
  v_total     NUMERIC(12, 2) := 0;
  v_item      JSONB;
  v_new_stock NUMERIC(10, 3);
BEGIN
  -- Security: caller must be the shop owner
  IF p_shop_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: shop_id does not match authenticated user';
  END IF;

  -- Validate payment mode
  IF p_payment_mode NOT IN ('Cash', 'UPI', 'Card') THEN
    RAISE EXCEPTION 'Invalid payment mode: %', p_payment_mode;
  END IF;

  -- Sum up total from items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_total := v_total + (v_item->>'line_total')::NUMERIC;
  END LOOP;

  -- Insert sale header
  INSERT INTO sales (shop_id, total_amount, payment_mode, note, created_by, sale_date)
  VALUES (p_shop_id, v_total, p_payment_mode, p_note, p_created_by, NOW())
  RETURNING id INTO v_sale_id;

  -- Insert each line item and deduct stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Insert sale_item
    INSERT INTO sale_items (
      shop_id, sale_id, counter_item_id,
      item_name, price_per_kg, qty_kg, line_total
    ) VALUES (
      p_shop_id,
      v_sale_id,
      (v_item->>'counter_item_id')::UUID,
      v_item->>'item_name',
      (v_item->>'price_per_kg')::NUMERIC,
      (v_item->>'qty_kg')::NUMERIC,
      (v_item->>'line_total')::NUMERIC
    );

    -- Deduct stock atomically
    UPDATE counter_items
    SET    current_stock_kg = current_stock_kg - (v_item->>'qty_kg')::NUMERIC
    WHERE  id      = (v_item->>'counter_item_id')::UUID
      AND  shop_id = p_shop_id
    RETURNING current_stock_kg INTO v_new_stock;

    -- Guard against negative stock — rolls back entire transaction
    IF v_new_stock IS NULL THEN
      RAISE EXCEPTION 'Item not found: %', v_item->>'item_name';
    END IF;

    IF v_new_stock < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for "%". Available: %.3f kg',
        v_item->>'item_name',
        v_new_stock + (v_item->>'qty_kg')::NUMERIC;
    END IF;
  END LOOP;

  RETURN v_sale_id;
END;
$$;

-- Grant execute to authenticated users (RLS inside function handles auth)
GRANT EXECUTE ON FUNCTION record_sale(UUID, TEXT, TEXT, UUID, JSONB)
  TO authenticated;


-- ────────────────────────────────────────────────────────────
-- SECTION 5: REALTIME
--
--  Run these to enable Realtime change tracking.
--  REPLICA IDENTITY FULL ensures UPDATE and DELETE events
--  include the old row data (needed to track what changed).
-- ────────────────────────────────────────────────────────────

ALTER TABLE counter_items  REPLICA IDENTITY FULL;
ALTER TABLE sales           REPLICA IDENTITY FULL;
ALTER TABLE raw_materials   REPLICA IDENTITY FULL;

-- Then in Supabase Dashboard:
--   Database → Replication → supabase_realtime publication
--   → Add tables: counter_items, sales, raw_materials
--
-- OR run this SQL (safe to run even if already added):
DO $$
BEGIN
  -- Add counter_items to realtime publication
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE counter_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Add sales to realtime publication
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE sales;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Add raw_materials to realtime publication
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE raw_materials;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ────────────────────────────────────────────────────────────
-- DONE — All tables, RLS, indexes, function, and Realtime
--        are now configured.
-- ────────────────────────────────────────────────────────────
