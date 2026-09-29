-- Function to test UltimatePOS connection using the http extension
-- This bypasses Deno's fetch Host header restriction
CREATE OR REPLACE FUNCTION public.ultimatepos_test_connection()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config JSONB;
  v_api_url TEXT;
  v_direct_ip TEXT;
  v_client_id TEXT;
  v_client_secret TEXT;
  v_username TEXT;
  v_password TEXT;
  v_business_id INT;
  v_location_id INT;
  v_token_url TEXT;
  v_response JSONB;
  v_http_response TEXT;
  v_status INT;
  v_token TEXT;
  v_api_response JSONB;
  v_product_url TEXT;
BEGIN
  -- Get active config
  SELECT to_jsonb(c) INTO v_config
  FROM public.ultimatepos_config c
  WHERE c.is_active = true
  LIMIT 1;

  IF v_config IS NULL THEN
    RETURN jsonb_build_object('error', 'No active UltimatePOS configuration found');
  END IF;

  v_api_url := v_config->>'api_url';
  v_direct_ip := v_config->>'direct_server_ip';
  v_client_id := v_config->>'client_id';
  v_client_secret := v_config->>'client_secret';
  v_username := v_config->>'username';
  v_password := v_config->>'password';
  v_business_id := (v_config->>'business_id')::INT;
  v_location_id := (v_config->>'location_id')::INT;

  -- Build token URL
  v_token_url := v_api_url || '/oauth/token';

  -- If direct IP is set, rewrite the URL to use HTTP with the direct IP
  IF v_direct_ip IS NOT NULL AND v_direct_ip != '' THEN
    -- Extract path from the API URL
    v_token_url := 'http://' || v_direct_ip || regexp_replace(v_token_url, '^https?://[^/]+', '');
  END IF;

  -- Step 1: Get OAuth token
  BEGIN
    SELECT content INTO v_http_response
    FROM extensions.http_post(
      v_token_url,
      'grant_type=password&client_id=' || v_client_id || '&client_secret=' || v_client_secret || '&username=' || v_username || '&password=' || v_password,
      'application/x-www-form-urlencoded'
    );

    v_response := v_http_response::JSONB;
    v_token := v_response->>'access_token';

    IF v_token IS NULL THEN
      RETURN jsonb_build_object('error', 'OAuth failed', 'response', v_http_response);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error', 'OAuth request failed', 'details', SQLERRM);
  END;

  -- Step 2: Test product API
  v_product_url := v_api_url || '/connector/api/product?business_id=' || v_business_id || '&location_id=' || v_location_id || '&per_page=1';

  IF v_direct_ip IS NOT NULL AND v_direct_ip != '' THEN
    v_product_url := 'http://' || v_direct_ip || regexp_replace(v_product_url, '^https?://[^/]+', '');
  END IF;

  BEGIN
    SELECT content INTO v_http_response
    FROM extensions.http_get(
      v_product_url,
      ARRAY[
        ARRAY['Authorization', 'Bearer ' || v_token],
        ARRAY['Accept', 'application/json']
      ]
    );

    v_api_response := v_http_response::JSONB;

    -- Update connection status
    UPDATE public.ultimatepos_config
    SET connection_status = 'connected',
        last_connected_at = now()
    WHERE is_active = true;

    RETURN jsonb_build_object(
      'success', true,
      'connected', true,
      'token_obtained', true,
      'product_count', COALESCE((v_api_response->'meta'->>'total')::INT, 0),
      'using_direct_ip', v_direct_ip IS NOT NULL
    );
  EXCEPTION WHEN OTHERS THEN
    -- Token obtained but API call failed
    UPDATE public.ultimatepos_config
    SET connection_status = 'error'
    WHERE is_active = true;

    RETURN jsonb_build_object(
      'error', 'API call failed after auth',
      'token_obtained', true,
      'details', SQLERRM
    );
  END;
END;
$$;