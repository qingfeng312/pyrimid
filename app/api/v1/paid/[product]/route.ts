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

type GitHubRepo = {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  updated_at: string;
  topics?: string[];
  owner?: { login: string; html_url: string };
};

function leadQuery(segment: string) {
  switch (segment) {
    case 'agent-frameworks':
      return 'agent framework mcp OR x402 language:TypeScript pushed:>2026-01-01';
    case 'api-tools':
      return 'AI API x402 paid endpoint language:TypeScript pushed:>2026-01-01';
    case 'mcp':
    default:
      return 'mcp server tools language:TypeScript pushed:>2026-01-01';
  }
}

function scoreLead(repo: GitHubRepo, segment: string) {
  const text = `${repo.full_name} ${repo.description || ''} ${(repo.topics || []).join(' ')}`.toLowerCase();
  let score = 30;
  if (text.includes('mcp')) score += 25;
  if (text.includes('x402') || text.includes('paid') || text.includes('payment')) score += 20;
  if (text.includes('agent') || text.includes('tool')) score += 15;
  if (segment === 'agent-frameworks' && text.includes('framework')) score += 10;
  if (segment === 'api-tools' && text.includes('api')) score += 10;
  score += Math.min(10, Math.floor(Math.log10(Math.max(1, repo.stargazers_count)) * 5));
  return Math.min(100, score);
}

function fallbackLeads(segment: string) {
  const targets = [
    {
      name: 'MCP server vendors with data-heavy tools',
      url: 'https://github.com/search?q=mcp+server+tools+language%3ATypeScript&type=repositories',
      segment: 'mcp',
      score: segment === 'mcp' ? 82 : 70,
      reason: 'Already expose agent-callable tools; easiest path to wrap one high-value tool behind x402.',
    },
    {
      name: 'Agent frameworks with plugin marketplaces',
      url: 'https://github.com/search?q=agent+framework+mcp+x402&type=repositories',
      segment: 'agent-frameworks',
      score: segment === 'agent-frameworks' ? 80 : 68,
      reason: 'Can route many downstream agents to paid tools through a single Pyrimid catalog integration.',
    },
    {
      name: 'AI API wrappers with per-call cost',
      url: 'https://github.com/search?q=AI+API+x402+paid+endpoint&type=repositories',
      segment: 'api-tools',
      score: segment === 'api-tools' ? 78 : 66,
      reason: 'Usage-based API value maps cleanly to per-call Base USDC pricing and affiliate distribution.',
    },
  ];

  return targets.sort((a, b) => b.score - a.score);
}

async function vendorLeadDiscovery(segment: string) {
  const query = leadQuery(segment);
  const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=8`;

  try {
    const response = await fetch(searchUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'pyrimid-vendor-lead-discovery',
      },
      cache: 'no-store',
    });

    if (response.ok) {
      const data = (await response.json()) as { items?: GitHubRepo[] };
      const leads = (data.items || []).map((repo) => {
        const score = scoreLead(repo, segment);
        return {
          name: repo.full_name,
          url: repo.html_url,
          owner: repo.owner?.login || repo.full_name.split('/')[0],
          owner_url: repo.owner?.html_url || `https://github.com/${repo.full_name.split('/')[0]}`,
          segment,
          score,
          language: repo.language,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          updated_at: repo.updated_at,
          reason:
            score >= 75
              ? 'Strong fit for a paid MCP/API wrapper and Pyrimid catalog listing.'
              : 'Potential fit; confirm tool surface, pricing unit, and owner interest before outreach.',
          recommended_pitch: 'Offer a no-risk paid endpoint pilot with x402 402 metadata, Base USDC settlement, and affiliateBps for distribution agents.',
        };
      });

      if (leads.length > 0) {
        return {
          source: 'github-search',
          query,
          generated_at: new Date().toISOString(),
          leads,
        };
      }
    }
  } catch {
    // Fall through to deterministic seed leads when GitHub search is unavailable.
  }

  return {
    source: 'fallback-seed',
    query,
    generated_at: new Date().toISOString(),
    leads: fallbackLeads(segment),
  };
}

async function payload(productId: string, req: NextRequest, proof: string) {
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
      const discovery = await vendorLeadDiscovery(segment);
      return {
        segment,
        ...discovery,
        scoring_model: {
          base: 30,
          mcp_signal: 25,
          monetization_signal: 20,
          agent_tool_signal: 15,
          segment_match: 10,
          popularity_cap: 10,
        },
        next_actions: [
          'Open the repo and confirm it exposes a tool/API surface with repeat buyer value.',
          'Pick one endpoint to wrap with an unpaid 402 challenge and a paid response path.',
          'List product metadata in Pyrimid with price_usdc, affiliate_bps, endpoint, method, and output_schema.',
        ],
      };
    }
    case 'mcp-server-audit': {
      const url = query.url || 'https://example.com/mcp';
      return {
        audit: {
          url,
          recommended_paid_tools: ['search', 'enrich', 'export', 'analyze'],
          pricing: '$0.01-$0.25 per call depending on compute/data cost',
          integration_steps: [
            'Add 402 response with x402 accepts[] metadata',
            'Register vendor/product in Pyrimid catalog',
            'Expose tool schema in MCP server card',
            'Add affiliateBps for distribution agents',
          ],
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
    ...(await payload(product.product_id, req, proof)),
    routed_by: 'pyrimid',
    links: {
      docs: 'https://pyrimid.ai/quickstart',
      proof: 'https://pyrimid.ai/proof',
      stats: 'https://pyrimid.ai/stats',
      catalog: 'https://pyrimid.ai/api/v1/catalog',
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
