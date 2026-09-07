-- Demo/dev seed data. Applied automatically by `supabase db reset`.
-- Not idempotent by design (relies on unique constraints) — run against a
-- freshly reset database, not repeatedly against one already seeded.
--
-- Creates one demo organization, five demo users (one per role, password
-- "DemoPass123!" for all), ~120 customers, 500+ transactions, 55+ alerts
-- across the full investigation lifecycle, and 20+ cases. Five customers are
-- hand-built to walk through the required demo scenarios end-to-end:
--   1. High transaction velocity
--   2. New device + large transfer
--   3. Multi-country anomaly
--   4. Structuring behavior
--   5. False positive (AI recommended escalation, analyst cleared it)
--
-- No scenario here reaches a RESOLVED/CLOSED case via anything other than an
-- explicit analyst_decisions row, matching the Critical Rule in CLAUDE.md:
-- the system recommends, a human decides.

do $$
declare
  v_org_id uuid;
  v_admin_id uuid := gen_random_uuid();
  v_compliance_id uuid := gen_random_uuid();
  v_analyst1_id uuid := gen_random_uuid();
  v_analyst2_id uuid := gen_random_uuid();
  v_viewer_id uuid := gen_random_uuid();
  v_analyst_ids uuid[];

  v_customer_ids uuid[] := '{}';
  v_customer_id uuid;
  v_cust_velocity uuid;
  v_cust_newdevice uuid;
  v_cust_multicountry uuid;
  v_cust_structuring uuid;
  v_cust_falsepositive uuid;

  v_txn_id uuid;
  v_txn_row record;
  v_alert_id uuid;
  v_rec_id uuid;
  v_case_id uuid;

  v_first_names text[] := array['James','Mary','Robert','Patricia','John','Jennifer','Michael','Linda','David','Elizabeth','William','Barbara','Richard','Susan','Joseph','Jessica','Thomas','Sarah','Charles','Karen'];
  v_last_names text[] := array['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Fisher','Taylor','Moore','Jackson','Martin'];
  v_countries text[] := array['US','GB','DE','FR','SG','AE','CA','NG','CN','BR'];
  v_channels text[] := array['WIRE','ACH','CARD','MOBILE','CRYPTO'];
  v_alert_types alert_type[] := array['AMOUNT_ANOMALY','VELOCITY_ANOMALY','NEW_BENEFICIARY','NEW_DEVICE','LOCATION_ANOMALY','COUNTRY_RISK','STRUCTURING','BEHAVIORAL_ANOMALY']::alert_type[];
  v_severities alert_severity[] := array['LOW','MEDIUM','HIGH','CRITICAL']::alert_severity[];
  v_priorities case_priority[] := array['LOW','MEDIUM','HIGH','URGENT']::case_priority[];
  v_states investigation_state[] := array['ANALYZING','EVIDENCE_COLLECTED','AI_INVESTIGATING','RECOMMENDATION_READY','HUMAN_REVIEW','RESOLVED']::investigation_state[];
  v_dispositions recommendation_disposition[] := array['ESCALATE','CLEAR','REFER']::recommendation_disposition[];
  v_case_dispositions case_disposition[] := array['CONFIRMED_FRAUD','FALSE_POSITIVE','CLEARED','INSUFFICIENT_EVIDENCE']::case_disposition[];

  v_state investigation_state;
  v_txn_count int;
  i int;
  j int;
begin
  ----------------------------------------------------------------------------
  -- Organization
  ----------------------------------------------------------------------------
  insert into public.organizations (name, slug)
  values ('Northwind Bank (Demo)', 'northwind-bank')
  returning id into v_org_id;

  insert into public.organization_settings (organization_id, risk_thresholds)
  values (v_org_id, jsonb_build_object('escalate_above', 0.75, 'review_above', 0.4));

  ----------------------------------------------------------------------------
  -- Demo users. Inserting into auth.users fires handle_new_user(), which
  -- creates the matching public.profiles row from raw_user_meta_data.
  ----------------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values
    ('00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated', 'authenticated',
     'admin@demo.amlfraud.dev', crypt('DemoPass123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('organization_id', v_org_id, 'role', 'ADMIN', 'full_name', 'Amara Chen'),
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_compliance_id, 'authenticated', 'authenticated',
     'compliance@demo.amlfraud.dev', crypt('DemoPass123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('organization_id', v_org_id, 'role', 'COMPLIANCE_MANAGER', 'full_name', 'Diego Alvarez'),
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_analyst1_id, 'authenticated', 'authenticated',
     'analyst1@demo.amlfraud.dev', crypt('DemoPass123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('organization_id', v_org_id, 'role', 'ANALYST', 'full_name', 'Priya Natarajan'),
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_analyst2_id, 'authenticated', 'authenticated',
     'analyst2@demo.amlfraud.dev', crypt('DemoPass123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('organization_id', v_org_id, 'role', 'ANALYST', 'full_name', 'Marcus Webb'),
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_viewer_id, 'authenticated', 'authenticated',
     'viewer@demo.amlfraud.dev', crypt('DemoPass123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('organization_id', v_org_id, 'role', 'VIEWER', 'full_name', 'Investor Guest'),
     now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', u.id::text, now(), now(), now()
  from auth.users u
  where u.id in (v_admin_id, v_compliance_id, v_analyst1_id, v_analyst2_id, v_viewer_id);

  v_analyst_ids := array[v_analyst1_id, v_analyst2_id];

  ----------------------------------------------------------------------------
  -- Scenario 1: High transaction velocity
  ----------------------------------------------------------------------------
  insert into public.customers (organization_id, external_customer_id, full_name, email, country_code, risk_rating, kyc_status, account_opened_at)
  values (v_org_id, 'CUST-SCN-001', 'Elena Volkov', 'elena.volkov@example-demo.test', 'US', 'MEDIUM', 'VERIFIED', now() - interval '400 days')
  returning id into v_cust_velocity;

  insert into public.customer_profiles (organization_id, customer_id, occupation, expected_monthly_volume, average_transaction_amount, typical_countries)
  values (v_org_id, v_cust_velocity, 'Freelance Consultant', 6000, 350, array['US']);

  for j in 1..8 loop
    insert into public.transactions (organization_id, customer_id, direction, amount, currency, channel, status, origin_country, destination_country, transaction_at)
    values (v_org_id, v_cust_velocity, 'OUTBOUND', 900 + (j * 137), 'USD', 'MOBILE', 'COMPLETED', 'US', 'US', now() - interval '1 hour' * (8 - j))
    returning id into v_txn_id;
  end loop;

  insert into public.alerts (organization_id, customer_id, transaction_id, alert_type, severity, status, source, triggered_rules, risk_score, ml_score, assigned_analyst_id, opened_at)
  values (v_org_id, v_cust_velocity, v_txn_id, 'VELOCITY_ANOMALY', 'HIGH', 'HUMAN_REVIEW', 'RULE_ENGINE',
    jsonb_build_array('RULE_VELOCITY_8_IN_2H'), 0.8100, 0.7400, v_analyst1_id, now() - interval '1 hour')
  returning id into v_alert_id;

  insert into public.risk_signals (organization_id, customer_id, transaction_id, alert_id, signal_type, weight, description)
  values (v_org_id, v_cust_velocity, v_txn_id, v_alert_id, 'VELOCITY_ANOMALY', 0.8000, '8 outbound transactions within 2 hours, 6x the customer baseline of 350/day');

  insert into public.ml_predictions (organization_id, customer_id, transaction_id, alert_id, provider, model_name, prediction, score, confidence)
  values (v_org_id, v_cust_velocity, v_txn_id, v_alert_id, 'internal', 'isolation-forest-v1', 'FRAUD_LIKELY', 0.7400, 0.6600);

  insert into public.ai_recommendations (organization_id, alert_id, disposition, confidence, risk_level, rationale, red_flags, supporting_evidence, contradictory_evidence, recommended_next_steps, provider, model_name)
  values (v_org_id, v_alert_id, 'ESCALATE', 0.7200, 'HIGH',
    'Eight rapid-fire outbound mobile transfers in two hours are far outside this customer''s established pattern of infrequent, low-value transfers.',
    jsonb_build_array('Velocity 6x baseline', 'All transfers to previously unseen accounts'),
    jsonb_build_array('8 transactions between 21:00-23:00 totaling $8,652'),
    jsonb_build_array('No account takeover indicators (same device, same IP range)'),
    jsonb_build_array('Contact customer to confirm authorization', 'Temporarily hold further outbound transfers pending confirmation'),
    'anthropic', 'claude-investigation-demo');

  -- Left in HUMAN_REVIEW: this alert is still open, awaiting the analyst's call.
  insert into public.cases (organization_id, alert_id, customer_id, assigned_analyst_id, status, priority, opened_at)
  values (v_org_id, v_alert_id, v_cust_velocity, v_analyst1_id, 'IN_PROGRESS', 'HIGH', now() - interval '1 hour')
  returning id into v_case_id;

  insert into public.case_events (organization_id, case_id, event_type, actor_id, actor_role, description)
  values (v_org_id, v_case_id, 'case_created', v_analyst1_id, 'ANALYST', 'Case opened from velocity anomaly alert; awaiting customer contact.');

  ----------------------------------------------------------------------------
  -- Scenario 2: New device + large transfer (confirmed fraud)
  ----------------------------------------------------------------------------
  insert into public.customers (organization_id, external_customer_id, full_name, email, country_code, risk_rating, kyc_status, account_opened_at)
  values (v_org_id, 'CUST-SCN-002', 'Tomas Reyes', 'tomas.reyes@example-demo.test', 'US', 'LOW', 'VERIFIED', now() - interval '900 days')
  returning id into v_cust_newdevice;

  insert into public.customer_profiles (organization_id, customer_id, occupation, expected_monthly_volume, average_transaction_amount, typical_countries)
  values (v_org_id, v_cust_newdevice, 'Retail Manager', 4000, 250, array['US']);

  insert into public.transactions (organization_id, customer_id, direction, amount, currency, channel, status, origin_country, destination_country, device_id, device_is_new, transaction_at)
  values (v_org_id, v_cust_newdevice, 'OUTBOUND', 250, 'USD', 'MOBILE', 'COMPLETED', 'US', 'US', 'device-known-a1', false, now() - interval '20 days');

  insert into public.transactions (organization_id, customer_id, direction, amount, currency, channel, status, counterparty_name, counterparty_country, origin_country, destination_country, device_id, device_is_new, transaction_at)
  values (v_org_id, v_cust_newdevice, 'OUTBOUND', 45000, 'USD', 'WIRE', 'FLAGGED', 'Unverified Holdings Ltd', 'NG', 'US', 'NG', 'device-unknown-x9', true, now() - interval '3 days')
  returning id into v_txn_id;

  insert into public.alerts (organization_id, customer_id, transaction_id, alert_type, severity, status, source, triggered_rules, risk_score, ml_score, assigned_analyst_id, opened_at, resolved_at)
  values (v_org_id, v_cust_newdevice, v_txn_id, 'NEW_DEVICE', 'CRITICAL', 'RESOLVED', 'RULE_ENGINE',
    jsonb_build_array('RULE_NEW_DEVICE_LARGE_TRANSFER', 'RULE_HIGH_RISK_DESTINATION'), 0.9300, 0.9100, v_analyst2_id, now() - interval '3 days', now() - interval '1 day')
  returning id into v_alert_id;

  insert into public.risk_signals (organization_id, customer_id, transaction_id, alert_id, signal_type, weight, description) values
    (v_org_id, v_cust_newdevice, v_txn_id, v_alert_id, 'NEW_DEVICE', 0.8500, 'Transaction initiated from a device never seen on this account'),
    (v_org_id, v_cust_newdevice, v_txn_id, v_alert_id, 'AMOUNT_ANOMALY', 0.9000, 'Amount is 180x the customer''s average transaction value'),
    (v_org_id, v_cust_newdevice, v_txn_id, v_alert_id, 'COUNTRY_RISK', 0.7500, 'Destination country flagged as elevated-risk corridor');

  insert into public.ml_predictions (organization_id, customer_id, transaction_id, alert_id, provider, model_name, prediction, score, confidence)
  values (v_org_id, v_cust_newdevice, v_txn_id, v_alert_id, 'internal', 'xgboost-fraud-v1', 'FRAUD_LIKELY', 0.9100, 0.8800);

  insert into public.ai_recommendations (organization_id, alert_id, disposition, confidence, risk_level, rationale, red_flags, supporting_evidence, contradictory_evidence, recommended_next_steps, provider, model_name)
  values (v_org_id, v_alert_id, 'ESCALATE', 0.9000, 'CRITICAL',
    'A $45,000 wire to an unverified counterparty in an elevated-risk corridor, initiated from a brand-new device, is highly inconsistent with this customer''s decade-long low-value transaction history.',
    jsonb_build_array('New device', 'Amount 180x baseline', 'High-risk destination country', 'Unverified counterparty'),
    jsonb_build_array('Device fingerprint device-unknown-x9 first seen at transaction time', 'Counterparty has no prior transaction history with customer'),
    jsonb_build_array(),
    jsonb_build_array('Freeze outbound transfers pending verification', 'Contact customer via verified phone number on file'),
    'anthropic', 'claude-investigation-demo')
  returning id into v_rec_id;

  insert into public.analyst_decisions (organization_id, alert_id, ai_recommendation_id, analyst_id, decision, agreed_with_ai, notes, decided_at)
  values (v_org_id, v_alert_id, v_rec_id, v_analyst2_id, 'ESCALATE', true, 'Customer confirmed by phone they did not initiate this transfer. Account compromise suspected.', now() - interval '1 day');

  insert into public.cases (organization_id, alert_id, customer_id, assigned_analyst_id, status, priority, disposition, resolution_reason, opened_at, resolved_at)
  values (v_org_id, v_alert_id, v_cust_newdevice, v_analyst2_id, 'RESOLVED', 'URGENT', 'CONFIRMED_FRAUD',
    'Customer confirmed non-authorization; consistent with account takeover. Escalated to fraud operations for reversal and customer account lockdown.',
    now() - interval '3 days', now() - interval '1 day')
  returning id into v_case_id;

  insert into public.case_events (organization_id, case_id, event_type, actor_id, actor_role, description, occurred_at) values
    (v_org_id, v_case_id, 'case_created', v_analyst2_id, 'ANALYST', 'Case opened from critical new-device alert.', now() - interval '3 days'),
    (v_org_id, v_case_id, 'case_resolved', v_analyst2_id, 'ANALYST', 'Confirmed fraud after customer contact; escalated externally to fraud operations.', now() - interval '1 day');

  ----------------------------------------------------------------------------
  -- Scenario 3: Multi-country anomaly
  ----------------------------------------------------------------------------
  insert into public.customers (organization_id, external_customer_id, full_name, email, country_code, risk_rating, kyc_status, account_opened_at)
  values (v_org_id, 'CUST-SCN-003', 'Fatima Al-Sayed', 'fatima.alsayed@example-demo.test', 'AE', 'MEDIUM', 'VERIFIED', now() - interval '600 days')
  returning id into v_cust_multicountry;

  insert into public.customer_profiles (organization_id, customer_id, occupation, expected_monthly_volume, average_transaction_amount, typical_countries)
  values (v_org_id, v_cust_multicountry, 'Import/Export Trader', 15000, 2000, array['AE']);

  insert into public.transactions (organization_id, customer_id, direction, amount, currency, channel, status, origin_country, destination_country, transaction_at) values
    (v_org_id, v_cust_multicountry, 'OUTBOUND', 4200, 'USD', 'WIRE', 'COMPLETED', 'AE', 'SG', now() - interval '6 days'),
    (v_org_id, v_cust_multicountry, 'OUTBOUND', 3800, 'USD', 'WIRE', 'COMPLETED', 'AE', 'CN', now() - interval '5 days'),
    (v_org_id, v_cust_multicountry, 'OUTBOUND', 5100, 'USD', 'WIRE', 'COMPLETED', 'AE', 'BR', now() - interval '4 days'),
    (v_org_id, v_cust_multicountry, 'OUTBOUND', 4700, 'USD', 'WIRE', 'FLAGGED', 'AE', 'NG', now() - interval '2 days');

  select id into v_txn_id from public.transactions
  where customer_id = v_cust_multicountry
  order by transaction_at desc limit 1;

  insert into public.alerts (organization_id, customer_id, transaction_id, related_transaction_ids, alert_type, severity, status, source, triggered_rules, risk_score, ml_score, assigned_analyst_id, opened_at)
  select v_org_id, v_cust_multicountry, v_txn_id, array_agg(t.id), 'LOCATION_ANOMALY', 'HIGH', 'AI_INVESTIGATING', 'RULE_ENGINE',
    jsonb_build_array('RULE_MULTI_COUNTRY_FANOUT'), 0.7000, null, v_analyst1_id, now() - interval '2 days'
  from public.transactions t where t.customer_id = v_cust_multicountry
  returning id into v_alert_id;

  insert into public.risk_signals (organization_id, customer_id, alert_id, signal_type, weight, description)
  values (v_org_id, v_cust_multicountry, v_alert_id, 'LOCATION_ANOMALY', 0.7000, 'Four outbound wires to four different countries within one week, including one elevated-risk corridor');

  ----------------------------------------------------------------------------
  -- Scenario 4: Structuring behavior
  ----------------------------------------------------------------------------
  insert into public.customers (organization_id, external_customer_id, full_name, email, country_code, risk_rating, kyc_status, account_opened_at)
  values (v_org_id, 'CUST-SCN-004', 'Kevin O''Malley', 'kevin.omalley@example-demo.test', 'US', 'HIGH', 'VERIFIED', now() - interval '250 days')
  returning id into v_cust_structuring;

  insert into public.customer_profiles (organization_id, customer_id, occupation, expected_monthly_volume, average_transaction_amount, typical_countries)
  values (v_org_id, v_cust_structuring, 'Business Owner', 20000, 1500, array['US']);

  insert into public.transactions (organization_id, customer_id, direction, amount, currency, channel, status, origin_country, destination_country, transaction_at) values
    (v_org_id, v_cust_structuring, 'INBOUND', 9500, 'USD', 'ACH', 'COMPLETED', 'US', 'US', now() - interval '9 days'),
    (v_org_id, v_cust_structuring, 'INBOUND', 9700, 'USD', 'ACH', 'COMPLETED', 'US', 'US', now() - interval '8 days'),
    (v_org_id, v_cust_structuring, 'INBOUND', 9800, 'USD', 'ACH', 'COMPLETED', 'US', 'US', now() - interval '7 days'),
    (v_org_id, v_cust_structuring, 'INBOUND', 9650, 'USD', 'ACH', 'FLAGGED', 'US', 'US', now() - interval '6 days');

  select id into v_txn_id from public.transactions
  where customer_id = v_cust_structuring
  order by transaction_at desc limit 1;

  insert into public.alerts (organization_id, customer_id, transaction_id, alert_type, severity, status, source, triggered_rules, risk_score, ml_score, assigned_analyst_id, opened_at, resolved_at)
  values (v_org_id, v_cust_structuring, v_txn_id, 'STRUCTURING', 'HIGH', 'RESOLVED', 'RULE_ENGINE',
    jsonb_build_array('RULE_STRUCTURING_UNDER_THRESHOLD'), 0.8600, 0.7900, v_analyst2_id, now() - interval '6 days', now() - interval '2 days')
  returning id into v_alert_id;

  insert into public.risk_signals (organization_id, customer_id, transaction_id, alert_id, signal_type, weight, description)
  values (v_org_id, v_cust_structuring, v_txn_id, v_alert_id, 'STRUCTURING_INDICATOR', 0.8600, 'Four inbound ACH credits within 9 days, each just under the $10,000 CTR threshold');

  insert into public.ml_predictions (organization_id, customer_id, transaction_id, alert_id, provider, model_name, prediction, score, confidence)
  values (v_org_id, v_cust_structuring, v_txn_id, v_alert_id, 'internal', 'xgboost-fraud-v1', 'FRAUD_LIKELY', 0.7900, 0.7000);

  insert into public.ai_recommendations (organization_id, alert_id, disposition, confidence, risk_level, rationale, red_flags, supporting_evidence, contradictory_evidence, recommended_next_steps, provider, model_name)
  values (v_org_id, v_alert_id, 'ESCALATE', 0.8200, 'HIGH',
    'Four inbound credits clustered just under the $10,000 reporting threshold within nine days is a classic structuring pattern.',
    jsonb_build_array('All amounts within $500 of the CTR threshold', 'Consistent same-channel deposits'),
    jsonb_build_array('$9,500, $9,700, $9,800, $9,650 over 9 days'),
    jsonb_build_array('Customer operates a cash-intensive business, which can independently explain frequent deposits'),
    jsonb_build_array('Request documentation of fund source', 'Compliance manager review for potential regulatory filing'),
    'anthropic', 'claude-investigation-demo')
  returning id into v_rec_id;

  insert into public.analyst_decisions (organization_id, alert_id, ai_recommendation_id, analyst_id, decision, agreed_with_ai, notes, decided_at)
  values (v_org_id, v_alert_id, v_rec_id, v_analyst2_id, 'ESCALATE', true,
    'Pattern consistent with structuring. Escalating to compliance for regulatory review; no automatic filing performed by this system.', now() - interval '2 days');

  insert into public.cases (organization_id, alert_id, customer_id, assigned_analyst_id, status, priority, disposition, resolution_reason, opened_at, resolved_at)
  values (v_org_id, v_alert_id, v_cust_structuring, v_analyst2_id, 'RESOLVED', 'HIGH', 'ESCALATED_EXTERNALLY',
    'Escalated to compliance manager for regulatory filing review. Filing decision and submission handled outside this system by a human.',
    now() - interval '6 days', now() - interval '2 days')
  returning id into v_case_id;

  insert into public.case_events (organization_id, case_id, event_type, actor_id, actor_role, description, occurred_at) values
    (v_org_id, v_case_id, 'case_created', v_analyst2_id, 'ANALYST', 'Case opened from structuring alert.', now() - interval '6 days'),
    (v_org_id, v_case_id, 'case_resolved', v_analyst2_id, 'ANALYST', 'Escalated externally to compliance for regulatory review.', now() - interval '2 days');

  ----------------------------------------------------------------------------
  -- Scenario 5: False positive
  ----------------------------------------------------------------------------
  insert into public.customers (organization_id, external_customer_id, full_name, email, country_code, risk_rating, kyc_status, account_opened_at)
  values (v_org_id, 'CUST-SCN-005', 'Grace Whitfield', 'grace.whitfield@example-demo.test', 'GB', 'LOW', 'VERIFIED', now() - interval '1500 days')
  returning id into v_cust_falsepositive;

  insert into public.customer_profiles (organization_id, customer_id, occupation, employer, expected_monthly_volume, average_transaction_amount, typical_countries)
  values (v_org_id, v_cust_falsepositive, 'Software Engineer', 'Globex LLC', 5000, 400, array['GB']);

  insert into public.transactions (organization_id, customer_id, direction, amount, currency, channel, status, origin_country, destination_country, transaction_at) values
    (v_org_id, v_cust_falsepositive, 'INBOUND', 380, 'GBP', 'ACH', 'COMPLETED', 'GB', 'GB', now() - interval '35 days'),
    (v_org_id, v_cust_falsepositive, 'INBOUND', 420, 'GBP', 'ACH', 'COMPLETED', 'GB', 'GB', now() - interval '20 days'),
    (v_org_id, v_cust_falsepositive, 'INBOUND', 12000, 'GBP', 'ACH', 'COMPLETED', 'GB', 'GB', now() - interval '5 days');

  select id into v_txn_id from public.transactions
  where customer_id = v_cust_falsepositive
  order by transaction_at desc limit 1;

  insert into public.alerts (organization_id, customer_id, transaction_id, alert_type, severity, status, source, triggered_rules, risk_score, ml_score, assigned_analyst_id, opened_at, resolved_at)
  values (v_org_id, v_cust_falsepositive, v_txn_id, 'AMOUNT_ANOMALY', 'MEDIUM', 'RESOLVED', 'RULE_ENGINE',
    jsonb_build_array('RULE_AMOUNT_DEVIATION'), 0.5500, 0.6100, v_analyst1_id, now() - interval '5 days', now() - interval '4 days')
  returning id into v_alert_id;

  insert into public.risk_signals (organization_id, customer_id, transaction_id, alert_id, signal_type, weight, description)
  values (v_org_id, v_cust_falsepositive, v_txn_id, v_alert_id, 'AMOUNT_ANOMALY', 0.5500, 'Transaction is 30x the customer''s average, deviating from baseline');

  insert into public.ml_predictions (organization_id, customer_id, transaction_id, alert_id, provider, model_name, prediction, score, confidence)
  values (v_org_id, v_cust_falsepositive, v_txn_id, v_alert_id, 'internal', 'xgboost-fraud-v1', 'FRAUD_POSSIBLE', 0.6100, 0.5000);

  insert into public.ai_recommendations (organization_id, alert_id, disposition, confidence, risk_level, rationale, red_flags, supporting_evidence, contradictory_evidence, recommended_next_steps, provider, model_name)
  values (v_org_id, v_alert_id, 'ESCALATE', 0.5800, 'MEDIUM',
    'Deposit amount is a significant outlier relative to this customer''s transaction history.',
    jsonb_build_array('Amount 30x customer average'),
    jsonb_build_array('Single GBP 12,000 inbound ACH credit'),
    jsonb_build_array('Timing coincides with typical annual bonus payment cycle'),
    jsonb_build_array('Verify source of funds with customer and employer payroll records'),
    'anthropic', 'claude-investigation-demo')
  returning id into v_rec_id;

  insert into public.analyst_decisions (organization_id, alert_id, ai_recommendation_id, analyst_id, decision, agreed_with_ai, override_reason, notes, decided_at)
  values (v_org_id, v_alert_id, v_rec_id, v_analyst1_id, 'CLEAR', false,
    'Confirmed with employer payroll department that this was a scheduled annual bonus payment, consistent with prior year.',
    'AI recommendation was reasonable given the isolated data point, but additional context (payroll confirmation) clears this transaction.',
    now() - interval '4 days');

  insert into public.cases (organization_id, alert_id, customer_id, assigned_analyst_id, status, priority, disposition, resolution_reason, opened_at, resolved_at)
  values (v_org_id, v_alert_id, v_cust_falsepositive, v_analyst1_id, 'CLOSED', 'LOW', 'FALSE_POSITIVE',
    'Verified as legitimate annual bonus payment via employer payroll confirmation. AI escalation recommendation overridden by analyst.',
    now() - interval '5 days', now() - interval '4 days')
  returning id into v_case_id;

  insert into public.case_events (organization_id, case_id, event_type, actor_id, actor_role, description, occurred_at) values
    (v_org_id, v_case_id, 'case_created', v_analyst1_id, 'ANALYST', 'Case opened from amount anomaly alert.', now() - interval '5 days'),
    (v_org_id, v_case_id, 'case_resolved', v_analyst1_id, 'ANALYST', 'Closed as false positive after payroll verification; overrode AI escalation recommendation.', now() - interval '4 days');

  v_customer_ids := array[v_cust_velocity, v_cust_newdevice, v_cust_multicountry, v_cust_structuring, v_cust_falsepositive];

  ----------------------------------------------------------------------------
  -- Bulk customers (115 more, for 120 total) with logically related transactions
  ----------------------------------------------------------------------------
  for i in 1..115 loop
    insert into public.customers (
      organization_id, external_customer_id, full_name, email, phone, date_of_birth,
      country_code, status, risk_rating, kyc_status, account_opened_at
    ) values (
      v_org_id,
      'CUST-' || lpad(i::text, 5, '0'),
      v_first_names[1 + (i % array_length(v_first_names, 1))] || ' ' || v_last_names[1 + ((i * 7) % array_length(v_last_names, 1))],
      'customer' || i || '@example-demo.test',
      '+1555' || lpad((1000000 + i)::text, 7, '0'),
      date '1960-01-01' + ((i * 137) % 16000),
      v_countries[1 + (i % array_length(v_countries, 1))],
      (case when i % 23 = 0 then 'DORMANT' when i % 41 = 0 then 'SUSPENDED' else 'ACTIVE' end)::customer_status,
      (case when i % 17 = 0 then 'HIGH' when i % 11 = 0 then 'MEDIUM' else 'LOW' end)::risk_level,
      (case when i % 13 = 0 then 'PENDING' else 'VERIFIED' end)::kyc_status,
      now() - (i * 11) * interval '1 day'
    )
    returning id into v_customer_id;

    v_customer_ids := array_append(v_customer_ids, v_customer_id);

    insert into public.customer_profiles (
      organization_id, customer_id, occupation, employer, expected_monthly_volume,
      average_transaction_amount, typical_countries, sanctions_status, sanctions_checked_at, pep_status
    ) values (
      v_org_id, v_customer_id,
      (array['Software Engineer', 'Retail Manager', 'Consultant', 'Business Owner', 'Teacher', 'Accountant', 'Physician', 'Import/Export Trader'])[1 + (i % 8)],
      (array['Acme Corp', 'Self-Employed', 'Globex LLC', 'Initech', 'Umbrella Ltd'])[1 + (i % 5)],
      (500 + (i * 137 % 20000))::numeric(18, 2),
      (20 + (i * 53 % 3000))::numeric(18, 2),
      array[v_countries[1 + (i % array_length(v_countries, 1))]],
      (case when i % 47 = 0 then 'POTENTIAL_MATCH' else 'CLEAR' end)::sanctions_status,
      now() - (i % 90) * interval '1 day',
      (i % 89 = 0)
    );

    v_txn_count := 3 + (i % 5);
    for j in 1..v_txn_count loop
      insert into public.transactions (
        organization_id, customer_id, direction, amount, currency, channel, status,
        counterparty_country, origin_country, destination_country, device_is_new, transaction_at
      ) values (
        v_org_id, v_customer_id,
        (case when j % 2 = 0 then 'OUTBOUND' else 'INBOUND' end)::transaction_direction,
        (25 + ((i * 31 + j * 97) % 4000))::numeric(18, 2),
        'USD',
        v_channels[1 + ((i + j) % array_length(v_channels, 1))],
        (case when (i + j) % 29 = 0 then 'FLAGGED' else 'COMPLETED' end)::transaction_status,
        v_countries[1 + (j % array_length(v_countries, 1))],
        v_countries[1 + (i % array_length(v_countries, 1))],
        v_countries[1 + (j % array_length(v_countries, 1))],
        ((i * j) % 37 = 0),
        now() - ((i * 3 + j) % 90) * interval '1 day' - (j * 2) * interval '1 hour'
      );
    end loop;
  end loop;

  ----------------------------------------------------------------------------
  -- Bulk alerts spanning the full investigation lifecycle
  ----------------------------------------------------------------------------
  for i in 1..50 loop
    v_customer_id := v_customer_ids[6 + (i % (array_length(v_customer_ids, 1) - 5))];

    select id, transaction_at into v_txn_row
    from public.transactions
    where customer_id = v_customer_id
    order by transaction_at desc
    limit 1;

    v_state := v_states[1 + (i % array_length(v_states, 1))];

    insert into public.alerts (
      organization_id, customer_id, transaction_id, alert_type, severity, status, source,
      triggered_rules, risk_score, ml_score, assigned_analyst_id, opened_at, resolved_at
    ) values (
      v_org_id, v_customer_id, v_txn_row.id,
      v_alert_types[1 + (i % array_length(v_alert_types, 1))],
      v_severities[1 + (i % array_length(v_severities, 1))],
      v_state,
      (case when i % 4 = 0 then 'ML_MODEL' else 'RULE_ENGINE' end)::alert_source,
      jsonb_build_array('RULE_' || (100 + i)),
      round((0.3 + (i % 7) * 0.1)::numeric, 4),
      round((0.25 + (i % 6) * 0.12)::numeric, 4),
      v_analyst_ids[1 + (i % 2)],
      coalesce(v_txn_row.transaction_at, now() - (i % 30) * interval '1 day'),
      case when v_state = 'RESOLVED' then now() - (i % 10) * interval '1 day' else null end
    )
    returning id into v_alert_id;

    insert into public.risk_signals (organization_id, customer_id, transaction_id, alert_id, signal_type, weight, description)
    values (
      v_org_id, v_customer_id, v_txn_row.id, v_alert_id,
      (array['AMOUNT_ANOMALY', 'VELOCITY_ANOMALY', 'COUNTRY_RISK', 'HISTORICAL_BEHAVIOR', 'ACCOUNT_AGE']::risk_signal_type[])[1 + (i % 5)],
      round((0.4 + (i % 6) * 0.1)::numeric, 4),
      'Auto-generated demo risk signal #' || i
    );

    insert into public.ml_predictions (organization_id, customer_id, transaction_id, alert_id, provider, model_name, prediction, score, confidence)
    values (
      v_org_id, v_customer_id, v_txn_row.id, v_alert_id, 'internal',
      (case when i % 2 = 0 then 'xgboost-fraud-v1' else 'isolation-forest-v1' end),
      case when i % 3 = 0 then 'FRAUD_LIKELY' else 'FRAUD_UNLIKELY' end,
      round((0.2 + (i % 8) * 0.09)::numeric, 4),
      round((0.55 + (i % 4) * 0.1)::numeric, 4)
    );

    if v_state in ('RECOMMENDATION_READY', 'HUMAN_REVIEW', 'RESOLVED') then
      insert into public.ai_recommendations (
        organization_id, alert_id, disposition, confidence, risk_level, rationale,
        red_flags, supporting_evidence, contradictory_evidence, recommended_next_steps, provider, model_name
      ) values (
        v_org_id, v_alert_id,
        v_dispositions[1 + (i % array_length(v_dispositions, 1))],
        round((0.55 + (i % 5) * 0.08)::numeric, 4),
        v_severities[1 + (i % array_length(v_severities, 1))]::text::risk_level,
        'Demo-generated investigation summary for alert #' || i || '.',
        jsonb_build_array('Elevated deterministic risk score', 'Pattern deviates from customer baseline'),
        jsonb_build_array('Transaction ' || v_txn_row.id),
        jsonb_build_array('No prior adverse history on file'),
        jsonb_build_array('Verify counterparty identity', 'Confirm source of funds with customer'),
        'anthropic', 'claude-investigation-demo'
      )
      returning id into v_rec_id;
    else
      v_rec_id := null;
    end if;

    if v_state in ('HUMAN_REVIEW', 'RESOLVED') then
      insert into public.cases (
        organization_id, alert_id, customer_id, assigned_analyst_id, status, priority,
        disposition, resolution_reason, opened_at, resolved_at
      ) values (
        v_org_id, v_alert_id, v_customer_id, v_analyst_ids[1 + (i % 2)],
        (case when v_state = 'RESOLVED' then 'RESOLVED' else 'IN_PROGRESS' end)::case_status,
        v_priorities[1 + (i % array_length(v_priorities, 1))],
        case when v_state = 'RESOLVED' then v_case_dispositions[1 + (i % array_length(v_case_dispositions, 1))] else null end,
        case when v_state = 'RESOLVED' then 'Demo resolution notes for bulk-seeded case #' || i || '.' else null end,
        coalesce(v_txn_row.transaction_at, now() - (i % 30) * interval '1 day'),
        case when v_state = 'RESOLVED' then now() - (i % 10) * interval '1 day' else null end
      )
      returning id into v_case_id;

      insert into public.case_events (organization_id, case_id, event_type, actor_id, actor_role, description)
      values (v_org_id, v_case_id, 'case_created', v_analyst_ids[1 + (i % 2)], 'ANALYST', 'Case opened from bulk-seeded demo alert #' || i || '.');

      if v_state = 'RESOLVED' then
        insert into public.analyst_decisions (organization_id, alert_id, ai_recommendation_id, analyst_id, decision, agreed_with_ai, override_reason, notes)
        values (
          v_org_id, v_alert_id, v_rec_id, v_analyst_ids[1 + (i % 2)],
          v_dispositions[1 + (i % array_length(v_dispositions, 1))],
          (i % 4 <> 0),
          case when (i % 4 = 0) then 'Additional context outweighed the automated recommendation.' else null end,
          'Reviewed evidence and closed via demo seed.'
        );

        insert into public.case_events (organization_id, case_id, event_type, actor_id, actor_role, description)
        values (v_org_id, v_case_id, 'case_resolved', v_analyst_ids[1 + (i % 2)], 'ANALYST', 'Case resolved via demo seed.');
      end if;
    end if;
  end loop;

  ----------------------------------------------------------------------------
  -- Minimal governance seed data (proposed, not deployed by anything here)
  ----------------------------------------------------------------------------
  insert into public.model_versions (organization_id, model_name, version, provider, model_type, status, metrics, created_by)
  values
    (null, 'isolation-forest-v1', '1.0.0', 'internal', 'anomaly_detection', 'DEPLOYED', jsonb_build_object('precision', 0.81, 'recall', 0.74), null),
    (null, 'xgboost-fraud-v1', '1.2.0', 'internal', 'classification', 'DEPLOYED', jsonb_build_object('precision', 0.88, 'recall', 0.79), null),
    (v_org_id, 'xgboost-fraud-v1', '1.3.0-rc1', 'internal', 'classification', 'REVIEW', jsonb_build_object('precision', 0.90, 'recall', 0.81), v_compliance_id);

  insert into public.rule_versions (organization_id, rule_name, version, definition, status, proposed_by, approved_by, approved_at)
  values
    (v_org_id, 'RULE_VELOCITY_8_IN_2H', '1.0.0', jsonb_build_object('window_minutes', 120, 'max_transactions', 6), 'DEPLOYED', v_compliance_id, v_admin_id, now() - interval '60 days'),
    (v_org_id, 'RULE_STRUCTURING_UNDER_THRESHOLD', '1.0.0', jsonb_build_object('threshold', 10000, 'window_days', 10, 'min_occurrences', 3), 'DEPLOYED', v_compliance_id, v_admin_id, now() - interval '60 days'),
    (v_org_id, 'RULE_NEW_DEVICE_LARGE_TRANSFER', '2.0.0', jsonb_build_object('amount_multiplier', 50, 'requires_new_device', true), 'PROPOSED', v_compliance_id, null, null);

  insert into public.agent_skills (organization_id, name, description, version, status, source, governance_state, approved_by, approved_at)
  values (v_org_id, 'summarize-investigation-evidence', 'Summarizes collected evidence into an analyst-readable brief.', '1.0.0', 'ACTIVE', 'built-in', 'DEPLOYED', v_admin_id, now() - interval '60 days');
end $$;
