import { getSupabase } from "@/lib/supabase";

function readEnv(value: string | undefined): string {
  return (value ?? "").trim().replace(/^["']+|["';,\s]+$/g, "");
}

const BACKEND_BASE_URL = readEnv(process.env.EXPO_PUBLIC_BACKEND_URL) || "http://127.0.0.1:8001";
const NORMALIZED_BASE_URL = BACKEND_BASE_URL.replace(/\/$/, "");

export class BackendRequestError extends Error {}

async function backendRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new BackendRequestError("Sign in again to continue.");
  }

  let response: Response;
  try {
    response = await fetch(`${NORMALIZED_BASE_URL}/v1${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...options.headers,
      },
    });
  } catch {
    throw new BackendRequestError(
      "Can't reach TracePay's servers right now. Check your connection and try again.",
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new BackendRequestError(body?.detail || `Request failed (${response.status}).`);
  }

  return (await response.json()) as T;
}

export interface RedeemPartnerOfferResponse {
  redemption_id: number;
  partner_id: string;
  points_spent: number;
  remaining_points: number;
}

export async function redeemPartnerOffer(partnerId: string): Promise<RedeemPartnerOfferResponse> {
  return backendRequest<RedeemPartnerOfferResponse>("/me/redeem", {
    method: "POST",
    body: JSON.stringify({ partner_id: partnerId }),
  });
}
