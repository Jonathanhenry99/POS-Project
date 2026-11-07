-- HPP perkiraan untuk transaksi hasil impor ESB. Transaksi ESB tidak memotong stok (bahannya sudah terpakai sebelum
-- Mourden dipakai), jadi HPP-nya tidak tercatat lewat stock_movements. Nilainya dihitung dari resep menu yang
-- dicocokkan x harga bahan, dan bisa dihitung ulang owner setelah resep/harga bahan dilengkapi.
alter table orders add column if not exists cogs_estimate numeric(14, 2);

update orders o set cogs_estimate = coalesce((
  select sum(ri.qty * oi.qty * i.cost_per_unit)
  from order_items oi
  join recipe_items ri on ri.product_id = oi.product_id
    and (ri.option_id is null or exists (select 1 from jsonb_array_elements(oi.options) e where e->>'optionId' = ri.option_id::text))
  join ingredients i on i.id = ri.ingredient_id
  where oi.order_id = o.id
), 0)
where o.source = 'esb' and o.cogs_estimate is null;
