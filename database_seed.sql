-- ============================================================
-- Restaurant Kiosk System - Seed Data
-- Run AFTER database_schema.sql
-- ============================================================

-- System Settings
INSERT INTO public.system_settings (id, setting_key, setting_value, setting_type, description) VALUES
  ('7ad07e3e-9c2b-4eae-9b29-f80f7d019f78', 'currency', '{"code":"MVR","name":"Maldivian Rufiyaa","symbol":"MVR","decimal_places":2,"symbol_position":"before","decimal_separator":".","thousand_separator":","}'::jsonb, 'currency', 'Default currency for the restaurant'),
  ('8f7722f4-4941-4ab0-a9ac-348fb11d0cf8', 'service_charge', '{"name":"Service Charge","rate":0,"enabled":false}'::jsonb, 'financial', 'Service charge configuration'),
  ('1bbabff1-1746-45d8-a4f4-d95dd0fbcabc', 'tax_rate', 8, 'number', 'Sales tax rate percentage')
ON CONFLICT (id) DO NOTHING;

-- User Roles
INSERT INTO public.user_roles (id, name, display_name, description, permissions, is_active) VALUES
  ('2c85a0bc-181f-4730-bb22-f1af6313e952', 'admin', 'Administrator', 'Full system access including user management, settings, and all features', '{"dashboard":true,"users":{"view":true,"create":true,"edit":true,"delete":true,"assign_roles":true},"orders":{"view":true,"create":true,"edit":true,"delete":true},"products":{"view":true,"create":true,"edit":true,"delete":true},"categories":{"view":true,"create":true,"edit":true,"delete":true},"payments":{"view":true,"process":true,"refund":true},"reports":{"view":true,"export":true},"settings":{"view":true,"edit":true},"kitchen":{"view":true,"update_status":true},"pos_access":true}'::jsonb, true),
  ('afc9a1ae-ea36-4bd9-a737-b59949b3856f', 'cashier', 'Cashier', 'Process payments and manage customer orders', '{"orders":{"view":true,"create":true,"edit":true},"payments":{"view":true,"process":true},"reports":{"view":true},"products":{"view":true},"pos_access":true}'::jsonb, true),
  ('0264dcc3-d6a8-4681-9247-9c2368d171ae', 'kitchen_staff', 'Kitchen Staff', 'Access to kitchen display and order preparation', '{"orders":{"view":true},"kitchen":{"view":true,"update_status":true}}'::jsonb, true),
  ('cb093517-b441-4f5f-a03a-066fe49cf47b', 'waiter', 'Waiter/Server', 'Take and manage customer orders', '{"orders":{"view":true,"create":true,"edit":true},"kitchen":{"view":true},"products":{"view":true}}'::jsonb, true)
ON CONFLICT (id) DO NOTHING;

-- Payment Gateway (BML QPOS)
INSERT INTO public.payment_gateways (id, name, gateway_type, is_active, is_default, config, display_order, qr_timeout, supports_qr) VALUES
  ('31086cf3-aaf8-4483-b45d-c417cd5f3868', 'BML QPOS', 'bml', true, true, '{"currency":"MVR","access_key":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHBJZCI6IjRiNjY5NmUyLTgyNmYtNDUzYy1hMjQzLTQ4YzVmNGYzZDJiNyIsImNvbXBhbnlJZCI6bnVsbCwiaWF0IjoxNjY4MzgxMDExLCJleHAiOjQ4MjQwNTQ2MTF9.cpDfxcTZV7bUm7vm31wD_9tkc6bDZUUqfm2hro6Eb6M","environment":"production","merchant_id":"4b6696e2-826f-453c-a243-48c5f4f3d2b7"}'::jsonb, 1, 300, true)
ON CONFLICT (id) DO NOTHING;

-- UltimatePOS Config (Cafe Oceanic - mudhaamv.com)
INSERT INTO public.ultimatepos_config (id, api_url, client_id, client_secret, username, password, personal_access_token, auth_mode, business_id, location_id, is_active, auto_sync_products, auto_sync_customers, auto_push_sales, connection_status, sync_order_location_id, direct_server_ip) VALUES
  ('a9dd56b8-3e9a-4f87-9cc3-eeae2db28dca', 'https://mudhaamv.com/public', '8', 'eUMFUTdGh34Ryh3uInWkWYgTLzNe23zg8AzKWLS3', 'cafeoceanic', 'P@$$1985', 'eUMFUTdGh34Ryh3uInWkWYgTLzNe23zg8AzKWLS3', 'oauth', 1, 2, true, true, true, true, 'connected', 2, '50.6.156.135')
ON CONFLICT (id) DO NOTHING;
