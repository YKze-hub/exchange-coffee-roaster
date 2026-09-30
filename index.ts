import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://exchange-cafe.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  try {

    // Handle browser CORS preflight request
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

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey
      );


    // Get request body
    const body =
      await req.json();

    const idToken =
      body.id_token;


    if (!idToken) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "id_token is required",
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


    // Verify LINE ID token
    const verifyResponse =
      await fetch(
        "https://api.line.me/oauth2/v2.1/verify",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },

          body:
            new URLSearchParams({
              id_token: idToken,
              client_id:
                "2011803432-8wUZVBDB",
            }),
        }
      );


    const lineTokenData =
      await verifyResponse.json();


    if (!verifyResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid LINE ID token",
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


    // Get real LINE user ID
    const lineUserId =
      lineTokenData.sub;

    const displayName =
      lineTokenData.name ?? null;


    if (!lineUserId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "LINE user ID not found",
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


    // Development campaign
    const campaignCode =
      "DEV-TEST-2026";


    const {
      data: campaign,
      error: campaignError,
    } =
      await supabase
        .from("campaigns")
        .select("*")
        .eq(
          "campaign_code",
          campaignCode
        )
        .single();


    if (
      campaignError ||
      !campaign
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Campaign not found",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }


    // Check claim period
    const now =
      new Date();

    const claimStart =
      new Date(
        campaign.claim_start
      );

    const claimEnd =
      new Date(
        campaign.claim_end
      );


    if (
      now < claimStart ||
      now > claimEnd
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Claim period is not active",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }


    // Find customer
    let {
      data: customer,
      error: customerError,
    } =
      await supabase
        .from("customers")
        .select("*")
        .eq(
          "line_user_id",
          lineUserId
        )
        .maybeSingle();


    if (customerError) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            customerError.message,
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


    // Create customer if needed
    if (!customer) {

      const {
        data: newCustomer,
        error:
          createCustomerError,
      } =
        await supabase
          .from("customers")
          .insert({
            line_user_id:
              lineUserId,

            display_name:
              displayName,
          })
          .select()
          .single();


      if (
        createCustomerError
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              createCustomerError.message,
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


      customer =
        newCustomer;
    }


    // Check existing reward
    const {
      data: existingReward,
      error:
        existingRewardError,
    } =
      await supabase
        .from("rewards")
        .select("*")
        .eq(
          "customer_id",
          customer.id
        )
        .eq(
          "campaign_id",
          campaign.id
        )
        .maybeSingle();


    if (existingRewardError) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            existingRewardError.message,
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


    // Already claimed
    if (existingReward) {
      return new Response(
        JSON.stringify({
          success: false,

          error:
            "Already claimed",

          reward: {
            reward_token:
              existingReward.reward_token,

            status:
              existingReward.status,

            claimed_at:
              existingReward.claimed_at,
          },
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


    // Generate reward token
    const rewardToken =
      `EX1-${crypto
        .randomUUID()
        .replaceAll("-", "")
        .slice(0, 12)
        .toUpperCase()}`;


    const expiresAt =
      campaign.claim_end;


    // Create reward
    const {
      data: reward,
      error: rewardError,
    } =
      await supabase
        .from("rewards")
        .insert({
          customer_id:
            customer.id,

          campaign_id:
            campaign.id,

          reward_type:
            "BUY_ONE_GET_ONE",

          reward_token:
            rewardToken,

          status:
            "claimed",

          claimed_at:
            now.toISOString(),

          expires_at:
            expiresAt,
        })
        .select()
        .single();


    if (rewardError) {

      if (
        rewardError.code ===
        "23505"
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Already claimed",
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
            rewardError.message,
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
          "Reward claimed successfully",

        reward: {
          reward_token:
            reward.reward_token,

          reward_type:
            reward.reward_type,

          status:
            reward.status,

          claimed_at:
            reward.claimed_at,

          expires_at:
            reward.expires_at,
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
