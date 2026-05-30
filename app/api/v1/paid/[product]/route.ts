import { NextRequest, NextResponse } from 'next/server';
import { getSeedProduct, paymentRequirement } from '@/lib/seed-products';
import { verifyPyrimidPaymentTx } from '@/lib/payment-verification';

function paymentRequired(req: NextRequest, product: NonNullable<ReturnType<typeof getSeedProduct>>) {
  const requirement = paymentRequirement(product, req.url);
  return NextResponse.json(
    {
      error: 'payment_required',
      message: `Pay ${product.price_display} USDC on Base through Pyrimid, then retry with X-PAYMENT or X-PAYMENT-TX.`,
      accepts: [requirement],
      docs: 'https://pyrimid.ai/quickstart',
      catalog: 'https://pyrimid.ai/api/v1/catalog?source=pyrimid-seed',
    },
    {
      status: 402,
      headers: {
        'X-PAYMENT-REQUIRED': JSON.stringify(requirement),
        'X-Pyrimid-Vendor': product.vendor_id,
        'X-Pyrimid-Product': product.product_id,
        'Cache-Control': 'no-store',
      },
    }
  );
}

function safeUrlParts(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return {
      normalized: parsed.toString(),
      host: parsed.host,
      protocol: parsed.protocol.replace(':', ''),
      path: parsed.pathname || '/',
      isHttps: parsed.protocol === 'https:',
    };
  } catch {
    return {
      normalized: rawUrl,
      host: 'unknown',
      protocol: 'unknown',
      path: '/',
      isHttps: false,
    };
  }
}

function productIdFromHost(host: string) {
  return host
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'mcp-server';
}

function mcpAudit(url: string) {
  const target = safeUrlParts(url);
  const path = target.path.toLowerCase();
  const transportHint = path.includes('sse')
    ? 'sse'
    : path.includes('mcp') || path.includes('rpc')
      ? 'streamable-http-json-rpc'
      : 'unknown-http';
  const readinessScore = [
    target.isHttps,
    target.host !== 'unknown',
    path.includes('mcp') || path.includes('rpc') || path.includes('sse'),
  ].filter(Boolean).length;

  return {
    url: target.normalized,
    host: target.host,
    protocol: target.protocol,
    transport_hint: transportHint,
    monetization_readiness: {
      score: readinessScore,
      max_score: 3,
      summary:
        readinessScore >= 2
          ? 'Ready for a thin paid-tool wrapper and catalog listing.'
          : 'Needs endpoint discovery details before pricing can be finalized.',
    },
    recommended_paid_tools: [
      {
        name: 'search',
        buyer_value: 'Return ranked results from the server with source metadata.',
        suggested_price_usdc: '0.01-0.05',
        cache_ttl_seconds: 300,
      },
      {
        name: 'enrich',
        buyer_value: 'Expand one input into structured entities, links, or scoring fields.',
        suggested_price_usdc: '0.05-0.15',
        cache_ttl_seconds: 900,
      },
      {
        name: 'analyze',
        buyer_value: 'Run the highest-cost reasoning/data path and return an agent-ready brief.',
        suggested_price_usdc: '0.10-0.25',
        cache_ttl_seconds: 1800,
      },
    ],
    pricing_tiers: [
      { tier: 'smoke-test', price_usdc: '0.01', use_case: 'cheap buyer-agent verification and catalog testing' },
      { tier: 'standard-call', price_usdc: '0.05-0.10', use_case: 'normal paid MCP tool invocation' },
      { tier: 'premium-analysis', price_usdc: '0.15-0.25', use_case: 'expensive model, data, or multi-step workflows' },
    ],
    x402_route_shape: {
      unpaid: 'Return HTTP 402 with accepts[] metadata and X-PAYMENT-REQUIRED.',
      paid: 'Verify X-PAYMENT or X-PAYMENT-TX, then return the normal MCP tool result.',
      network: 'base',
      asset: 'USDC',
    },
    pyrimid_listing: {
      vendor_id: productIdFromHost(target.host),
      product_id: `${productIdFromHost(target.host)}-mcp-access`,
      category: 'devtools',
      affiliate_bps: 4000,
      endpoint: target.normalized,
      output_schema: {
        type: 'object',
        properties: {
          result: { type: 'object' },
          routed_by: { const: 'pyrimid' },
        },
      },
    },
    integration_steps: [
      'Map one high-value MCP tool to a deterministic HTTP endpoint.',
      'Return x402 402 payment metadata before running paid compute.',
      'Verify payment proof before invoking the tool handler.',
      'Publish Pyrimid catalog metadata with price, affiliateBps, network, and output_schema.',
      'Expose a no-spend smoke test so buyer agents can validate status and schema.',
    ],
    risk_checks: [
      'Do not include API keys, bearer tokens, or private prompts in catalog metadata.',
      'Keep paid responses deterministic enough for buyer-agent retries.',
      'Rate-limit unpaid 402 probes separately from paid tool calls.',
      'Log payment tx hashes and product ids without storing private user payloads.',
    ],
    validation_checks: [
      'curl the endpoint without payment and confirm HTTP 402 plus accepts[].',
      'query the Pyrimid catalog and confirm vendor_id/product_id/affiliate_bps are discoverable.',
      'submit a mocked paid request in staging and confirm the MCP payload shape remains stable.',
    ],
  };
}

function payload(productId: string, req: NextRequest, proof: string) {
  const query = Object.fromEntries(req.nextUrl.searchParams.entries());

  switch (productId) {
    case 'mya-agent-enrichment': {
      const agent = query.agent || 'demo-agent';
      return {
        enrichment: {
          agent,
          category: 'developer-tools',
          agent_readable_summary: `${agent} can monetize API calls by exposing paid tools through x402 and listing them in the Pyrimid catalog.`,
          monetization_angle: 'Package one high-value tool as a paid MCP/API endpoint priced $0.05-$0.25 per call.',
          suggested_cta: 'Claim listing → add paid tool → route purchases through Pyrimid.',
        },
      };
    }
    case 'mya-category-scout': {
      const category = query.category || 'developer-tools';
      return {
        category,
        agents: [
          { name: 'MCP server vendors', fit: 'high', reason: 'Already expose tool interfaces; easiest path to paid tools.' },
          { name: 'AI API wrappers', fit: 'high', reason: 'Usage-based value maps cleanly to x402 per-call pricing.' },
          { name: 'agent directories', fit: 'medium', reason: 'Can route discovery traffic into paid vendor listings.' },
        ],
      };
    }
    case 'vendor-lead-discovery': {
      const segment = query.segment || 'mcp';
      return {
        segment,
        leads: [
          { segment: 'mcp', target: 'MCP servers with paid/data-heavy tools', pitch: 'Add optional x402 payment gate + Pyrimid catalog listing.' },
          { segment: 'agent-frameworks', target: 'Agent frameworks with marketplace/plugin systems', pitch: 'Let builders sell tools to agents with Base USDC settlement.' },
          { segment: 'api-tools', target: 'AI API services with per-call cost', pitch: 'Turn API calls into agent-purchasable products.' },
        ],
      };
    }
    case 'mcp-server-audit': {
      const url = query.url || 'https://example.com/mcp';
      const audit = mcpAudit(url);
      return {
        audit: {
          ...audit,
          pricing: '$0.01-$0.25 per call depending on compute/data cost',
          compatibility: {
            recommended_paid_tools: audit.recommended_paid_tools.map((tool) => tool.name),
          },
        },
      };
    }
    case 'x402-integration-plan': {
      const service = query.service || 'agent-api';
      return {
        plan: {
          service,
          route_shape: 'GET /api/paid/{tool} returns 402 until X-PAYMENT or X-PAYMENT-TX is supplied',
          payment_network: 'Base USDC',
          pyrimid_metadata: ['vendorId', 'productId', 'affiliateBps', 'endpoint', 'output_schema'],
          launch_checklist: ['publish llms.txt', 'publish agents.txt', 'submit MCP server card', 'list product in Pyrimid catalog'],
        },
      };
    }
    default:
      return { result: 'unknown_seed_product' };
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ product: string }> }) {
  const { product: productId } = await context.params;
  const product = getSeedProduct(productId);

  if (!product) {
    return NextResponse.json(
      { error: 'not_found', message: 'Unknown Pyrimid seed product', catalog: 'https://pyrimid.ai/api/v1/catalog' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const proof = req.headers.get('x-payment-tx') || req.headers.get('x-payment');
  if (!proof) return paymentRequired(req, product);

  const verification = await verifyPyrimidPaymentTx(proof, product.price_usdc);
  if (!verification.valid) {
    return NextResponse.json(
      {
        error: 'payment_invalid',
        message: verification.reason || 'Payment could not be verified on Base',
        docs: 'https://pyrimid.ai/quickstart',
        proof: 'https://pyrimid.ai/proof',
      },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json({
    product_id: product.product_id,
    vendor_id: product.vendor_id,
    payment_tx: verification.txHash,
    payment_amount: verification.amount?.toString(),
    buyer: verification.buyer,
    ...payload(product.product_id, req, proof),
    routed_by: 'pyrimid',
    links: {
      docs: 'https://pyrimid.ai/quickstart',
      proof: 'https://pyrimid.ai/proof',
      stats: 'https://pyrimid.ai/stats',
      catalog: 'https://pyrimid.ai/api/v1/catalog',
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
