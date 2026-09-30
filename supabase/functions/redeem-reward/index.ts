import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://exchange-cafe.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        status: 200,
        headers: corsHeaders,
      });
    }

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

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL")!;

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    const body = await req.json();

    const rewardToken = body.reward_token;
    const staffPin = body.staff_pin;

    // Check staff PIN
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

    // Check reward token
    if (!rewardToken) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "reward_token is required",
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

    // Find reward
    const {
      data: reward,
      error: rewardError,
    } = await supabase
      .from("rewards")
      .select(`
        *,
        campaigns (
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

    const campaign = reward.campaigns;
    const now = new Date();

    // Check redemption period
    const redeemStart =
      new Date(campaign.redeem_start);

    const redeemEnd =
      new Date(campaign.redeem_end);

    if (
      now < redeemStart ||
      now > redeemEnd
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Redemption period is not active",
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

    // Check reward status
    if (reward.status !== "claimed") {
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

      return new Response(
        JSON.stringify({
          success: false,
          error: `Reward status is ${reward.status}`,
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

        // Redeem reward using a database transaction
    const {
      data: redeemedReward,
      error: redeemError,
    } = await supabase.rpc(
      "redeem_reward",
      {
        p_reward_id: reward.id,
        p_redeemed_at: now.toISOString(),
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
            error: "Reward already redeemed",
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
          error: redeemError.message,
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

    // Success
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

    return new Response(
      JSON.stringify({
        success: true,
        message: "Reward redeemed successfully",
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
          "Content-Type": "application/json",
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
          "Content-Type": "application/json",
        },
      }
    );
  }
});
