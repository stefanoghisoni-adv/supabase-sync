import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({
    message: "Shopify Supabase Sync App",
  });
};

export default function Index() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      <h1>Shopify Supabase Sync</h1>
      <p>Welcome to your Shopify app!</p>
    </div>
  );
}
