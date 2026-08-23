import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: callerUser } } = await userClient.auth.getUser();
    if (!callerUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adminCheck } = await serviceClient
      .from("admin_users")
      .select("id")
      .eq("id", callerUser.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!adminCheck) {
      return new Response(JSON.stringify({ error: "Forbidden: admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/manage-users/, "");

    if (req.method === "POST" && path === "/create") {
      const { email, password, roleIds } = await req.json();

      const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { is_admin: true },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("User creation failed");

      const { error: adminError } = await serviceClient
        .from("admin_users")
        .insert({ id: authData.user.id, email, is_active: true });

      if (adminError) throw adminError;

      if (roleIds && roleIds.length > 0) {
        const assignments = roleIds.map((roleId: string) => ({
          user_id: authData.user!.id,
          role_id: roleId,
          assigned_by: callerUser.id,
        }));
        const { error: roleError } = await serviceClient
          .from("user_role_assignments")
          .insert(assignments);
        if (roleError) throw roleError;
      }

      return new Response(JSON.stringify({ user: authData.user }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "PUT" && path.startsWith("/update/")) {
      const userId = path.replace("/update/", "");
      const { email, password, is_active } = await req.json();

      if (email || password) {
        const updates: Record<string, string> = {};
        if (email) updates.email = email;
        if (password) updates.password = password;
        const { error } = await serviceClient.auth.admin.updateUserById(userId, updates);
        if (error) throw error;
      }

      if (typeof is_active === "boolean") {
        const { error } = await serviceClient
          .from("admin_users")
          .update({ is_active })
          .eq("id", userId);
        if (error) throw error;
      }

      if (email) {
        await serviceClient
          .from("admin_users")
          .update({ email })
          .eq("id", userId);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "DELETE" && path.startsWith("/delete/")) {
      const userId = path.replace("/delete/", "");

      await serviceClient.from("user_role_assignments").delete().eq("user_id", userId);
      await serviceClient.from("admin_users").update({ is_active: false }).eq("id", userId);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
