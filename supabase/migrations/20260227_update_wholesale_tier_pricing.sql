-- Update wholesale pricing tiers to new price points
-- Standard: 10+ units, cost + $20
-- Growth:   50+ units, cost + $15
-- Preferred: 100+ units, cost + $12.50 (NEW)
-- Volume:   200+ units, cost + $10

update wholesale_pricing_tiers
set min_monthly_units = 10, markup_amount = 20
where name = 'Standard';

update wholesale_pricing_tiers
set min_monthly_units = 50, markup_amount = 15
where name = 'Growth';

update wholesale_pricing_tiers
set min_monthly_units = 200, markup_amount = 10, sort_order = 4
where name = 'Volume';

-- Add 100-unit tier
insert into wholesale_pricing_tiers (name, min_monthly_units, markup_amount, discount_pct, sort_order, active)
values ('Preferred', 100, 12.50, 0, 3, true);
