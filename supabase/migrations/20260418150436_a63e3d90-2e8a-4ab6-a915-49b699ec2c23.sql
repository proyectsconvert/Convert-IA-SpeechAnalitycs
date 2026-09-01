-- Reconciliar contador de presentaciones con los registros existentes del mes en curso.
-- Para cada cuenta, cuenta cuántas presentaciones se crearon en el mes actual y
-- actualiza usage_tracking para que el límite refleje la realidad.
DO $$
DECLARE
  r RECORD;
  v_period_start date := date_trunc('month', CURRENT_DATE)::date;
  v_period_end date := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
BEGIN
  FOR r IN
    SELECT account_id, COUNT(*) AS cnt
    FROM presentations
    WHERE created_at >= v_period_start
    GROUP BY account_id
  LOOP
    INSERT INTO usage_tracking (account_id, period_start, period_end, presentations_created)
    VALUES (r.account_id, v_period_start, v_period_end, r.cnt)
    ON CONFLICT (account_id, period_start) DO UPDATE
      SET presentations_created = GREATEST(usage_tracking.presentations_created, r.cnt),
          updated_at = now();
  END LOOP;
END $$;