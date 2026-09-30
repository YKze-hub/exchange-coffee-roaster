import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://exchange-cafe.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  try {
    // Handle CORS
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Only POST is allowed
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Method not allowed",
        }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Supabase
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL")!;

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    // Request body
    const body = await req.json();

    const rewardToken =
      body.reward_token?.trim();

    const staffPin =
      body.staff_pin?.trim();

    // ==============================
    // 1. CHECK STAFF PIN
    // ==============================

    const correctStaffPin =
      Deno.env.get("STAFF_REDEEM_PIN");

    if (!staffPin) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Staff PIN is required",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!correctStaffPin) {
      console.error(
        "STAFF_REDEEM_PIN is not configured"
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "Staff redemption is not configured",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (staffPin !== correctStaffPin) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid staff PIN",
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ==============================
    // 2. CHECK REWARD CODE
    // ==============================

    if (!rewardToken) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Reward code is required",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ==============================
    // 3. FIND REWARD
    // ==============================

    const {
      data: reward,
      error: rewardError,
    } = await supabase
      .from("rewards")
      .select(`
        *,
        campaigns (
          id,
          campaign_code,
          name,
          redeem_start,
          redeem_end
        )
      `)
      .eq("reward_token", rewardToken)
      .maybeSingle();

    if (rewardError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: rewardError.message,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!reward) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Reward not found",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ==============================
    // 4. CHECK CAMPAIGN
    // ==============================

    const campaign =
      reward.campaigns;

    if (!campaign) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Campaign not found",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (
      campaign.campaign_code !==
      "EXCHANGE-1ST-ANNIVERSARY-2026"
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid campaign",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ==============================
    // 5. CHECK REDEMPTION PERIOD
    // ==============================

    const now = new Date();

    const redeemStart =
      new Date(campaign.redeem_start);

    const redeemEnd =
      new Date(campaign.redeem_end);

    if (now < redeemStart) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Redemption has not started yet",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (now > redeemEnd) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "This reward has expired",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ==============================
    // 6. CHECK REWARD STATUS
    // ==============================

    if (reward.status === "redeemed") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Reward already redeemed",
        }),
        {
          status: 409,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (reward.status !== "claimed") {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            `Reward status is ${reward.status}`,
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ==============================
    // 7. REDEEM
    // ==============================

    const {
      data: redeemedReward,
      error: redeemError,
    } = await supabase.rpc(
      "redeem_reward",
      {
        p_reward_id: reward.id,
        p_redeemed_at:
          now.toISOString(),
      }
    );

    if (redeemError) {

      if (
        redeemError.message.includes(
          "Reward already redeemed"
        )
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Reward already redeemed",
          }),
          {
            status: 409,
            headers: {
              ...corsHeaders,
              "Content-Type":
                "application/json",
            },
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error:
            redeemError.message,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // ==============================
    // 8. SUCCESS
    // ==============================

    return new Response(
      JSON.stringify({
        success: true,
        message:
          "Reward redeemed successfully",
        reward: {
          reward_token:
            redeemedReward.reward_token,

          reward_type:
            redeemedReward.reward_type,

          status:
            redeemedReward.status,

          redeemed_at:
            redeemedReward.redeemed_at,
        },
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );

  } catch (error) {

    console.error(error);

    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  }
});
